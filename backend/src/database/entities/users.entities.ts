import { Column, Entity, Index, JoinColumn, JoinTable, ManyToMany, ManyToOne, OneToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Patient } from './patients.entities';
import { Professional } from './professionals.entities';

/** Permissão RBAC (ex.: "patients:read", "units:manage"). */
@Entity('permissions')
export class Permission extends BaseEntity {
  @Index({ unique: true }) @Column({ length: 60 }) code: string;
  @Column({ length: 160 }) description: string;
}

/** Papel do sistema: paciente, profissional ou admin. */
@Entity('roles')
export class Role extends BaseEntity {
  @Index({ unique: true }) @Column({ length: 30 }) code: string;
  @Column({ length: 80 }) name: string;
  @ManyToMany(() => Permission, { eager: false })
  @JoinTable({ name: 'role_permissions', joinColumn: { name: 'role_id' }, inverseJoinColumn: { name: 'permission_id' } })
  permissions: Permission[];
}

/** Conta de acesso. O login é feito por CPF; a senha é armazenada apenas como hash bcrypt. */
@Entity('users')
export class User extends BaseEntity {
  @Index({ unique: true }) @Column({ length: 11 }) cpf: string;
  @Column({ name: 'password_hash', length: 100, select: false }) passwordHash: string;
  @Column({ length: 150 }) name: string;
  @Column({ type: 'varchar', length: 150, nullable: true }) email: string | null;
  @Column({ type: 'varchar', length: 120, nullable: true }) title: string | null;

  @ManyToOne(() => Role, { nullable: false }) @JoinColumn({ name: 'role_id' }) role: Role;
  @Column({ name: 'role_id' }) roleId: string;

  @OneToOne(() => Patient, { nullable: true, onDelete: 'SET NULL' }) @JoinColumn({ name: 'patient_id' }) patient: Patient | null;
  @Index({ unique: true }) @Column({ name: 'patient_id', type: 'varchar', length: 36, nullable: true }) patientId: string | null;
  @OneToOne(() => Professional, { nullable: true, onDelete: 'SET NULL' }) @JoinColumn({ name: 'professional_id' }) professional: Professional | null;
  @Index({ unique: true }) @Column({ name: 'professional_id', type: 'varchar', length: 36, nullable: true }) professionalId: string | null;

  @Column({ default: true }) active: boolean;
  @Column({ name: 'mfa_enabled', default: false }) mfaEnabled: boolean;
  @Column({ name: 'failed_login_attempts', type: 'int', default: 0 }) failedLoginAttempts: number;
  @Column({ name: 'locked_until', type: 'datetime', nullable: true }) lockedUntil: Date | null;
  @Column({ name: 'last_login_at', type: 'datetime', nullable: true }) lastLoginAt: Date | null;
  @Column({ name: 'password_reset_hash', type: 'varchar', length: 64, nullable: true, select: false }) passwordResetHash: string | null;
  @Column({ name: 'password_reset_expires', type: 'datetime', nullable: true, select: false }) passwordResetExpires: Date | null;
}

/** Sessão de refresh token (rotação + revogação). Guarda apenas o hash do token. */
@Entity('user_sessions')
@Index(['userId', 'revokedAt'])
export class UserSession extends BaseEntity {
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user: User;
  @Column({ name: 'user_id' }) userId: string;
  @Index({ unique: true }) @Column({ name: 'refresh_token_hash', length: 64 }) refreshTokenHash: string;
  @Column({ name: 'expires_at', type: 'datetime' }) expiresAt: Date;
  @Column({ name: 'revoked_at', type: 'datetime', nullable: true }) revokedAt: Date | null;
  @Column({ name: 'replaced_by', type: 'varchar', length: 36, nullable: true }) replacedBy: string | null;
  @Column({ name: 'user_agent', type: 'varchar', length: 255, nullable: true }) userAgent: string | null;
  @Column({ type: 'varchar', length: 64, nullable: true }) ip: string | null;
}
