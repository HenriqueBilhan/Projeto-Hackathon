import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { UNIT_CATEGORIES } from '../../database/entities';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class CreateHealthUnitDto {
  @ApiProperty() @IsString() @Length(3, 200) nome: string;
  @ApiProperty({ enum: UNIT_CATEGORIES }) @IsIn(UNIT_CATEGORIES as unknown as string[]) tipo: string;
  @ApiPropertyOptional({ description: 'Código CNES (7 dígitos)' }) @IsOptional() @Matches(/^\d{7}$/, { message: 'O CNES deve ter 7 dígitos.' }) cnes?: string;
  @ApiProperty() @IsString() @Length(3, 255) endereco: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) telefone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) responsavel?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) horario?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{6}$/) codigoMunicipio?: string;
  @ApiPropertyOptional({ description: 'Unidade integrada (compartilha registros na rede)' }) @IsOptional() @IsBoolean() integrada?: boolean;
}
export class UpdateHealthUnitDto extends PartialType(CreateHealthUnitDto) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() ativa?: boolean;
}

export class ImportCnesDto {
  @ApiProperty({ description: 'Código CNES do estabelecimento (dados públicos do Ministério da Saúde)' }) @Matches(/^\d{1,7}$/) codigoCnes: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() integrada?: boolean;
}

export class HealthUnitQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional({ enum: UNIT_CATEGORIES }) @IsOptional() @IsIn(UNIT_CATEGORIES as unknown as string[]) tipo?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() integrada?: boolean;
}
