import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsDateString, IsEmail, IsIn, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

export const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,72}$/;

export class LoginDto {
  @ApiProperty({ example: '529.982.247-25' }) @IsString() @MaxLength(14) cpf: string;
  @ApiProperty() @IsString() @MinLength(6) @MaxLength(72) senha: string;
  @ApiPropertyOptional({ enum: ['paciente', 'profissional'], description: 'Tipo de acesso escolhido na tela de login' })
  @IsOptional() @IsIn(['paciente', 'profissional']) perfil?: 'paciente' | 'profissional';
}

export class RegisterDto {
  @ApiProperty() @IsString() @Length(3, 150) nome: string;
  @ApiProperty() @IsString() @MaxLength(14) cpf: string;
  @ApiProperty({ description: 'Cartão Nacional de Saúde (15 dígitos)' }) @IsString() @MaxLength(18) cns: string;
  @ApiProperty({ example: '1990-05-20' }) @IsDateString({ strict: true }) nascimento: string;
  @ApiProperty() @IsEmail() @MaxLength(150) email: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) telefone?: string;
  @ApiProperty({ description: '8+ caracteres com letras e números' }) @Matches(PASSWORD_RULE, { message: 'A senha deve ter 8+ caracteres, com letras e números.' }) senha: string;
  @ApiProperty({ description: 'Aceite da política de privacidade (LGPD)' }) @Equals(true, { message: 'É necessário aceitar a política de privacidade.' }) aceiteLgpd: boolean;
}

export class ForgotPasswordDto {
  @ApiProperty() @IsString() @MaxLength(14) cpf: string;
  @ApiProperty() @IsEmail() email: string;
}

export class ResetPasswordDto {
  @ApiProperty() @IsString() @Length(20, 200) token: string;
  @ApiProperty() @Matches(PASSWORD_RULE, { message: 'A senha deve ter 8+ caracteres, com letras e números.' }) novaSenha: string;
}
