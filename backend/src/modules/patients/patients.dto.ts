import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEmail, IsIn, IsObject, IsOptional, IsString, IsUUID, Length, MaxLength, ValidateNested } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class AllergyDto {
  @ApiProperty() @IsString() @Length(2, 120) nome: string;
  @ApiPropertyOptional({ enum: ['Leve', 'Moderada', 'Grave'] }) @IsOptional() @IsIn(['Leve', 'Moderada', 'Grave']) gravidade?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) reacao?: string;
}

export class CreatePatientDto {
  @ApiProperty() @IsString() @Length(3, 150) nome: string;
  @ApiProperty() @IsString() @MaxLength(14) cpf: string;
  @ApiProperty() @IsString() @MaxLength(18) cns: string;
  @ApiProperty() @IsDateString({ strict: true }) nascimento: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['Feminino', 'Masculino', 'Outro', 'Não informado']) sexo?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Não informado']) tipoSanguineo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) telefone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) endereco?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) nomeMae?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) contatoEmergencia?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() unidadeRef?: string;
  @ApiPropertyOptional({ type: [AllergyDto] }) @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => AllergyDto) alergias?: AllergyDto[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(200, { each: true }) cronicas?: string[];
}

class PreferencesDto {
  @IsOptional() @IsBoolean() notificarAcesso?: boolean;
  @IsOptional() @IsBoolean() compartilhar?: boolean;
}

/** Campos editáveis. O serviço aplica o subconjunto permitido conforme o perfil de quem edita. */
export class UpdatePatientDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) telefone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) endereco?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) contatoEmergencia?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(150) nomeMae?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() unidadeRef?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['Feminino', 'Masculino', 'Outro', 'Não informado']) sexo?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Não informado']) tipoSanguineo?: string;
  @ApiPropertyOptional({ type: [AllergyDto] }) @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => AllergyDto) alergias?: AllergyDto[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(200, { each: true }) cronicas?: string[];
  @ApiPropertyOptional({ description: 'Somente o próprio paciente' }) @IsOptional() @IsObject() @ValidateNested() @Type(() => PreferencesDto) preferencias?: PreferencesDto;
}

export class PatientQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Parte do nome' }) @IsOptional() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional({ description: 'CPF completo' }) @IsOptional() @IsString() @MaxLength(14) cpf?: string;
  @ApiPropertyOptional({ description: 'CNS completo ou parcial (mín. 4 dígitos)' }) @IsOptional() @IsString() @MaxLength(18) cns?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() unidadeRef?: string;
}

export class AccessQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Justificativa para acesso de emergência (mín. 10 caracteres)' }) @IsOptional() @IsString() @MaxLength(300) justificativa?: string;
  @ApiPropertyOptional({ description: 'Exibe CPF/CNS completos (exige permissão; gera auditoria)' }) @IsOptional() @IsIn(['true', 'false']) reveal?: string;
}
