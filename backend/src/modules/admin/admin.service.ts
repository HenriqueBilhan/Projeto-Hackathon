import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { AuditLog, ExternalEstablishment, HealthUnit, Patient, Synchronization, User, UserSession } from '../../database/entities';
import { paginated } from '../../common/dto/pagination.dto';
import { maskCns, maskCpf } from '../../common/utils/documents';
import type { AuthUser } from '../../common/types';
import { AuditService } from '../core/audit.service';
import { AuthContextService } from '../core/auth-context.service';
import { SettingsService } from '../core/settings.service';
import { auditDto, unitDto } from '../core/presenters';

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** Indicadores e governança. Somente agregados e metadados — nunca conteúdo clínico individual. */
@Injectable()
export class AdminService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(AuditLog) private readonly logs: Repository<AuditLog>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly ctx: AuthContextService,
  ) {}

  private monthKeys(n: number) {
    const now = new Date(); const out: { key: string; label: string }[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      out.push({ key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, label: `${MONTHS[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}` });
    }
    return out;
  }
  private async monthly(sql: string, n: number) {
    const rows: { m: string; n: string }[] = await this.ds.query(sql, [n - 1]);
    const map = Object.fromEntries(rows.map((r) => [r.m, Number(r.n)]));
    return this.monthKeys(n).map((k) => map[k.key] || 0);
  }

  async indicators(months = 6) {
    const one = async (sql: string) => Number((await this.ds.query(sql))[0].n);
    const [pacientes, profissionais, profissionaisAtivos, unidades, integradas, atendimentos, exames, examesComResultado, prescricoes, encaminhamentos] = await Promise.all([
      one('SELECT COUNT(*) n FROM patients'), one('SELECT COUNT(*) n FROM professionals'), one('SELECT COUNT(*) n FROM professionals WHERE active = 1'),
      one('SELECT COUNT(*) n FROM health_units'), one('SELECT COUNT(*) n FROM health_unit_integrations WHERE sharing_enabled = 1'),
      one("SELECT COUNT(*) n FROM attendances WHERE status = 'Finalizado'"), one("SELECT COUNT(*) n FROM exams WHERE status <> 'Cancelado'"),
      one("SELECT COUNT(*) n FROM exams WHERE status = 'Resultado disponível'"), one('SELECT COUNT(*) n FROM prescription_medications'), one('SELECT COUNT(*) n FROM referrals'),
    ]);
    const since = 'DATE_FORMAT(DATE_SUB(UTC_DATE(), INTERVAL ? MONTH), "%Y-%m-01")';
    const meses = this.monthKeys(months).map((k) => k.label);
    const atendimentosMes = await this.monthly(`SELECT DATE_FORMAT(occurred_at,'%Y-%m') m, COUNT(*) n FROM attendances WHERE status='Finalizado' AND occurred_at >= ${since} GROUP BY m`, months);
    const examesMes = await this.monthly(`SELECT DATE_FORMAT(performed_at,'%Y-%m') m, COUNT(*) n FROM exams WHERE status <> 'Cancelado' AND performed_at >= ${since} GROUP BY m`, months);
    const pacientesMes = await this.monthly(`SELECT DATE_FORMAT(occurred_at,'%Y-%m') m, COUNT(DISTINCT patient_id) n FROM attendances WHERE status='Finalizado' AND occurred_at >= ${since} GROUP BY m`, months);
    const porUnidade: { id: string; n: string }[] = await this.ds.query(`SELECT unit_id id, COUNT(*) n FROM attendances WHERE status='Finalizado' AND occurred_at >= ${since} GROUP BY unit_id`, [months - 1]);
    const units = await this.ds.getRepository(HealthUnit).find({ relations: { integration: true } });
    const volMap = Object.fromEntries(porUnidade.map((r) => [r.id, Number(r.n)]));
    const unidadesDto = units.map((u) => unitDto(u, { volume: volMap[u.id] || 0 }));
    const tipos: { t: string; n: string }[] = await this.ds.query(`SELECT type t, COUNT(*) n FROM attendances WHERE status='Finalizado' AND occurred_at >= ${since} GROUP BY type`, [months - 1]);
    // A API publica várias versões por hospital sem período: soma-se o MAIOR valor publicado de cada hospital.
    const [leitos] = await this.ds.query(`SELECT COALESCE(SUM(t),0) total, COALESCE(SUM(s),0) sus, COALESCE(SUM(u),0) uti, COUNT(*) hospitais FROM (
      SELECT MAX(leitos_total) t, MAX(leitos_sus) s, MAX(uti_total) u FROM external_hospital_beds GROUP BY uf, municipio, nome_hospital, razao_social, cep) x`);
    const estabelecimentos = await this.ds.getRepository(ExternalEstablishment).count();
    return {
      totais: { pacientes, profissionais, profissionaisAtivos, unidades, unidadesIntegradas: integradas, atendimentos, exames, examesComResultado, prescricoes, encaminhamentos },
      meses, atendimentosMes, examesMes, pacientesMes,
      unidades: unidadesDto, tiposAtendimento: Object.fromEntries(tipos.map((t) => [t.t, Number(t.n)])),
      dadosPublicos: { estabelecimentosCnes: estabelecimentos, hospitais: Number(leitos.hospitais), leitosMaxPublicado: Number(leitos.total), leitosSusMaxPublicado: Number(leitos.sus), leitosUtiMaxPublicado: Number(leitos.uti) },
    };
  }

  async dashboard() {
    const ind = await this.indicators(6);
    const recent = await this.logs.find({ order: { occurredAt: 'DESC' }, take: 8 });
    const pats = await this.patientsMap(recent.map((r) => r.patientId).filter(Boolean) as string[]);
    const syncs = await this.ds.getRepository(Synchronization).find({ order: { dataset: 'ASC' } });
    return { ...ind, atividadesRecentes: recent.map((l) => auditDto(l, l.patientId ? pats[l.patientId] : null)), sincronizacoes: syncs };
  }

  private async patientsMap(ids: string[]) {
    if (!ids.length) return {} as Record<string, { name: string; cpf: string }>;
    const rows = await this.patients.createQueryBuilder('p').select(['p.id', 'p.name', 'p.cpf']).where('p.id IN (:...ids)', { ids: [...new Set(ids)] }).getMany();
    // Gestores veem apenas o primeiro nome + CPF mascarado na auditoria.
    return Object.fromEntries(rows.map((p) => [p.id, { name: p.name.split(' ')[0], cpf: p.cpf }]));
  }

  async auditLogs(q: { page: number; limit: number; q?: string; operacao?: string; unidadeId?: string; data?: string; pacienteId?: string }) {
    const qb = this.logs.createQueryBuilder('l');
    if (q.q) qb.leftJoin(Patient, 'p', 'p.id = l.patient_id').andWhere('(l.user_name LIKE :q OR p.name LIKE :q)', { q: `%${q.q}%` });
    if (q.operacao) qb.andWhere('l.operation = :op', { op: q.operacao });
    if (q.unidadeId) qb.andWhere('l.unit_id = :u', { u: q.unidadeId });
    if (q.pacienteId) qb.andWhere('l.patient_id = :pid', { pid: q.pacienteId });
    if (q.data) qb.andWhere('DATE(l.occurred_at) = :d', { d: q.data });
    qb.orderBy('l.occurredAt', 'DESC').addOrderBy('l.id', 'DESC').skip((q.page - 1) * q.limit).take(q.limit);
    const [items, total] = await qb.getManyAndCount();
    const pats = await this.patientsMap(items.map((i) => i.patientId).filter(Boolean) as string[]);
    const ops: { op: string }[] = await this.ds.query('SELECT DISTINCT operation op FROM audit_logs ORDER BY op');
    const res = paginated(items.map((l) => auditDto(l, l.patientId ? pats[l.patientId] : null)), total, q);
    return { ...res, meta: { ...res.meta, operacoes: ops.map((o) => o.op) } };
  }

  async listUsers(q: { page: number; limit: number; q?: string; role?: string }) {
    const qb = this.users.createQueryBuilder('u').innerJoinAndSelect('u.role', 'r');
    if (q.q) qb.andWhere('u.name LIKE :q', { q: `%${q.q}%` });
    if (q.role) qb.andWhere('r.code = :r', { r: q.role });
    qb.orderBy('u.name', 'ASC').skip((q.page - 1) * q.limit).take(q.limit);
    const [items, total] = await qb.getManyAndCount();
    return paginated(items.map((u) => ({ id: u.id, nome: u.name, cpf: maskCpf(u.cpf), perfil: u.role.code, ativo: u.active, bloqueadoAte: u.lockedUntil?.toISOString() ?? null, ultimoAcesso: u.lastLoginAt?.toISOString() ?? null })), total, q);
  }

  async updateUser(actor: AuthUser, id: string, dto: { ativo?: boolean; desbloquear?: boolean; encerrarSessoes?: boolean }) {
    const u = await this.users.findOne({ where: { id } });
    if (!u) throw new NotFoundException('Usuário não encontrado.');
    if (id === actor.userId && dto.ativo === false) throw new BadRequestException({ message: 'Você não pode desativar a própria conta.', code: 'SELF_DISABLE' });
    await this.users.update(id, { ...(dto.ativo !== undefined && { active: dto.ativo }), ...(dto.desbloquear && { lockedUntil: null, failedLoginAttempts: 0 }) });
    if (dto.ativo === false || dto.encerrarSessoes) await this.ds.getRepository(UserSession).update({ userId: id, revokedAt: IsNull() }, { revokedAt: new Date() });
    this.ctx.invalidate(id);
    await this.audit.log(actor, dto.ativo === false ? 'Desativação de usuário' : dto.desbloquear ? 'Desbloqueio de usuário' : 'Atualização de usuário', { detail: u.name });
    return { id };
  }

  /** Exportações CSV (dados mascarados). Bloqueadas quando "bloquearExportacao" está ativo. */
  async exportCsv(actor: AuthUser, type: 'pacientes' | 'auditoria' | 'indicadores') {
    if (await this.settings.get('bloquearExportacao')) throw new ForbiddenException({ message: 'A exportação de dados está bloqueada pela política de segurança.', code: 'EXPORT_BLOCKED' });
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    let rows: unknown[][];
    if (type === 'pacientes') {
      const ps = await this.patients.find({ relations: { referenceUnit: true }, order: { name: 'ASC' } });
      rows = [['Nome', 'CPF (mascarado)', 'CNS (mascarado)', 'Nascimento', 'Unidade de referência'], ...ps.map((p) => [p.name, maskCpf(p.cpf), maskCns(p.cns), p.birthDate, p.referenceUnit?.name || ''])];
    } else if (type === 'auditoria') {
      const ls = await this.logs.find({ order: { occurredAt: 'DESC' }, take: 10000 });
      const pats = await this.patientsMap(ls.map((l) => l.patientId).filter(Boolean) as string[]);
      rows = [['Data/hora (UTC)', 'Usuário', 'Perfil', 'Paciente', 'CPF paciente', 'Unidade', 'Operação', 'Detalhe', 'IP'], ...ls.map((l) => {
        const p = l.patientId ? pats[l.patientId] : null;
        return [l.occurredAt.toISOString(), l.userName, l.userRole, p?.name || '', p ? maskCpf(p.cpf) : '', l.unitId || '', l.operation, l.detail || '', l.ip || ''];
      })];
    } else {
      const ind = await this.indicators(12);
      rows = [['Unidade', 'Tipo', 'Atendimentos (12 meses)', 'Situação'], ...ind.unidades.map((u) => [u.nome, u.tipo, u.volume, u.status]), [], ['Mês', 'Atendimentos', 'Exames', 'Pacientes atendidos'], ...ind.meses.map((m, i) => [m, ind.atendimentosMes[i], ind.examesMes[i], ind.pacientesMes[i]])];
    }
    await this.audit.log(actor, 'Exportação de relatório', { detail: `${type} (dados mascarados)` });
    return '﻿' + rows.map((r) => r.map(esc).join(';')).join('\n');
  }
}
