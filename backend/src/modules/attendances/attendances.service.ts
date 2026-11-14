import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  Appointment, Attendance, AttendanceProcedure, AttendanceVitalSigns, Exam, ExamRequest, HealthUnit, HealthUnitIntegration, PatientHospitalization, Professional, Referral,
} from '../../database/entities';
import { paginated, resolveSort } from '../../common/dto/pagination.dto';
import { nowWallClock, parseWallClock, todayWall } from '../../common/utils/dates';
import type { AuthUser } from '../../common/types';
import { AuditService } from '../core/audit.service';
import { NotificationsService } from '../core/notifications.service';
import { PatientAccessService } from '../core/patient-access.service';
import { attendanceDto } from '../core/presenters';
import { AttendanceQueryDto, CreateAttendanceDto } from './attendances.dto';

const RELATIONS = { procedures: true, vitalSigns: true, examRequests: true } as const;

@Injectable()
export class AttendancesService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(Attendance) private readonly repo: Repository<Attendance>,
    private readonly access: PatientAccessService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Histórico (atendimentos finalizados) visível para quem consulta. */
  async listForPatient(user: AuthUser, patientId: string, page = 1, limit = 200) {
    const hidden = await this.access.hiddenUnitIdsFor(user);
    const qb = this.repo.createQueryBuilder('a').leftJoinAndSelect('a.procedures', 'p').leftJoinAndSelect('a.vitalSigns', 'v').leftJoinAndSelect('a.examRequests', 'e')
      .where('a.patient_id = :patientId', { patientId }).andWhere("a.status = 'Finalizado'");
    if (hidden.length) qb.andWhere('a.unit_id NOT IN (:...hidden)', { hidden });
    qb.orderBy('a.occurredAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [items, total] = await qb.getManyAndCount();
    return paginated(items.map(attendanceDto), total, { page, limit });
  }

  async list(user: AuthUser, q: AttendanceQueryDto) {
    if (user.role === 'admin') throw new ForbiddenException({ message: 'Administradores não têm acesso ao conteúdo clínico.', code: 'ADMIN_NO_CLINICAL' });
    if (user.role === 'paciente') return this.listForPatient(user, user.patientId!, q.page, q.limit);
    if (q.pacienteId) {
      await this.access.assertClinicalAccess(user, q.pacienteId);
      if (q.status !== 'Rascunho') return this.listForPatient(user, q.pacienteId, q.page, q.limit);
    }
    const [col, dir] = resolveSort(q, { data: 'a.occurredAt', criado: 'a.createdAt' }, 'data');
    const qb = this.repo.createQueryBuilder('a').leftJoinAndSelect('a.procedures', 'p').leftJoinAndSelect('a.vitalSigns', 'v').leftJoinAndSelect('a.examRequests', 'e');
    const status = q.status || 'Finalizado';
    qb.where('a.status = :status', { status });
    // Rascunhos são sempre pessoais; finalizados: do próprio profissional ou da unidade.
    if (status === 'Rascunho' || (q.escopo || 'minhas') === 'minhas') qb.andWhere('a.professional_id = :pid', { pid: user.professionalId });
    else qb.andWhere('a.unit_id = :uid', { uid: user.unitId });
    if (q.pacienteId) qb.andWhere('a.patient_id = :pac', { pac: q.pacienteId });
    if (q.de) qb.andWhere('a.occurred_at >= :de', { de: `${q.de} 00:00:00` });
    if (q.ate) qb.andWhere('a.occurred_at <= :ate', { ate: `${q.ate} 23:59:59` });
    qb.orderBy(col, dir).skip((q.page - 1) * q.limit).take(q.limit);
    const [items, total] = await qb.getManyAndCount();
    return paginated(items.map(attendanceDto), total, q);
  }

  async get(user: AuthUser, id: string) {
    const a = await this.repo.findOne({ where: { id }, relations: RELATIONS });
    if (!a) throw new NotFoundException('Atendimento não encontrado.');
    if (a.status === 'Rascunho' && a.professionalId !== user.professionalId) throw new NotFoundException('Atendimento não encontrado.');
    await this.access.assertClinicalAccess(user, a.patientId);
    if (user.role === 'profissional' && (await this.access.hiddenUnitIdsFor(user)).includes(a.unitId)) throw new ForbiddenException({ message: 'A unidade de origem não compartilha este registro.', code: 'UNIT_NOT_SHARING' });
    if (user.role === 'profissional') await this.audit.log(user, 'Visualização de atendimento', { patientId: a.patientId });
    return attendanceDto(a);
  }

  /** Registra atendimento (ou rascunho). Tudo em uma transação. */
  async create(user: AuthUser, dto: CreateAttendanceDto) {
    await this.access.assertResource(user, 'registrar');
    if (dto.unidadeId !== user.unitId) throw new ForbiddenException({ message: 'O atendimento deve ser registrado na sua unidade de atuação.', code: 'UNIT_MISMATCH' });
    await this.access.getPatientOr404(dto.pacienteId);
    if (dto.data.slice(0, 10) > todayWall()) throw new BadRequestException({ message: 'A data do atendimento não pode ser futura.', code: 'FUTURE_DATE', details: [{ field: 'data' }] });

    if (dto.rascunho) {
      const draft = await this.repo.save(this.repo.create({
        patientId: dto.pacienteId, professionalId: user.professionalId!, unitId: dto.unidadeId, occurredAt: parseWallClock(dto.data),
        type: dto.tipo || 'Consulta', specialty: dto.especialidade || '', chiefComplaint: dto.queixa || '', status: 'Rascunho', draftData: dto.dados || {},
      }));
      await this.audit.log(user, 'Rascunho de atendimento salvo', { patientId: dto.pacienteId });
      return this.reload(draft.id);
    }
    this.assertComplete(dto);
    if (dto.exames?.length) await this.access.assertResource(user, 'exames');
    const id = await this.ds.transaction((m) => this.persistFinal(m, user, dto));
    await this.afterFinalize(user, dto, id);
    return this.reload(id);
  }

  private assertComplete(dto: CreateAttendanceDto) {
    const missing = (['queixa', 'diagnostico'] as const).filter((f) => !dto[f]?.trim());
    if (!dto.tipo) missing.push('tipo' as any);
    if (missing.length) throw new BadRequestException({ message: 'Preencha os campos obrigatórios.', code: 'VALIDATION', details: missing.map((f) => ({ field: f })) });
  }

  private async persistFinal(m: EntityManager, user: AuthUser, dto: CreateAttendanceDto) {
    const prof = await m.findOneOrFail(Professional, { where: { id: user.professionalId! }, relations: { specialty: true } });
    let appointment: Appointment | null = null;
    if (dto.consultaId) {
      appointment = await m.findOne(Appointment, { where: { id: dto.consultaId, patientId: dto.pacienteId, unitId: user.unitId! } });
      if (!appointment) throw new BadRequestException({ message: 'Consulta não encontrada para este paciente na sua unidade.', code: 'APPOINTMENT_MISMATCH' });
    }
    let destino: HealthUnit | null = null;
    if (dto.encaminhamento) {
      destino = await m.findOne(HealthUnit, { where: { id: dto.encaminhamento.destinoId } });
      if (!destino) throw new BadRequestException({ message: 'Unidade de destino inexistente.', code: 'UNIT_UNKNOWN' });
    }
    const documents = ['Ficha de atendimento', ...(dto.prescricao ? ['Receita médica'] : []), ...(dto.exames?.length ? ['Requisição de exames'] : []), ...(dto.encaminhamento ? ['Encaminhamento'] : [])];
    const a = await m.save(m.create(Attendance, {
      patientId: dto.pacienteId, professionalId: prof.id, unitId: dto.unidadeId, appointmentId: appointment?.id ?? null,
      occurredAt: parseWallClock(dto.data), type: dto.tipo!, specialty: dto.especialidade || prof.specialty.name,
      chiefComplaint: dto.queixa!.trim(), presentIllness: dto.hda || null, clinicalAssessment: dto.avaliacao || null,
      diagnosis: dto.diagnostico!.trim(), cid10: dto.cid ? dto.cid.toUpperCase() : null, prescriptionText: dto.prescricao || null,
      referralText: destino ? `${dto.encaminhamento!.especialidade} — ${destino.name}` : null, clinicalNotes: dto.observacoes || null,
      documents, status: 'Finalizado',
    }));
    const s = dto.sinais;
    if (s && Object.values(s).some((v) => v !== undefined && v !== '')) {
      await m.insert(AttendanceVitalSigns, {
        attendanceId: a.id, bloodPressure: s.pa || null, heartRate: s.fc ?? null, respiratoryRate: s.fr ?? null, temperature: s.temp !== undefined ? String(s.temp) : null,
        oxygenSaturation: s.spo2 ?? null, weightKg: s.peso !== undefined ? String(s.peso) : null, capillaryGlucose: s.glicemia ?? null,
      });
    }
    const procs = [...new Set((dto.procedimentos || []).map((p) => p.trim()).filter(Boolean))];
    if (procs.length) await m.insert(AttendanceProcedure, procs.map((description) => ({ attendanceId: a.id, description })));
    for (const examName of [...new Set(dto.exames || [])]) {
      const exam = await m.save(m.create(Exam, { patientId: dto.pacienteId, name: examName, performedAt: todayWall(), unitId: dto.unidadeId, requesterId: prof.id, status: 'Solicitado' }));
      await m.insert(ExamRequest, {
        patientId: dto.pacienteId, professionalId: prof.id, unitId: dto.unidadeId, attendanceId: a.id, examId: exam.id, examName,
        justification: `Solicitado no atendimento: ${dto.queixa!.trim()}`.slice(0, 2000), priority: dto.tipo === 'Atendimento de urgência' ? 'Urgente' : 'Rotina',
        status: 'Solicitado', requestedAt: parseWallClock(nowWallClock()),
      });
    }
    if (destino) {
      await m.insert(Referral, {
        patientId: dto.pacienteId, professionalId: prof.id, originUnitId: dto.unidadeId, destinationUnitId: destino.id, specialty: dto.encaminhamento!.especialidade,
        reason: dto.queixa!.trim(), priority: 'Rotina', status: 'Pendente', referredAt: todayWall(),
      });
    }
    if (appointment) await m.update(Appointment, appointment.id, { status: 'Realizada' });
    if (dto.tipo === 'Internação') {
      await m.insert(PatientHospitalization, { patientId: dto.pacienteId, unitId: dto.unidadeId, admissionDate: dto.data.slice(0, 10), dischargeDate: null, reason: `${dto.diagnostico!.trim()}`.slice(0, 255) });
    }
    await m.update(HealthUnitIntegration, { unitId: dto.unidadeId }, { lastActivityAt: new Date() });
    return a.id;
  }

  private async afterFinalize(user: AuthUser, dto: CreateAttendanceDto, id: string) {
    await this.audit.log(user, 'Registro de atendimento', { patientId: dto.pacienteId });
    if (dto.exames?.length) await this.audit.log(user, 'Solicitação de exame', { patientId: dto.pacienteId, detail: `${dto.exames.length} exame(s) no atendimento` });
    if (dto.encaminhamento) await this.audit.log(user, 'Encaminhamento', { patientId: dto.pacienteId });
    const unit = await this.ds.getRepository(HealthUnit).findOne({ where: { id: dto.unidadeId } });
    await this.notifications.notifyPatient(dto.pacienteId, 'Novo atendimento no seu histórico', `${unit?.name ?? 'Unidade'}: ${dto.queixa}.`, 'historico.html', 'stethoscope');
    return id;
  }

  /** Atualiza um rascunho ou o finaliza (rascunho: false). */
  async update(user: AuthUser, id: string, dto: CreateAttendanceDto) {
    const draft = await this.repo.findOne({ where: { id } });
    if (!draft || draft.professionalId !== user.professionalId) throw new NotFoundException('Rascunho não encontrado.');
    if (draft.status !== 'Rascunho') throw new BadRequestException({ message: 'Atendimentos finalizados não podem ser alterados (integridade do prontuário).', code: 'ATTENDANCE_LOCKED' });
    if (dto.rascunho) {
      await this.repo.update(id, { patientId: dto.pacienteId, occurredAt: parseWallClock(dto.data), type: dto.tipo || draft.type, chiefComplaint: dto.queixa || '', draftData: (dto.dados || {}) as any });
      return this.reload(id);
    }
    await this.access.assertResource(user, 'registrar');
    this.assertComplete(dto);
    if (dto.exames?.length) await this.access.assertResource(user, 'exames');
    if (dto.unidadeId !== user.unitId) throw new ForbiddenException({ message: 'O atendimento deve ser registrado na sua unidade de atuação.', code: 'UNIT_MISMATCH' });
    const newId = await this.ds.transaction(async (m) => { const nid = await this.persistFinal(m, user, dto); await m.delete(Attendance, id); return nid; });
    await this.afterFinalize(user, dto, newId);
    return this.reload(newId);
  }

  async removeDraft(user: AuthUser, id: string) {
    const draft = await this.repo.findOne({ where: { id } });
    if (!draft || draft.professionalId !== user.professionalId || draft.status !== 'Rascunho') throw new NotFoundException('Rascunho não encontrado.');
    await this.repo.delete(id);
    return { id };
  }

  private async reload(id: string) { return attendanceDto(await this.repo.findOneOrFail({ where: { id }, relations: RELATIONS })); }
}
