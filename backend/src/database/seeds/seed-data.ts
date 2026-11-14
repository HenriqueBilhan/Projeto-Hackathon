/**
 * Dados necessários ao funcionamento inicial (NÃO são dados fictícios de pacientes):
 * papéis, permissões RBAC, matriz de acesso clínico, configurações e catálogo de especialidades.
 */
export const PERMISSIONS: Record<string, string> = {
  'self:read': 'Consultar o próprio perfil e prontuário',
  'self:update': 'Atualizar os próprios dados de contato e preferências',
  'appointments:self': 'Solicitar e cancelar as próprias consultas',
  'notifications:read': 'Consultar notificações',
  'patients:read': 'Localizar e identificar pacientes',
  'patients:create': 'Cadastrar pacientes',
  'patients:update': 'Atualizar dados de pacientes',
  'patients:delete': 'Excluir cadastro de paciente',
  'clinical:read': 'Consultar prontuários (sujeito à autorização por paciente)',
  'clinical:write': 'Registrar informações clínicas (sujeito à matriz de acesso)',
  'professionals:read': 'Consultar profissionais',
  'professionals:manage': 'Gerenciar profissionais',
  'units:read': 'Consultar unidades de saúde',
  'units:manage': 'Gerenciar unidades de saúde',
  'users:manage': 'Gerenciar usuários e permissões',
  'reports:read': 'Consultar indicadores e relatórios',
  'audit:read': 'Consultar trilha de auditoria',
  'settings:manage': 'Gerenciar configurações da plataforma',
  'integrations:read': 'Consultar dados públicos integrados',
  'integrations:manage': 'Executar e gerenciar sincronizações',
};

export const ROLES: Record<string, { name: string; permissions: string[] }> = {
  paciente: { name: 'Paciente', permissions: ['self:read', 'self:update', 'appointments:self', 'notifications:read', 'professionals:read', 'units:read'] },
  profissional: {
    name: 'Profissional de saúde',
    permissions: ['patients:read', 'patients:create', 'patients:update', 'clinical:read', 'clinical:write', 'professionals:read', 'units:read', 'notifications:read', 'integrations:read'],
  },
  // O administrador NÃO recebe clinical:* — não acessa conteúdo clínico.
  admin: {
    name: 'Administrador / Gestor',
    permissions: ['patients:read', 'patients:delete', 'professionals:read', 'professionals:manage', 'units:read', 'units:manage', 'users:manage', 'reports:read', 'audit:read', 'settings:manage', 'integrations:read', 'integrations:manage', 'notifications:read'],
  },
};

/** Matriz de acesso clínico padrão por perfil profissional (editável em Segurança › Controle de acesso). */
export const ACCESS_MATRIX: Record<string, Record<string, boolean>> = {
  'Médico': { ver_prontuario: true, registrar: true, prescrever: true, exames: true, laudos: true, dados_cadastrais: true, gestao: false },
  'Enfermeiro': { ver_prontuario: true, registrar: true, prescrever: false, exames: false, laudos: false, dados_cadastrais: true, gestao: false },
  'Técnico de laboratório': { ver_prontuario: false, registrar: false, prescrever: false, exames: false, laudos: true, dados_cadastrais: false, gestao: false },
  'Recepção': { ver_prontuario: false, registrar: false, prescrever: false, exames: false, laudos: false, dados_cadastrais: true, gestao: false },
  'Administrador': { ver_prontuario: false, registrar: false, prescrever: false, exames: false, laudos: false, dados_cadastrais: false, gestao: true },
};

export const DEFAULT_SETTINGS: Record<string, unknown> = {
  compartilharEntreUnidades: true,
  consentimentoPaciente: true,
  exigirJustificativaEmergencia: true,
  notificarPacienteAcesso: true,
  mascararDocumentos: true,
  bloquearExportacao: false,
  expirarSessao: 30,
};

export const SPECIALTIES = [
  'Clínica Médica', 'Medicina de Emergência', 'Medicina de Família', 'Cardiologia', 'Endocrinologia', 'Pediatria',
  'Ginecologia e Obstetrícia', 'Ortopedia', 'Neurologia', 'Cirurgia Geral', 'Patologia Clínica', 'Radiologia',
  'Pneumologia', 'Enfermagem', 'Psicologia', 'Nutrição', 'Farmácia', 'Análises Clínicas', 'Recepção',
];
