import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../database/entities';

export interface UserContext {
  userId: string; active: boolean; role: 'paciente' | 'profissional' | 'admin'; permissions: string[]; name: string;
  patientId: string | null; professionalId: string | null; unitId: string | null; cargo: string | null; professionalActive: boolean;
}

/** Carrega papel, permissões e vínculo profissional do usuário (cache de 30 s, invalidável). */
@Injectable()
export class AuthContextService {
  private cache = new Map<string, { at: number; ctx: UserContext | null }>();
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  async get(userId: string): Promise<UserContext | null> {
    const hit = this.cache.get(userId);
    if (hit && Date.now() - hit.at < 30000) return hit.ctx;
    const u = await this.users.findOne({ where: { id: userId }, relations: { role: { permissions: true }, professional: true } });
    const ctx: UserContext | null = u ? {
      userId: u.id, active: u.active, role: u.role.code as UserContext['role'], permissions: u.role.permissions.map((p) => p.code), name: u.name,
      patientId: u.patientId, professionalId: u.professionalId, unitId: u.professional?.unitId ?? null, cargo: u.professional?.cargo ?? null,
      professionalActive: u.professional ? u.professional.active : true,
    } : null;
    this.cache.set(userId, { at: Date.now(), ctx });
    return ctx;
  }
  invalidate(userId?: string) { if (userId) this.cache.delete(userId); else this.cache.clear(); }
}
