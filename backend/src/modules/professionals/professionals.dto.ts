import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, IsUUID, Length, Matches, MaxLength } from 'class-validator';
import { CARGOS } from '../../database/entities';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { PASSWORD_RULE } from '../auth/auth.dto';

export class CreateProfessionalDto {
  @ApiProperty() @IsString() @Length(3, 150) nome: string;
  @ApiProperty() @IsString() @MaxLength(14) cpf: string;
  @ApiProperty({ enum: CARGOS }) @IsIn(CARGOS as unknown as string[]) cargo: string;
  @ApiProperty({ example: 'CRM-RS 12345' }) @IsString() @Length(2, 40) registro: string;
  @ApiProperty({ description: 'Nome da especialidade (catálogo /professionals/specialties)' }) @IsString() @Length(2, 100) especialidade: string;
  @ApiProperty() @IsUUID() unidadeId: string;
  @ApiProperty() @IsEmail() @MaxLength(150) email: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) telefone?: string;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() ativo?: boolean;
  @ApiProperty({ description: 'Senha inicial de acesso (8+ caracteres, letras e números)' })
  @Matches(PASSWORD_RULE, { message: 'A senha inicial deve ter 8+ caracteres, com letras e números.' }) senha: string;
}
export class UpdateProfessionalDto extends PartialType(OmitType(CreateProfessionalDto, ['cpf', 'senha'] as const)) {
  @ApiPropertyOptional({ description: 'Redefine a senha do profissional' })
  @IsOptional() @Matches(PASSWORD_RULE, { message: 'A senha deve ter 8+ caracteres, com letras e números.' }) novaSenha?: string;
}
export class ProfessionalQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() unidadeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) especialidade?: string;
  @ApiPropertyOptional({ enum: CARGOS }) @IsOptional() @IsIn(CARGOS as unknown as string[]) cargo?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() ativo?: boolean;
}
