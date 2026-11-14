import { Column, Entity, Index, JoinColumn, ManyToOne, OneToOne, Relation } from 'typeorm';
import { BaseEntity } from './base.entity';
import { ExternalEstablishment } from './external.entities';

export const UNIT_CATEGORIES = ['UBS', 'UPA', 'Hospital', 'Laboratório', 'Clínica'] as const;
export type UnitCategory = (typeof UNIT_CATEGORIES)[number];

/** Unidade de saúde da rede Conecta. Pode ser vinculada a um estabelecimento real do CNES. */
@Entity('health_units')
@Index(['category'])
export class HealthUnit extends BaseEntity {
  @Column({ length: 200 }) name: string;
  @Column({ type: 'enum', enum: UNIT_CATEGORIES }) category: UnitCategory;
  /** Código CNES (7 dígitos). Único quando informado. */
  @Index({ unique: true }) @Column({ type: 'char', length: 7, nullable: true }) cnes: string | null;
  @ManyToOne(() => ExternalEstablishment, { nullable: true, onDelete: 'SET NULL', createForeignKeyConstraints: false })
  @JoinColumn({ name: 'cnes', referencedColumnName: 'codigoCnes' })
  establishment: ExternalEstablishment | null;
  @Column({ length: 255 }) address: string;
  @Column({ type: 'varchar', length: 40, nullable: true }) phone: string | null;
  @Column({ name: 'technical_manager', type: 'varchar', length: 150, nullable: true }) technicalManager: string | null;
  @Column({ name: 'opening_hours', type: 'varchar', length: 80, nullable: true }) openingHours: string | null;
  @Column({ name: 'codigo_municipio', type: 'char', length: 6, nullable: true }) codigoMunicipio: string | null;
  @Column({ default: true }) active: boolean;
  @OneToOne(() => HealthUnitIntegration, (i) => i.unit, { cascade: true }) integration: Relation<HealthUnitIntegration>;
}

/** Situação de integração/compartilhamento de registros da unidade na rede. */
@Entity('health_unit_integrations')
export class HealthUnitIntegration extends BaseEntity {
  @OneToOne(() => HealthUnit, (u) => u.integration, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'unit_id' }) unit: Relation<HealthUnit>;
  @Index({ unique: true }) @Column({ name: 'unit_id' }) unitId: string;
  /** Integrada = homologada e compartilhando registros com a rede. */
  @Column({ name: 'sharing_enabled', default: false }) sharingEnabled: boolean;
  @Column({ name: 'integrated_since', type: 'date', nullable: true }) integratedSince: string | null;
  @Column({ name: 'last_activity_at', type: 'datetime', nullable: true }) lastActivityAt: Date | null;
}
