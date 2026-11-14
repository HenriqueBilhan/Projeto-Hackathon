import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from './base.entity';
import { User } from './users.entities';

/** Notificação para um usuário. */
@Entity('notifications')
@Index(['userId', 'readAt'])
export class Notification extends BaseEntity {
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user: User;
  @Column({ name: 'user_id' }) userId: string;
  @Column({ length: 120 }) title: string;
  @Column({ length: 500 }) message: string;
  @Column({ length: 40, default: 'bell' }) icon: string;
  /** Link relativo para a página do frontend (ex.: "exames.html"). */
  @Column({ type: 'varchar', length: 200, nullable: true }) link: string | null;
  @Column({ name: 'read_at', type: 'datetime', nullable: true }) readAt: Date | null;
}

/**
 * Trilha de auditoria (LGPD): quem, quando, de onde e o quê.
 * Nunca armazena conteúdo clínico, apenas a operação e identificadores.
 */
@Entity('audit_logs')
@Index(['occurredAt'])
@Index(['patientId', 'occurredAt'])
@Index(['userId', 'occurredAt'])
@Index(['operation'])
export class AuditLog {
  @PrimaryGeneratedColumn('increment', { type: 'bigint', unsigned: true }) id: string;
  @CreateDateColumn({ name: 'occurred_at', type: 'datetime', precision: 6 }) occurredAt: Date;
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL', createForeignKeyConstraints: true }) @JoinColumn({ name: 'user_id' }) user: User | null;
  @Column({ name: 'user_id', type: 'varchar', length: 36, nullable: true }) userId: string | null;
  @Column({ name: 'user_name', length: 150 }) userName: string;
  @Column({ name: 'user_role', length: 40 }) userRole: string;
  @Column({ name: 'patient_id', type: 'varchar', length: 36, nullable: true }) patientId: string | null;
  @Column({ name: 'unit_id', type: 'varchar', length: 36, nullable: true }) unitId: string | null;
  @Column({ length: 80 }) operation: string;
  @Column({ type: 'varchar', length: 255, nullable: true }) detail: string | null;
  @Column({ type: 'varchar', length: 64, nullable: true }) ip: string | null;
  @Column({ default: true }) success: boolean;
}

export const CLINICAL_PROFILES = ['Médico', 'Enfermeiro', 'Técnico de laboratório', 'Recepção', 'Administrador'] as const;
export const CLINICAL_RESOURCES = [
  { id: 'ver_prontuario', name: 'Visualizar prontuário completo' },
  { id: 'registrar', name: 'Registrar atendimento' },
  { id: 'prescrever', name: 'Emitir prescrições' },
  { id: 'exames', name: 'Solicitar exames' },
  { id: 'laudos', name: 'Liberar laudos de exames' },
  { id: 'dados_cadastrais', name: 'Ver dados cadastrais (sem máscara)' },
  { id: 'gestao', name: 'Gestão de usuários e unidades' },
] as const;

/** Matriz de acesso clínico por perfil profissional (editável pelo gestor). */
@Entity('access_permissions')
@Index(['profile', 'resource'], { unique: true })
export class AccessPermission extends BaseEntity {
  @Column({ length: 40 }) profile: string;
  @Column({ length: 40 }) resource: string;
  @Column({ default: false }) allowed: boolean;
}

/** Configurações da plataforma (chave/valor JSON). */
@Entity('system_settings')
export class SystemSetting extends BaseEntity {
  @Index({ unique: true }) @Column({ name: 'setting_key', length: 60 }) key: string;
  @Column({ type: 'json' }) value: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}
