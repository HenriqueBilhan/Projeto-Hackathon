import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { Attendance, Patient, PatientAllergy, Prescription, PrescriptionMedication } from '../../database/entities';
import { paginated } from '../../common/dto/pagination.dto';
import { todayWall } from '../../common/utils/dates';
import type { AuthUser } from '../../common/types';
import { AuditService } from '../core/audit.service';
import { NotificationsService } from '../core/notifications.service';
import { PatientAccessService } from '../core/patient-access.service';
import { prescriptionItemDto } from '../core/presenters';
import { CreatePrescriptionDto, PrescriptionQueryDto, UpdatePrescriptionDto } from './prescriptions.dto';

const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

@Injectable()
export class PrescriptionsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    @InjectRepository(PrescriptionMedication) private readonly meds: Repository<PrescriptionMedication>,
    @InjectRepository(PatientAllergy) private readonly allergies: Repository<PatientAllergy>,
    private readonly access: PatientAccessService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private base(): SelectQueryBuilder<PrescriptionMedication> {
    return this.meds.createQueryBuilder('m').innerJoinAndSelect('m.prescription', 'h');
  }
  private async page(qb: SelectQueryBuilder<PrescriptionMedication>, q: { page: number; limit: number; situacao?: string }) {
    if (q.situacao === 'ativas') qb.andWhere("m.status IN ('Em uso','Uso contínuo')");
    if (q.situacao === 'concluidas') qb.andWhere("m.status = 'Concluído'");
    qb.orderBy('h.prescribedAt', 'DESC').addOrderBy('m.createdAt', 'DESC').skip((q.page - 1) * q.limit).take(q.limit);
    const [items, total] = await qb.getManyAndCount();
    return paginated(items.map((m) => prescriptionItemDto(m, m.prescription)), total, q);
  }

  async listForPatient(user: AuthUser, patientId: string, q: Partial<PrescriptionQueryDto> = {}) {
    const hidden = await this.access.hiddenUnitIdsFor(user);
    const qb = this.base().where('h.patient_id = :patientId', { patientId });
    if (hidden.length) qb.andWhere('h.unit_id NOT IN (:...hidden)', { hidden });
    return this.page(qb, { page: q.page || 1, limit: q.limit || 200, situacao: q.situacao });
  }

  async list(user: AuthUser, q: PrescriptionQueryDto) {
    if (user.role === 'admin') throw new ForbiddenException({ message: 'Administradores não têm acesso ao conteúdo clínico.', code: 'ADMIN_NO_CLINICAL' });
    if (user.role === 'paciente') return this.listForPatient(user, user.patientId!, q);
    if (q.pacienteId) { await this.access.assertClinicalAccess(user, q.pacienteId); return this.listForPatient(user, q.pacienteId, q); }
    const qb = this.base();
    if ((q.escopo || 'minhas') === 'unidade') qb.where('h.unit_id = :u', { u: user.unitId });
    else qb.where('h.professional_id = :p', { p: user.professionalId });
    return this.page(qb, q);
  }

  async get(user: AuthUser, id: string) {
    const m = await this.base().where('m.id = :id', { id }).getOne();
    if (!m) throw new NotFoundException('Prescrição não encontrada.');
    await this.access.assertClinicalAccess(user, m.prescription.patientId);
    return prescriptionItemDto(m, m.prescription);
  }

  async create(user: AuthUser, dto: CreatePrescriptionDto) {
    await this.access.assertResource(user, 'prescrever');
    await this.access.getPatientOr404(dto.pacienteId);
    // Regra de segurança do paciente: alerta de alergia registrada compatível com o medicamento.
    const allergies = await this.allergies.find({ where: { patientId: dto.pacienteId } });
    const conflicts = dto.medicamentos.flatMap((m) => allergies.filter((a) => norm(m.medicamento).includes(norm(a.substance)) || norm(a.substance).includes(norm(m.medicamento))).map((a) => ({ medicamento: m.medicamento, alergia: a.substance, gravidade: a.severity, reacao: a.reaction })));
    if (conflicts.length && !dto.confirmarAlergia) {
      throw new ConflictException({ message: `Possível alergia: o paciente tem alergia registrada a ${conflicts.map((c) => c.alergia).join(', ')}.`, code: 'ALLERGY_CONFLICT', details: conflicts });
    }
    if (dto.atendimentoId && !(await this.ds.getRepository(Attendance).exist({ where: { id: dto.atendimentoId, patientId: dto.pacienteId } }))) {
      throw new NotFoundException('Atendimento não encontrado para este paciente.');
    }
    const ids = await this.ds.transaction(async (m) => {
      const h = await m.save(m.create(Prescription, { patientId: dto.pacienteId, professionalId: user.professionalId!, unitId: user.unitId!, attendanceId: dto.atendimentoId || null, prescribedAt: todayWall() }));
      const saved = await m.save(dto.medicamentos.map((x) => m.create(PrescriptionMedication, {
        prescriptionId: h.id, medication: x.medicamento.trim(), dosage: x.dosagem.trim(), frequency: x.frequencia.trim(), duration: x.duracao.trim(),
        instructions: x.orientacoes?.trim() || null, status: /cont[ií]nuo/i.test(x.duracao) ? 'Uso contínuo' : 'Em uso',
      })));
      return saved.map((s) => s.id);
    });
    await this.audit.log(user, 'Prescrição médica', { patientId: dto.pacienteId, detail: conflicts.length ? 'Prescrita com alerta de alergia confirmado' : null });
    await this.notifications.notifyPatient(dto.pacienteId, 'Nova receita registrada', `${user.name} registrou uma prescrição (${dto.medicamentos.map((x) => x.medicamento).join(', ')}).`, 'receitas.html', 'file-text');
    const items = await this.base().where('m.id IN (:...ids)', { ids }).getMany();
    return items.map((x) => prescriptionItemDto(x, x.prescription));
  }

  async update(user: AuthUser, id: string, dto: UpdatePrescriptionDto) {
    await this.access.assertResource(user, 'prescrever');
    const m = await this.base().where('m.id = :id', { id }).getOne();
    if (!m) throw new NotFoundException('Prescrição não encontrada.');
    if (m.prescription.professionalId !== user.professionalId && m.prescription.unitId !== user.unitId) throw new ForbiddenException({ message: 'Somente o prescritor ou a unidade de origem pode alterar a prescrição.', code: 'NOT_PRESCRIBER' });
    await this.meds.update(id, { status: dto.status });
    await this.audit.log(user, 'Alteração de prescrição', { patientId: m.prescription.patientId, detail: `Situação: ${dto.status}` });
    return this.get(user, id);
  }

  /** Usado pelo módulo de pacientes. */
  static patientOf(m: PrescriptionMedication): Patient['id'] { return m.prescription.patientId; }
}
