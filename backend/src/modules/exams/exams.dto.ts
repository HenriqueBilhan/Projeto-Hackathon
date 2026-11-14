import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, ValidateNested } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class ResultRowDto {
  @ApiProperty() @IsString() @Length(1, 120) parametro: string;
  @ApiProperty() @IsString() @Length(1, 500) valor: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) referencia?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() alterado?: boolean;
}

export class CreateExamRequestDto {
  @ApiProperty() @IsUUID() pacienteId: string;
  @ApiProperty() @IsString() @Length(2, 150) exame: string;
  @ApiProperty() @IsString() @Length(10, 2000) justificativa: string;
  @ApiPropertyOptional({ enum: ['Rotina', 'Urgente', 'Emergência'] }) @IsOptional() @IsIn(['Rotina', 'Urgente', 'Emergência']) prioridade?: string;
  @ApiProperty({ description: 'Unidade solicitante (a unidade de atuação do profissional)' }) @IsUUID() unidadeId: string;
}
export class UpdateExamRequestDto {
  @ApiProperty({ enum: ['Agendado', 'Em andamento', 'Cancelado'] }) @IsIn(['Agendado', 'Em andamento', 'Cancelado']) status: string;
}
export class CreateExamResultDto {
  @ApiProperty() @IsUUID() exameId: string;
  @ApiPropertyOptional({ description: 'Data de realização (AAAA-MM-DD)' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) data?: string;
  @ApiProperty({ type: [ResultRowDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(80) @ValidateNested({ each: true }) @Type(() => ResultRowDto) resultados: ResultRowDto[];
}
/** Registro direto de exame já realizado (ex.: laudo recebido de laboratório da rede). */
export class CreateExamDto {
  @ApiProperty() @IsUUID() pacienteId: string;
  @ApiProperty() @IsString() @Length(2, 150) nome: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['Laboratorial', 'Imagem', 'Cardiológico', 'Funcional', 'Outro']) categoria?: string;
  @ApiProperty() @Matches(/^\d{4}-\d{2}-\d{2}$/) data: string;
  @ApiPropertyOptional({ type: [ResultRowDto] }) @IsOptional() @IsArray() @ArrayMaxSize(80) @ValidateNested({ each: true }) @Type(() => ResultRowDto) resultados?: ResultRowDto[];
}
export class ExamQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() pacienteId?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['Solicitado', 'Agendado', 'Em análise', 'Resultado disponível', 'Cancelado']) status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) nome?: string;
}
export class ExamRequestQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['minhas', 'unidade'], default: 'minhas' }) @IsOptional() @IsIn(['minhas', 'unidade']) escopo?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['Solicitado', 'Agendado', 'Em andamento', 'Resultado disponível', 'Cancelado']) status?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() pacienteId?: string;
}
