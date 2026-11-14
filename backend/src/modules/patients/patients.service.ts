import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, In, Repository } from 'typeorm';
import { Attendance, AuditLog, Patient, PatientAllergy, PatientChronicCondition, User } from '../../database/entities';
import { paginated, resolveSort } from '../../common/dto/pagination.dto';
import { isValidCns, isValidCpf, onlyDigits } from '../../common/utils/documents';
import { wallClock } from '../../common/utils/dates';
import type { AuthUser } from '../../common/types';
import { AuditService } from '../core/audit.service';
import { NotificationsService } from '../core/notifications.service';
import { PatientAccessService } from '../core/patient-access.service';
import { SettingsService } from '../core/settings.service';
import { auditDto, patientDto } from '../core/presenters';
import { CreatePatientDto, PatientQueryDto, UpdatePatientDto } from './patients.dto';

@Injectable()
export class PatientsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(Patient) private readonly repo: Repository<Patient>,
    @InjectRepository(Attendance) private readonly attendances: Repository<Attendance>,
    @InjectRepository(AuditLog) private readonly logs: Repository<AuditLog>,
    private readonly access: PatientAccessService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
  ) {}

  private loadFull(id: string) {
    return this.repo.findOneOrFail({ where: { id }, relations: { allergies: true, chronicConditions: true, hospitalizations: true } });
  }

  /** Busca/identificação de pacientes (profissionais e gestores). Retorna apenas dados cadastrais mascarados. */
  async list(user: AuthUser, q: PatientQueryDto) {
    const [col, dir] = resolveSort(q, { nome: 'p.name', nascimento: 'p.birthDate', cadastro: 'p.createdAt' }, 'nome');
    const qb = this.repo.createQueryBuilder('p');
    const cpf = onlyDigits(q.cpf); const cns = onlyDigits(q.cns);
    if (q.cpf) { if (!isValidCpf(cpf)) throw new BadRequestException({ message: 'CPF inválido. Digite os 11 dígitos.', code: 'INVALID_CPF' }); qb.andWhere('p.cpf = :cpf', { cpf }); }
    if (q.cns) { if (cns.length < 4) throw new BadRequestException({ message: 'Digite ao menos 4 dígitos do CNS.', code: 'INVALID_CNS' }); qb.andWhere(cns.length === 15 ? 'p.cns = :cns' : 'p.cns LIKE :cnsl', { cns, cnsl: `%${cns}%` }); }
    if (q.q) {
      if (q.q.trim().length < 3) throw new BadRequestException({ message: 'Digite ao menos 3 letras do nome.', code: 'SEARCH_TOO_SHORT' });
      qb.andWhere('p.name LIKE :q', { q: `%${q.q.trim()}%` });
    }
    if (q.unidadeRef) qb.andWhere('p.reference_unit_id = :u', { u: q.unidadeRef });
    qb.orderBy(col, q.sort ? dir : 'ASC').skip((q.page - 1) * q.limit).take(q.limit);
    const [items, total] = await qb.getManyAndCount();
    if ((q.cpf || q.cns || q.q) && user.role === 'profissional') await this.audit.log(user, 'Pesquisa de paciente', { detail: `Busca por ${q.cpf ? 'CPF' : q.cns ? 'CNS' : 'nome'}` });
    const last = await this.lastAttendances(user, items.map((p) => p.id));
    const counts = user.role === 'admin' ? await this.attendanceCounts(items.map((p) => p.id)) : {};
    return paginated(items.map((p) => ({ ...patientDto(p, 'cadastral'), ultimoAtendimento: last[p.id] || null, ...(user.role === 'admin' ? { registros: counts[p.id] || 0 } : {}) })), total, q);
  }

  private async lastAttendances(user: AuthUser, ids: string[]) {
    if (!ids.length || user.role !== 'profissional') return {} as Record<string, { data: string | null; unidadeId: string }>;
    const hidden = await this.access.hiddenUnitIdsFor(user);
    const qb = this.attendances.createQueryBuilder('a').select(['a.patientId', 'a.unitId', 'a.occurredAt'])
      .where('a.patient_id IN (:...ids)', { ids }).andWhere("a.status = 'Finalizado'").orderBy('a.occurredAt', 'DESC');
    if (hidden.length) qb.andWhere('a.unit_id NOT IN (:...hidden)', { hidden });
    const out: Record<string, { data: string | null; unidadeId: string }> = {};
    (await qb.getMany()).forEach((a) => { if (!out[a.patientId]) out[a.patientId] = { data: wallClock(a.occurredAt), unidadeId: a.unitId }; });
    return out;
  }
  private async attendanceCounts(ids: string[]) {
    if (!ids.length) return {} as Record<string, number>;
    const rows = await this.attendances.createQueryBuilder('a').select('a.patient_id', 'pid').addSelect('COUNT(*)', 'n').where('a.patient_id IN (:...ids)', { ids }).groupBy('a.patient_id').getRawMany();
    return Object.fromEntries(rows.map((r) => [r.pid, Number(r.n)]));
  }

  /** Prontuário/identificação do paciente conforme o perfil de quem consulta. */
  async get(user: AuthUser, id: string, opts: { justificativa?: string; reveal?: boolean } = {}) {
    if (user.role === 'admin') {
      const p = await this.access.getPatientOr404(id);
      await this.audit.log(user, 'Consulta de dados cadastrais', { patientId: id });
      return patientDto(p, 'cadastral');
    }
    const { emergency } = await this.access.assertClinicalAccess(user, id, opts.justificativa);
    const p = await this.loadFull(id);
    if (user.role === 'paciente') return patientDto(p, 'self', true);
    let reveal = false;
    if (opts.reveal) {
      if (!(await this.settings.can(user.cargo, 'dados_cadastrais'))) throw new ForbiddenException({ message: 'Seu perfil não pode exibir documentos completos.', code: 'CLINICAL_PERMISSION' });
      reveal = true;
      await this.audit.log(user, 'Exibição de dados sensíveis (CPF/CNS)', { patientId: id });
    } else {
      await this.audit.log(user, 'Visualização de prontuário', { patientId: id, detail: emergency ? 'Acesso de emergência' : null });
      await this.notifyAccess(user, p);
    }
    return { ...patientDto(p, 'clinical', reveal), acessoEmergencia: emergency };
  }

  private async notifyAccess(user: AuthUser, p: Patient) {
    if (!p.notifyOnAccess || !(await this.settings.get('notificarPacienteAcesso'))) return;
    const unit = user.unitId ? (await this.ds.query('SELECT name FROM health_units WHERE id = ?', [user.unitId]))[0]?.name : '';
    await this.notifications.notifyPatient(p.id, 'Seu prontuário foi acessado', `${user.name}${unit ? ` (${unit})` : ''} consultou seu histórico.`, 'perfil-paciente.html#acessos', 'shield-check', true);
  }

  async create(user: AuthUser, dto: CreatePatientDto) {
    if (!(await this.settings.can(user.cargo, 'registrar')) && !(await this.settings.can(user.cargo, 'dados_cadastrais'))) {
      throw new ForbiddenException({ message: 'Seu perfil não pode cadastrar pacientes.', code: 'CLINICAL_PERMISSION' });
    }
    const cpf = onlyDigits(dto.cpf); const cns = onlyDigits(dto.cns);
    if (!isValidCpf(cpf)) throw new BadRequestException({ message: 'CPF inválido.', code: 'INVALID_CPF' });
    if (!isValidCns(cns)) throw new BadRequestException({ message: 'CNS inválido.', code: 'INVALID_CNS' });
    if (await this.repo.exist({ where: [{ cpf }, { cns }] })) throw new ConflictException({ message: 'Paciente já cadastrado (CPF ou CNS).', code: 'PATIENT_EXISTS' });
    const id = await this.ds.transaction(async (m) => {
      const p = await m.save(m.create(Patient, {
        name: dto.nome.trim(), cpf, cns, birthDate: dto.nascimento, sex: dto.sexo || 'Não informado', bloodType: dto.tipoSanguineo || 'Não informado',
        phone: dto.telefone || null, email: dto.email || null, address: dto.endereco || null, motherName: dto.nomeMae || null,
        emergencyContact: dto.contatoEmergencia || null, referenceUnitId: dto.unidadeRef || user.unitId,
      }));
      await this.replaceClinicalLists(m, p.id, dto.alergias, dto.cronicas);
      return p.id;
    });
    await this.audit.log(user, 'Cadastro de paciente', { patientId: id });
    return patientDto(await this.loadFull(id), 'clinical');
  }

  private async replaceClinicalLists(m: DataSource['manager'], patientId: string, alergias?: { nome: string; gravidade?: string; reacao?: string }[], cronicas?: string[]) {
    if (alergias) {
      await m.delete(PatientAllergy, { patientId });
      const uniq = [...new Map(alergias.map((a) => [a.nome.trim().toLowerCase(), a])).values()];
      if (uniq.length) await m.insert(PatientAllergy, uniq.map((a) => ({ patientId, substance: a.nome.trim(), severity: a.gravidade || 'Moderada', reaction: a.reacao || null })));
    }
    if (cronicas) {
      await m.delete(PatientChronicCondition, { patientId });
      const uniq = [...new Set(cronicas.map((c) => c.trim()).filter(Boolean))];
      if (uniq.length) await m.insert(PatientChronicCondition, uniq.map((description) => ({ patientId, description, cid10: (description.match(/CID\s*([A-Z]\d{2}(\.\d)?)/i) || [])[1] || null })));
    }
  }

  async update(user: AuthUser, id: string, dto: UpdatePatientDto) {
    if (user.role === 'admin') throw new ForbiddenException({ message: 'Gestores não editam cadastros de pacientes.', code: 'ADMIN_NO_CLINICAL' });
    await this.access.assertClinicalAccess(user, id);
    const isSelf = user.role === 'paciente';
    if (!isSelf && !(await this.settings.can(user.cargo, 'registrar'))) throw new ForbiddenException({ message: 'Seu perfil não pode alterar dados do paciente.', code: 'CLINICAL_PERMISSION' });
    if (isSelf && (dto.alergias || dto.cronicas || dto.tipoSanguineo || dto.unidadeRef || dto.sexo || dto.nomeMae)) {
      throw new ForbiddenException({ message: 'Informações clínicas e cadastrais são atualizadas pela unidade de saúde.', code: 'FIELD_FORBIDDEN' });
    }
    if (!isSelf && dto.preferencias) throw new ForbiddenException({ message: 'Somente o paciente altera suas preferências de privacidade.', code: 'FIELD_FORBIDDEN' });
    await this.ds.transaction(async (m) => {
      const patch: Partial<Patient> = {
        ...(dto.telefone !== undefined && { phone: dto.telefone || null }), ...(dto.email !== undefined && { email: dto.email || null }),
        ...(dto.endereco !== undefined && { address: dto.endereco || null }), ...(dto.contatoEmergencia !== undefined && { emergencyContact: dto.contatoEmergencia || null }),
        ...(dto.nomeMae !== undefined && { motherName: dto.nomeMae || null }), ...(dto.unidadeRef !== undefined && { referenceUnitId: dto.unidadeRef }),
        ...(dto.sexo !== undefined && { sex: dto.sexo }), ...(dto.tipoSanguineo !== undefined && { bloodType: dto.tipoSanguineo }),
        ...(dto.preferencias?.notificarAcesso !== undefined && { notifyOnAccess: dto.preferencias.notificarAcesso }),
        ...(dto.preferencias?.compartilhar !== undefined && { shareConsent: dto.preferencias.compartilhar }),
      };
      if (Object.keys(patch).length) await m.update(Patient, id, patch);
      if (dto.email !== undefined && isSelf) await m.update(User, { patientId: id }, { email: dto.email || null });
      await this.replaceClinicalLists(m, id, dto.alergias, dto.cronicas);
    });
    const op = dto.preferencias ? 'Alteração de preferências de privacidade' : dto.alergias || dto.cronicas ? 'Atualização de dados clínicos' : 'Atualização de dados cadastrais';
    await this.audit.log(user, op, { patientId: id });
    return patientDto(await this.loadFull(id), isSelf ? 'self' : 'clinical', isSelf);
  }

  /** Exclusão (gestor). Bloqueada se houver registros clínicos — prontuários devem ser preservados. */
  async remove(user: AuthUser, id: string) {
    const p = await this.access.getPatientOr404(id);
    const hasRecords = await this.attendances.exist({ where: { patientId: id } });
    if (hasRecords) throw new ConflictException({ message: 'O paciente possui registros clínicos e não pode ser excluído (retenção obrigatória de prontuários).', code: 'PATIENT_HAS_RECORDS' });
    await this.ds.transaction(async (m) => { await m.delete(User, { patientId: id }); await m.delete(Patient, id); });
    await this.audit.log(user, 'Exclusão de cadastro de paciente', { detail: p.name.split(' ')[0] });
    return { id };
  }

  /** Registros de acesso ao prontuário (transparência ao titular; sem IP). */
  async accessLogs(user: AuthUser, id: string, page = 1, limit = 50) {
    if (user.role !== 'paciente' || user.patientId !== id) throw new ForbiddenException({ message: 'Somente o titular consulta os acessos ao próprio prontuário.', code: 'NOT_OWNER' });
    const [items, total] = await this.logs.createQueryBuilder('l').where('l.patient_id = :id', { id })
      .andWhere(new Brackets((b) => b.where('l.user_id IS NULL').orWhere('l.user_id <> :me', { me: user.userId })))
      .orderBy('l.occurredAt', 'DESC').skip((page - 1) * limit).take(limit).getManyAndCount();
    return paginated(items.map((l) => auditDto(l, null, false)), total, { page, limit });
  }

  async byIds(ids: string[]) { return ids.length ? this.repo.find({ where: { id: In(ids) } }) : []; }
}
