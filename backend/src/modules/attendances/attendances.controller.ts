import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions, Roles } from '../../common/decorators/auth.decorators';
import type { AuthUser } from '../../common/types';
import { AttendanceQueryDto, CreateAttendanceDto } from './attendances.dto';
import { AttendancesService } from './attendances.service';

@ApiTags('Atendimentos') @ApiBearerAuth()
@Controller('attendances')
export class AttendancesController {
  constructor(private readonly svc: AttendancesService) {}

  @Get() @Roles('paciente', 'profissional') @ApiOperation({ summary: 'Lista atendimentos (paciente: os seus; profissional: seus/da unidade, rascunhos)' })
  list(@CurrentUser() u: AuthUser, @Query() q: AttendanceQueryDto) { return this.svc.list(u, q); }

  @Get(':id') @Roles('paciente', 'profissional')
  get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u, id); }

  @Post() @RequirePermissions('clinical:write') @ApiOperation({ summary: 'Registra atendimento (sinais vitais, procedimentos, exames, encaminhamento) ou rascunho' })
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateAttendanceDto) { return this.svc.create(u, dto); }

  @Patch(':id') @RequirePermissions('clinical:write') @ApiOperation({ summary: 'Atualiza ou finaliza um rascunho' })
  update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateAttendanceDto) { return this.svc.update(u, id, dto); }

  @Delete(':id') @RequirePermissions('clinical:write') @ApiOperation({ summary: 'Exclui um rascunho próprio' })
  remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.removeDraft(u, id); }
}
