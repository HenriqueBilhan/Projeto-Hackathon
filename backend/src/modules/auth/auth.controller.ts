import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser, Public } from '../../common/decorators/auth.decorators';
import type { AuthUser } from '../../common/types';
import { config } from '../../config/configuration';
import { AuthService } from './auth.service';
import { ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto } from './auth.dto';

export const REFRESH_COOKIE = 'conecta_rt';
const cookieOpts = () => ({
  httpOnly: true, secure: config.security.cookieSecure, sameSite: 'strict' as const, path: `/${config.apiPrefix}/auth`,
  maxAge: config.jwt.refreshTtlDays * 86400000,
});
const meta = (req: Request) => ({ ip: req.ip || '', userAgent: String(req.headers['user-agent'] || '') });

/**
 * Autenticação JWT. O token de acesso (curto) vai no corpo da resposta;
 * o refresh token fica em cookie httpOnly/SameSite=Strict (inacessível a scripts).
 */
@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public() @Post('login') @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Login por CPF e senha (paciente, profissional ou gestor)' })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.login(dto, meta(req));
    res.cookie(REFRESH_COOKIE, r.refreshToken, cookieOpts());
    return { accessToken: r.accessToken, expiresIn: r.expiresIn, user: r.user };
  }

  @Public() @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Cadastro de conta de paciente' })
  register(@Body() dto: RegisterDto, @Req() req: Request) { return this.auth.register(dto, meta(req)); }

  @Public() @Post('refresh') @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Renova o token de acesso (rotação do refresh token em cookie)' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const r = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE], meta(req));
      res.cookie(REFRESH_COOKIE, r.refreshToken, cookieOpts());
      return { accessToken: r.accessToken, expiresIn: r.expiresIn, user: r.user };
    } catch (e) {
      res.clearCookie(REFRESH_COOKIE, { path: cookieOpts().path });
      throw e;
    }
  }

  @Post('logout') @HttpCode(200) @ApiBearerAuth()
  @ApiOperation({ summary: 'Encerra a sessão atual' })
  async logout(@CurrentUser() user: AuthUser, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user, req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { path: cookieOpts().path });
    return { message: 'Sessão encerrada.' };
  }

  @Public() @Post('forgot-password') @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Solicita redefinição de senha (resposta genérica)' })
  forgot(@Body() dto: ForgotPasswordDto) { return this.auth.forgotPassword(dto.cpf, dto.email); }

  @Public() @Post('reset-password') @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Redefine a senha com o token recebido' })
  reset(@Body() dto: ResetPasswordDto) { return this.auth.resetPassword(dto.token, dto.novaSenha); }

  @Get('me') @ApiBearerAuth()
  @ApiOperation({ summary: 'Dados do usuário autenticado' })
  me(@CurrentUser() user: AuthUser) { return this.auth.me(user.userId); }
}
