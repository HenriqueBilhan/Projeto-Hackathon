import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthUser } from '../types';

export const IS_PUBLIC = 'isPublic';
export const PERMISSIONS = 'permissions';
export const ROLES = 'roles';

/** Rota pública (sem JWT). Nunca use em rotas com dados de pacientes. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Exige todas as permissões RBAC informadas. */
export const RequirePermissions = (...perms: string[]) => SetMetadata(PERMISSIONS, perms);
/** Restringe a rota a determinados papéis. */
export const Roles = (...roles: string[]) => SetMetadata(ROLES, roles);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user);
