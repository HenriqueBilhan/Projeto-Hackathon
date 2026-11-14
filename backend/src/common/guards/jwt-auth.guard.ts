import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { UserSession } from '../../database/entities';
import { AuthContextService } from '../../modules/core/auth-context.service';
import { IS_PUBLIC, PERMISSIONS, ROLES } from '../decorators/auth.decorators';
import type { AuthUser } from '../types';

export const JWT_ISSUER = 'conecta-api';
export const JWT_AUDIENCE = 'conecta-web';

/**
 * Guarda global: valida o JWT de acesso, confere se a sessão não foi revogada,
 * recarrega papel/permissões do banco (não confia no perfil enviado pelo cliente)
 * e aplica @Roles / @RequirePermissions.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly ctxService: AuthContextService,
    @InjectRepository(UserSession) private readonly sessions: Repository<UserSession>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    const req = context.switchToHttp().getRequest();
    const header: string = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw new UnauthorizedException({ message: 'Autenticação necessária.', code: 'TOKEN_MISSING' });
    let payload: { sub: string; sid: string };
    try {
      payload = await this.jwt.verifyAsync(token, { issuer: JWT_ISSUER, audience: JWT_AUDIENCE });
    } catch (e) {
      throw new UnauthorizedException({ message: e.name === 'TokenExpiredError' ? 'Sessão expirada.' : 'Token inválido.', code: e.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID' });
    }
    const session = await this.sessions.findOne({ where: { id: payload.sid, userId: payload.sub, revokedAt: IsNull(), expiresAt: MoreThan(new Date()) } });
    if (!session) throw new UnauthorizedException({ message: 'Sessão encerrada.', code: 'SESSION_REVOKED' });
    const ctx = await this.ctxService.get(payload.sub);
    if (!ctx || !ctx.active || !ctx.professionalActive) throw new UnauthorizedException({ message: 'Conta desativada.', code: 'ACCOUNT_DISABLED' });

    const user: AuthUser = { ...ctx, sessionId: session.id, ip: req.ip };
    req.user = user;

    const roles = this.reflector.getAllAndOverride<string[]>(ROLES, targets);
    if (roles?.length && !roles.includes(user.role)) throw new ForbiddenException({ message: 'Seu perfil não tem acesso a este recurso.', code: 'ROLE_FORBIDDEN' });
    const perms = this.reflector.getAllAndOverride<string[]>(PERMISSIONS, targets);
    if (perms?.length && !perms.every((p) => user.permissions.includes(p))) throw new ForbiddenException({ message: 'Permissão insuficiente.', code: 'PERMISSION_DENIED' });
    return true;
  }
}
