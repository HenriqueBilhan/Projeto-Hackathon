import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Put, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import type { Response } from 'express';
import { Repository } from 'typeorm';
import { Synchronization } from '../../database/entities';
import { CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import type { AuthUser } from '../../common/types';
import { AuditService } from '../core/audit.service';
import { SettingsService } from '../core/settings.service';
import { AdminService } from './admin.service';

class AuditQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) operacao?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() unidadeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() pacienteId?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) data?: string;
}
class ReportQueryDto { @ApiPropertyOptional({ default: 6 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(24) meses = 6; }
class UserQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['paciente', 'profissional', 'admin']) role?: string;
}
class UpdateUserDto {
  @IsOptional() @IsBoolean() ativo?: boolean;
  @IsOptional() @IsBoolean() desbloquear?: boolean;
  @IsOptional() @IsBoolean() encerrarSessoes?: boolean;
}
class MatrixDto { @IsObject() matriz: Record<string, Record<string, boolean>>; }
class SettingsDto {
  @IsOptional() @IsBoolean() compartilharEntreUnidades?: boolean;
  @IsOptional() @IsBoolean() consentimentoPaciente?: boolean;
  @IsOptional() @IsBoolean() exigirJustificativaEmergencia?: boolean;
  @IsOptional() @IsBoolean() notificarPacienteAcesso?: boolean;
  @IsOptional() @IsBoolean() mascararDocumentos?: boolean;
  @IsOptional() @IsBoolean() bloquearExportacao?: boolean;
  @IsOptional() @IsInt() @IsIn([15, 30, 60]) expirarSessao?: number;
}

@ApiTags('Administração') @ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly svc: AdminService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    @InjectRepository(Synchronization) private readonly syncs: Repository<Synchronization>,
  ) {}

  @Get('dashboard') @RequirePermissions('reports:read') @ApiOperation({ summary: 'Indicadores consolidados, atividades recentes e integrações' })
  dashboard() { return this.svc.dashboard(); }

  @Get('reports') @RequirePermissions('reports:read') @ApiOperation({ summary: 'Indicadores por período (meses)' })
  reports(@Query() q: ReportQueryDto) { return this.svc.indicators(q.meses); }

  @Get('audit-logs') @RequirePermissions('audit:read') @ApiOperation({ summary: 'Trilha de auditoria com filtros' })
  auditLogs(@Query() q: AuditQueryDto) { return this.svc.auditLogs(q); }

  @Get('synchronizations') @RequirePermissions('integrations:read') @ApiOperation({ summary: 'Estado das sincronizações por conjunto de dados' })
  synchronizations() { return this.syncs.find({ order: { dataset: 'ASC' } }); }

  @Get('users') @RequirePermissions('users:manage') users(@Query() q: UserQueryDto) { return this.svc.listUsers(q); }
  @Patch('users/:id') @RequirePermissions('users:manage') @ApiOperation({ summary: 'Ativa/desativa, desbloqueia ou encerra sessões de um usuário' })
  updateUser(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) { return this.svc.updateUser(u, id, dto); }

  @Get('access-permissions') @RequirePermissions('users:manage') @ApiOperation({ summary: 'Matriz de acesso clínico por perfil profissional' })
  matrix() { return this.settings.getMatrix(); }
  @Put('access-permissions') @RequirePermissions('users:manage')
  async saveMatrix(@CurrentUser() u: AuthUser, @Body() dto: MatrixDto) {
    const r = await this.settings.updateMatrix(dto.matriz);
    await this.audit.log(u, 'Alteração de permissões', { detail: 'Matriz de acesso por perfil' });
    return r;
  }

  @Get('settings') @RequirePermissions('settings:manage') getSettings() { return this.settings.getAll(); }
  @Patch('settings') @RequirePermissions('settings:manage')
  async patchSettings(@CurrentUser() u: AuthUser, @Body() dto: SettingsDto) {
    const r = await this.settings.update(dto as Record<string, unknown>);
    await this.audit.log(u, 'Alteração de configuração de privacidade', { detail: Object.keys(dto).join(', ') });
    return r;
  }

  @Get('exports/:type') @RequirePermissions('reports:read') @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'Exporta CSV (pacientes | auditoria | indicadores) com dados mascarados' })
  async export(@CurrentUser() u: AuthUser, @Param('type') type: string, @Res() res: Response) {
    if (!['pacientes', 'auditoria', 'indicadores'].includes(type)) { res.status(404).json({ success: false, error: { statusCode: 404, code: 'NOT_FOUND', message: 'Tipo de exportação inválido.' } }); return; }
    if (type === 'auditoria' && !u.permissions.includes('audit:read')) { res.status(403).json({ success: false, error: { statusCode: 403, code: 'PERMISSION_DENIED', message: 'Permissão insuficiente.' } }); return; }
    const csv = await this.svc.exportCsv(u, type as any);
    res.setHeader('Content-Disposition', `attachment; filename="conecta-${type}.csv"`);
    res.send(csv);
  }
}
