import { Body, Controller, ForbiddenException, Get, Injectable, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { Repository } from 'typeorm';
import { HealthUnit, Referral } from '../../database/entities';
import { PaginationQueryDto, paginated } from '../../common/dto/pagination.dto';
import { todayWall } from '../../common/utils/dates';
import { CurrentUser, RequirePermissions, Roles } from '../../common/decorators/auth.decorators';
import type { AuthUser } from '../../common/types';
import { AuditService } from '../core/audit.service';
import { NotificationsService } from '../core/notifications.service';
import { PatientAccessService } from '../core/patient-access.service';
import { referralDto } from '../core/presenters';

const PRIORITIES = ['Rotina', 'Urgente', 'Emergência'];
export class CreateReferralDto {
  @ApiProperty() @IsUUID() pacienteId: string;
  @ApiProperty() @IsString() @Length(2, 100) especialidade: string;
  @ApiProperty() @IsUUID() destinoId: string;
  @ApiPropertyOptional({ enum: PRIORITIES }) @IsOptional() @IsIn(PRIORITIES) prioridade?: string;
  @ApiProperty() @IsString() @Length(10, 2000) motivo: string;
}
export class UpdateReferralDto {
  @ApiProperty({ enum: ['Agendado', 'Realizado', 'Cancelado'] }) @IsIn(['Agendado', 'Realizado', 'Cancelado']) status: string;
}
export class ReferralQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['unidade', 'minhas'], default: 'unidade' }) @IsOptional() @IsIn(['unidade', 'minhas']) escopo?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['Pendente', 'Agendado', 'Realizado', 'Cancelado']) status?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() pacienteId?: string;
}

@Injectable()
export class ReferralsService {
  constructor(
    @InjectRepository(Referral) private readonly repo: Repository<Referral>,
    @InjectRepository(HealthUnit) private readonly units: Repository<HealthUnit>,
    private readonly access: PatientAccessService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async listForPatient(user: AuthUser, patientId: string, page = 1, limit = 200) {
    const [items, total] = await this.repo.findAndCount({ where: { patientId }, order: { referredAt: 'DESC', createdAt: 'DESC' }, skip: (page - 1) * limit, take: limit });
    return paginated(items.map(referralDto), total, { page, limit });
  }

  async list(user: AuthUser, q: ReferralQueryDto) {
    if (user.role === 'admin') throw new ForbiddenException({ message: 'Administradores não têm acesso ao conteúdo clínico.', code: 'ADMIN_NO_CLINICAL' });
    if (user.role === 'paciente') return this.listForPatient(user, user.patientId!, q.page, q.limit);
    if (q.pacienteId) { await this.access.assertClinicalAccess(user, q.pacienteId); return this.listForPatient(user, q.pacienteId, q.page, q.limit); }
    const qb = this.repo.createQueryBuilder('r');
    if ((q.escopo || 'unidade') === 'minhas') qb.where('r.professional_id = :p', { p: user.professionalId });
    else qb.where('(r.origin_unit_id = :u OR r.destination_unit_id = :u)', { u: user.unitId });
    if (q.status) qb.andWhere('r.status = :s', { s: q.status });
    qb.orderBy('r.referredAt', 'DESC').addOrderBy('r.createdAt', 'DESC').skip((q.page - 1) * q.limit).take(q.limit);
    const [items, total] = await qb.getManyAndCount();
    return paginated(items.map(referralDto), total, q);
  }

  async create(user: AuthUser, dto: CreateReferralDto) {
    await this.access.assertResource(user, 'registrar');
    await this.access.getPatientOr404(dto.pacienteId);
    const dest = await this.units.findOne({ where: { id: dto.destinoId, active: true } });
    if (!dest) throw new NotFoundException('Unidade de destino não encontrada.');
    const r = await this.repo.save(this.repo.create({
      patientId: dto.pacienteId, professionalId: user.professionalId!, originUnitId: user.unitId!, destinationUnitId: dest.id, specialty: dto.especialidade,
      reason: dto.motivo.trim(), priority: dto.prioridade || 'Rotina', status: 'Pendente', referredAt: todayWall(),
    }));
    await this.audit.log(user, 'Encaminhamento', { patientId: dto.pacienteId, detail: `${dto.especialidade} → ${dest.name}` });
    await this.notifications.notifyPatient(dto.pacienteId, 'Novo encaminhamento', `Você foi encaminhado(a) para ${dto.especialidade} em ${dest.name}. Aguarde contato da unidade.`, 'consultas.html', 'send');
    return referralDto(r);
  }

  async update(user: AuthUser, id: string, dto: UpdateReferralDto) {
    const r = await this.repo.findOne({ where: { id } });
    if (!r) throw new NotFoundException('Encaminhamento não encontrado.');
    if (user.unitId !== r.destinationUnitId && user.unitId !== r.originUnitId) throw new ForbiddenException({ message: 'Somente as unidades de origem ou destino podem atualizar o encaminhamento.', code: 'UNIT_MISMATCH' });
    await this.repo.update(id, { status: dto.status });
    await this.audit.log(user, 'Atualização de encaminhamento', { patientId: r.patientId, detail: dto.status });
    if (dto.status === 'Agendado') await this.notifications.notifyPatient(r.patientId, 'Encaminhamento agendado', `Seu encaminhamento para ${r.specialty} foi agendado.`, 'consultas.html', 'calendar-check');
    return referralDto(await this.repo.findOneByOrFail({ id }));
  }
}

@ApiTags('Encaminhamentos') @ApiBearerAuth()
@Controller('referrals')
export class ReferralsController {
  constructor(private readonly svc: ReferralsService) {}
  @Get() @Roles('paciente', 'profissional') @ApiOperation({ summary: 'Lista encaminhamentos (profissional: da unidade de origem/destino ou seus)' })
  list(@CurrentUser() u: AuthUser, @Query() q: ReferralQueryDto) { return this.svc.list(u, q); }
  @Post() @RequirePermissions('clinical:write') create(@CurrentUser() u: AuthUser, @Body() dto: CreateReferralDto) { return this.svc.create(u, dto); }
  @Patch(':id') @RequirePermissions('clinical:write') update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateReferralDto) { return this.svc.update(u, id, dto); }
}
