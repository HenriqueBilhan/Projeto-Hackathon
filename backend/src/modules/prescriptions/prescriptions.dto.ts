import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength, ValidateNested } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class MedicationDto {
  @ApiProperty() @IsString() @Length(2, 150) medicamento: string;
  @ApiProperty() @IsString() @Length(1, 120) dosagem: string;
  @ApiProperty() @IsString() @Length(2, 120) frequencia: string;
  @ApiProperty({ example: '7 dias' }) @IsString() @Length(2, 60) duracao: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) orientacoes?: string;
}
export class CreatePrescriptionDto {
  @ApiProperty() @IsUUID() pacienteId: string;
  @ApiProperty({ type: [MedicationDto] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => MedicationDto) medicamentos: MedicationDto[];
  @ApiPropertyOptional() @IsOptional() @IsUUID() atendimentoId?: string;
  @ApiPropertyOptional({ description: 'Confirma a prescrição mesmo havendo alergia registrada compatível' }) @IsOptional() @IsBoolean() confirmarAlergia?: boolean;
}
export class UpdatePrescriptionDto {
  @ApiProperty({ enum: ['Em uso', 'Uso contínuo', 'Concluído'] }) @IsIn(['Em uso', 'Uso contínuo', 'Concluído']) status: string;
}
export class PrescriptionQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['minhas', 'unidade', 'paciente'], default: 'minhas' }) @IsOptional() @IsIn(['minhas', 'unidade', 'paciente']) escopo?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() pacienteId?: string;
  @ApiPropertyOptional({ enum: ['ativas', 'concluidas'] }) @IsOptional() @IsIn(['ativas', 'concluidas']) situacao?: string;
}
