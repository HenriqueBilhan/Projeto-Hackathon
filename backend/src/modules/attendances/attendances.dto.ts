import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export const ATTENDANCE_TYPES = ['Consulta', 'Atendimento de urgência', 'Procedimento', 'Internação', 'Exame'];
const WALL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const num = ({ value }: { value: unknown }) => (value === '' || value === null || value === undefined ? undefined : Number(String(value).replace(',', '.')));

export class VitalSignsDto {
  @ApiPropertyOptional({ example: '120/80' }) @IsOptional() @Matches(/^\d{2,3}\/\d{2,3}$/, { message: 'Pressão no formato 120/80.' }) pa?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(num) @IsInt() @Min(20) @Max(250) fc?: number;
  @ApiPropertyOptional() @IsOptional() @Transform(num) @IsInt() @Min(4) @Max(80) fr?: number;
  @ApiPropertyOptional() @IsOptional() @Transform(num) @IsNumber() @Min(30) @Max(45) temp?: number;
  @ApiPropertyOptional() @IsOptional() @Transform(num) @IsInt() @Min(50) @Max(100) spo2?: number;
  @ApiPropertyOptional() @IsOptional() @Transform(num) @IsNumber() @Min(0.5) @Max(400) peso?: number;
  @ApiPropertyOptional() @IsOptional() @Transform(num) @IsInt() @Min(10) @Max(1500) glicemia?: number;
}

export class ReferralInlineDto {
  @ApiProperty() @IsString() @Length(2, 100) especialidade: string;
  @ApiProperty() @IsUUID() destinoId: string;
}

export class CreateAttendanceDto {
  @ApiProperty() @IsUUID() pacienteId: string;
  @ApiProperty() @IsUUID() unidadeId: string;
  @ApiProperty({ example: '2026-11-14T09:30', description: 'Data e hora do atendimento (hora local da unidade)' }) @Matches(WALL) data: string;
  @ApiPropertyOptional({ enum: ATTENDANCE_TYPES }) @IsOptional() @IsIn(ATTENDANCE_TYPES) tipo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) especialidade?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) queixa?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) hda?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) avaliacao?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(240) diagnostico?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^$|^[A-Za-z]\d{2}(\.\d{1,2})?$/, { message: 'CID-10 inválido (ex.: N39.0).' }) cid?: string;
  @ApiPropertyOptional({ type: VitalSignsDto }) @IsOptional() @IsObject() @ValidateNested() @Type(() => VitalSignsDto) sinais?: VitalSignsDto;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(200, { each: true }) procedimentos?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) prescricao?: string;
  @ApiPropertyOptional({ type: [String], description: 'Exames a solicitar' }) @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(150, { each: true }) exames?: string[];
  @ApiPropertyOptional({ type: ReferralInlineDto }) @IsOptional() @IsObject() @ValidateNested() @Type(() => ReferralInlineDto) encaminhamento?: ReferralInlineDto;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) observacoes?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() consultaId?: string;
  @ApiPropertyOptional({ description: 'Salvar como rascunho' }) @IsOptional() @IsBoolean() rascunho?: boolean;
  @ApiPropertyOptional({ description: 'Conteúdo bruto do formulário (rascunho)' }) @IsOptional() @IsObject() dados?: Record<string, unknown>;
}

export class AttendanceQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['minhas', 'unidade'], default: 'minhas' }) @IsOptional() @IsIn(['minhas', 'unidade']) escopo?: string;
  @ApiPropertyOptional({ enum: ['Finalizado', 'Rascunho'] }) @IsOptional() @IsIn(['Finalizado', 'Rascunho']) status?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() pacienteId?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) de?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) ate?: string;
}
