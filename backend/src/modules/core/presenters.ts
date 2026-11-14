/**
 * Apresentadores: convertem entidades no formato de dados que o frontend do Conecta
 * já utiliza (mesmos nomes de campos do antigo Conecta.Data), evitando reescrever as páginas.
 * CPF/CNS saem mascarados, salvo quando `reveal` é autorizado.
 */
import { maskCns, maskCpf } from '../../common/utils/documents';
import { instant, wallClock, wallDate } from '../../common/utils/dates';
import type {
  Appointment, Attendance, AuditLog, Exam, ExamRequest, HealthUnit, Notification, Patient, Prescription, PrescriptionMedication, Professional, Referral,
} from '../../database/entities';

export const unitDto = (u: HealthUnit, extra: { volume?: number } = {}) => ({
  id: u.id, nome: u.name, tipo: u.category, cnes: u.cnes, endereco: u.address, telefone: u.phone || '—', responsavel: u.technicalManager || '—',
  horario: u.openingHours || '—', codigoMunicipio: u.codigoMunicipio, ativa: u.active,
  integrada: !!u.integration?.sharingEnabled, status: u.integration?.sharingEnabled ? 'Integrada' : 'Em integração',
  desde: u.integration?.integratedSince || '', volume: extra.volume ?? 0,
});

export const professionalDto = (p: Professional, full = false) => ({
  id: p.id, nome: p.name, cargo: p.cargo, registro: p.registration, especialidade: p.specialty?.name ?? '', unidadeId: p.unitId, ativo: p.active,
  ...(full ? { cpf: maskCpf(p.cpf), email: p.email, telefone: p.phone || '', cadastro: wallDate(p.createdAt) } : {}),
});

export type PatientView = 'self' | 'clinical' | 'cadastral';
/** self/clinical: inclui resumo clínico; cadastral: somente identificação (gestor). */
export const patientDto = (p: Patient, view: PatientView, reveal = false) => {
  const base = {
    id: p.id, nome: p.name, nascimento: p.birthDate, sexo: p.sex,
    cpf: reveal ? p.cpf : maskCpf(p.cpf), cns: reveal ? p.cns : maskCns(p.cns),
    unidadeRef: p.referenceUnitId, cadastro: wallDate(p.createdAt), telefone: p.phone || '',
  };
  if (view === 'cadastral') return base;
  return {
    ...base,
    email: p.email || '', endereco: p.address || 'Não informado', nomeMae: p.motherName || '—', contatoEmergencia: p.emergencyContact || '',
    tipoSanguineo: p.bloodType,
    alergias: (p.allergies || []).map((a) => ({ id: a.id, nome: a.substance, gravidade: a.severity, reacao: a.reaction || '' })),
    cronicas: (p.chronicConditions || []).map((c) => c.description),
    internacoes: (p.hospitalizations || []).sort((a, b) => b.admissionDate.localeCompare(a.admissionDate)).map((h) => ({ id: h.id, entrada: h.admissionDate, alta: h.dischargeDate, unidadeId: h.unitId, motivo: h.reason })),
    ...(view === 'self' ? { preferencias: { notificarAcesso: p.notifyOnAccess, compartilhar: p.shareConsent } } : {}),
  };
};

const fmtNum = (v: string | number | null | undefined, unit: string) => (v === null || v === undefined || v === '' ? '' : `${String(v).replace('.', ',')}${unit}`);
export const attendanceDto = (a: Attendance) => ({
  id: a.id, pacienteId: a.patientId, unidadeId: a.unitId, profissionalId: a.professionalId, data: wallClock(a.occurredAt), tipo: a.type,
  especialidade: a.specialty, motivo: a.chiefComplaint, hda: a.presentIllness || '', avaliacao: a.clinicalAssessment || '',
  diagnostico: a.diagnosis || '', cid: a.cid10 || '',
  sinais: a.vitalSigns ? {
    pa: a.vitalSigns.bloodPressure ? `${a.vitalSigns.bloodPressure} mmHg` : '', fc: fmtNum(a.vitalSigns.heartRate, ' bpm'), temp: fmtNum(a.vitalSigns.temperature, ' °C'),
    spo2: fmtNum(a.vitalSigns.oxygenSaturation, '%'), fr: fmtNum(a.vitalSigns.respiratoryRate, ' irpm'), peso: fmtNum(a.vitalSigns.weightKg, ' kg'), glicemia: fmtNum(a.vitalSigns.capillaryGlucose, ' mg/dL'),
  } : null,
  procedimentos: (a.procedures || []).map((p) => p.description), exames: (a.examRequests || []).map((e) => e.examName),
  prescricao: a.prescriptionText || '', encaminhamento: a.referralText || '', observacoes: a.clinicalNotes || '', documentos: a.documents || [],
  status: a.status, consultaId: a.appointmentId, criadoEm: instant(a.createdAt),
  ...(a.status === 'Rascunho' ? { dados: a.draftData || {} } : {}),
});

export const examDto = (e: Exam) => ({
  id: e.id, pacienteId: e.patientId, nome: e.name, data: e.performedAt, unidadeId: e.unitId, solicitanteId: e.requesterId, status: e.status, categoria: e.category,
  resultado: e.status === 'Resultado disponível' && e.results?.length ? e.results.sort((a, b) => a.position - b.position).map((r) => [r.parameter, r.value, r.referenceRange, r.isAbnormal]) : null,
  liberadoEm: instant(e.releasedAt),
});

export const examRequestDto = (r: ExamRequest) => ({
  id: r.id, pacienteId: r.patientId, exame: r.examName, justificativa: r.justification, prioridade: r.priority, unidadeId: r.unitId,
  profissionalId: r.professionalId, data: wallClock(r.requestedAt), status: r.status, exameId: r.examId, atendimentoId: r.attendanceId,
});

export const appointmentDto = (c: Appointment) => ({
  id: c.id, pacienteId: c.patientId, data: wallClock(c.scheduledAt), unidadeId: c.unitId, profissionalId: c.professionalId, especialidade: c.specialty, status: c.status, tipo: c.type, observacao: c.notes || '',
});

/** Cada medicamento prescrito é um item (formato "receita" do frontend). */
export const prescriptionItemDto = (m: PrescriptionMedication, h: Prescription) => ({
  id: m.id, prescricaoId: h.id, pacienteId: h.patientId, profissionalId: h.professionalId, unidadeId: h.unitId, data: h.prescribedAt,
  medicamento: m.medication, dosagem: m.dosage, frequencia: m.frequency, duracao: m.duration, orientacoes: m.instructions || '', status: m.status,
});

export const referralDto = (r: Referral) => ({
  id: r.id, pacienteId: r.patientId, profissionalId: r.professionalId, origemId: r.originUnitId, destinoId: r.destinationUnitId, especialidade: r.specialty,
  data: r.referredAt, motivo: r.reason, prioridade: r.priority, status: r.status,
});

export const notificationDto = (n: Notification) => ({ id: n.id, titulo: n.title, texto: n.message, icone: n.icon, link: n.link, data: instant(n.createdAt), lida: !!n.readAt });

export const auditDto = (l: AuditLog, patient?: { name: string; cpf: string } | null, includeIp = true) => ({
  id: l.id, data: instant(l.occurredAt), usuario: l.userName, perfil: l.userRole, pacienteId: l.patientId,
  pacienteNome: patient ? patient.name : null, pacienteCpf: patient ? maskCpf(patient.cpf) : null,
  unidadeId: l.unitId, operacao: l.operation, detalhe: l.detail || '', sucesso: l.success, ...(includeIp ? { ip: l.ip } : {}),
});
