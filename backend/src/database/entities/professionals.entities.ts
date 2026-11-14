import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { HealthUnit } from './health-units.entities';

/** Especialidade/área de atuação (catálogo). */
@Entity('professional_specialties')
export class ProfessionalSpecialty extends BaseEntity {
  @Index({ unique: true }) @Column({ length: 100 }) name: string;
  /** Código CBO correspondente, quando conhecido (ex.: 225125). */
  @Column({ type: 'varchar', length: 10, nullable: true }) cbo: string | null;
}

export const CARGOS = ['Médico', 'Enfermeiro', 'Técnico de enfermagem', 'Técnico de laboratório', 'Farmacêutico', 'Recepção'] as const;

/** Profissional de saúde vinculado a uma unidade. */
@Entity('professionals')
@Index(['unitId', 'active'])
export class Professional extends BaseEntity {
  @Column({ length: 150 }) name: string;
  @Index({ unique: true }) @Column({ length: 11 }) cpf: string;
  @Column({ type: 'enum', enum: CARGOS }) cargo: (typeof CARGOS)[number];
  @Column({ name: 'registration', length: 40 }) registration: string;
  @ManyToOne(() => ProfessionalSpecialty, { nullable: false }) @JoinColumn({ name: 'specialty_id' }) specialty: ProfessionalSpecialty;
  @Column({ name: 'specialty_id' }) specialtyId: string;
  @ManyToOne(() => HealthUnit, { nullable: false, onDelete: 'RESTRICT' }) @JoinColumn({ name: 'unit_id' }) unit: HealthUnit;
  @Column({ name: 'unit_id' }) unitId: string;
  @Column({ length: 150 }) email: string;
  @Column({ type: 'varchar', length: 40, nullable: true }) phone: string | null;
  @Column({ default: true }) active: boolean;
}
