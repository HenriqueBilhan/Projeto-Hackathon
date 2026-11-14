import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public, RequirePermissions } from '../../common/decorators/auth.decorators';
import type { AuthUser } from '../../common/types';
import { CreateHealthUnitDto, HealthUnitQueryDto, ImportCnesDto, UpdateHealthUnitDto } from './health-units.dto';
import { HealthUnitsService } from './health-units.service';

@ApiTags('Unidades de saúde') @ApiBearerAuth()
@Controller('health-units')
export class HealthUnitsController {
  constructor(private readonly svc: HealthUnitsService) {}

  @Get() @RequirePermissions('units:read') @ApiOperation({ summary: 'Lista unidades (filtros: q, tipo, integrada; paginação e ordenação)' })
  list(@Query() q: HealthUnitQueryDto) { return this.svc.list(q); }

  @Get(':id') @RequirePermissions('units:read')
  get(@Param('id', ParseUUIDPipe) id: string) { return this.svc.get(id); }

  @Post() @RequirePermissions('units:manage') @ApiOperation({ summary: 'Cadastra UBS, UPA, hospital, laboratório ou clínica' })
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateHealthUnitDto) { return this.svc.create(u, dto); }

  @Post('import-cnes') @RequirePermissions('units:manage') @ApiOperation({ summary: 'Cria a unidade a partir de um estabelecimento real do CNES' })
  importCnes(@CurrentUser() u: AuthUser, @Body() dto: ImportCnesDto) { return this.svc.importFromCnes(u, dto.codigoCnes, dto.integrada); }

  @Patch(':id') @RequirePermissions('units:manage')
  update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateHealthUnitDto) { return this.svc.update(u, id, dto); }

  @Delete(':id') @RequirePermissions('units:manage')
  remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.remove(u, id); }
}

/** Endpoints públicos do portal institucional (sem dados de pacientes). */
@ApiTags('Público')
@Controller('public')
export class PublicController {
  constructor(private readonly svc: HealthUnitsService) {}
  @Public() @Get('health-units') @ApiOperation({ summary: 'Diretório público de unidades da rede' })
  directory(@Query() q: HealthUnitQueryDto) { return this.svc.publicDirectory(q); }
}
