import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, OneToOne } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Patient } from './patients.entities';
import { Professional } from './professionals.entities';
import { HealthUnit } from './health-units.entities';

/** Consulta agendada (agenda). */
@Entity('appointments')
@Index(['patientId', 'scheduledAt'])
@Index(['professionalId', 'scheduledAt'])
@Index(['unitId', 'scheduledAt'])
export class Appointment extends BaseEntity {
  @ManyToOne(() => Patient, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'patient_id' }) patient: Patient;
  @Column({ name: 'patient_id' }) patientId: string;
  @ManyToOne(() => Professional, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'professional_id' }) professional: Professional;
  @Column({ name: 'professional_id' }) professionalId: string;
  @ManyToOne(() => HealthUnit, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'unit_id' }) unit: HealthUnit;
  @Column({ name: 'unit_id' }) unitId: string;
  @Column({ name: 'scheduled_at', type: 'datetime' }) scheduledAt: Date;
  @Column({ length: 100 }) specialty: string;
  @Column({ length: 80, default: 'Consulta presencial' }) type: string;
  @Column({ type: 'enum', enum: ['Agendada', 'Confirmada', 'Realizada', 'Cancelada', 'Faltou'], default: 'Agendada' }) status: string;
  @Column({ type: 'varchar', length: 255, nullable: true }) notes: string | null;
}

/** Registro de atendimento clínico (compõe a linha do tempo integrada). */
@Entity('attendances')
@Index(['patientId', 'occurredAt'])
@Index(['professionalId', 'occurredAt'])
@Index(['unitId', 'occurredAt'])
@Index(['status'])
export class Attendance extends BaseEntity {
  @ManyToOne(() => Patient, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'patient_id' }) patient: Patient;
  @Column({ name: 'patient_id' }) patientId: string;
  @ManyToOne(() => Professional, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'professional_id' }) professional: Professional;
  @Column({ name: 'professional_id' }) professionalId: string;
  @ManyToOne(() => HealthUnit, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'unit_id' }) unit: HealthUnit;
  @Column({ name: 'unit_id' }) unitId: string;
  @ManyToOne(() => Appointment, { nullable: true, onDelete: 'SET NULL' }) @JoinColumn({ name: 'appointment_id' }) appointment: Appointment | null;
  @Column({ name: 'appointment_id', type: 'varchar', length: 36, nullable: true }) appointmentId: string | null;
  @Column({ name: 'occurred_at', type: 'datetime' }) occurredAt: Date;
  @Column({ type: 'enum', enum: ['Consulta', 'Atendimento de urgência', 'Procedimento', 'Internação', 'Exame'] }) type: string;
  @Column({ length: 100 }) specialty: string;
  @Column({ name: 'chief_complaint', length: 255 }) chiefComplaint: string;
  @Column({ name: 'present_illness', type: 'text', nullable: true }) presentIllness: string | null;
  @Column({ name: 'clinical_assessment', type: 'text', nullable: true }) clinicalAssessment: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true }) diagnosis: string | null;
  @Column({ name: 'cid10', type: 'varchar', length: 10, nullable: true }) cid10: string | null;
  @Column({ name: 'prescription_text', type: 'text', nullable: true }) prescriptionText: string | null;
  @Column({ name: 'referral_text', type: 'varchar', length: 255, nullable: true }) referralText: string | null;
  @Column({ name: 'clinical_notes', type: 'text', nullable: true }) clinicalNotes: string | null;
  /** Documentos gerados no atendimento (rótulos). */
  @Column({ type: 'json', nullable: true }) documents: string[] | null;
  @Column({ type: 'enum', enum: ['Finalizado', 'Rascunho'], default: 'Finalizado' }) status: string;
  /** Conteúdo bruto do formulário quando salvo como rascunho. */
  @Column({ name: 'draft_data', type: 'json', nullable: true }) draftData: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  @OneToMany(() => AttendanceProcedure, (p) => p.attendance, { cascade: true }) procedures: AttendanceProcedure[];
  @OneToOne(() => AttendanceVitalSigns, (v) => v.attendance, { cascade: true }) vitalSigns: AttendanceVitalSigns | null;
  @OneToMany(() => ExamRequest, (e) => e.attendance) examRequests: ExamRequest[];
}

@Entity('attendance_procedures')
export class AttendanceProcedure extends BaseEntity {
  @ManyToOne(() => Attendance, (a) => a.procedures, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'attendance_id' }) attendance: Attendance;
  @Index() @Column({ name: 'attendance_id' }) attendanceId: string;
  @Column({ length: 200 }) description: string;
}

@Entity('attendance_vital_signs')
export class AttendanceVitalSigns extends BaseEntity {
  @OneToOne(() => Attendance, (a) => a.vitalSigns, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'attendance_id' }) attendance: Attendance;
  @Index({ unique: true }) @Column({ name: 'attendance_id' }) attendanceId: string;
  @Column({ name: 'blood_pressure', type: 'varchar', length: 15, nullable: true }) bloodPressure: string | null;
  @Column({ name: 'heart_rate', type: 'smallint', unsigned: true, nullable: true }) heartRate: number | null;
  @Column({ name: 'respiratory_rate', type: 'smallint', unsigned: true, nullable: true }) respiratoryRate: number | null;
  @Column({ type: 'decimal', precision: 4, scale: 1, nullable: true }) temperature: string | null;
  @Column({ name: 'oxygen_saturation', type: 'tinyint', unsigned: true, nullable: true }) oxygenSaturation: number | null;
  @Column({ name: 'weight_kg', type: 'decimal', precision: 5, scale: 1, nullable: true }) weightKg: string | null;
  @Column({ name: 'capillary_glucose', type: 'smallint', unsigned: true, nullable: true }) capillaryGlucose: number | null;
}

/** Exame do paciente (o que aparece em "Meus exames"). */
@Entity('exams')
@Index(['patientId', 'performedAt'])
@Index(['status'])
export class Exam extends BaseEntity {
  @ManyToOne(() => Patient, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'patient_id' }) patient: Patient;
  @Column({ name: 'patient_id' }) patientId: string;
  @Column({ length: 150 }) name: string;
  @Column({ length: 40, default: 'Laboratorial' }) category: string;
  @Column({ name: 'performed_at', type: 'date' }) performedAt: string;
  @ManyToOne(() => HealthUnit, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'unit_id' }) unit: HealthUnit;
  @Column({ name: 'unit_id' }) unitId: string;
  @ManyToOne(() => Professional, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'requester_id' }) requester: Professional;
  @Column({ name: 'requester_id' }) requesterId: string;
  @Column({ type: 'enum', enum: ['Solicitado', 'Agendado', 'Em análise', 'Resultado disponível', 'Cancelado'], default: 'Solicitado' }) status: string;
  @OneToMany(() => ExamResult, (r) => r.exam, { cascade: true }) results: ExamResult[];
  @Column({ name: 'released_at', type: 'datetime', nullable: true }) releasedAt: Date | null;
  @ManyToOne(() => Professional, { nullable: true, onDelete: 'SET NULL' }) @JoinColumn({ name: 'released_by_id' }) releasedBy: Professional | null;
  @Column({ name: 'released_by_id', type: 'varchar', length: 36, nullable: true }) releasedById: string | null;
}

/** Solicitação de exame (fluxo Solicitado → Agendado → Em andamento → Resultado disponível). */
@Entity('exam_requests')
@Index(['professionalId', 'requestedAt'])
@Index(['status'])
export class ExamRequest extends BaseEntity {
  @ManyToOne(() => Patient, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'patient_id' }) patient: Patient;
  @Index() @Column({ name: 'patient_id' }) patientId: string;
  @ManyToOne(() => Professional, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'professional_id' }) professional: Professional;
  @Column({ name: 'professional_id' }) professionalId: string;
  @ManyToOne(() => HealthUnit, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'unit_id' }) unit: HealthUnit;
  @Column({ name: 'unit_id' }) unitId: string;
  @ManyToOne(() => Attendance, (a) => a.examRequests, { nullable: true, onDelete: 'SET NULL' }) @JoinColumn({ name: 'attendance_id' }) attendance: Attendance | null;
  @Column({ name: 'attendance_id', type: 'varchar', length: 36, nullable: true }) attendanceId: string | null;
  @OneToOne(() => Exam, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'exam_id' }) exam: Exam;
  @Index({ unique: true }) @Column({ name: 'exam_id' }) examId: string;
  @Column({ name: 'exam_name', length: 150 }) examName: string;
  @Column({ type: 'text' }) justification: string;
  @Column({ type: 'enum', enum: ['Rotina', 'Urgente', 'Emergência'], default: 'Rotina' }) priority: string;
  @Column({ type: 'enum', enum: ['Solicitado', 'Agendado', 'Em andamento', 'Resultado disponível', 'Cancelado'], default: 'Solicitado' }) status: string;
  @Column({ name: 'requested_at', type: 'datetime' }) requestedAt: Date;
}

/** Linha de resultado (parâmetro, valor, referência, alterado). */
@Entity('exam_results')
export class ExamResult extends BaseEntity {
  @ManyToOne(() => Exam, (e) => e.results, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'exam_id' }) exam: Exam;
  @Index() @Column({ name: 'exam_id' }) examId: string;
  @Column({ type: 'smallint', default: 0 }) position: number;
  @Column({ length: 120 }) parameter: string;
  @Column({ length: 500 }) value: string;
  @Column({ name: 'reference_range', length: 120, default: '—' }) referenceRange: string;
  @Column({ name: 'is_abnormal', default: false }) isAbnormal: boolean;
}

/** Prescrição (cabeçalho). */
@Entity('prescriptions')
@Index(['patientId', 'prescribedAt'])
export class Prescription extends BaseEntity {
  @ManyToOne(() => Patient, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'patient_id' }) patient: Patient;
  @Column({ name: 'patient_id' }) patientId: string;
  @ManyToOne(() => Professional, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'professional_id' }) professional: Professional;
  @Index() @Column({ name: 'professional_id' }) professionalId: string;
  @ManyToOne(() => HealthUnit, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'unit_id' }) unit: HealthUnit;
  @Column({ name: 'unit_id' }) unitId: string;
  @ManyToOne(() => Attendance, { nullable: true, onDelete: 'SET NULL' }) @JoinColumn({ name: 'attendance_id' }) attendance: Attendance | null;
  @Column({ name: 'attendance_id', type: 'varchar', length: 36, nullable: true }) attendanceId: string | null;
  @Column({ name: 'prescribed_at', type: 'date' }) prescribedAt: string;
  @OneToMany(() => PrescriptionMedication, (m) => m.prescription, { cascade: true }) medications: PrescriptionMedication[];
}

/** Medicamento prescrito. */
@Entity('prescription_medications')
@Index(['status'])
export class PrescriptionMedication extends BaseEntity {
  @ManyToOne(() => Prescription, (p) => p.medications, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'prescription_id' }) prescription: Prescription;
  @Index() @Column({ name: 'prescription_id' }) prescriptionId: string;
  @Column({ length: 150 }) medication: string;
  @Column({ length: 120 }) dosage: string;
  @Column({ length: 120 }) frequency: string;
  @Column({ length: 60 }) duration: string;
  @Column({ type: 'text', nullable: true }) instructions: string | null;
  @Column({ type: 'enum', enum: ['Em uso', 'Uso contínuo', 'Concluído'], default: 'Em uso' }) status: string;
}

/** Encaminhamento entre unidades. */
@Entity('referrals')
@Index(['patientId', 'referredAt'])
@Index(['destinationUnitId', 'status'])
export class Referral extends BaseEntity {
  @ManyToOne(() => Patient, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'patient_id' }) patient: Patient;
  @Column({ name: 'patient_id' }) patientId: string;
  @ManyToOne(() => Professional, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'professional_id' }) professional: Professional;
  @Column({ name: 'professional_id' }) professionalId: string;
  @ManyToOne(() => HealthUnit, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'origin_unit_id' }) originUnit: HealthUnit;
  @Column({ name: 'origin_unit_id' }) originUnitId: string;
  @ManyToOne(() => HealthUnit, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'destination_unit_id' }) destinationUnit: HealthUnit;
  @Column({ name: 'destination_unit_id' }) destinationUnitId: string;
  @Column({ length: 100 }) specialty: string;
  @Column({ type: 'text' }) reason: string;
  @Column({ type: 'enum', enum: ['Rotina', 'Urgente', 'Emergência'], default: 'Rotina' }) priority: string;
  @Column({ type: 'enum', enum: ['Pendente', 'Agendado', 'Realizado', 'Cancelado'], default: 'Pendente' }) status: string;
  @Column({ name: 'referred_at', type: 'date' }) referredAt: string;
}
