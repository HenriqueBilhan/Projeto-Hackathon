export * from './users.entities';
export * from './patients.entities';
export * from './professionals.entities';
export * from './health-units.entities';
export * from './clinical.entities';
export * from './system.entities';
export * from './external.entities';
export * from './sync.entities';
import { Permission, Role, User, UserSession } from './users.entities';
import { Patient, PatientAllergy, PatientChronicCondition, PatientHospitalization } from './patients.entities';
import { Professional, ProfessionalSpecialty } from './professionals.entities';
import { HealthUnit, HealthUnitIntegration } from './health-units.entities';
import { Appointment, Attendance, AttendanceProcedure, AttendanceVitalSigns, Exam, ExamRequest, ExamResult, Prescription, PrescriptionMedication, Referral } from './clinical.entities';
import { AccessPermission, AuditLog, Notification, SystemSetting } from './system.entities';
import { ExternalCnesProfessional, ExternalDataset, ExternalEstablishment, ExternalHospitalBeds, ExternalMunicipality, ExternalUnitType } from './external.entities';
import { Synchronization, SynchronizationLog } from './sync.entities';

/** Todas as entidades registradas no TypeORM. */
export const ENTITIES = [
  Permission, Role, User, UserSession,
  Patient, PatientAllergy, PatientChronicCondition, PatientHospitalization,
  Professional, ProfessionalSpecialty, HealthUnit, HealthUnitIntegration,
  Appointment, Attendance, AttendanceProcedure, AttendanceVitalSigns, Exam, ExamRequest, ExamResult,
  Prescription, PrescriptionMedication, Referral,
  Notification, AuditLog, AccessPermission, SystemSetting,
  ExternalUnitType, ExternalMunicipality, ExternalEstablishment, ExternalCnesProfessional, ExternalHospitalBeds, ExternalDataset,
  Synchronization, SynchronizationLog,
];
