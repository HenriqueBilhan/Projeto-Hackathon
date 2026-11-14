/** Usuário autenticado anexado à requisição pelo JwtAuthGuard. */
export interface AuthUser {
  userId: string;
  role: 'paciente' | 'profissional' | 'admin';
  permissions: string[];
  name: string;
  patientId: string | null;
  professionalId: string | null;
  /** Unidade de atuação (profissionais). */
  unitId: string | null;
  /** Cargo do profissional (usado na matriz de acesso clínico). */
  cargo: string | null;
  sessionId: string;
  ip: string;
}
export const ROLE_CODES = { PACIENTE: 'paciente', PROFISSIONAL: 'profissional', ADMIN: 'admin' } as const;
