import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from './base.entity';
import { HealthUnit } from './health-units.entities';

/** Paciente. CPF e CNS são únicos; dados clínicos ficam em tabelas relacionadas. */
@Entity('patients')
@Index(['name'])
export class Patient extends BaseEntity {
  @Column({ length: 150 }) name: string;
  @Index({ unique: true }) @Column({ length: 11 }) cpf: string;
  @Index({ unique: true }) @Column({ length: 15 }) cns: string;
  @Column({ name: 'birth_date', type: 'date' }) birthDate: string;
  @Column({ length: 20, default: 'Não informado' }) sex: string;
  @Column({ name: 'blood_type', length: 15, default: 'Não informado' }) bloodType: string;
  @Column({ type: 'varchar', length: 40, nullable: true }) phone: string | null;
  @Column({ type: 'varchar', length: 150, nullable: true }) email: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true }) address: string | null;
  @Column({ name: 'mother_name', type: 'varchar', length: 150, nullable: true }) motherName: string | null;
  @Column({ name: 'emergency_contact', type: 'varchar', length: 200, nullable: true }) emergencyContact: string | null;
  @ManyToOne(() => HealthUnit, { nullable: true, onDelete: 'SET NULL' }) @JoinColumn({ name: 'reference_unit_id' }) referenceUnit: HealthUnit | null;
  @Column({ name: 'reference_unit_id', type: 'varchar', length: 36, nullable: true }) referenceUnitId: string | null;
  /** Consentimento para compartilhar o histórico entre unidades (LGPD). */
  @Column({ name: 'share_consent', default: true }) shareConsent: boolean;
  /** Preferência: ser notificado a cada acesso ao prontuário. */
  @Column({ name: 'notify_on_access', default: true }) notifyOnAccess: boolean;
  @OneToMany(() => PatientAllergy, (a) => a.patient, { cascade: true }) allergies: PatientAllergy[];
  @OneToMany(() => PatientChronicCondition, (c) => c.patient, { cascade: true }) chronicConditions: PatientChronicCondition[];
  @OneToMany(() => PatientHospitalization, (h) => h.patient, { cascade: true }) hospitalizations: PatientHospitalization[];
}

@Entity('patient_allergies')
@Index(['patientId', 'substance'], { unique: true })
export class PatientAllergy extends BaseEntity {
  @ManyToOne(() => Patient, (p) => p.allergies, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'patient_id' }) patient: Patient;
  @Column({ name: 'patient_id' }) patientId: string;
  @Column({ length: 120 }) substance: string;
  @Column({ type: 'enum', enum: ['Leve', 'Moderada', 'Grave'], default: 'Moderada' }) severity: string;
  @Column({ type: 'varchar', length: 200, nullable: true }) reaction: string | null;
}

@Entity('patient_chronic_conditions')
@Index(['patientId', 'description'], { unique: true })
export class PatientChronicCondition extends BaseEntity {
  @ManyToOne(() => Patient, (p) => p.chronicConditions, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'patient_id' }) patient: Patient;
  @Column({ name: 'patient_id' }) patientId: string;
  @Column({ length: 200 }) description: string;
  @Column({ name: 'cid10', type: 'varchar', length: 10, nullable: true }) cid10: string | null;
}

/** Internações registradas (exibidas no prontuário). */
@Entity('patient_hospitalizations')
@Index(['patientId', 'admissionDate'])
export class PatientHospitalization extends BaseEntity {
  @ManyToOne(() => Patient, (p) => p.hospitalizations, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'patient_id' }) patient: Patient;
  @Column({ name: 'patient_id' }) patientId: string;
  @ManyToOne(() => HealthUnit, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'unit_id' }) unit: HealthUnit;
  @Column({ name: 'unit_id' }) unitId: string;
  @Column({ name: 'admission_date', type: 'date' }) admissionDate: string;
  @Column({ name: 'discharge_date', type: 'date', nullable: true }) dischargeDate: string | null;
  @Column({ length: 255 }) reason: string;
}
