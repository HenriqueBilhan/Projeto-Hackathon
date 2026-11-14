import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Public, RequirePermissions } from '../../common/decorators/auth.decorators';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { MinisterioSaudeService } from './ministerio-saude.service';

class EstablishmentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) q?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{6}$/) codigoMunicipio?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Za-z]{2}$/) uf?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() tipo?: number;
  @ApiPropertyOptional({ description: 'Somente tipos que viram unidades do Conecta' }) @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() somenteSuportados?: boolean;
}
class MunicipalityQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) q?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Za-z]{2}$/) uf?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10) regiaoSaude?: string;
}
class CnesProfessionalQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) q?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{1,7}$/) cnes?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() competencia?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) cbo?: string;
}
class BedsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) q?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Za-z]{2}$/) uf?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) municipio?: string;
}
class CatalogQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) tag?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) q?: string;
}
class RefreshQueryDto { @IsOptional() @IsIn(['true', 'false']) refresh?: string; }

/** Dados públicos do Ministério da Saúde armazenados localmente (consultas rápidas, sem chamar a API externa). */
@ApiTags('Integração — Ministério da Saúde') @ApiBearerAuth()
@Controller('integrations/ministerio-saude')
export class MinisterioSaudeController {
  constructor(private readonly svc: MinisterioSaudeService) {}

  @Get('status') @RequirePermissions('integrations:read') @ApiOperation({ summary: 'Disponibilidade real da API oficial e resumo da base local' })
  status() { return this.svc.status(); }

  @Get('datasets') @RequirePermissions('integrations:read') @ApiOperation({ summary: 'Conjuntos sincronizados e catálogo de endpoints do swagger oficial' })
  datasets(@Query() q: CatalogQueryDto) { return this.svc.catalog(q); }

  @Get('establishments') @RequirePermissions('integrations:read') @ApiOperation({ summary: 'Estabelecimentos CNES sincronizados (filtros, paginação, ordenação)' })
  establishments(@Query() q: EstablishmentQueryDto) { return this.svc.searchEstablishments(q); }

  @Get('establishments/:cnes') @RequirePermissions('integrations:read') @ApiOperation({ summary: 'Detalhe do estabelecimento (refresh=true consulta a API e atualiza a base)' })
  async establishment(@Param('cnes') cnes: string, @Query() q: RefreshQueryDto) {
    const e = await this.svc.getEstablishment(cnes, q.refresh === 'true');
    if (!e) throw new NotFoundException('Estabelecimento não encontrado.');
    return e;
  }

  @Get('municipalities') @RequirePermissions('integrations:read') municipalities(@Query() q: MunicipalityQueryDto) { return this.svc.searchMunicipalities(q); }
  @Get('unit-types') @RequirePermissions('integrations:read') unitTypes() { return this.svc.listUnitTypes(); }
  @Get('professionals') @RequirePermissions('integrations:read') @ApiOperation({ summary: 'Vínculos públicos de profissionais por estabelecimento (CNES)' })
  professionals(@Query() q: CnesProfessionalQueryDto) { return this.svc.searchCnesProfessionals(q); }
  @Get('hospital-beds') @RequirePermissions('integrations:read') hospitalBeds(@Query() q: BedsQueryDto) { return this.svc.searchHospitalBeds(q); }
  @Get('stats') @RequirePermissions('integrations:read') stats() { return this.svc.stats(); }
}

/** Resumo público (portal): apenas contagens de dados abertos e da rede, sem dados pessoais. */
@ApiTags('Público')
@Controller('public')
export class PublicStatsController {
  constructor(private readonly svc: MinisterioSaudeService) {}
  @Public() @Get('stats') @ApiOperation({ summary: 'Números públicos da rede e dos dados abertos integrados' })
  async stats() {
    const s = await this.svc.status();
    return { estabelecimentosCnes: s.baseLocal.estabelecimentos, municipios: s.baseLocal.municipios, versoesHospitaisLeitos: s.baseLocal.hospitaisLeitos };
  }
}
