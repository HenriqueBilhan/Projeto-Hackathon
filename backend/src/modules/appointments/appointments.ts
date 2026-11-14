import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Injectable, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query, UnprocessableEntityException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { IsIn, IsOptional, IsString, IsUUID, Length, Matches, MaxLength } from 'class-validator';
import { Not, Repository } from 'typeorm';
import { Appointment, HealthUnit, Professional } from '../../database/entities';
import { PaginationQueryDto, paginated } from '../../common/dto/pagination.dto';
import { nowWallClock, parseWallClock } from '../../common/utils/dates';
import { CurrentUser, Roles } from '../../common/decorators/auth.decorators';
import type { AuthUser } from '../../common/types';
import { AuditService } from '../core/audit.service';
import { NotificationsService } from '../core/notifications.service';
import { PatientAccessService } from '../core/patient-access.service';
import { appointmentDto } from '../core/presenters';

const WALL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
export class CreateAppointmentDto {
  @ApiPropertyOptional({ description: 'Obrigatório para profissionais' }) @IsOptional() @IsUUID() pacienteId?: string;
  @ApiProperty() @IsUUID() unidadeId: string;
  @ApiPropertyOptional({ description: 'Profissional (opcional: atribuído automaticamente pela especialidade)' }) @IsOptional() @IsUUID() profissionalId?: string;
  @ApiProperty() @IsString() @Length(2, 100) especialidade: string;
  @ApiProperty({ example: '2026-12-01T09:00' }) @Matches(WALL) data: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) tipo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) observacao?: string;
}
export class UpdateAppointmentDto {
  @ApiPropertyOptional({ enum: ['Agendada', 'Confirmada', 'Realizada', 'Cancelada', 'Faltou'] }) @IsOptional() @IsIn(['Agendada', 'Confirmada', 'Realizada', 'Cancelada', 'Faltou']) status?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(WALL) data?: string;
}
export class AppointmentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['minhas', 'unidade'], default: 'minhas' }) @IsOptional() @IsIn(['minhas', 'unidade']) escopo?: string;
  @ApiPropertyOptional({ enum: ['proximas', 'anteriores'] }) @IsOptional() @IsIn(['proximas', 'anteriores']) periodo?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) dia?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['Agendada', 'Confirmada', 'Realizada', 'Cancelada', 'Faltou']) status?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() pacienteId?: string;
}

@Injectable()
export class AppointmentsService {
  constructor(
    @InjectRepository(Appointment) private readonly repo: Repository<Appointment>,
    @InjectRepository(Professional) private readonly professionals: Repository<Professional>,
    @InjectRepository(HealthUnit) private readonly units: Repository<HealthUnit>,
    private readonly access: PatientAccessService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async listForPatient(patientId: string, page = 1, limit = 200) {
    const [items, total] = await this.repo.findAndCount({ where: { patientId }, order: { scheduledAt: 'DESC' }, skip: (page - 1) * limit, take: limit });
    return paginated(items.map(appointmentDto), total, { page, limit });
  }

  async list(user: AuthUser, q: AppointmentQueryDto) {
    if (user.role === 'admin') throw new ForbiddenException({ message: 'Administradores não têm acesso à agenda clínica.', code: 'ADMIN_NO_CLINICAL' });
    const qb = this.repo.createQueryBuilder('c');
    if (user.role === 'paciente') qb.where('c.patient_id = :p', { p: user.patientId });
    else if (q.pacienteId) { await this.access.assertClinicalAccess(user, q.pacienteId); qb.where('c.patient_id = :p', { p: q.pacienteId }); }
    else if ((q.escopo || 'minhas') === 'unidade') qb.where('c.unit_id = :u', { u: user.unitId });
    else qb.where('c.professional_id = :pr', { pr: user.professionalId });
    if (q.status) qb.andWhere('c.status = :s', { s: q.status });
    if (q.dia) qb.andWhere('DATE(c.scheduled_at) = :d', { d: q.dia });
    if (q.periodo === 'proximas') qb.andWhere("c.status IN ('Agendada','Confirmada')");
    if (q.periodo === 'anteriores') qb.andWhere("c.status NOT IN ('Agendada','Confirmada')");
    qb.orderBy('c.scheduledAt', q.periodo === 'proximas' || q.dia ? 'ASC' : 'DESC').skip((q.page - 1) * q.limit).take(q.limit);
    const [items, total] = await qb.getManyAndCount();
    return paginated(items.map(appointmentDto), total, q);
  }

  async create(user: AuthUser, dto: CreateAppointmentDto) {
    if (dto.data <= nowWallClock()) throw new BadRequestException({ message: 'Escolha uma data e hora futuras.', code: 'PAST_DATE', details: [{ field: 'data' }] });
    const unit = await this.units.findOne({ where: { id: dto.unidadeId, active: true } });
    if (!unit) throw new NotFoundException('Unidade não encontrada.');
    let patientId: string; let professional: Professional | null;
    if (user.role === 'paciente') {
      patientId = user.patientId!;
      const qb = this.professionals.createQueryBuilder('p').innerJoin('p.specialty', 's').where('p.unit_id = :u AND p.active = 1', { u: unit.id }).andWhere("p.cargo IN ('Médico','Enfermeiro')");
      professional = await qb.clone().andWhere('s.name = :e', { e: dto.especialidade }).getOne() || null;
      if (!professional) throw new UnprocessableEntityException({ message: `Não há profissional de ${dto.especialidade} disponível nesta unidade.`, code: 'NO_PROFESSIONAL' });
    } else {
      if (!dto.pacienteId) throw new BadRequestException({ message: 'Informe o paciente.', code: 'VALIDATION', details: [{ field: 'pacienteId' }] });
      await this.access.getPatientOr404(dto.pacienteId);
      if (dto.unidadeId !== user.unitId) throw new ForbiddenException({ message: 'Agende consultas na sua unidade de atuação.', code: 'UNIT_MISMATCH' });
      patientId = dto.pacienteId;
      professional = await this.professionals.findOne({ where: { id: dto.profissionalId || user.professionalId!, unitId: unit.id, active: true } });
      if (!professional) throw new BadRequestException({ message: 'Profissional não pertence à unidade.', code: 'PROFESSIONAL_UNIT' });
    }
    const at = parseWallClock(dto.data);
    if (await this.repo.exist({ where: { professionalId: professional.id, scheduledAt: at, status: Not('Cancelada') } })) {
      throw new ConflictException({ message: 'Horário indisponível para este profissional. Escolha outro horário.', code: 'SLOT_TAKEN' });
    }
    const c = await this.repo.save(this.repo.create({
      patientId, professionalId: professional.id, unitId: unit.id, scheduledAt: at, specialty: dto.especialidade,
      type: dto.tipo || (user.role === 'paciente' ? 'Solicitação pelo app' : 'Consulta presencial'), status: 'Agendada', notes: dto.observacao || null,
    }));
    await this.audit.log(user, 'Agendamento de consulta', { patientId, unitId: unit.id });
    if (user.role === 'paciente') await this.notifications.notifyProfessional(professional.id, 'Nova consulta agendada', `Consulta de ${dto.especialidade} solicitada pelo paciente.`, 'medico.html', 'calendar-plus');
    else await this.notifications.notifyPatient(patientId, 'Consulta agendada', `${dto.especialidade} em ${unit.name}.`, 'consultas.html', 'calendar-check');
    return appointmentDto(c);
  }

  private async own(user: AuthUser, id: string) {
    const c = await this.repo.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Consulta não encontrada.');
    if (user.role === 'paciente' && c.patientId !== user.patientId) throw new NotFoundException('Consulta não encontrada.');
    if (user.role === 'profissional' && c.unitId !== user.unitId) throw new ForbiddenException({ message: 'A consulta pertence a outra unidade.', code: 'UNIT_MISMATCH' });
    return c;
  }

  async update(user: AuthUser, id: string, dto: UpdateAppointmentDto) {
    const c = await this.own(user, id);
    if (user.role === 'paciente' && (dto.data || (dto.status && dto.status !== 'Cancelada'))) throw new ForbiddenException({ message: 'Pacientes podem apenas cancelar consultas.', code: 'FIELD_FORBIDDEN' });
    if (['Realizada', 'Cancelada'].includes(c.status) && dto.status !== c.status) throw new BadRequestException({ message: 'Consulta já encerrada.', code: 'APPOINTMENT_CLOSED' });
    const patch: Partial<Appointment> = {};
    if (dto.status) patch.status = dto.status;
    if (dto.data) {
      if (dto.data <= nowWallClock()) throw new BadRequestException({ message: 'Escolha uma data futura.', code: 'PAST_DATE' });
      const at = parseWallClock(dto.data);
      if (await this.repo.exist({ where: { professionalId: c.professionalId, scheduledAt: at, status: Not('Cancelada'), id: Not(id) } })) throw new ConflictException({ message: 'Horário indisponível.', code: 'SLOT_TAKEN' });
      patch.scheduledAt = at;
    }
    await this.repo.update(id, patch);
    await this.audit.log(user, dto.status === 'Cancelada' ? 'Cancelamento de consulta' : 'Atualização de consulta', { patientId: c.patientId, unitId: c.unitId });
    if (user.role === 'profissional' && (dto.status === 'Confirmada' || dto.data || dto.status === 'Cancelada')) {
      await this.notifications.notifyPatient(c.patientId, dto.status === 'Cancelada' ? 'Consulta cancelada' : 'Consulta atualizada', `${c.specialty}: ${dto.status || 'nova data'}.`, 'consultas.html', 'calendar-days');
    }
    return appointmentDto(await this.repo.findOneByOrFail({ id }));
  }

  /** DELETE = cancelamento (o histórico da agenda é preservado). */
  cancel(user: AuthUser, id: string) { return this.update(user, id, { status: 'Cancelada' }); }
}

@ApiTags('Consultas') @ApiBearerAuth()
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly svc: AppointmentsService) {}
  @Get() @Roles('paciente', 'profissional') @ApiOperation({ summary: 'Agenda (paciente: suas consultas; profissional: sua agenda ou da unidade)' })
  list(@CurrentUser() u: AuthUser, @Query() q: AppointmentQueryDto) { return this.svc.list(u, q); }
  @Post() @Roles('paciente', 'profissional') @ApiOperation({ summary: 'Agenda consulta (paciente: solicitação; profissional: para um paciente)' })
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateAppointmentDto) { return this.svc.create(u, dto); }
  @Patch(':id') @Roles('paciente', 'profissional') update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAppointmentDto) { return this.svc.update(u, id, dto); }
  @Delete(':id') @Roles('paciente', 'profissional') @ApiOperation({ summary: 'Cancela a consulta' })
  remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.cancel(u, id); }
}
