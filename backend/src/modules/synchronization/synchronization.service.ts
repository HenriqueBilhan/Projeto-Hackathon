import { ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { CronJob } from 'cron';
import { randomUUID } from 'crypto';
import { Brackets, DataSource, EntityTarget, In, ObjectLiteral, Repository } from 'typeorm';
import {
  ExternalCnesProfessional, ExternalDataset, ExternalEstablishment, ExternalHospitalBeds, ExternalMunicipality, ExternalUnitType, Synchronization, SynchronizationLog,
} from '../../database/entities';
import { config } from '../../config/configuration';
import { paginated } from '../../common/dto/pagination.dto';
import { MinisterioSaudeClient, PaginationLimitError } from '../../integrations/ministerio-saude/ministerio-saude.client';
import { Mapped, mapCnesProfissional, mapEstabelecimento, mapHospitalLeitos, mapMunicipio, mapTipoUnidade } from '../../integrations/ministerio-saude/ministerio-saude.mapper';
import { DATASETS, DatasetCode, ENDPOINTS, EndpointDef, UF_IBGE } from '../../integrations/ministerio-saude/ministerio-saude.types';
import { AuditService } from '../core/audit.service';
import { NotificationsService } from '../core/notifications.service';

type Trigger = 'manual' | 'auto' | 'reprocess';
type Mode = 'full' | 'incremental' | 'reprocess';
interface FailedRequest { path: string; params: Record<string, string | number>; page: number; error: string }
interface RunCtx {
  log: SynchronizationLog; mode: Mode; cursor: Record<string, unknown>; nextCursor: Record<string, unknown>;
  failed: FailedRequest[]; errors: string[];
}
export interface SyncScope { ufs: string[]; municipios: string[]; competenciaCnes: string }

const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/**
 * Sincronização API do Ministério da Saúde → MySQL.
 *  - Trava por conjunto de dados no banco (UPDATE condicional): nunca duas execuções simultâneas do mesmo conjunto.
 *  - Processamento em lotes com transação por lote; identifica novos/alterados/inalterados por hash de conteúdo.
 *  - Nunca apaga nem sobrescreve registros válidos com respostas inválidas/incompletas.
 *  - Requisições que falham (após retries) são registradas e podem ser reprocessadas.
 */
@Injectable()
export class SynchronizationService implements OnModuleInit {
  private readonly logger = new Logger(SynchronizationService.name);
  scope: SyncScope = { ufs: config.sync.ufs, municipios: config.sync.municipios, competenciaCnes: config.sync.competenciaCnes };

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(Synchronization) private readonly syncs: Repository<Synchronization>,
    @InjectRepository(SynchronizationLog) private readonly logs: Repository<SynchronizationLog>,
    private readonly client: MinisterioSaudeClient,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  onModuleInit() {
    if (!config.sync.autoEnabled) return;
    const job = new CronJob(config.sync.cron, () => { this.runAll('auto').catch((e) => this.logger.error({ err: e.message }, 'Falha na sincronização automática')); }, null, false, config.timezone);
    this.scheduler.addCronJob('ministerio-saude-sync', job as any);
    job.start();
    this.logger.log({ cron: config.sync.cron }, 'Sincronização automática agendada');
  }

  /* ----------------------------- Trava ----------------------------- */
  private async acquire(dataset: DatasetCode): Promise<string> {
    await this.syncs.createQueryBuilder().insert().into(Synchronization).values({ dataset, status: 'idle' }).orIgnore().execute();
    const token = randomUUID();
    const r = await this.syncs.createQueryBuilder().update(Synchronization).set({ status: 'running', lockToken: token, lockedAt: () => 'UTC_TIMESTAMP()', lastRunAt: () => 'UTC_TIMESTAMP()' })
      .where('dataset = :dataset', { dataset })
      .andWhere(new Brackets((b) => b.where("status <> 'running'").orWhere('locked_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL :min MINUTE)', { min: config.sync.lockTimeoutMinutes })))
      .execute();
    if (!r.affected) throw new ConflictException({ message: `Já existe uma sincronização de "${dataset}" em andamento.`, code: 'SYNC_RUNNING' });
    return token;
  }

  /* ----------------------- Execução de um conjunto ----------------------- */
  /** Inicia a sincronização. Por padrão aguarda o término; com background=true devolve o log imediatamente. */
  async start(dataset: DatasetCode, opts: { trigger?: Trigger; mode?: Mode; userId?: string | null; reprocessOf?: SynchronizationLog; background?: boolean } = {}) {
    if (!DATASETS.includes(dataset)) throw new NotFoundException(`Conjunto de dados desconhecido: ${dataset}`);
    const token = await this.acquire(dataset);
    const state = await this.syncs.findOneByOrFail({ dataset });
    const cursor = (state.cursor || {}) as Record<string, unknown>;
    const mode: Mode = opts.reprocessOf ? 'reprocess' : opts.mode || this.defaultMode(dataset, cursor);
    const log = await this.logs.save(this.logs.create({
      dataset, trigger: opts.trigger || 'manual', mode, status: 'running', startedAt: new Date(), triggeredBy: opts.userId || null,
      reprocessOf: opts.reprocessOf?.id || null, params: { escopo: this.scope, cursor },
    }));
    await this.syncs.update({ dataset }, { lastLogId: log.id });
    const ctx: RunCtx = { log, mode, cursor, nextCursor: { ...cursor }, failed: [], errors: [] };
    const job = this.execute(dataset, ctx, token, opts.reprocessOf);
    if (opts.background) { job.catch(() => undefined); return log; }
    return job;
  }

  private defaultMode(dataset: DatasetCode, cursor: Record<string, unknown>): Mode {
    if (dataset !== 'cnes-estabelecimentos' || !cursor.lastFullAt || !cursor.lastDay) return 'full';
    const days = (Date.now() - new Date(String(cursor.lastDay)).getTime()) / 86400000;
    return days <= config.sync.incrementalMaxDays ? 'incremental' : 'full';
  }

  private async execute(dataset: DatasetCode, ctx: RunCtx, token: string, reprocessOf?: SynchronizationLog) {
    const before = this.client.requestCount;
    try {
      if (reprocessOf) await this.reprocessRequests(dataset, ctx, reprocessOf);
      else await this.handlers[dataset](ctx);
    } catch (e) {
      this.pushError(ctx, e.message);
    }
    const l = ctx.log;
    l.requestsMade = this.client.requestCount - before;
    l.finishedAt = new Date();
    l.errorCount = ctx.errors.length;
    l.errors = ctx.errors.slice(0, 50);
    l.failedRequests = ctx.failed.length ? ctx.failed.slice(0, 500) : null;
    const processed = l.recordsInserted + l.recordsUpdated + l.recordsUnchanged;
    l.status = !ctx.errors.length ? 'success' : processed > 0 ? 'partial' : 'failed';
    await this.logs.save(l);
    const ok = l.status === 'success';
    await this.syncs.update({ dataset, lockToken: token }, {
      status: l.status, lockToken: null, lockedAt: null, lastError: ok ? null : (ctx.errors[0] || '').slice(0, 500),
      ...(ok ? { lastSuccessAt: new Date(), cursor: ctx.nextCursor as any } : {}),
    });
    this.logger.log({ dataset, status: l.status, fetched: l.recordsFetched, inserted: l.recordsInserted, updated: l.recordsUpdated, invalid: l.recordsInvalid, errors: l.errorCount, requests: l.requestsMade }, 'Sincronização concluída');
    if (l.trigger === 'auto' && l.status !== 'success') await this.notifications.notifyAdmins('Falha na sincronização', `O conjunto ${dataset} terminou com status "${l.status}".`, 'seguranca.html?aba=config', 'alert-triangle');
    return l;
  }

  private pushError(ctx: RunCtx, msg: string) { ctx.errors.push(msg.slice(0, 300)); }

  /** Executa todos os conjuntos na ordem (dependências primeiro). Conjuntos em execução são ignorados. */
  async runAll(trigger: Trigger = 'manual', userId: string | null = null) {
    const results: Array<{ dataset: string; status: string; logId?: string; erro?: string }> = [];
    for (const d of DATASETS) {
      try {
        const l = (await this.start(d, { trigger, userId })) as SynchronizationLog;
        results.push({ dataset: d, status: l.status, logId: l.id });
      } catch (e) { results.push({ dataset: d, status: 'skipped', erro: e.message }); }
    }
    return results;
  }

  /* ----------------------------- Lotes ----------------------------- */
  /**
   * Grava um lote: compara hashes existentes, insere novos, atualiza alterados e
   * apenas renova synced_at dos inalterados. Uma transação por lote.
   */
  async upsertBatch<T extends ObjectLiteral>(target: EntityTarget<T>, keyProp: string, keyColumn: string, mapped: Mapped<any>[], ctx: RunCtx) {
    const valid = new Map<string, Extract<Mapped<any>, { ok: true }>>();
    for (const m of mapped) {
      if (m.ok) valid.set(m.key, m); // duplicatas dentro do lote: prevalece a última
      else { ctx.log.recordsInvalid++; if (ctx.errors.length < 50) this.pushError(ctx, `Registro inválido: ${m.error}`); }
    }
    if (!valid.size) return;
    const keys = [...valid.keys()];
    await this.ds.transaction(async (em) => {
      const repo = em.getRepository(target);
      const existing: { k: string; h: string }[] = await repo.createQueryBuilder('t').select(`t.${keyColumn}`, 'k').addSelect('t.content_hash', 'h').where(`t.${keyColumn} IN (:...keys)`, { keys }).getRawMany();
      const hashes = new Map(existing.map((e) => [String(e.k), e.h]));
      const now = new Date();
      const toWrite: any[] = []; const unchanged: string[] = [];
      for (const [k, m] of valid) {
        const h = hashes.get(k);
        if (h === undefined) { ctx.log.recordsInserted++; toWrite.push({ ...m.value, contentHash: m.hash, syncedAt: now, lastSyncLogId: ctx.log.id }); }
        else if (h !== m.hash) { ctx.log.recordsUpdated++; toWrite.push({ ...m.value, contentHash: m.hash, syncedAt: now, lastSyncLogId: ctx.log.id }); }
        else { ctx.log.recordsUnchanged++; unchanged.push(k); }
      }
      for (let i = 0; i < toWrite.length; i += 200) await repo.upsert(toWrite.slice(i, i + 200), { conflictPaths: [keyProp], skipUpdateIfNoValuesChanged: false });
      if (unchanged.length) await repo.createQueryBuilder().update().set({ syncedAt: now, lastSyncLogId: ctx.log.id } as any).where(`${keyColumn} IN (:...unchanged)`, { unchanged }).execute();
    });
  }

  /** Percorre um endpoint paginado gravando em lotes. Falhas são registradas para reprocessamento. */
  private async crawl<R>(def: EndpointDef, params: Record<string, string | number>, ctx: RunCtx, mapper: (r: R) => Mapped<any>, target: EntityTarget<any>, keyProp: string, keyColumn: string, startPage = 0) {
    let buffer: Mapped<any>[] = [];
    let nextPage = startPage;      // próxima página a buscar
    let bufferStart = startPage;   // primeira página ainda não gravada
    const flush = async () => { if (buffer.length) { await this.upsertBatch(target, keyProp, keyColumn, buffer, ctx); buffer = []; } bufferStart = nextPage; };
    try {
      for await (const p of this.client.paginate<R>(def, params, startPage, { maxRequests: config.sync.maxRequestsPerScope })) {
        if (!buffer.length) bufferStart = p.page;
        ctx.log.recordsFetched += p.items.length;
        buffer.push(...p.items.map(mapper));
        nextPage = p.page + 1;
        if (buffer.length >= config.sync.batchSize) await flush();
      }
      await flush();
    } catch (e) {
      // Grava o que já foi validado; o reprocessamento retoma da primeira página não gravada (upsert é idempotente).
      let resumeFrom = bufferStart;
      try { await flush(); resumeFrom = e instanceof PaginationLimitError ? e.nextPage : nextPage; } catch (flushErr) { this.pushError(ctx, `Falha ao gravar lote: ${flushErr.message}`); }
      ctx.failed.push({ path: def.path, params, page: resumeFrom, error: e.message });
      this.pushError(ctx, e.message);
    }
  }

  /* ----------------------------- Conjuntos ----------------------------- */
  private readonly handlers: Record<DatasetCode, (ctx: RunCtx) => Promise<void>> = {
    'cnes-tipos-unidade': async (ctx) => {
      const body = await this.client.get(ENDPOINTS.tiposUnidade.path);
      const list = this.client.extractList<any>(ENDPOINTS.tiposUnidade, body);
      ctx.log.recordsFetched += list.length;
      await this.upsertBatch(ExternalUnitType, 'codigoTipoUnidade', 'codigo_tipo_unidade', list.map(mapTipoUnidade), ctx);
    },

    'regioes-saude': async (ctx) => {
      // Território nacional completo (5.570 municípios em ~7 páginas): base para os demais conjuntos.
      await this.crawl(ENDPOINTS.municipios, {}, ctx, mapMunicipio, ExternalMunicipality, 'codigoMunicipio', 'codigo_municipio');
    },

    'cnes-estabelecimentos': async (ctx) => {
      const scopes = this.establishmentScopes();
      if (!scopes.length) throw new Error('Configure SYNC_MUNICIPIOS ou SYNC_UFS para limitar o volume (a API devolve 20 estabelecimentos por página).');
      if (ctx.mode === 'incremental') {
        // data_atualizacao filtra pelo dia exato: consulta cada dia desde a última execução bem-sucedida.
        const from = new Date(`${String(ctx.cursor.lastDay)}T00:00:00Z`); const today = new Date();
        for (let d = from; isoDay(d) <= isoDay(today); d = new Date(d.getTime() + 86400000)) {
          for (const s of scopes) await this.crawl(ENDPOINTS.estabelecimentos, { ...s, data_atualizacao: isoDay(d) }, ctx, mapEstabelecimento, ExternalEstablishment, 'codigoCnes', 'codigo_cnes');
        }
      } else {
        for (const s of scopes) await this.crawl(ENDPOINTS.estabelecimentos, s, ctx, mapEstabelecimento, ExternalEstablishment, 'codigoCnes', 'codigo_cnes');
        ctx.nextCursor.lastFullAt = new Date().toISOString();
      }
      ctx.nextCursor.lastDay = isoDay(new Date());
      ctx.nextCursor.scopes = scopes;
    },

    'hospitais-leitos': async (ctx) => {
      const ufs = this.scope.ufs.length ? this.scope.ufs : [''];
      for (const uf of ufs) await this.crawl(ENDPOINTS.hospitaisLeitos, uf ? { uf } : {}, ctx, mapHospitalLeitos, ExternalHospitalBeds, 'recordKey', 'record_key');
    },

    'cnes-profissionais': async (ctx) => {
      if (!this.scope.municipios.length) throw new Error('Configure SYNC_MUNICIPIOS (códigos IBGE) para sincronizar profissionais do CNES.');
      const comp = this.scope.competenciaCnes ? Number(this.scope.competenciaCnes) : await this.detectLatestCompetencia(this.scope.municipios[0]);
      if (!comp) throw new Error('Nenhuma competência recente com dados de profissionais foi encontrada na API.');
      ctx.log.params = { ...(ctx.log.params || {}), competencia: comp };
      for (const m of this.scope.municipios) await this.crawl(ENDPOINTS.profissionais, { co_ibge: m, nu_comp: comp }, ctx, mapCnesProfissional, ExternalCnesProfessional, 'recordKey', 'record_key');
      ctx.nextCursor.competencia = comp;
    },

    catalogo: async (ctx) => {
      const spec = await this.client.get<{ paths: Record<string, Record<string, any>> }>('/static/swagger.json');
      if (!spec?.paths || typeof spec.paths !== 'object') throw new Error('Swagger oficial sem a seção "paths".');
      const syncMap: Record<string, string> = {
        [ENDPOINTS.tiposUnidade.path]: 'cnes-tipos-unidade', [ENDPOINTS.municipios.path]: 'regioes-saude', [ENDPOINTS.estabelecimentos.path]: 'cnes-estabelecimentos',
        [ENDPOINTS.hospitaisLeitos.path]: 'hospitais-leitos', [ENDPOINTS.profissionais.path]: 'cnes-profissionais',
      };
      const now = new Date();
      const rows = Object.entries(spec.paths).flatMap(([path, ops]) => Object.entries(ops).filter(([m]) => m.toLowerCase() === 'get').map(([, op]) => ({
        path: path.slice(0, 200), tag: String(op.tags?.[0] || 'Outros').slice(0, 120), summary: op.summary ? String(op.summary).slice(0, 500) : null,
        parameters: (op.parameters || []).map((p: any) => ({ name: p.name, in: p.in, type: p.type, required: !!p.required, description: p.description ? String(p.description).slice(0, 300) : undefined })),
        syncDataset: syncMap[path] || null, lastSeenAt: now,
      })));
      ctx.log.recordsFetched = rows.length;
      const repo = this.ds.getRepository(ExternalDataset);
      const existing = new Set((await repo.find({ select: { path: true } })).map((d) => d.path));
      await this.ds.transaction(async (em) => { for (let i = 0; i < rows.length; i += 100) await em.getRepository(ExternalDataset).upsert(rows.slice(i, i + 100), ['path']); });
      rows.forEach((r) => (existing.has(r.path) ? ctx.log.recordsUpdated++ : ctx.log.recordsInserted++));
    },
  };

  private establishmentScopes(): Array<Record<string, number>> {
    if (this.scope.municipios.length) return this.scope.municipios.map((m) => ({ codigo_municipio: Number(m) }));
    return this.scope.ufs.filter((u) => UF_IBGE[u]).map((u) => ({ codigo_uf: UF_IBGE[u] }));
  }

  /** Competência (AAAAMM) mais recente com dados, testando do mês atual para trás (até 18 meses). */
  async detectLatestCompetencia(municipio: string): Promise<number | null> {
    const now = new Date();
    for (let i = 0; i < 18; i++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const comp = Number(`${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}`);
      const body = await this.client.get(ENDPOINTS.profissionais.path, { co_ibge: municipio, nu_comp: comp, limit: 1, offset: 0 });
      if (body && this.client.extractList(ENDPOINTS.profissionais, body).length) return comp;
    }
    return null;
  }

  /** Reprocessa somente as requisições que falharam na execução original. */
  private async reprocessRequests(dataset: DatasetCode, ctx: RunCtx, original: SynchronizationLog) {
    const failed = (original.failedRequests || []) as unknown as FailedRequest[];
    if (!failed.length) { await this.handlers[dataset](ctx); return; }
    const table: Record<string, [EndpointDef, (r: any) => Mapped<any>, EntityTarget<any>, string, string]> = {
      [ENDPOINTS.estabelecimentos.path]: [ENDPOINTS.estabelecimentos, mapEstabelecimento, ExternalEstablishment, 'codigoCnes', 'codigo_cnes'],
      [ENDPOINTS.municipios.path]: [ENDPOINTS.municipios, mapMunicipio, ExternalMunicipality, 'codigoMunicipio', 'codigo_municipio'],
      [ENDPOINTS.hospitaisLeitos.path]: [ENDPOINTS.hospitaisLeitos, mapHospitalLeitos, ExternalHospitalBeds, 'recordKey', 'record_key'],
      [ENDPOINTS.profissionais.path]: [ENDPOINTS.profissionais, mapCnesProfissional, ExternalCnesProfessional, 'recordKey', 'record_key'],
    };
    for (const f of failed) {
      const t = table[f.path];
      if (!t) { await this.handlers[dataset](ctx); return; }
      await this.crawl(t[0], f.params, ctx, t[1], t[2], t[3], t[4], f.page || 0);
    }
  }

  async reprocess(logId: string, userId: string | null, background = true) {
    const original = await this.logs.findOne({ where: { id: logId } });
    if (!original) throw new NotFoundException('Execução não encontrada.');
    if (original.status === 'running') throw new ConflictException({ message: 'A execução ainda está em andamento.', code: 'SYNC_RUNNING' });
    if (original.status === 'success') throw new ConflictException({ message: 'A execução foi concluída com sucesso; não há o que reprocessar.', code: 'NOTHING_TO_REPROCESS' });
    return this.start(original.dataset as DatasetCode, { trigger: 'reprocess', userId, reprocessOf: original, background });
  }

  async listLogs(q: { page: number; limit: number; dataset?: string; status?: string }) {
    const where: Record<string, unknown> = {};
    if (q.dataset) where.dataset = q.dataset;
    if (q.status) where.status = q.status;
    const [items, total] = await this.logs.findAndCount({ where, order: { startedAt: 'DESC' }, skip: (q.page - 1) * q.limit, take: q.limit });
    return paginated(items, total, q);
  }
  async getLog(id: string) {
    const l = await this.logs.findOne({ where: { id } });
    if (!l) throw new NotFoundException('Execução não encontrada.');
    return l;
  }
  states() { return this.syncs.find({ where: { dataset: In([...DATASETS]) }, order: { dataset: 'ASC' } }); }
}
