import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions } from '../../common/decorators/auth.decorators';
import type { AuthUser } from '../../common/types';
import { CreateProfessionalDto, ProfessionalQueryDto, UpdateProfessionalDto } from './professionals.dto';
import { ProfessionalsService } from './professionals.service';

@ApiTags('Profissionais') @ApiBearerAuth()
@Controller('professionals')
export class ProfessionalsController {
  constructor(private readonly svc: ProfessionalsService) {}

  @Get() @RequirePermissions('professionals:read') @ApiOperation({ summary: 'Lista profissionais (dados completos apenas para gestores)' })
  list(@CurrentUser() u: AuthUser, @Query() q: ProfessionalQueryDto) { return this.svc.list(u, q); }

  @Get('specialties') @RequirePermissions('professionals:read') @ApiOperation({ summary: 'Catálogo de especialidades' })
  specialties() { return this.svc.listSpecialties(); }

  @Get(':id') @RequirePermissions('professionals:read')
  get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u, id); }

  @Post() @RequirePermissions('professionals:manage') @ApiOperation({ summary: 'Cadastra profissional e sua conta de acesso' })
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateProfessionalDto) { return this.svc.create(u, dto); }

  @Patch(':id') @RequirePermissions('professionals:manage') @ApiOperation({ summary: 'Edita cadastro, unidade, especialidade, ativa/desativa acesso' })
  update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProfessionalDto) { return this.svc.update(u, id, dto); }

  @Delete(':id') @RequirePermissions('professionals:manage')
  remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.remove(u, id); }
}
