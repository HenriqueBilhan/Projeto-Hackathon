import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions, Roles } from '../../common/decorators/auth.decorators';
import type { AuthUser } from '../../common/types';
import { CreatePrescriptionDto, PrescriptionQueryDto, UpdatePrescriptionDto } from './prescriptions.dto';
import { PrescriptionsService } from './prescriptions.service';

@ApiTags('Prescrições') @ApiBearerAuth()
@Controller('prescriptions')
export class PrescriptionsController {
  constructor(private readonly svc: PrescriptionsService) {}

  @Get() @Roles('paciente', 'profissional') @ApiOperation({ summary: 'Lista medicamentos prescritos (cada item = um medicamento da receita)' })
  list(@CurrentUser() u: AuthUser, @Query() q: PrescriptionQueryDto) { return this.svc.list(u, q); }

  @Get(':id') @Roles('paciente', 'profissional')
  get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u, id); }

  @Post() @RequirePermissions('clinical:write') @ApiOperation({ summary: 'Registra prescrição (409 ALLERGY_CONFLICT se houver alergia compatível e não confirmada)' })
  create(@CurrentUser() u: AuthUser, @Body() dto: CreatePrescriptionDto) { return this.svc.create(u, dto); }

  @Patch(':id') @RequirePermissions('clinical:write') @ApiOperation({ summary: 'Altera a situação do medicamento (ex.: encerrar)' })
  update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePrescriptionDto) { return this.svc.update(u, id, dto); }
}
