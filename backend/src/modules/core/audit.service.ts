import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { LessThan, Repository } from 'typeorm';
import { AuditLog } from '../../database/entities';
import type { AuthUser } from '../../common/types';
import { config } from '../../config/configuration';

const ROLE_LABEL: Record<string, string> = { paciente: 'Paciente', profissional: 'Profissional', admin: 'Administrador' };

/** Registro de auditoria (LGPD). Grava apenas metadados — nunca conteúdo clínico. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  constructor(@InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>) {}

  async log(user: Pick<AuthUser, 'userId' | 'name' | 'role' | 'unitId' | 'ip' | 'cargo'> | null, operation: string, opts: { patientId?: string | null; detail?: string | null; unitId?: string | null; success?: boolean; userName?: string; ip?: string } = {}) {
    try {
      await this.repo.insert({
        userId: user?.userId ?? null,
        userName: user?.name ?? opts.userName ?? 'Desconhecido',
        userRole: user ? (user.role === 'profissional' && user.cargo ? user.cargo : ROLE_LABEL[user.role]) : '—',
        patientId: opts.patientId ?? null,
        unitId: opts.unitId ?? user?.unitId ?? null,
        operation: operation.slice(0, 80),
        detail: opts.detail ? opts.detail.slice(0, 255) : null,
        ip: user?.ip ?? opts.ip ?? null,
        success: opts.success ?? true,
      });
    } catch (e) {
      // A falha de auditoria não pode derrubar a operação, mas precisa ser registrada.
      this.logger.error({ operation, err: e.message }, 'Falha ao gravar auditoria');
    }
  }

  /** Política de retenção: remove registros mais antigos que AUDIT_RETENTION_DAYS (diariamente às 02:30). */
  @Cron('30 2 * * *')
  async purgeExpired() {
    const limit = new Date(Date.now() - config.audit.retentionDays * 86400000);
    const r = await this.repo.delete({ occurredAt: LessThan(limit) });
    if (r.affected) this.logger.log({ removed: r.affected }, 'Registros de auditoria expirados removidos');
    return r.affected || 0;
  }
}
