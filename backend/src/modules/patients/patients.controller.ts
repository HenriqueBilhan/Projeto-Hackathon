import { Body, Controller, Delete, ForbiddenException, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions, Roles } from '../../common/decorators/auth.decorators';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import type { AuthUser } from '../../common/types';
import { AuditService } from '../core/audit.service';
import { PatientAccessService } from '../core/patient-access.service';
import { AttendancesService } from '../attendances/attendances.service';
import { ExamsService } from '../exams/exams.service';
import { PrescriptionsService } from '../prescriptions/prescriptions.service';
import { AppointmentsService } from '../appointments/appointments';
import { ReferralsService } from '../referrals/referrals';
import { AccessQueryDto, CreatePatientDto, PatientQueryDto, UpdatePatientDto } from './patients.dto';
import { PatientsService } from './patients.service';

@ApiTags('Pacientes') @ApiBearerAuth()
@Controller('patients')
export class PatientsController {
  constructor(
    private readonly svc: PatientsService,
    private readonly access: PatientAccessService,
    private readonly audit: AuditService,
    private readonly attendances: AttendancesService,
    private readonly exams: ExamsService,
    private readonly prescriptions: PrescriptionsService,
    private readonly appointments: AppointmentsService,
    private readonly referrals: ReferralsService,
  ) {}

  @Get() @RequirePermissions('patients:read') @ApiOperation({ summary: 'Busca pacientes por nome, CPF ou CNS (dados cadastrais mascarados)' })
  list(@CurrentUser() u: AuthUser, @Query() q: PatientQueryDto) { return this.svc.list(u, q); }

  @Get('me') @Roles('paciente') @ApiOperation({ summary: 'Prontuário resumido do próprio paciente' })
  me(@CurrentUser() u: AuthUser) { return this.svc.get(u, u.patientId!); }

  @Get(':id') @ApiOperation({ summary: 'Perfil clínico (profissional autorizado), próprio perfil (paciente) ou cadastro (gestor)' })
  get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: AccessQueryDto) {
    return this.svc.get(u, id, { justificativa: q.justificativa, reveal: q.reveal === 'true' });
  }

  @Post() @RequirePermissions('patients:create') @ApiOperation({ summary: 'Cadastra paciente na unidade' })
  create(@CurrentUser() u: AuthUser, @Body() dto: CreatePatientDto) { return this.svc.create(u, dto); }

  @Patch(':id') @Roles('paciente', 'profissional') @ApiOperation({ summary: 'Paciente: contato e privacidade. Profissional: dados cadastrais e resumo clínico' })
  update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePatientDto) { return this.svc.update(u, id, dto); }

  @Delete(':id') @RequirePermissions('patients:delete') @ApiOperation({ summary: 'Exclui cadastro sem registros clínicos' })
  remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.remove(u, id); }

  /** Histórico clínico integrado: atendimentos de todas as unidades autorizadas. */
  @Get(':id/history') @Roles('paciente', 'profissional') @ApiOperation({ summary: 'Linha do tempo clínica integrada' })
  async history(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: AccessQueryDto) {
    await this.access.assertClinicalAccess(u, id, q.justificativa);
    await this.audit.log(u, u.role === 'paciente' ? 'Consulta ao próprio histórico' : 'Consulta ao histórico clínico', { patientId: id });
    return this.attendances.listForPatient(u, id, q.page, q.limit);
  }

  @Get(':id/attendances') @Roles('paciente', 'profissional')
  async attendancesOf(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: PaginationQueryDto) {
    await this.access.assertClinicalAccess(u, id);
    return this.attendances.listForPatient(u, id, q.page, q.limit);
  }

  @Get(':id/exams') @Roles('paciente', 'profissional')
  async examsOf(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: PaginationQueryDto) {
    await this.access.assertClinicalAccess(u, id);
    return this.exams.listForPatient(u, id, q);
  }

  @Get(':id/prescriptions') @Roles('paciente', 'profissional')
  async prescriptionsOf(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: PaginationQueryDto) {
    await this.access.assertClinicalAccess(u, id);
    return this.prescriptions.listForPatient(u, id, q);
  }

  @Get(':id/appointments') @Roles('paciente', 'profissional')
  async appointmentsOf(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: PaginationQueryDto) {
    await this.access.assertClinicalAccess(u, id);
    return this.appointments.listForPatient(id, q.page, q.limit);
  }

  @Get(':id/referrals') @Roles('paciente', 'profissional')
  async referralsOf(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: PaginationQueryDto) {
    await this.access.assertClinicalAccess(u, id);
    return this.referrals.listForPatient(u, id, q.page, q.limit);
  }

  @Get(':id/access-logs') @Roles('paciente') @ApiOperation({ summary: 'Quem acessou o meu prontuário (somente o titular)' })
  accessLogs(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Query() q: PaginationQueryDto) {
    if (u.patientId !== id) throw new ForbiddenException({ message: 'Somente o titular.', code: 'NOT_OWNER' });
    return this.svc.accessLogs(u, id, q.page, q.limit);
  }
}
