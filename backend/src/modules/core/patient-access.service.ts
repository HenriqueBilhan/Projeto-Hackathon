import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Appointment, Attendance, HealthUnitIntegration, Patient, Referral } from '../../database/entities';
import type { AuthUser } from '../../common/types';
import { SettingsService } from './settings.service';
import { AuditService } from './audit.service';

/**
 * Autorização por paciente/prontuário (além do RBAC):
 *  - paciente: apenas o próprio registro;
 *  - administrador: nunca acessa conteúdo clínico;
 *  - profissional: cargo com permissão na matriz + (vínculo assistencial com a unidade OU
 *    compartilhamento em rede permitido pelo paciente e pela unidade) OU acesso de emergência justificado.
 */
@Injectable()
export class PatientAccessService {
  constructor(
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(Attendance) private readonly attendances: Repository<Attendance>,
    @InjectRepository(Appointment) private readonly appointments: Repository<Appointment>,
    @InjectRepository(Referral) private readonly referrals: Repository<Referral>,
    @InjectRepository(HealthUnitIntegration) private readonly integrations: Repository<HealthUnitIntegration>,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  async getPatientOr404(id: string) {
    const p = await this.patients.findOne({ where: { id } });
    if (!p) throw new NotFoundException('Paciente não encontrado.');
    return p;
  }

  /** Exige permissão da matriz clínica para o cargo do profissional. */
  async assertResource(user: AuthUser, resource: string) {
    if (user.role !== 'profissional') throw new ForbiddenException({ message: 'Operação restrita a profissionais de saúde.', code: 'PROFESSIONAL_ONLY' });
    if (!(await this.settings.can(user.cargo, resource))) throw new ForbiddenException({ message: 'Seu perfil profissional não tem permissão para esta operação.', code: 'CLINICAL_PERMISSION' });
  }

  async hasCareLink(unitId: string, patient: Patient) {
    if (patient.referenceUnitId === unitId) return true;
    if (await this.attendances.exist({ where: { patientId: patient.id, unitId } })) return true;
    if (await this.appointments.exist({ where: { patientId: patient.id, unitId } })) return true;
    if (await this.referrals.exist({ where: [{ patientId: patient.id, destinationUnitId: unitId }, { patientId: patient.id, originUnitId: unitId }] })) return true;
    return false;
  }

  /**
   * Garante acesso ao conteúdo clínico do paciente. Retorna o paciente.
   * `justification` habilita o acesso de emergência (registrado na auditoria).
   */
  async assertClinicalAccess(user: AuthUser, patientId: string, justification?: string) {
    const patient = await this.getPatientOr404(patientId);
    if (user.role === 'paciente') {
      if (user.patientId !== patientId) throw new ForbiddenException({ message: 'Você só pode acessar o seu próprio prontuário.', code: 'NOT_OWNER' });
      return { patient, emergency: false };
    }
    if (user.role === 'admin') throw new ForbiddenException({ message: 'Administradores não têm acesso ao conteúdo clínico dos pacientes.', code: 'ADMIN_NO_CLINICAL' });
    await this.assertResource(user, 'ver_prontuario');
    const s = await this.settings.getAll();
    if (await this.hasCareLink(user.unitId!, patient)) return { patient, emergency: false };
    const unit = await this.integrations.findOne({ where: { unitId: user.unitId! } });
    const consentOk = patient.shareConsent || !s.consentimentoPaciente;
    if (s.compartilharEntreUnidades && unit?.sharingEnabled && consentOk) return { patient, emergency: false };
    if (justification && justification.trim().length >= 10) {
      await this.audit.log(user, 'Acesso de emergência ao prontuário', { patientId, detail: `Justificativa registrada (${justification.trim().length} caracteres)` });
      return { patient, emergency: true };
    }
    if (!s.exigirJustificativaEmergencia && s.compartilharEntreUnidades) return { patient, emergency: false };
    await this.audit.log(user, 'Tentativa de acesso negada', { patientId, success: false, detail: 'Sem vínculo assistencial ou consentimento' });
    throw new ForbiddenException({ message: 'Sem vínculo assistencial com este paciente ou compartilhamento não autorizado. Informe uma justificativa para acesso de emergência.', code: 'JUSTIFICATION_REQUIRED' });
  }

  /** Unidades cujos registros NÃO podem ser vistos por profissionais de outras unidades. */
  async hiddenUnitIdsFor(user: AuthUser): Promise<string[]> {
    if (user.role !== 'profissional') return [];
    const s = await this.settings.getAll();
    const rows = await this.integrations.find();
    return rows.filter((i) => i.unitId !== user.unitId && (!i.sharingEnabled || !s.compartilharEntreUnidades)).map((i) => i.unitId);
  }
}
