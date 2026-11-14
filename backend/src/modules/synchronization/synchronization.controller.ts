import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, Matches } from 'class-validator';
import { CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import type { AuthUser } from '../../common/types';
import { DATASETS, DatasetCode } from '../../integrations/ministerio-saude/ministerio-saude.types';
import { AuditService } from '../core/audit.service';
import { SynchronizationService } from './synchronization.service';

class SyncDto {
  @ApiPropertyOptional({ enum: [...DATASETS, 'todos'], default: 'todos' }) @IsOptional() @IsIn([...DATASETS, 'todos']) dataset?: string;
  @ApiPropertyOptional({ enum: ['full', 'incremental'] }) @IsOptional() @IsIn(['full', 'incremental']) modo?: 'full' | 'incremental';
}
class ReprocessDto { @ApiProperty() @Matches(/^\d+$/) logId: string; }
class LogQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: DATASETS }) @IsOptional() @IsIn([...DATASETS]) dataset?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['running', 'success', 'partial', 'failed']) status?: string;
}

@ApiTags('Integração — Ministério da Saúde') @ApiBearerAuth()
@Controller('integrations/ministerio-saude')
export class SynchronizationController {
  constructor(private readonly svc: SynchronizationService, private readonly audit: AuditService) {}

  @Post('sync') @HttpCode(202) @RequirePermissions('integrations:manage')
  @ApiOperation({ summary: 'Dispara a sincronização manual (em segundo plano). 409 se o conjunto já estiver em execução.' })
  async sync(@CurrentUser() u: AuthUser, @Body() dto: SyncDto) {
    await this.audit.log(u, 'Sincronização manual iniciada', { detail: dto.dataset || 'todos' });
    if (!dto.dataset || dto.dataset === 'todos') {
      this.svc.runAll('manual', u.userId).catch(() => undefined);
      return { iniciado: true, conjuntos: DATASETS };
    }
    const log = await this.svc.start(dto.dataset as DatasetCode, { trigger: 'manual', mode: dto.modo, userId: u.userId, background: true });
    return { iniciado: true, logId: (log as any).id, dataset: dto.dataset };
  }

  @Post('reprocess') @HttpCode(202) @RequirePermissions('integrations:manage') @ApiOperation({ summary: 'Reprocessa as requisições que falharam em uma execução' })
  async reprocess(@CurrentUser() u: AuthUser, @Body() dto: ReprocessDto) {
    const log = await this.svc.reprocess(dto.logId, u.userId, true);
    await this.audit.log(u, 'Reprocessamento de sincronização', { detail: `Execução ${dto.logId}` });
    return { iniciado: true, logId: (log as any).id };
  }

  @Get('sync-logs') @RequirePermissions('integrations:read') logs(@Query() q: LogQueryDto) { return this.svc.listLogs(q); }
  @Get('sync-logs/:id') @RequirePermissions('integrations:read') log(@Param('id') id: string) { return this.svc.getLog(id); }
  @Get('sync-state') @RequirePermissions('integrations:read') states() { return this.svc.states(); }
}
