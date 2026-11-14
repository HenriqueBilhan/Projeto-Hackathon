import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import {
  ExternalCnesProfessional, ExternalDataset, ExternalEstablishment, ExternalHospitalBeds, ExternalMunicipality, ExternalUnitType, HealthUnit, Synchronization,
} from '../../database/entities';
import { paginated, resolveSort } from '../../common/dto/pagination.dto';
import { MinisterioSaudeApiError, MinisterioSaudeClient } from './ministerio-saude.client';
import { categoryFromTipoUnidade, mapEstabelecimento, normalizeCnes, SUPPORTED_TIPOS } from './ministerio-saude.mapper';
import { DATASET_INFO, DATASETS, ENDPOINTS, EstabelecimentoApi, UF_IBGE } from './ministerio-saude.types';

/** Consulta dos dados públicos já armazenados no MySQL + operações pontuais na API oficial. */
@Injectable()
export class MinisterioSaudeService {
  private readonly logger = new Logger(MinisterioSaudeService.name);
  constructor(
    readonly client: MinisterioSaudeClient,
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(ExternalEstablishment) private readonly establishments: Repository<ExternalEstablishment>,
    @InjectRepository(ExternalMunicipality) private readonly municipalities: Repository<ExternalMunicipality>,
    @InjectRepository(ExternalUnitType) private readonly unitTypes: Repository<ExternalUnitType>,
    @InjectRepository(ExternalCnesProfessional) private readonly cnesProfessionals: Repository<ExternalCnesProfessional>,
    @InjectRepository(ExternalHospitalBeds) private readonly beds: Repository<ExternalHospitalBeds>,
    @InjectRepository(ExternalDataset) private readonly datasets: Repository<ExternalDataset>,
    @InjectRepository(Synchronization) private readonly syncs: Repository<Synchronization>,
  ) {}

  /** Busca um estabelecimento na API (GET /cnes/estabelecimentos/{codigo_cnes}) e atualiza a base local. */
  async refreshEstablishment(codigo: string): Promise<ExternalEstablishment | null> {
    const cnes = normalizeCnes(codigo);
    if (!cnes) return null;
    const body = await this.client.get<EstabelecimentoApi>(`/cnes/estabelecimentos/${Number(cnes)}`);
    if (!body) return null;
    const m = mapEstabelecimento(body);
    if (!m.ok) throw new MinisterioSaudeApiError(`Registro do CNES ${cnes} inválido: ${m.error}`, 200, false, '/cnes/estabelecimentos/{codigo_cnes}');
    await this.establishments.upsert({ ...m.value, contentHash: m.hash, syncedAt: new Date() }, ['codigoCnes']);
    return this.establishments.findOne({ where: { codigoCnes: cnes } });
  }

  /** Verifica a disponibilidade real da API e resume a base local. */
  async status() {
    const started = Date.now();
    let api: { disponivel: boolean; latenciaMs: number | null; erro: string | null };
    try {
      const body = await new MinisterioSaudeClient({ maxRetries: 0, timeoutMs: 10000, minIntervalMs: 0 }).get(ENDPOINTS.tiposUnidade.path);
      api = { disponivel: !!body, latenciaMs: Date.now() - started, erro: null };
    } catch (e) {
      api = { disponivel: false, latenciaMs: null, erro: e.message };
    }
    const [estabelecimentos, municipios, tipos, profissionais, hospitais, catalogo] = await Promise.all([
      this.establishments.count(), this.municipalities.count(), this.unitTypes.count(), this.cnesProfessionals.count(), this.beds.count(), this.datasets.count(),
    ]);
    const sincronizacoes = await this.syncs.find();
    const byCode = Object.fromEntries(sincronizacoes.map((s) => [s.dataset, s]));
    return {
      api: { baseUrl: this.client.opts.baseUrl, ...api },
      baseLocal: { estabelecimentos, municipios, tiposUnidade: tipos, profissionaisCnes: profissionais, hospitaisLeitos: hospitais, endpointsCatalogados: catalogo },
      conjuntos: DATASETS.map((code) => ({ codigo: code, ...DATASET_INFO[code], sincronizacao: byCode[code] || null })),
    };
  }

  /** Catálogo dos endpoints oficiais (persistido pela sincronização "catalogo"). */
  async catalog(q: { tag?: string; q?: string }) {
    const qb = this.datasets.createQueryBuilder('d');
    if (q.tag) qb.andWhere('d.tag = :t', { t: q.tag });
    if (q.q) qb.andWhere('(d.path LIKE :q OR d.summary LIKE :q)', { q: `%${q.q}%` });
    const items = await qb.orderBy('d.tag', 'ASC').addOrderBy('d.path', 'ASC').getMany();
    const syncs = Object.fromEntries((await this.syncs.find()).map((s) => [s.dataset, s]));
    return {
      sincronizados: DATASETS.map((code) => ({ codigo: code, ...DATASET_INFO[code], estado: syncs[code] || null })),
      endpoints: items.map((d) => ({ caminho: d.path, tema: d.tag, resumo: d.summary, parametros: d.parameters, sincronizadoComo: d.syncDataset, vistoEm: d.lastSeenAt })),
      total: items.length,
    };
  }

  async searchEstablishments(q: { page: number; limit: number; sort?: string; order?: string; q?: string; codigoMunicipio?: string; uf?: string; tipo?: number; somenteSuportados?: boolean }) {
    const [col, dir] = resolveSort(q, { nome: 'e.nomeFantasia', cnes: 'e.codigoCnes', atualizacao: 'e.dataAtualizacao' }, 'nome');
    const qb = this.establishments.createQueryBuilder('e');
    if (q.q) qb.andWhere('(e.nome_fantasia LIKE :q OR e.nome_razao_social LIKE :q OR e.codigo_cnes = :exact)', { q: `%${q.q}%`, exact: normalizeCnes(q.q) || '' });
    if (q.codigoMunicipio) qb.andWhere('e.codigo_municipio = :m', { m: q.codigoMunicipio });
    if (q.uf && UF_IBGE[q.uf.toUpperCase()]) qb.andWhere('e.codigo_uf = :uf', { uf: UF_IBGE[q.uf.toUpperCase()] });
    if (q.tipo) qb.andWhere('e.codigo_tipo_unidade = :t', { t: q.tipo });
    if (q.somenteSuportados) qb.andWhere('e.codigo_tipo_unidade IN (:...tipos)', { tipos: SUPPORTED_TIPOS });
    qb.orderBy(col, q.sort ? dir : 'ASC').skip((q.page - 1) * q.limit).take(q.limit);
    const [items, total] = await qb.getManyAndCount();
    const tipos = Object.fromEntries((await this.unitTypes.find()).map((t) => [t.codigoTipoUnidade, t.descricaoTipoUnidade]));
    const muns = items.length ? Object.fromEntries((await this.municipalities.find({ where: { codigoMunicipio: In([...new Set(items.map((i) => i.codigoMunicipio).filter(Boolean) as string[])]) } })).map((m) => [m.codigoMunicipio, m])) : {};
    const imported = items.length ? new Set((await this.ds.getRepository(HealthUnit).find({ where: { cnes: In(items.map((i) => i.codigoCnes)) }, select: { cnes: true } })).map((u) => u.cnes)) : new Set();
    return paginated(items.map((e) => ({
      ...e, tipoDescricao: e.codigoTipoUnidade !== null ? tipos[e.codigoTipoUnidade] || null : null, categoriaConecta: categoryFromTipoUnidade(e.codigoTipoUnidade),
      municipio: e.codigoMunicipio ? muns[e.codigoMunicipio]?.municipio || null : null, regiaoSaude: e.codigoMunicipio ? muns[e.codigoMunicipio]?.regiaoSaude || null : null,
      importadoComoUnidade: imported.has(e.codigoCnes),
    })), total, q);
  }

  async getEstablishment(cnes: string, refresh = false) {
    const code = normalizeCnes(cnes);
    if (!code) return null;
    const e = refresh ? await this.refreshEstablishment(code) : await this.establishments.findOne({ where: { codigoCnes: code } });
    if (!e) return null;
    const [tipo, mun, profs] = await Promise.all([
      e.codigoTipoUnidade !== null ? this.unitTypes.findOne({ where: { codigoTipoUnidade: e.codigoTipoUnidade } }) : null,
      e.codigoMunicipio ? this.municipalities.findOne({ where: { codigoMunicipio: e.codigoMunicipio } }) : null,
      this.cnesProfessionals.createQueryBuilder('p').select('p.nu_comp', 'comp').addSelect('COUNT(*)', 'n').where('p.co_cnes = :c', { c: code }).groupBy('p.nu_comp').orderBy('p.nu_comp', 'DESC').limit(1).getRawOne(),
    ]);
    return { ...e, tipoDescricao: tipo?.descricaoTipoUnidade || null, categoriaConecta: categoryFromTipoUnidade(e.codigoTipoUnidade), municipioInfo: mun, profissionaisCnes: profs ? { competencia: Number(profs.comp), total: Number(profs.n) } : null };
  }

  async searchMunicipalities(q: { page: number; limit: number; q?: string; uf?: string; regiaoSaude?: string }) {
    const qb = this.municipalities.createQueryBuilder('m');
    if (q.q) qb.andWhere('(m.municipio LIKE :q OR m.codigo_municipio = :c)', { q: `%${q.q}%`, c: q.q });
    if (q.uf && UF_IBGE[q.uf.toUpperCase()]) qb.andWhere('m.codigo_uf = :uf', { uf: String(UF_IBGE[q.uf.toUpperCase()]) });
    if (q.regiaoSaude) qb.andWhere('m.codigo_regiao_saude = :r', { r: q.regiaoSaude });
    qb.orderBy('m.municipio', 'ASC').skip((q.page - 1) * q.limit).take(q.limit);
    const [items, total] = await qb.getManyAndCount();
    return paginated(items, total, q);
  }

  listUnitTypes() {
    return this.unitTypes.find({ order: { codigoTipoUnidade: 'ASC' } }).then((r) => r.map((t) => ({ ...t, categoriaConecta: categoryFromTipoUnidade(t.codigoTipoUnidade) })));
  }

  async searchCnesProfessionals(q: { page: number; limit: number; q?: string; cnes?: string; competencia?: number; cbo?: string }) {
    const qb = this.cnesProfessionals.createQueryBuilder('p');
    if (q.q) qb.andWhere('p.no_profissional LIKE :q', { q: `%${q.q}%` });
    if (q.cnes) qb.andWhere('p.co_cnes = :c', { c: normalizeCnes(q.cnes) });
    if (q.competencia) qb.andWhere('p.nu_comp = :comp', { comp: q.competencia });
    if (q.cbo) qb.andWhere('p.ds_cbo LIKE :cbo', { cbo: `%${q.cbo}%` });
    qb.orderBy('p.nu_comp', 'DESC').addOrderBy('p.no_profissional', 'ASC').skip((q.page - 1) * q.limit).take(q.limit);
    const [items, total] = await qb.getManyAndCount();
    return paginated(items, total, q);
  }

  async searchHospitalBeds(q: { page: number; limit: number; q?: string; uf?: string; municipio?: string }) {
    const qb = this.beds.createQueryBuilder('h');
    if (q.q) qb.andWhere('(h.nome_hospital LIKE :q OR h.razao_social LIKE :q)', { q: `%${q.q}%` });
    if (q.uf) qb.andWhere('h.uf = :uf', { uf: q.uf.toUpperCase() });
    if (q.municipio) qb.andWhere('h.municipio LIKE :m', { m: `%${q.municipio}%` });
    qb.orderBy('h.leitos_total', 'DESC').skip((q.page - 1) * q.limit).take(q.limit);
    const [items, total] = await qb.getManyAndCount();
    return paginated(items, total, q);
  }

  /** Indicadores agregados dos dados públicos (por tipo de unidade e município). */
  async stats() {
    const porTipo = await this.establishments.createQueryBuilder('e').leftJoin(ExternalUnitType, 't', 't.codigo_tipo_unidade = e.codigo_tipo_unidade')
      .select('e.codigo_tipo_unidade', 'codigo').addSelect('t.descricao_tipo_unidade', 'descricao').addSelect('COUNT(*)', 'total').groupBy('e.codigo_tipo_unidade').addGroupBy('t.descricao_tipo_unidade').orderBy('total', 'DESC').getRawMany();
    const porMunicipio = await this.establishments.createQueryBuilder('e').leftJoin(ExternalMunicipality, 'm', 'm.codigo_municipio = e.codigo_municipio')
      .select('e.codigo_municipio', 'codigo').addSelect('m.municipio', 'municipio').addSelect('COUNT(*)', 'total').groupBy('e.codigo_municipio').addGroupBy('m.municipio').orderBy('total', 'DESC').limit(30).getRawMany();
    // Várias versões por hospital sem período: usa o maior valor publicado de cada hospital (não soma versões).
    const leitos = await this.ds.query(`SELECT uf, SUM(t) leitos, SUM(s) leitosSus, SUM(u) uti, COUNT(*) hospitais, SUM(v) versoesPublicadas FROM (
      SELECT uf, MAX(leitos_total) t, MAX(leitos_sus) s, MAX(uti_total) u, COUNT(*) v FROM external_hospital_beds GROUP BY uf, municipio, nome_hospital, razao_social, cep) x GROUP BY uf ORDER BY leitos DESC`);
    const num = (rows: Record<string, unknown>[], keys: string[]) => rows.map((r) => ({ ...r, ...Object.fromEntries(keys.map((k) => [k, Number(r[k])])) }));
    return { estabelecimentosPorTipo: num(porTipo, ['total']), estabelecimentosPorMunicipio: num(porMunicipio, ['total']), leitosPorUf: num(leitos, ['leitos', 'leitosSus', 'uti', 'hospitais', 'versoesPublicadas']), observacao: 'Leitos: maior valor publicado por hospital (a API não informa o período de cada versão).' };
  }
}
