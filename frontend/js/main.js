/* ==========================================================================
   CONECTA — Núcleo da aplicação (main.js)
   --------------------------------------------------------------------------
   Carregado em TODAS as páginas. Responsável por:
     1. Camada de dados (ConectaData) — simula um backend usando LocalStorage.
     2. Dados fictícios iniciais (seed) para demonstração.
     3. Sessão/autenticação demonstrativa e proteção de rotas por perfil.
     4. Utilitários (máscaras, datas, escape de HTML, badges).
     5. Componentes de interface (toast, modal, confirmação, tabelas).
     6. Estrutura comum dos painéis (menu lateral, cabeçalho, notificações).
     7. Registro de auditoria (LGPD).

   IMPORTANTE: todos os dados são FICTÍCIOS. Nenhum dado real de saúde deve ser
   armazenado no LocalStorage. A integração com o SUS é apenas simulada.

   PONTO DE INTEGRAÇÃO COM BACKEND: as funções de ConectaData (getAll, getById,
   add, update, remove) concentram todo acesso a dados. Para conectar uma API
   real, basta substituí-las por chamadas fetch() (ex.: GET /api/pacientes).
   ========================================================================== */
(function () {
  "use strict";

  const PREFIXO = "conecta:v1:";
  const VERSAO_DADOS = 3;

  /* ------------------------------------------------------------------------
     1. Armazenamento (envoltório seguro do LocalStorage)
     ------------------------------------------------------------------------ */
  const Store = {
    get(chave, padrao) {
      try {
        const v = localStorage.getItem(PREFIXO + chave);
        return v === null ? padrao : JSON.parse(v);
      } catch (e) { return padrao; }
    },
    set(chave, valor) {
      try { localStorage.setItem(PREFIXO + chave, JSON.stringify(valor)); } catch (e) { /* armazenamento indisponível */ }
    },
    remove(chave) {
      try { localStorage.removeItem(PREFIXO + chave); } catch (e) { /* ignora */ }
    },
    limparTudo() {
      try {
        Object.keys(localStorage).filter((k) => k.startsWith(PREFIXO)).forEach((k) => localStorage.removeItem(k));
      } catch (e) { /* ignora */ }
    }
  };

  /* ------------------------------------------------------------------------
     2. Utilitários gerais
     ------------------------------------------------------------------------ */
  const pad = (n) => String(n).padStart(2, "0");
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

  /** Gera os dígitos verificadores de um CPF a partir dos 9 primeiros dígitos. */
  function cpfCompleto(base9) {
    const d = base9.split("").map(Number);
    const calc = (arr, peso) => {
      const soma = arr.reduce((s, n, i) => s + n * (peso - i), 0);
      const r = (soma * 10) % 11;
      return r === 10 ? 0 : r;
    };
    const d1 = calc(d, 10);
    const d2 = calc(d.concat(d1), 11);
    return base9 + d1 + d2;
  }

  /** Valida CPF (dígitos verificadores). */
  function validarCPF(cpf) {
    const s = String(cpf).replace(/\D/g, "");
    if (s.length !== 11 || /^(\d)\1+$/.test(s)) return false;
    return cpfCompleto(s.slice(0, 9)) === s;
  }

  const somenteDigitos = (v) => String(v || "").replace(/\D/g, "");
  const formatarCPF = (v) => {
    const s = somenteDigitos(v).slice(0, 11);
    return s.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  };
  /** Máscara de privacidade: exibe apenas parte do CPF (LGPD). */
  const mascararCPF = (v) => {
    const s = somenteDigitos(v);
    if (s.length !== 11) return "***.***.***-**";
    return `***.${s.slice(3, 6)}.***-${s.slice(9)}`;
  };
  const formatarCNS = (v) => somenteDigitos(v).replace(/(\d{3})(\d{4})(\d{4})(\d{4})/, "$1 $2 $3 $4");
  const mascararCNS = (v) => {
    const s = somenteDigitos(v);
    if (s.length !== 15) return "*** **** **** ****";
    return `${s.slice(0, 3)} **** **** ${s.slice(11)}`;
  };

  function parseData(iso) {
    if (!iso) return null;
    // Datas sem horário são tratadas no fuso local.
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) { const [a, m, d] = iso.split("-").map(Number); return new Date(a, m - 1, d); }
    return new Date(iso);
  }
  const fmtData = (iso) => { const d = parseData(iso); return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : "—"; };
  const fmtHora = (iso) => { const d = parseData(iso); return d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : ""; };
  const fmtDataHora = (iso) => (iso ? `${fmtData(iso)} às ${fmtHora(iso)}` : "—");
  const diaMes = (iso) => { const d = parseData(iso); return { dia: pad(d.getDate()), mes: MESES[d.getMonth()] }; };
  const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const agoraISO = () => { const d = new Date(); return `${hojeISO()}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const mesmoDia = (iso, dia) => String(iso || "").slice(0, 10) === dia;
  function calcIdade(nasc) {
    const n = parseData(nasc); const h = new Date();
    let idade = h.getFullYear() - n.getFullYear();
    const m = h.getMonth() - n.getMonth();
    if (m < 0 || (m === 0 && h.getDate() < n.getDate())) idade--;
    return idade;
  }
  function tempoRelativo(iso) {
    const d = parseData(iso); if (!d) return "";
    const diff = (Date.now() - d.getTime()) / 60000;
    if (diff < 1) return "agora mesmo";
    if (diff < 60) return `há ${Math.round(diff)} min`;
    if (diff < 1440) return `há ${Math.round(diff / 60)} h`;
    if (diff < 2880) return "ontem";
    if (diff < 43200) return `há ${Math.round(diff / 1440)} dias`;
    return fmtData(iso);
  }
  const iniciais = (nome) => String(nome || "?").replace(/^(Dra?\.|Enf\.)\s*/, "").split(/\s+/).filter(Boolean).map((p) => p[0]).filter((c, i, a) => i === 0 || i === a.length - 1).join("").toUpperCase();
  const primeiroNome = (nome) => String(nome || "").replace(/^(Dra?\.|Enf\.)\s*/, "").split(" ")[0];
  const novoId = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const qs = (sel, raiz = document) => raiz.querySelector(sel);
  const qsa = (sel, raiz = document) => Array.from(raiz.querySelectorAll(sel));
  const param = (nome) => new URLSearchParams(location.search).get(nome);

  /** Escapa HTML para evitar injeção de conteúdo ao renderizar dados. */
  function esc(v) {
    return String(v === undefined || v === null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  const ico = (nome, extra = "") => `<i data-lucide="${nome}" aria-hidden="true" ${extra}></i>`;

  /** Badge de status com cor semântica. */
  const MAPA_STATUS = {
    sucesso: ["Resultado disponível", "Realizada", "Realizado", "Finalizado", "Ativo", "Ativa", "Integrada", "Confirmada", "Liberado", "Permitido", "Autorizado"],
    info: ["Agendada", "Agendado", "Em uso", "Em andamento", "Solicitado", "Uso contínuo", "Rotina"],
    alerta: ["Em análise", "Pendente", "Rascunho", "Coletado", "Urgente", "Em integração", "Moderada"],
    perigo: ["Cancelada", "Cancelado", "Inativo", "Emergência", "Faltou", "Desativado", "Negado", "Grave"]
  };
  function badge(status) {
    let tipo = "neutro";
    Object.keys(MAPA_STATUS).forEach((k) => { if (MAPA_STATUS[k].includes(status)) tipo = k; });
    return `<span class="badge badge-${tipo}">${esc(status)}</span>`;
  }
  const tipoTag = (tipo) => `<span class="tipo-tag tipo-${esc(tipo)}">${esc(tipo)}</span>`;
  const ICONE_TIPO = { UPA: "siren", UBS: "house-plus", Hospital: "hospital", "Laboratório": "flask-conical", "Clínica": "stethoscope" };

  /* ------------------------------------------------------------------------
     3. Dados fictícios iniciais
     ------------------------------------------------------------------------ */
  /** Modelos de resultado de exames (valores fictícios para demonstração). */
  const MODELOS_RESULTADO = {
    "Hemograma completo": [
      ["Hemácias", "4,52 milhões/mm³", "4,0 – 5,4"], ["Hemoglobina", "13,1 g/dL", "12,0 – 16,0"], ["Hematócrito", "39,8 %", "36 – 46"],
      ["Leucócitos", "7.850 /mm³", "4.000 – 11.000"], ["Plaquetas", "248.000 /mm³", "150.000 – 450.000"]
    ],
    "Glicemia em jejum": [["Glicose", "132 mg/dL", "70 – 99", true]],
    "Hemoglobina glicada (HbA1c)": [["HbA1c", "7,2 %", "< 5,7", true], ["Glicose média estimada", "160 mg/dL", "—"]],
    "Urina tipo I (EAS)": [["Aspecto", "Turvo", "Límpido", true], ["Leucócitos", "45 /campo", "até 5", true], ["Nitrito", "Positivo", "Negativo", true], ["Hemácias", "6 /campo", "até 3", true]],
    "Urocultura com antibiograma": [["Resultado", "Escherichia coli > 100.000 UFC/mL", "Negativo", true], ["Sensível a", "Nitrofurantoína, Fosfomicina", "—"]],
    "Perfil lipídico": [["Colesterol total", "212 mg/dL", "< 190", true], ["HDL", "46 mg/dL", "> 40"], ["LDL", "134 mg/dL", "< 130", true], ["Triglicerídeos", "160 mg/dL", "< 150", true]],
    "Creatinina": [["Creatinina", "0,9 mg/dL", "0,6 – 1,1"]],
    "TSH": [["TSH", "3,1 µUI/mL", "0,4 – 4,0"]],
    "Ultrassonografia de abdome": [["Laudo", "Apêndice cecal espessado (9 mm) com densificação da gordura adjacente, compatível com apendicite aguda.", "—", true]],
    "Eletrocardiograma": [["Ritmo", "Sinusal", "Sinusal"], ["Frequência", "78 bpm", "60 – 100"], ["Conclusão", "ECG dentro dos limites da normalidade", "—"]],
    "Raio-X de tórax": [["Laudo", "Campos pulmonares sem consolidações. Área cardíaca normal.", "—"]],
    "Espirometria": [["VEF1/CVF", "0,64", "> 0,70", true], ["Conclusão", "Distúrbio ventilatório obstrutivo moderado", "—", true]]
  };
  const TIPOS_EXAME = Object.keys(MODELOS_RESULTADO).concat(["Ácido úrico", "Vitamina D", "Tomografia de crânio", "Mamografia", "PSA total"]);
  const ESPECIALIDADES = ["Clínica Médica", "Medicina de Emergência", "Medicina de Família", "Cardiologia", "Endocrinologia", "Pediatria", "Ginecologia e Obstetrícia", "Ortopedia", "Neurologia", "Cirurgia Geral", "Patologia Clínica", "Radiologia", "Enfermagem", "Psicologia", "Nutrição"];

  function gerarDadosIniciais() {
    const hoje = hojeISO();

    const unidades = [
      { id: "u1", nome: "UPA Central", tipo: "UPA", cnes: "7012345", endereco: "Av. Brasil, 1500 — Centro", telefone: "(11) 3200-1100", responsavel: "Dra. Juliana Martins", horario: "24 horas", integrada: true, status: "Integrada", desde: "2025-03-10", volume: 1840 },
      { id: "u2", nome: "UBS Jardim das Flores", tipo: "UBS", cnes: "7023456", endereco: "Rua das Margaridas, 320 — Jardim das Flores", telefone: "(11) 3200-2200", responsavel: "Dr. Ricardo Almeida", horario: "07h às 19h", integrada: true, status: "Integrada", desde: "2025-04-02", volume: 1210 },
      { id: "u3", nome: "Laboratório Municipal de Análises Clínicas", tipo: "Laboratório", cnes: "7034567", endereco: "Rua Saúde, 88 — Centro", telefone: "(11) 3200-3300", responsavel: "Dr. Fernando Costa", horario: "06h às 18h", integrada: true, status: "Integrada", desde: "2025-03-10", volume: 2650 },
      { id: "u4", nome: "Hospital Municipal São Lucas", tipo: "Hospital", cnes: "7045678", endereco: "Av. das Nações, 2000 — Vila Esperança", telefone: "(11) 3200-4400", responsavel: "Dra. Camila Rocha", horario: "24 horas", integrada: true, status: "Integrada", desde: "2025-05-15", volume: 1530 },
      { id: "u5", nome: "UBS Vila Nova", tipo: "UBS", cnes: "7056789", endereco: "Rua Esperança, 45 — Vila Nova", telefone: "(11) 3200-5500", responsavel: "Dra. Beatriz Santos", horario: "07h às 17h", integrada: true, status: "Integrada", desde: "2025-06-01", volume: 980 },
      { id: "u6", nome: "UPA Zona Norte", tipo: "UPA", cnes: "7067890", endereco: "Av. Norte, 900 — Parque Norte", telefone: "(11) 3200-6600", responsavel: "Dr. Lucas Ribeiro", horario: "24 horas", integrada: true, status: "Integrada", desde: "2025-07-20", volume: 1620 },
      { id: "u7", nome: "Hospital Regional Santa Clara", tipo: "Hospital", cnes: "7078901", endereco: "Rod. Estadual, km 12 — Distrito Industrial", telefone: "(11) 3200-7700", responsavel: "Dr. Marcos Pereira", horario: "24 horas", integrada: true, status: "Integrada", desde: "2025-08-05", volume: 1390 },
      { id: "u8", nome: "Centro de Especialidades Médicas", tipo: "Clínica", cnes: "7089012", endereco: "Rua dos Especialistas, 150 — Centro", telefone: "(11) 3200-8800", responsavel: "Dr. André Nogueira", horario: "07h às 19h", integrada: true, status: "Integrada", desde: "2025-09-12", volume: 760 },
      { id: "u9", nome: "Laboratório Regional Norte", tipo: "Laboratório", cnes: "7090123", endereco: "Av. Norte, 1200 — Parque Norte", telefone: "(11) 3200-9900", responsavel: "Dra. Sônia Prado", horario: "06h às 16h", integrada: false, status: "Em integração", desde: "", volume: 540 },
      { id: "u10", nome: "UBS Centro", tipo: "UBS", cnes: "7101234", endereco: "Praça da Matriz, 10 — Centro", telefone: "(11) 3201-1000", responsavel: "Enf. Patrícia Lima", horario: "07h às 19h", integrada: true, status: "Integrada", desde: "2025-04-18", volume: 1100 }
    ];

    const P = (id, nome, cargo, registro, especialidade, unidadeId, base9, ativo = true) => ({
      id, nome, cargo, registro, especialidade, unidadeId, cpf: cpfCompleto(base9), ativo,
      email: `${primeiroNome(nome).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}.${id}@conecta.demo`,
      telefone: `(11) 9${base9.slice(1, 5)}-${base9.slice(5, 9)}`, cadastro: "2025-04-01"
    });
    const profissionais = [
      P("pr1", "Dr. Ricardo Almeida", "Médico", "CRM-SP 123456", "Clínica Médica", "u2", "111444777"),
      P("pr2", "Dra. Juliana Martins", "Médico", "CRM-SP 234567", "Medicina de Emergência", "u1", "222333444"),
      P("pr3", "Dr. Fernando Costa", "Médico", "CRM-SP 345678", "Patologia Clínica", "u3", "333222111"),
      P("pr4", "Dra. Camila Rocha", "Médico", "CRM-SP 456789", "Cirurgia Geral", "u4", "444555666"),
      P("pr5", "Enf. Patrícia Lima", "Enfermeiro", "COREN-SP 567890", "Enfermagem", "u2", "555666777"),
      P("pr6", "Dr. André Nogueira", "Médico", "CRM-SP 678901", "Cardiologia", "u8", "666777888"),
      P("pr7", "Dra. Beatriz Santos", "Médico", "CRM-SP 789012", "Pediatria", "u5", "777888999"),
      P("pr8", "Dr. Marcos Pereira", "Médico", "CRM-SP 890123", "Ortopedia", "u7", "888999000", false),
      P("pr9", "Dra. Helena Duarte", "Médico", "CRM-SP 901234", "Endocrinologia", "u8", "999000111"),
      P("pr10", "Dr. Lucas Ribeiro", "Médico", "CRM-SP 112233", "Clínica Médica", "u6", "121212343")
    ];
    profissionais[0].pacientesBase = 1278;

    const PAC = (id, nome, sexo, nascimento, base9, cns, extra) => Object.assign({
      id, nome, sexo, nascimento, cpf: cpfCompleto(base9), cns, tipoSanguineo: "A+", alergias: [], cronicas: [], internacoes: [],
      telefone: `(11) 9${base9.slice(0, 4)}-${base9.slice(4, 8)}`,
      email: `${primeiroNome(nome).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}.${id}@exemplo.com`,
      endereco: "Endereço fictício — Município Demonstração", unidadeRef: "u2", nomeMae: "—", cadastro: "2025-05-10"
    }, extra);

    const pacientes = [
      PAC("p1", "Maria Aparecida Souza", "Feminino", "1978-03-22", "123456789", "898001234567890", {
        tipoSanguineo: "O+", telefone: "(11) 98765-4321", email: "maria.souza@exemplo.com",
        endereco: "Rua das Acácias, 245 — Jardim das Flores — CEP 00000-000", unidadeRef: "u2", nomeMae: "Josefa de Souza",
        alergias: [{ nome: "Dipirona", gravidade: "Grave", reacao: "Urticária e edema de face" }, { nome: "Frutos do mar", gravidade: "Moderada", reacao: "Prurido generalizado" }],
        cronicas: ["Hipertensão arterial sistêmica (CID I10)", "Diabetes mellitus tipo 2 (CID E11)"],
        internacoes: [
          { entrada: "2026-10-15", alta: "2026-10-18", unidadeId: "u4", motivo: "Apendicite aguda — apendicectomia videolaparoscópica" },
          { entrada: "2019-06-03", alta: "2019-06-08", unidadeId: "u7", motivo: "Pneumonia adquirida na comunidade" }
        ],
        contatoEmergencia: "José Souza (esposo) — (11) 97654-3210", cadastro: "2025-04-15"
      }),
      PAC("p2", "João Carlos Oliveira", "Masculino", "1965-08-11", "234567891", "700501234567812", { unidadeRef: "u5", tipoSanguineo: "B+", alergias: [{ nome: "Penicilina", gravidade: "Grave", reacao: "Anafilaxia" }], cronicas: ["DPOC (CID J44)", "Tabagismo"], nomeMae: "Rosa Oliveira" }),
      PAC("p3", "Ana Beatriz Lima", "Feminino", "1992-01-30", "345678912", "706009876543210", { unidadeRef: "u2", cronicas: ["Asma (CID J45)"], nomeMae: "Lúcia Lima" }),
      PAC("p4", "Pedro Henrique Santos", "Masculino", "2015-05-09", "456789123", "702304567891234", { unidadeRef: "u5", tipoSanguineo: "O-", nomeMae: "Carla Santos" }),
      PAC("p5", "Francisca das Chagas Silva", "Feminino", "1950-12-02", "567891234", "704105678912345", { unidadeRef: "u10", tipoSanguineo: "A-", cronicas: ["Hipertensão arterial (CID I10)", "Insuficiência cardíaca (CID I50)", "Osteoporose (CID M81)"], alergias: [{ nome: "AAS", gravidade: "Moderada", reacao: "Broncoespasmo" }], internacoes: [{ entrada: "2026-08-02", alta: "2026-08-09", unidadeId: "u7", motivo: "Insuficiência cardíaca descompensada" }] }),
      PAC("p6", "Lucas Gabriel Ferreira", "Masculino", "2001-09-17", "678912345", "703206789123456", { unidadeRef: "u6" }),
      PAC("p7", "Juliana Costa Mendes", "Feminino", "1988-04-25", "789123456", "705307891234567", { unidadeRef: "u2", tipoSanguineo: "AB+", cronicas: ["Hipotireoidismo (CID E03)"] }),
      PAC("p8", "Antônio José Pereira", "Masculino", "1972-07-07", "891234567", "706408912345678", { unidadeRef: "u10", tipoSanguineo: "O+", cronicas: ["Diabetes mellitus tipo 2 (CID E11)"], alergias: [{ nome: "Sulfa", gravidade: "Moderada", reacao: "Exantema" }] }),
      PAC("p9", "Rafaela Nunes Barbosa", "Feminino", "1996-11-13", "912345678", "707509123456789", { unidadeRef: "u5" })
    ];

    /* Atendimentos (registros clínicos) — formam a linha do tempo integrada */
    const sv = (pa, fc, temp, spo2, fr, peso, glic) => ({ pa, fc, temp, spo2, fr, peso, glicemia: glic });
    const A = (id, pacienteId, unidadeId, profissionalId, data, tipo, especialidade, motivo, diagnostico, extra) => Object.assign({
      id, pacienteId, unidadeId, profissionalId, data, tipo, especialidade, motivo, diagnostico,
      hda: "", sinais: null, avaliacao: "", procedimentos: [], prescricao: "", exames: [], encaminhamento: "", observacoes: "", documentos: [], status: "Finalizado"
    }, extra);

    const atendimentos = [
      A("a1", "p1", "u1", "pr2", "2026-11-10T14:35", "Atendimento de urgência", "Medicina de Emergência", "Febre e dor abdominal", "Infecção do trato urinário (CID N39.0)", {
        hda: "Paciente relata febre (38,6 °C) há 2 dias, disúria e dor em baixo ventre. Nega vômitos. Pós-operatório tardio de apendicectomia (25 dias), ferida operatória sem sinais flogísticos.",
        sinais: sv("138/86 mmHg", "96 bpm", "38,4 °C", "97%", "18 irpm", "72 kg", "168 mg/dL"),
        avaliacao: "Dor à palpação suprapúbica, Giordano negativo. Ferida cirúrgica limpa. Quadro compatível com ITU baixa.",
        procedimentos: ["Aferição de sinais vitais", "Coleta de urina para EAS e urocultura", "Paracetamol 750 mg VO (alergia a dipirona registrada)", "Hidratação venosa"],
        prescricao: "Nitrofurantoína 100 mg — 1 cápsula de 6/6 h por 7 dias; Paracetamol 750 mg se febre ou dor.",
        exames: ["Urina tipo I (EAS)", "Urocultura com antibiograma"], encaminhamento: "Retorno na UBS de referência em 7 dias.",
        observacoes: "Alergia a dipirona confirmada pelo histórico do Conecta antes da medicação.",
        documentos: ["Ficha de atendimento de urgência", "Receita médica", "Requisição de exames"]
      }),
      A("a2", "p1", "u2", "pr1", "2026-11-05T09:00", "Consulta", "Clínica Médica", "Consulta de acompanhamento — hipertensão e diabetes", "Hipertensão arterial controlada; Diabetes tipo 2 com controle parcial (CID I10 / E11)", {
        hda: "Retorno de rotina. Recuperação pós-cirúrgica sem intercorrências. Refere boa adesão à losartana; dieta irregular.",
        sinais: sv("128/82 mmHg", "78 bpm", "36,5 °C", "98%", "16 irpm", "72 kg", "142 mg/dL"),
        avaliacao: "Revisados exames de 20/10 (HbA1c 7,2%). Orientada sobre dieta e atividade física.",
        procedimentos: ["Consulta médica", "Revisão de exames laboratoriais", "Renovação de receita de uso contínuo"],
        prescricao: "Losartana 50 mg 1x ao dia; Metformina 850 mg 2x ao dia.",
        exames: ["Perfil lipídico"], encaminhamento: "Endocrinologia — Centro de Especialidades Médicas.",
        documentos: ["Receita de uso contínuo", "Encaminhamento para Endocrinologia"]
      }),
      A("a3", "p1", "u3", "pr3", "2026-10-20T07:30", "Exame", "Patologia Clínica", "Exame de sangue — hemograma completo, glicemia e HbA1c", "Exames laboratoriais de rotina", {
        procedimentos: ["Coleta de sangue venoso", "Hemograma completo", "Glicemia em jejum", "Hemoglobina glicada"],
        documentos: ["Laudo — Hemograma completo", "Laudo — Glicemia em jejum", "Laudo — HbA1c"]
      }),
      A("a4", "p1", "u4", "pr4", "2026-10-15T22:10", "Internação", "Cirurgia Geral", "Dor abdominal intensa em fossa ilíaca direita", "Apendicite aguda (CID K35.8)", {
        hda: "Dor periumbilical com migração para FID há 18 h, náuseas e febre baixa.",
        sinais: sv("142/90 mmHg", "104 bpm", "37,9 °C", "96%", "20 irpm", "73 kg", "181 mg/dL"),
        avaliacao: "Blumberg positivo. USG compatível com apendicite aguda.",
        procedimentos: ["Ultrassonografia de abdome", "Apendicectomia videolaparoscópica", "Internação por 3 dias", "Antibioticoterapia"],
        prescricao: "Cefalexina 500 mg 6/6 h por 7 dias após alta; Paracetamol 750 mg se dor.",
        exames: ["Ultrassonografia de abdome"], encaminhamento: "Acompanhamento na UBS de referência.",
        documentos: ["Resumo de alta hospitalar", "Descrição cirúrgica", "Laudo de ultrassonografia"]
      }),
      A("a5", "p1", "u2", "pr5", "2026-09-02T10:15", "Procedimento", "Enfermagem", "Vacinação — campanha de influenza", "Imunização em dia", {
        procedimentos: ["Aplicação de vacina influenza tetravalente", "Atualização da caderneta de vacinação"], documentos: ["Comprovante de vacinação"]
      }),
      A("a6", "p1", "u8", "pr6", "2026-07-18T15:20", "Consulta", "Cardiologia", "Avaliação cardiológica — risco cardiovascular", "Dislipidemia leve; sem cardiopatia estrutural (CID E78.5)", {
        sinais: sv("134/84 mmHg", "76 bpm", "36,3 °C", "98%", "16 irpm", "74 kg", ""),
        procedimentos: ["Consulta especializada", "Eletrocardiograma"], prescricao: "Sinvastatina 20 mg à noite.", exames: ["Eletrocardiograma"],
        documentos: ["Laudo de ECG", "Receita médica"]
      }),
      A("a7", "p2", "u5", "pr7", "2026-11-08T08:40", "Consulta", "Medicina de Família", "Falta de ar aos esforços", "DPOC exacerbada leve (CID J44.1)", { procedimentos: ["Nebulização", "Consulta médica"], exames: ["Espirometria"] }),
      A("a8", "p2", "u6", "pr10", "2026-10-28T23:05", "Atendimento de urgência", "Clínica Médica", "Tosse produtiva e febre", "Bronquite aguda (CID J20)", { procedimentos: ["Raio-X de tórax", "Medicação sintomática"], exames: ["Raio-X de tórax"] }),
      A("a9", "p3", "u2", "pr1", "2026-11-12T10:30", "Consulta", "Clínica Médica", "Crise asmática leve", "Asma não controlada (CID J45.9)", { procedimentos: ["Inalação com broncodilatador"], prescricao: "Budesonida + formoterol 200/6 mcg 2x ao dia." }),
      A("a10", "p4", "u5", "pr7", "2026-11-03T14:00", "Consulta", "Pediatria", "Consulta de puericultura", "Criança saudável — crescimento adequado", { procedimentos: ["Avaliação antropométrica", "Atualização vacinal"] }),
      A("a11", "p5", "u7", "pr8", "2026-08-02T11:00", "Internação", "Clínica Médica", "Dispneia e edema de membros inferiores", "Insuficiência cardíaca descompensada (CID I50.0)", { procedimentos: ["Internação por 7 dias", "Diureticoterapia venosa"] }),
      A("a12", "p5", "u10", "pr5", "2026-11-11T09:20", "Procedimento", "Enfermagem", "Aferição de pressão e curativo", "Acompanhamento de enfermagem", { procedimentos: ["Aferição de PA", "Curativo simples"] }),
      A("a13", "p6", "u6", "pr10", "2026-11-09T19:45", "Atendimento de urgência", "Clínica Médica", "Entorse de tornozelo direito", "Entorse de tornozelo (CID S93.4)", { procedimentos: ["Raio-X de tornozelo", "Imobilização"] }),
      A("a14", "p7", "u2", "pr1", "2026-11-06T11:10", "Consulta", "Clínica Médica", "Cansaço e ganho de peso", "Hipotireoidismo em ajuste de dose (CID E03.9)", { exames: ["TSH"], prescricao: "Levotiroxina 75 mcg em jejum." }),
      A("a15", "p8", "u10", "pr1", "2026-10-30T08:15", "Consulta", "Clínica Médica", "Controle de diabetes", "Diabetes tipo 2 descompensado (CID E11.6)", { exames: ["Hemoglobina glicada (HbA1c)"] }),
      A("a16", "p9", "u1", "pr2", "2026-11-13T02:30", "Atendimento de urgência", "Medicina de Emergência", "Cefaleia intensa", "Enxaqueca sem aura (CID G43.0)", { procedimentos: ["Analgesia venosa"] }),
      // Atendimentos de HOJE do profissional de demonstração (datas relativas ao dia do seed)
      A("a17", "p7", "u2", "pr1", `${hoje}T08:20`, "Consulta", "Clínica Médica", "Retorno — resultado de TSH", "Hipotireoidismo controlado (CID E03.9)", { procedimentos: ["Consulta médica"] }),
      A("a18", "p8", "u2", "pr1", `${hoje}T09:05`, "Consulta", "Clínica Médica", "Revisão de glicemias capilares", "Diabetes tipo 2 (CID E11)", { procedimentos: ["Consulta médica", "Ajuste de insulina NPH"] })
    ];

    /* Exames com resultados */
    const E = (id, pacienteId, nome, data, unidadeId, solicitanteId, status, categoria = "Laboratorial") => ({
      id, pacienteId, nome, data, unidadeId, solicitanteId, status, categoria,
      resultado: status === "Resultado disponível" ? (MODELOS_RESULTADO[nome] || [["Resultado", "Dentro dos parâmetros de referência", "—"]]) : null
    });
    const exames = [
      E("e1", "p1", "Urina tipo I (EAS)", "2026-11-10", "u1", "pr2", "Resultado disponível"),
      E("e2", "p1", "Urocultura com antibiograma", "2026-11-10", "u3", "pr2", "Em análise"),
      E("e3", "p1", "Hemograma completo", "2026-10-20", "u3", "pr1", "Resultado disponível"),
      E("e4", "p1", "Glicemia em jejum", "2026-10-20", "u3", "pr1", "Resultado disponível"),
      E("e5", "p1", "Hemoglobina glicada (HbA1c)", "2026-10-20", "u3", "pr1", "Resultado disponível"),
      E("e6", "p1", "Ultrassonografia de abdome", "2026-10-15", "u4", "pr4", "Resultado disponível", "Imagem"),
      E("e7", "p1", "Eletrocardiograma", "2026-07-18", "u8", "pr6", "Resultado disponível", "Cardiológico"),
      E("e8", "p1", "Perfil lipídico", "2026-11-20", "u3", "pr1", "Agendado"),
      E("e9", "p1", "Creatinina", "2026-05-06", "u3", "pr1", "Resultado disponível"),
      E("e10", "p2", "Raio-X de tórax", "2026-10-28", "u6", "pr10", "Resultado disponível", "Imagem"),
      E("e11", "p2", "Espirometria", "2026-11-19", "u8", "pr7", "Agendado", "Funcional"),
      E("e12", "p7", "TSH", "2026-11-07", "u3", "pr1", "Resultado disponível"),
      E("e13", "p8", "Hemoglobina glicada (HbA1c)", "2026-10-31", "u3", "pr1", "Resultado disponível"),
      E("e14", "p3", "Hemograma completo", "2026-11-12", "u3", "pr1", "Em análise")
    ];

    /* Consultas agendadas e realizadas */
    const C = (id, pacienteId, data, unidadeId, profissionalId, especialidade, status, tipo = "Consulta presencial") => ({ id, pacienteId, data, unidadeId, profissionalId, especialidade, status, tipo });
    const consultas = [
      C("c1", "p1", "2026-11-18T09:30", "u2", "pr1", "Clínica Médica", "Confirmada", "Retorno"),
      C("c2", "p1", "2026-11-25T14:00", "u8", "pr6", "Cardiologia", "Agendada"),
      C("c3", "p1", "2026-12-03T10:00", "u8", "pr9", "Endocrinologia", "Agendada", "Primeira consulta"),
      C("c4", "p1", "2026-11-05T09:00", "u2", "pr1", "Clínica Médica", "Realizada", "Retorno"),
      C("c5", "p1", "2026-07-18T15:20", "u8", "pr6", "Cardiologia", "Realizada"),
      C("c6", "p1", "2026-06-10T08:00", "u2", "pr1", "Clínica Médica", "Faltou"),
      C("c7", "p1", "2026-05-06T09:40", "u2", "pr1", "Clínica Médica", "Realizada"),
      C("c8", "p1", "2026-03-15T13:30", "u2", "pr5", "Enfermagem", "Cancelada", "Coleta de preventivo"),
      // Agenda de hoje do Dr. Ricardo (relativa ao dia do seed)
      C("c9", "p7", `${hoje}T08:20`, "u2", "pr1", "Clínica Médica", "Realizada", "Retorno"),
      C("c10", "p8", `${hoje}T09:00`, "u2", "pr1", "Clínica Médica", "Realizada", "Retorno"),
      C("c11", "p3", `${hoje}T10:30`, "u2", "pr1", "Clínica Médica", "Confirmada", "Retorno"),
      C("c12", "p1", `${hoje}T14:00`, "u2", "pr1", "Clínica Médica", "Agendada", "Avaliação pós-UPA"),
      C("c13", "p5", `${hoje}T15:30`, "u2", "pr1", "Clínica Médica", "Agendada", "Primeira consulta"),
      C("c14", "p2", "2026-11-19T08:00", "u2", "pr1", "Clínica Médica", "Agendada"),
      C("c15", "p9", "2026-11-21T11:00", "u2", "pr1", "Clínica Médica", "Agendada")
    ];

    /* Prescrições / receitas */
    const R = (id, pacienteId, profissionalId, unidadeId, data, medicamento, dosagem, frequencia, duracao, orientacoes, status) => ({ id, pacienteId, profissionalId, unidadeId, data, medicamento, dosagem, frequencia, duracao, orientacoes, status });
    const prescricoes = [
      R("r1", "p1", "pr2", "u1", "2026-11-10", "Nitrofurantoína", "100 mg — 1 cápsula", "De 6 em 6 horas", "7 dias", "Tomar após as refeições. Aumentar a ingestão de água. Não interromper antes do prazo.", "Em uso"),
      R("r2", "p1", "pr2", "u1", "2026-11-10", "Paracetamol", "750 mg — 1 comprimido", "Até de 6 em 6 horas, se febre ou dor", "Se necessário", "NÃO utilizar dipirona (alergia registrada).", "Em uso"),
      R("r3", "p1", "pr1", "u2", "2026-11-05", "Losartana potássica", "50 mg — 1 comprimido", "1 vez ao dia, pela manhã", "Uso contínuo", "Medir a pressão arterial semanalmente e anotar.", "Uso contínuo"),
      R("r4", "p1", "pr1", "u2", "2026-11-05", "Metformina", "850 mg — 1 comprimido", "2 vezes ao dia (café e jantar)", "Uso contínuo", "Tomar junto às refeições para reduzir desconforto gástrico.", "Uso contínuo"),
      R("r5", "p1", "pr6", "u8", "2026-07-18", "Sinvastatina", "20 mg — 1 comprimido", "1 vez ao dia, à noite", "Uso contínuo", "Evitar consumo de toranja (grapefruit).", "Uso contínuo"),
      R("r6", "p1", "pr4", "u4", "2026-10-18", "Cefalexina", "500 mg — 1 cápsula", "De 6 em 6 horas", "7 dias", "Concluir todo o tratamento.", "Concluído"),
      R("r7", "p3", "pr1", "u2", "2026-11-12", "Budesonida + formoterol", "200/6 mcg — 1 inalação", "2 vezes ao dia", "90 dias", "Enxaguar a boca após o uso.", "Em uso"),
      R("r8", "p7", "pr1", "u2", "2026-11-06", "Levotiroxina", "75 mcg — 1 comprimido", "1 vez ao dia, em jejum", "Uso contínuo", "Tomar 30 minutos antes do café da manhã.", "Uso contínuo")
    ];

    const encaminhamentos = [
      { id: "en1", pacienteId: "p1", profissionalId: "pr1", origemId: "u2", destinoId: "u8", especialidade: "Endocrinologia", data: "2026-11-05", motivo: "DM2 com controle parcial (HbA1c 7,2%) — avaliação de ajuste terapêutico.", prioridade: "Rotina", status: "Agendado" },
      { id: "en2", pacienteId: "p1", profissionalId: "pr2", origemId: "u1", destinoId: "u2", especialidade: "Clínica Médica", data: "2026-11-10", motivo: "Reavaliação de ITU e resultado de urocultura em 7 dias.", prioridade: "Rotina", status: "Pendente" },
      { id: "en3", pacienteId: "p2", profissionalId: "pr7", origemId: "u5", destinoId: "u8", especialidade: "Pneumologia", data: "2026-11-08", motivo: "DPOC com exacerbações frequentes.", prioridade: "Urgente", status: "Pendente" },
      { id: "en4", pacienteId: "p5", profissionalId: "pr8", origemId: "u7", destinoId: "u8", especialidade: "Cardiologia", data: "2026-08-09", motivo: "Seguimento pós-internação por IC.", prioridade: "Urgente", status: "Realizado" }
    ];

    const solicitacoes = [
      { id: "s1", pacienteId: "p1", exame: "Perfil lipídico", justificativa: "Controle de dislipidemia em paciente diabética.", prioridade: "Rotina", unidadeId: "u2", profissionalId: "pr1", data: "2026-11-05T09:20", status: "Agendado", exameId: "e8" },
      { id: "s2", pacienteId: "p1", exame: "Urocultura com antibiograma", justificativa: "Suspeita de ITU com febre.", prioridade: "Urgente", unidadeId: "u1", profissionalId: "pr2", data: "2026-11-10T14:50", status: "Em andamento", exameId: "e2" },
      { id: "s3", pacienteId: "p2", exame: "Espirometria", justificativa: "Estadiamento de DPOC.", prioridade: "Rotina", unidadeId: "u5", profissionalId: "pr7", data: "2026-11-08T09:00", status: "Agendado", exameId: "e11" },
      { id: "s4", pacienteId: "p7", exame: "TSH", justificativa: "Ajuste de dose de levotiroxina.", prioridade: "Rotina", unidadeId: "u2", profissionalId: "pr1", data: "2026-11-06T11:30", status: "Resultado disponível", exameId: "e12" },
      { id: "s5", pacienteId: "p3", exame: "Hemograma completo", justificativa: "Investigação de cansaço.", prioridade: "Rotina", unidadeId: "u2", profissionalId: "pr1", data: "2026-11-12T10:50", status: "Em andamento", exameId: "e14" },
      { id: "s6", pacienteId: "p8", exame: "Creatinina", justificativa: "Função renal em uso de metformina.", prioridade: "Rotina", unidadeId: "u2", profissionalId: "pr1", data: `${hoje}T09:15`, status: "Solicitado" }
    ];

    const L = (data, usuario, perfil, pacienteId, unidadeId, operacao, detalhe = "") => ({ id: novoId("lg"), data, usuario, perfil, pacienteId, unidadeId, operacao, detalhe, ip: `10.20.${Math.floor(Math.random() * 40)}.${Math.floor(Math.random() * 250)}` });
    const auditoria = [
      L(`${hoje}T09:06`, "Dr. Ricardo Almeida", "Médico", "p8", "u2", "Registro de atendimento"),
      L(`${hoje}T09:01`, "Dr. Ricardo Almeida", "Médico", "p8", "u2", "Visualização de prontuário"),
      L(`${hoje}T08:21`, "Dr. Ricardo Almeida", "Médico", "p7", "u2", "Registro de atendimento"),
      L(`${hoje}T08:15`, "Dr. Ricardo Almeida", "Médico", "p7", "u2", "Visualização de prontuário"),
      L("2026-11-13T02:34", "Dra. Juliana Martins", "Médico", "p9", "u1", "Visualização de prontuário"),
      L("2026-11-12T10:31", "Dr. Ricardo Almeida", "Médico", "p3", "u2", "Registro de atendimento"),
      L("2026-11-11T18:40", "Maria Aparecida Souza", "Paciente", "p1", "", "Consulta ao próprio histórico"),
      L("2026-11-10T15:02", "Dra. Juliana Martins", "Médico", "p1", "u1", "Prescrição médica"),
      L("2026-11-10T14:52", "Dra. Juliana Martins", "Médico", "p1", "u1", "Solicitação de exame"),
      L("2026-11-10T14:36", "Dra. Juliana Martins", "Médico", "p1", "u1", "Visualização de prontuário", "Acesso ao histórico da UBS Jardim das Flores e do Hospital São Lucas"),
      L("2026-11-10T14:40", "Dra. Juliana Martins", "Médico", "p1", "u1", "Registro de atendimento"),
      L("2026-11-09T19:50", "Dr. Lucas Ribeiro", "Médico", "p6", "u6", "Registro de atendimento"),
      L("2026-11-08T08:45", "Dra. Beatriz Santos", "Médico", "p2", "u5", "Visualização de prontuário"),
      L("2026-11-07T16:10", "Ana Paula Ferreira", "Administrador", "", "", "Alteração de permissões", "Perfil Técnico de laboratório"),
      L("2026-11-05T09:02", "Dr. Ricardo Almeida", "Médico", "p1", "u2", "Visualização de prontuário"),
      L("2026-11-04T07:12", "Desconhecido", "—", "p1", "u6", "Tentativa de acesso negada", "Profissional sem vínculo ativo")
    ];

    const notificacoes = [
      { id: "n1", para: "paciente:p1", icone: "flask-conical", titulo: "Resultado disponível", texto: "O resultado do exame Urina tipo I (EAS) já pode ser consultado.", data: "2026-11-11T08:10", lida: false, link: "exames.html" },
      { id: "n2", para: "paciente:p1", icone: "calendar-check", titulo: "Consulta confirmada", texto: "Retorno com Dr. Ricardo Almeida em 18/11 às 09:30 na UBS Jardim das Flores.", data: "2026-11-10T17:30", lida: false, link: "consultas.html" },
      { id: "n3", para: "paciente:p1", icone: "file-text", titulo: "Nova receita registrada", texto: "Dra. Juliana Martins registrou uma receita na UPA Central.", data: "2026-11-10T15:05", lida: false, link: "receitas.html" },
      { id: "n4", para: "paciente:p1", icone: "shield-check", titulo: "Seu prontuário foi acessado", texto: "Dra. Juliana Martins (UPA Central) consultou seu histórico em 10/11.", data: "2026-11-10T14:36", lida: true, link: "historico.html" },
      { id: "n5", para: "medico:pr1", icone: "flask-conical", titulo: "Resultado de exame", texto: "TSH de Juliana Costa Mendes está disponível.", data: "2026-11-07T10:00", lida: false, link: "solicitar-exame.html" },
      { id: "n6", para: "medico:pr1", icone: "share-2", titulo: "Atendimento externo", texto: "Maria Aparecida Souza foi atendida na UPA Central em 10/11.", data: "2026-11-10T15:10", lida: false, link: "perfil-paciente.html?id=p1" },
      { id: "n7", para: "medico:pr1", icone: "send", titulo: "Encaminhamento recebido", texto: "UPA Central encaminhou Maria A. Souza para reavaliação.", data: "2026-11-10T15:12", lida: true, link: "encaminhamentos.html" },
      { id: "n8", para: "admin:ad1", icone: "building-2", titulo: "Integração pendente", texto: "Laboratório Regional Norte aguarda homologação.", data: "2026-11-12T09:00", lida: false, link: "unidades.html" },
      { id: "n9", para: "admin:ad1", icone: "shield-alert", titulo: "Tentativa de acesso negada", texto: "Acesso sem vínculo ativo bloqueado (UPA Zona Norte).", data: "2026-11-04T07:12", lida: false, link: "seguranca.html?aba=auditoria" }
    ];

    const usuarios = [
      { cpf: "12345678909", senha: "paciente123", role: "paciente", refId: "p1" },
      { cpf: profissionais[0].cpf, senha: "medico123", role: "medico", refId: "pr1" },
      { cpf: "52998224725", senha: "admin123", role: "admin", refId: "ad1" }
    ];
    const administradores = [{ id: "ad1", nome: "Ana Paula Ferreira", cargo: "Gestora de Saúde Digital", cpf: "52998224725", email: "gestao@conecta.demo" }];

    const permissoes = {
      perfis: ["Médico", "Enfermeiro", "Técnico de laboratório", "Recepção", "Administrador"],
      recursos: [
        { id: "ver_prontuario", nome: "Visualizar prontuário completo" },
        { id: "registrar", nome: "Registrar atendimento" },
        { id: "prescrever", nome: "Emitir prescrições" },
        { id: "exames", nome: "Solicitar exames" },
        { id: "laudos", nome: "Liberar laudos de exames" },
        { id: "dados_cadastrais", nome: "Ver dados cadastrais (sem máscara)" },
        { id: "gestao", nome: "Gestão de usuários e unidades" }
      ],
      matriz: {
        "Médico": { ver_prontuario: true, registrar: true, prescrever: true, exames: true, laudos: false, dados_cadastrais: true, gestao: false },
        "Enfermeiro": { ver_prontuario: true, registrar: true, prescrever: false, exames: false, laudos: false, dados_cadastrais: true, gestao: false },
        "Técnico de laboratório": { ver_prontuario: false, registrar: false, prescrever: false, exames: false, laudos: true, dados_cadastrais: false, gestao: false },
        "Recepção": { ver_prontuario: false, registrar: false, prescrever: false, exames: false, laudos: false, dados_cadastrais: true, gestao: false },
        "Administrador": { ver_prontuario: false, registrar: false, prescrever: false, exames: false, laudos: false, dados_cadastrais: false, gestao: true }
      }
    };
    const configuracoes = {
      compartilharEntreUnidades: true, exigirJustificativaEmergencia: true, notificarPacienteAcesso: true,
      mascararDocumentos: true, expirarSessao: 30, consentimentoPaciente: true, bloquearExportacao: false, mfaProfissionais: true
    };

    /* Indicadores agregados de demonstração (rede inteira) */
    const indicadores = {
      pacientesBase: 48230, atendimentosBase: 182410, examesBase: 96318,
      meses: ["Jun", "Jul", "Ago", "Set", "Out", "Nov"],
      atendimentosMes: [12840, 13420, 14105, 13870, 15230, 9860],
      examesMes: [6820, 7110, 7480, 7350, 8120, 5240],
      pacientesMes: [8940, 9310, 9720, 9540, 10480, 6930],
      tiposAtendimento: { "Consultas": 46, "Urgência": 27, "Exames": 18, "Internações": 5, "Procedimentos": 4 }
    };

    return { unidades, profissionais, pacientes, atendimentos, exames, consultas, prescricoes, encaminhamentos, solicitacoes, auditoria, notificacoes, usuarios, administradores, permissoes, configuracoes, indicadores, rascunhos: [] };
  }

  /* ------------------------------------------------------------------------
     4. Camada de dados (repositório) — substituível por API REST no futuro
     ------------------------------------------------------------------------ */
  const ConectaData = {
    /** Inicializa os dados fictícios apenas na primeira execução (ou após reset). */
    seed(forcar = false) {
      if (!forcar && Store.get("versao") === VERSAO_DADOS) return;
      const dados = gerarDadosIniciais();
      Object.keys(dados).forEach((k) => Store.set(k, dados[k]));
      Store.set("versao", VERSAO_DADOS);
    },
    getAll(colecao) { return Store.get(colecao, []); },
    getObj(colecao) { return Store.get(colecao, {}); },
    setObj(colecao, obj) { Store.set(colecao, obj); },
    getById(colecao, id) { return this.getAll(colecao).find((x) => x.id === id) || null; },
    add(colecao, item, prefixo = "id") {
      const lista = this.getAll(colecao);
      const novo = Object.assign({ id: novoId(prefixo) }, item);
      lista.unshift(novo);
      Store.set(colecao, lista);
      return novo;
    },
    update(colecao, id, alteracoes) {
      const lista = this.getAll(colecao);
      const i = lista.findIndex((x) => x.id === id);
      if (i < 0) return null;
      lista[i] = Object.assign({}, lista[i], alteracoes);
      Store.set(colecao, lista);
      return lista[i];
    },
    remove(colecao, id) {
      Store.set(colecao, this.getAll(colecao).filter((x) => x.id !== id));
    },
    where(colecao, fn) { return this.getAll(colecao).filter(fn); },
    /** Restaura todos os dados de demonstração. */
    reset() {
      const sessao = Store.get("sessao", null);
      Store.limparTudo();
      this.seed(true);
      if (sessao) Store.set("sessao", sessao);
    },
    // Atalhos de leitura frequentes
    unidade(id) { return this.getById("unidades", id) || { nome: "—", tipo: "" }; },
    profissional(id) { return this.getById("profissionais", id) || { nome: "—", especialidade: "" }; },
    paciente(id) { return this.getById("pacientes", id); }
  };

  /* ------------------------------------------------------------------------
     5. Autenticação demonstrativa
     ------------------------------------------------------------------------ */
  const ROTAS_INICIAIS = { paciente: "paciente.html", medico: "medico.html", admin: "administrador.html" };
  const NOMES_PERFIL = { paciente: "Paciente", medico: "Profissional de saúde", admin: "Administrador" };

  const Auth = {
    sessao() { return Store.get("sessao", null); },
    /** Valida credenciais contra os usuários fictícios. Retorna sessão ou mensagem de erro. */
    login(cpf, senha, perfilEsperado) {
      const usuario = ConectaData.getAll("usuarios").find((u) => u.cpf === somenteDigitos(cpf));
      if (!usuario || usuario.senha !== senha) return { erro: "CPF ou senha incorretos. Verifique os dados e tente novamente." };
      if (perfilEsperado === "paciente" && usuario.role !== "paciente") return { erro: "Este CPF pertence a um profissional. Selecione \"Profissional de saúde\"." };
      if (perfilEsperado === "profissional" && usuario.role === "paciente") return { erro: "Este CPF pertence a um paciente. Selecione \"Paciente\"." };
      let ref;
      if (usuario.role === "paciente") ref = ConectaData.paciente(usuario.refId);
      else if (usuario.role === "medico") ref = ConectaData.profissional(usuario.refId);
      else ref = ConectaData.getAll("administradores").find((a) => a.id === usuario.refId);
      const sessao = { role: usuario.role, refId: usuario.refId, nome: ref.nome, cpf: usuario.cpf, unidadeId: ref.unidadeId || "", inicio: agoraISO() };
      Store.set("sessao", sessao);
      try { sessionStorage.removeItem("conecta:loaderVisto"); } catch (e) { /* ignora */ }
      registrarAuditoria("Login na plataforma", { usuarioSessao: sessao });
      return { sessao, destino: "pages/" + ROTAS_INICIAIS[usuario.role] };
    },
    logout() {
      Store.remove("sessao");
      location.href = "../login.html";
    },
    /** Protege uma página: exige sessão ativa e perfil autorizado. */
    exigir(perfis) {
      const s = this.sessao();
      if (!s) { location.replace("../login.html?expirada=1"); return null; }
      if (perfis && perfis.length && !perfis.includes(s.role)) { location.replace(ROTAS_INICIAIS[s.role] + "?negado=1"); return null; }
      return s;
    }
  };

  /** Registro de auditoria: quem acessou, qual paciente, de qual unidade, quando e o quê. */
  function registrarAuditoria(operacao, { pacienteId = "", detalhe = "", usuarioSessao = null } = {}) {
    const s = usuarioSessao || Auth.sessao();
    if (!s) return;
    ConectaData.add("auditoria", {
      data: agoraISO(), usuario: s.nome, perfil: s.role === "medico" ? "Médico" : NOMES_PERFIL[s.role],
      pacienteId, unidadeId: s.unidadeId || "", operacao, detalhe, ip: "10.20.0." + Math.floor(Math.random() * 250)
    }, "lg");
  }

  function notificar(para, titulo, texto, link = "", icone = "bell") {
    ConectaData.add("notificacoes", { para, titulo, texto, link, icone, data: agoraISO(), lida: false }, "n");
  }

  /* ------------------------------------------------------------------------
     6. Componentes de interface
     ------------------------------------------------------------------------ */
  function icones() { if (window.lucide && typeof window.lucide.createIcons === "function") window.lucide.createIcons(); }

  /** Mensagens rápidas (toast). tipo: sucesso | erro | alerta | info */
  function toast(mensagem, tipo = "sucesso", titulo = "") {
    let area = qs(".toast-area");
    if (!area) {
      area = document.createElement("div");
      area.className = "toast-area";
      area.setAttribute("role", "status");
      area.setAttribute("aria-live", "polite");
      document.body.appendChild(area);
    }
    const nomes = { sucesso: "check-circle-2", erro: "alert-circle", alerta: "alert-triangle", info: "info" };
    const titulos = { sucesso: "Tudo certo!", erro: "Algo deu errado", alerta: "Atenção", info: "Informação" };
    const el = document.createElement("div");
    el.className = `toast ${tipo}`;
    el.innerHTML = `${ico(nomes[tipo] || "info")}<div><strong>${esc(titulo || titulos[tipo])}</strong>${esc(mensagem)}</div>`;
    area.appendChild(el);
    icones();
    setTimeout(() => { el.classList.add("saindo"); setTimeout(() => el.remove(), 260); }, 4200);
  }

  /**
   * Modal acessível com foco preso, ESC para fechar e retorno do foco.
   * acoes: [{ label, classe, icone, onClick(fechar, modalEl) | 'fechar' }]
   */
  function abrirModal({ titulo, corpo, acoes = [{ label: "Fechar", classe: "btn-outline", onClick: "fechar" }], tamanho = "", aoAbrir } = {}) {
    const anterior = document.activeElement;
    const fundo = document.createElement("div");
    fundo.className = "modal-backdrop";
    const idTitulo = novoId("mt");
    fundo.innerHTML = `
      <div class="modal ${tamanho ? "modal-" + tamanho : ""}" role="dialog" aria-modal="true" aria-labelledby="${idTitulo}">
        <div class="modal-head">
          <h2 id="${idTitulo}">${esc(titulo)}</h2>
          <button type="button" class="btn-icon" data-fechar aria-label="Fechar janela">${ico("x")}</button>
        </div>
        <div class="modal-body">${corpo}</div>
        ${acoes.length ? `<div class="modal-foot">${acoes.map((a, i) => `<button type="button" class="btn ${a.classe || "btn-outline"}" data-acao="${i}">${a.icone ? ico(a.icone) : ""}${esc(a.label)}</button>`).join("")}</div>` : ""}
      </div>`;
    document.body.appendChild(fundo);
    document.body.style.overflow = "hidden";
    const modal = qs(".modal", fundo);

    function fechar() {
      fundo.remove();
      if (!qs(".modal-backdrop")) document.body.style.overflow = "";
      document.removeEventListener("keydown", teclado);
      if (anterior && anterior.focus) anterior.focus();
    }
    function teclado(e) {
      if (e.key === "Escape") { e.preventDefault(); fechar(); return; }
      if (e.key === "Tab") {
        const focaveis = qsa('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', modal).filter((el) => !el.disabled && el.offsetParent !== null);
        if (!focaveis.length) return;
        const primeiro = focaveis[0], ultimo = focaveis[focaveis.length - 1];
        if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
        else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
      }
    }
    document.addEventListener("keydown", teclado);
    fundo.addEventListener("mousedown", (e) => { if (e.target === fundo) fechar(); });
    qs("[data-fechar]", fundo).addEventListener("click", fechar);
    qsa("[data-acao]", fundo).forEach((b) => {
      b.addEventListener("click", () => {
        const a = acoes[Number(b.dataset.acao)];
        if (a.onClick === "fechar" || !a.onClick) fechar();
        else a.onClick(fechar, modal);
      });
    });
    icones();
    if (aoAbrir) aoAbrir(modal, fechar);
    const alvo = qs("input, select, textarea", modal) || qs("[data-fechar]", modal);
    setTimeout(() => alvo && alvo.focus(), 30);
    return { modal, fechar };
  }

  /** Caixa de confirmação que retorna uma Promise<boolean>. */
  function confirmar({ titulo = "Confirmar ação", mensagem = "Deseja continuar?", rotulo = "Confirmar", perigo = false } = {}) {
    return new Promise((resolve) => {
      let decidido = false;
      const m = abrirModal({
        titulo, tamanho: "sm",
        corpo: `<div class="flex gap-3">${ico(perigo ? "alert-triangle" : "help-circle", 'class="ico-lg"')}<p class="mb-0">${esc(mensagem)}</p></div>`,
        acoes: [
          { label: "Cancelar", classe: "btn-outline", onClick: (f) => { decidido = true; resolve(false); f(); } },
          { label: rotulo, classe: perigo ? "btn-danger" : "btn-primary", onClick: (f) => { decidido = true; resolve(true); f(); } }
        ]
      });
      // Se o usuário fechar pelo X/ESC, considera como "não".
      const obs = new MutationObserver(() => { if (!document.body.contains(m.modal)) { obs.disconnect(); if (!decidido) resolve(false); } });
      obs.observe(document.body, { childList: true });
    });
  }

  /**
   * Renderiza uma tabela responsiva. Em telas pequenas as linhas viram cartões
   * usando o atributo data-label de cada célula.
   */
  function tabela(container, { colunas, linhas, vazio = "Nenhum registro encontrado.", rotulo = "" }) {
    if (!container) return;
    if (!linhas.length) {
      container.innerHTML = `<div class="empty">${ico("inbox")}<span>${esc(vazio)}</span></div>`;
      icones();
      return;
    }
    container.innerHTML = `
      <div class="table-wrap"><table class="table table-responsive" ${rotulo ? `aria-label="${esc(rotulo)}"` : ""}>
        <thead><tr>${colunas.map((c) => `<th scope="col">${esc(c.titulo)}</th>`).join("")}</tr></thead>
        <tbody>${linhas.map((l) => `<tr>${colunas.map((c) => `<td data-label="${esc(c.titulo)}">${c.render ? c.render(l) : esc(l[c.chave])}</td>`).join("")}</tr>`).join("")}</tbody>
      </table></div>`;
    icones();
  }

  /** Opções de <select> a partir de uma lista. */
  const opcoes = (lista, valor, rotulo = (x) => x.nome, chave = (x) => x.id) =>
    lista.map((x) => `<option value="${esc(chave(x))}" ${String(chave(x)) === String(valor) ? "selected" : ""}>${esc(rotulo(x))}</option>`).join("");

  /** Abas genéricas: botões [role=tab][data-aba] e painéis [data-painel]. */
  function iniciarAbas(raiz, aoTrocar) {
    const botoes = qsa('[role="tab"]', raiz);
    function ativar(nome, foco = false) {
      botoes.forEach((b) => {
        const ativo = b.dataset.aba === nome;
        b.setAttribute("aria-selected", ativo ? "true" : "false");
        b.tabIndex = ativo ? 0 : -1;
        if (ativo && foco) b.focus();
      });
      qsa("[data-painel]", raiz).forEach((p) => p.classList.toggle("hidden", p.dataset.painel !== nome));
      if (aoTrocar) aoTrocar(nome);
    }
    botoes.forEach((b, i) => {
      b.addEventListener("click", () => ativar(b.dataset.aba));
      b.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          const prox = botoes[(i + (e.key === "ArrowRight" ? 1 : -1) + botoes.length) % botoes.length];
          ativar(prox.dataset.aba, true);
        }
      });
    });
    return ativar;
  }

  /** Validação simples de formulários: campos [required] e regras extras. */
  function validarFormulario(form, regras = {}) {
    let valido = true; let primeiroInvalido = null;
    qsa("input, select, textarea", form).forEach((campo) => {
      if (!campo.name && !campo.id) return;
      const erroEl = qs(`[data-erro-de="${campo.id}"]`, form);
      let msg = "";
      if (campo.required && !String(campo.value).trim()) msg = "Campo obrigatório.";
      else if (regras[campo.name]) msg = regras[campo.name](campo.value) || "";
      campo.setAttribute("aria-invalid", msg ? "true" : "false");
      if (erroEl) erroEl.textContent = msg;
      if (msg) { valido = false; if (!primeiroInvalido) primeiroInvalido = campo; }
    });
    if (primeiroInvalido) primeiroInvalido.focus();
    return valido;
  }
  const dadosFormulario = (form) => Object.fromEntries(new FormData(form).entries());

  /** Download de arquivo gerado no navegador (relatórios demonstrativos). */
  function baixarArquivo(nome, conteudo, tipo = "text/plain;charset=utf-8") {
    const blob = new Blob([conteudo], { type: tipo });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = nome; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
  }

  /** Abre uma janela de impressão (o usuário pode "Salvar como PDF"). */
  function imprimirDocumento(titulo, htmlCorpo) {
    const w = window.open("", "_blank", "width=820,height=900");
    if (!w) { toast("Permita pop-ups para gerar o PDF.", "alerta"); return; }
    const base = location.href.replace(/[^/]*$/, "");
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title><link rel="stylesheet" href="${base}../css/style.css"><link rel="stylesheet" href="${base}../css/paciente.css"></head><body class="print-doc"><div class="doc">${htmlCorpo}</div></body></html>`);
    w.document.close();
    w.addEventListener("load", () => { w.focus(); w.print(); });
  }

  /* ------------------------------------------------------------------------
     7. Estrutura dos painéis: menu lateral, cabeçalho e notificações
     ------------------------------------------------------------------------ */
  const MENUS = {
    paciente: [
      { secao: "Minha saúde" },
      { pagina: "visao-geral", href: "paciente.html", icone: "layout-dashboard", rotulo: "Visão geral" },
      { pagina: "historico", href: "historico.html", icone: "history", rotulo: "Meu histórico médico" },
      { pagina: "exames", href: "exames.html", icone: "flask-conical", rotulo: "Meus exames" },
      { pagina: "consultas", href: "consultas.html", icone: "calendar-days", rotulo: "Minhas consultas" },
      { pagina: "receitas", href: "receitas.html", icone: "file-text", rotulo: "Minhas receitas" },
      { pagina: "receitas", aba: "medicamentos", href: "receitas.html?aba=medicamentos", icone: "pill", rotulo: "Meus medicamentos" },
      { secao: "Rede" },
      { pagina: "rede", href: "rede.html", icone: "building-2", rotulo: "Unidades de saúde" },
      { secao: "Conta" },
      { pagina: "perfil", href: "perfil-paciente.html", icone: "user-round", rotulo: "Meu perfil" },
      { pagina: "ajuda", href: "ajuda.html", icone: "life-buoy", rotulo: "Ajuda e suporte" }
    ],
    medico: [
      { secao: "Atendimento" },
      { pagina: "dashboard", href: "medico.html", icone: "layout-dashboard", rotulo: "Dashboard" },
      { pagina: "buscar", href: "buscar-paciente.html", icone: "search", rotulo: "Buscar paciente" },
      { pagina: "perfil", href: "perfil-paciente.html", icone: "clipboard-list", rotulo: "Histórico clínico" },
      { pagina: "atendimento", href: "atendimento.html", icone: "stethoscope", rotulo: "Atendimentos" },
      { pagina: "exames-medico", href: "solicitar-exame.html", icone: "flask-conical", rotulo: "Exames" },
      { pagina: "prescricoes", href: "prescricoes.html", icone: "pill", rotulo: "Prescrições" },
      { pagina: "encaminhamentos", href: "encaminhamentos.html", icone: "send", rotulo: "Encaminhamentos" },
      { secao: "Rede e conta" },
      { pagina: "rede", href: "rede.html", icone: "network", rotulo: "Rede de atendimento" },
      { acao: "notificacoes", icone: "bell", rotulo: "Notificações", contador: true },
      { acao: "perfil-profissional", icone: "user-round", rotulo: "Meu perfil" }
    ],
    admin: [
      { secao: "Gestão" },
      { pagina: "admin", href: "administrador.html", icone: "layout-dashboard", rotulo: "Visão geral" },
      { pagina: "pacientes", href: "pacientes.html", icone: "users", rotulo: "Pacientes" },
      { pagina: "profissionais", href: "profissionais.html", icone: "user-cog", rotulo: "Profissionais" },
      { pagina: "unidades", href: "unidades.html", icone: "building-2", rotulo: "Unidades de saúde" },
      { pagina: "rede", href: "rede.html", icone: "network", rotulo: "Integrações" },
      { pagina: "relatorios", href: "relatorios.html", icone: "bar-chart-3", rotulo: "Relatórios" },
      { secao: "Governança (LGPD)" },
      { pagina: "seguranca", aba: "auditoria", href: "seguranca.html?aba=auditoria", icone: "scroll-text", rotulo: "Auditoria" },
      { pagina: "seguranca", aba: "acesso", href: "seguranca.html?aba=acesso", icone: "shield-check", rotulo: "Segurança" },
      { pagina: "seguranca", aba: "config", href: "seguranca.html?aba=config", icone: "settings", rotulo: "Configurações" }
    ]
  };
  const ICONE_PERFIL = { paciente: "heart-pulse", medico: "stethoscope", admin: "shield" };

  function dadosUsuario(s) {
    if (s.role === "paciente") { const p = ConectaData.paciente(s.refId); return { nome: p.nome, sub: "Paciente" }; }
    if (s.role === "medico") { const p = ConectaData.profissional(s.refId); return { nome: p.nome, sub: `${p.especialidade} · ${ConectaData.unidade(p.unidadeId).nome}` }; }
    const a = ConectaData.getAll("administradores").find((x) => x.id === s.refId) || { nome: s.nome, cargo: "Administrador" };
    return { nome: a.nome, sub: a.cargo };
  }

  const chaveNotif = (s) => `${s.role}:${s.refId}`;
  const minhasNotificacoes = (s) => ConectaData.where("notificacoes", (n) => n.para === chaveNotif(s)).sort((a, b) => b.data.localeCompare(a.data));

  /** Monta o menu lateral e o cabeçalho ao redor do <main> existente na página. */
  function montarShell(s) {
    const main = qs("main");
    const pagina = document.body.dataset.page;
    const abaAtual = param("aba") || document.body.dataset.abaPadrao || "";
    const usuario = dadosUsuario(s);
    const naoLidas = minhasNotificacoes(s).filter((n) => !n.lida).length;
    const itens = MENUS[s.role];

    // Item ativo: mesma página e mesma aba (ou o item sem aba como padrão)
    const candidatos = itens.filter((i) => i.pagina === pagina);
    const ativo = candidatos.find((i) => (i.aba || "") === abaAtual) || candidatos.find((i) => !i.aba) || candidatos[0];

    const navHtml = itens.map((i) => {
      if (i.secao) return `</ul><div class="nav-section">${esc(i.secao)}</div><ul class="nav-list">`;
      const corrente = i === ativo ? 'aria-current="page"' : "";
      const contador = i.contador && naoLidas ? `<span class="count" aria-label="${naoLidas} não lidas">${naoLidas}</span>` : "";
      if (i.acao) return `<li><button type="button" class="nav-link" data-shell-acao="${i.acao}">${ico(i.icone)}<span>${esc(i.rotulo)}</span>${contador}</button></li>`;
      return `<li><a class="nav-link" href="${i.href}" ${corrente} data-aba-link="${i.aba || ""}" data-pagina-link="${i.pagina}">${ico(i.icone)}<span>${esc(i.rotulo)}</span></a></li>`;
    }).join("");

    const app = document.createElement("div");
    app.className = "app";
    app.innerHTML = `
      <a href="#conteudo" class="skip-link">Pular para o conteúdo</a>
      <aside class="sidebar" id="sidebar" aria-label="Menu principal">
        <div class="sidebar-brand">
          <a href="${ROTAS_INICIAIS[s.role]}" aria-label="Conecta — página inicial"><span class="logo-crop"><img src="../assets/img/logo-conecta.png" alt="Conecta"></span></a>
          <button type="button" class="btn-icon sidebar-close" data-shell-acao="fechar-menu" aria-label="Fechar menu">${ico("x")}</button>
        </div>
        <div class="sidebar-role">
          <span class="role-ico">${ico(ICONE_PERFIL[s.role])}</span>
          <div><strong>${esc(NOMES_PERFIL[s.role])}</strong><span>Ambiente seguro · LGPD</span></div>
        </div>
        <nav aria-label="Navegação do ${esc(NOMES_PERFIL[s.role])}"><ul class="nav-list">${navHtml}</ul></nav>
        <div class="sidebar-foot">
          <button type="button" class="nav-link" data-shell-acao="sair">${ico("log-out")}<span>Sair</span></button>
        </div>
      </aside>
      <div class="main-area">
        <header class="topbar">
          <button type="button" class="btn-icon menu-toggle" data-shell-acao="abrir-menu" aria-label="Abrir menu" aria-controls="sidebar" aria-expanded="false">${ico("menu")}</button>
          <a class="topbar-logo" href="${ROTAS_INICIAIS[s.role]}" aria-label="Conecta — página inicial"><span class="logo-crop"><img src="../assets/img/logo-conecta.png" alt="Conecta"></span></a>
          <div class="topbar-title">${ico("shield-check")}<span>Conecta</span><span aria-hidden="true">/</span><strong>${esc(document.title.split("|")[0].trim())}</strong></div>
          <div class="topbar-spacer"></div>
          <div class="topbar-actions">
            <button type="button" class="btn-icon notif-btn" data-shell-acao="notificacoes" aria-label="Notificações${naoLidas ? `, ${naoLidas} não lidas` : ""}" aria-haspopup="true" aria-expanded="false">
              ${ico("bell")}${naoLidas ? `<span class="notif-dot">${naoLidas}</span>` : ""}
            </button>
            <button type="button" class="user-chip" data-shell-acao="${s.role === "paciente" ? "ir-perfil" : s.role === "medico" ? "perfil-profissional" : "perfil-admin"}" aria-label="Meu perfil: ${esc(usuario.nome)}">
              <span class="avatar">${esc(iniciais(usuario.nome))}</span>
              <span class="uc-text"><strong>${esc(usuario.nome)}</strong><span>${esc(usuario.sub)}</span></span>
            </button>
            <button type="button" class="btn-icon" data-shell-acao="sair" aria-label="Sair da plataforma" title="Sair">${ico("log-out")}</button>
          </div>
        </header>
        <div class="content-slot"></div>
        <footer class="app-footer">
          <span>${ico("lock")} Conecta · Dados fictícios para demonstração — integração com o SUS simulada.</span>
          <span>Conecta: sua saúde integrada, seu histórico sempre com você.</span>
        </footer>
      </div>`;
    main.parentNode.insertBefore(app, main);
    main.id = "conteudo";
    main.classList.add("content");
    main.tabIndex = -1;
    qs(".content-slot", app).replaceWith(main);

    app.addEventListener("click", (e) => {
      const alvo = e.target.closest("[data-shell-acao]");
      if (!alvo) return;
      const acao = alvo.dataset.shellAcao;
      if (acao === "sair") sair();
      if (acao === "abrir-menu") alternarMenu(true);
      if (acao === "fechar-menu") alternarMenu(false);
      if (acao === "notificacoes") { alternarMenu(false); alternarNotificacoes(s); }
      if (acao === "ir-perfil") location.href = "perfil-paciente.html";
      if (acao === "perfil-profissional") perfilProfissional(s);
      if (acao === "perfil-admin") perfilAdmin(s);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { alternarMenu(false); const p = qs(".notif-panel"); if (p) fecharNotificacoes(); }
    });
  }

  function alternarMenu(abrir) {
    const sb = qs("#sidebar"); const btn = qs(".menu-toggle");
    if (!sb) return;
    sb.classList.toggle("open", abrir);
    if (btn) btn.setAttribute("aria-expanded", abrir ? "true" : "false");
    let ov = qs(".overlay");
    if (abrir && !ov) {
      ov = document.createElement("div"); ov.className = "overlay";
      ov.addEventListener("click", () => alternarMenu(false));
      document.body.appendChild(ov);
      const primeiro = qs(".nav-link", sb); if (primeiro) primeiro.focus();
    } else if (!abrir && ov) ov.remove();
  }

  function fecharNotificacoes() {
    const p = qs(".notif-panel"); if (p) p.remove();
    const b = qs(".notif-btn"); if (b) b.setAttribute("aria-expanded", "false");
    document.removeEventListener("mousedown", cliqueFora);
  }
  function cliqueFora(e) { if (!e.target.closest(".notif-panel") && !e.target.closest("[data-shell-acao='notificacoes']")) fecharNotificacoes(); }

  /** Painel suspenso de notificações. */
  function alternarNotificacoes(s) {
    if (qs(".notif-panel")) { fecharNotificacoes(); return; }
    const lista = minhasNotificacoes(s);
    const painel = document.createElement("section");
    painel.className = "notif-panel";
    painel.setAttribute("aria-label", "Notificações");
    painel.innerHTML = `
      <header><h2>Notificações</h2><button type="button" class="btn btn-ghost btn-sm" data-marcar-todas>${ico("check-check")} Marcar todas como lidas</button></header>
      ${lista.length ? `<ul class="notif-list">${lista.map((n) => `
        <li><button type="button" class="notif-item ${n.lida ? "" : "unread"}" data-notif="${n.id}">
          <span class="ni-ico">${ico(n.icone || "bell")}</span>
          <span><span class="ni-title">${esc(n.titulo)}</span><span class="ni-text">${esc(n.texto)}</span><span class="ni-time">${esc(tempoRelativo(n.data))}</span></span>
        </button></li>`).join("")}</ul>` : `<div class="empty">${ico("bell-off")}<span>Nenhuma notificação.</span></div>`}`;
    qs(".topbar").appendChild(painel);
    qs(".notif-btn").setAttribute("aria-expanded", "true");
    icones();
    painel.addEventListener("click", (e) => {
      if (e.target.closest("[data-marcar-todas]")) {
        lista.forEach((n) => ConectaData.update("notificacoes", n.id, { lida: true }));
        atualizarContadorNotificacoes(s);
        qsa(".notif-item", painel).forEach((el) => el.classList.remove("unread"));
        toast("Todas as notificações foram marcadas como lidas.", "info");
        return;
      }
      const item = e.target.closest("[data-notif]");
      if (item) {
        const n = ConectaData.update("notificacoes", item.dataset.notif, { lida: true });
        if (n && n.link) location.href = n.link; else { fecharNotificacoes(); atualizarContadorNotificacoes(s); }
      }
    });
    setTimeout(() => document.addEventListener("mousedown", cliqueFora), 0);
    const primeiro = qs("button", painel); if (primeiro) primeiro.focus();
  }

  function atualizarContadorNotificacoes(s) {
    const n = minhasNotificacoes(s).filter((x) => !x.lida).length;
    const btn = qs(".notif-btn");
    if (btn) {
      const dot = qs(".notif-dot", btn);
      if (n && dot) dot.textContent = n;
      else if (n) btn.insertAdjacentHTML("beforeend", `<span class="notif-dot">${n}</span>`);
      else if (dot) dot.remove();
      btn.setAttribute("aria-label", `Notificações${n ? `, ${n} não lidas` : ""}`);
    }
    qsa(".nav-link .count").forEach((c) => { if (n) c.textContent = n; else c.remove(); });
  }

  /** Perfil do profissional (modal com edição de contato). */
  function perfilProfissional(s) {
    const p = ConectaData.profissional(s.refId);
    const u = ConectaData.unidade(p.unidadeId);
    abrirModal({
      titulo: "Meu perfil profissional",
      corpo: `
        <div class="flex items-center gap-3 mb-0"><span class="avatar lg">${esc(iniciais(p.nome))}</span>
          <div><h3 class="mb-0">${esc(p.nome)}</h3><span class="muted small">${esc(p.cargo)} · ${esc(p.registro)}</span></div></div>
        <dl class="dl mt-3">
          <div><dt>Especialidade</dt><dd>${esc(p.especialidade)}</dd></div>
          <div><dt>Unidade de atuação</dt><dd>${esc(u.nome)}</dd></div>
          <div><dt>CPF</dt><dd>${esc(mascararCPF(p.cpf))}</dd></div>
          <div><dt>Status do acesso</dt><dd>${badge(p.ativo ? "Ativo" : "Inativo")}</dd></div>
        </dl>
        <form id="form-perfil-prof" class="form-grid mt-3" novalidate>
          <div class="field"><label for="pp-tel">Telefone</label><input class="input" id="pp-tel" name="telefone" value="${esc(p.telefone)}" required><span class="field-error" data-erro-de="pp-tel"></span></div>
          <div class="field"><label for="pp-email">E-mail</label><input class="input" id="pp-email" name="email" type="email" value="${esc(p.email)}" required><span class="field-error" data-erro-de="pp-email"></span></div>
        </form>
        <div class="alert alert-info mt-3 mb-0">${ico("shield-check")}<span>Suas permissões são definidas pelo administrador da rede: visualizar prontuários, registrar atendimentos, prescrever e solicitar exames.</span></div>`,
      acoes: [
        { label: "Fechar", classe: "btn-outline", onClick: "fechar" },
        { label: "Salvar alterações", classe: "btn-primary", icone: "save", onClick: (f, m) => {
          const form = qs("#form-perfil-prof", m);
          if (!validarFormulario(form, { email: (v) => (/^\S+@\S+\.\S+$/.test(v) ? "" : "E-mail inválido.") })) return;
          ConectaData.update("profissionais", p.id, dadosFormulario(form));
          toast("Dados de contato atualizados.");
          f();
        } }
      ]
    });
  }

  function perfilAdmin(s) {
    const a = ConectaData.getAll("administradores").find((x) => x.id === s.refId) || {};
    abrirModal({
      titulo: "Meu perfil",
      corpo: `<div class="flex items-center gap-3"><span class="avatar lg">${esc(iniciais(a.nome))}</span><div><h3 class="mb-0">${esc(a.nome)}</h3><span class="muted small">${esc(a.cargo)}</span></div></div>
        <dl class="dl mt-3"><div><dt>CPF</dt><dd>${esc(mascararCPF(a.cpf))}</dd></div><div><dt>E-mail</dt><dd>${esc(a.email)}</dd></div>
        <div><dt>Perfil de acesso</dt><dd>Administrador da rede</dd></div><div><dt>Autenticação em dois fatores</dt><dd>${badge("Ativo")}</dd></div></dl>
        <div class="alert alert-alerta mt-3 mb-0">${ico("eye-off")}<span>Administradores não têm acesso ao conteúdo clínico dos prontuários — apenas a dados de gestão e auditoria.</span></div>`
    });
  }

  async function sair() {
    const ok = await confirmar({ titulo: "Sair do Conecta", mensagem: "Deseja realmente encerrar sua sessão?", rotulo: "Sair" });
    if (ok) Auth.logout();
  }

  /* ------------------------------------------------------------------------
     8. Tela de carregamento
     ------------------------------------------------------------------------ */
  function esconderLoader() {
    const l = qs("#loader"); if (!l) return;
    let visto = false;
    try { visto = sessionStorage.getItem("conecta:loaderVisto") === "1"; sessionStorage.setItem("conecta:loaderVisto", "1"); } catch (e) { visto = true; }
    setTimeout(() => { l.classList.add("done"); setTimeout(() => l.remove(), 400); }, visto ? 0 : 650);
  }

  /* ------------------------------------------------------------------------
     9. Roteamento por página e inicialização
     ------------------------------------------------------------------------ */
  const manipuladores = [];
  /** Páginas registram sua inicialização: Conecta.pagina('historico', fn, 'paciente') */
  function pagina(nome, fn, perfil) { manipuladores.push({ nome, fn, perfil }); }

  /** Atualiza a URL e o item ativo do menu quando a aba da página muda. */
  function definirAba(aba) {
    const url = new URL(location.href);
    url.searchParams.set("aba", aba);
    history.replaceState(null, "", url);
    const paginaAtual = document.body.dataset.page;
    const links = qsa(`.nav-link[data-pagina-link="${paginaAtual}"]`);
    if (links.length < 2) return;
    const alvo = links.find((l) => l.dataset.abaLink === aba) || links.find((l) => !l.dataset.abaLink);
    links.forEach((l) => l.removeAttribute("aria-current"));
    if (alvo) alvo.setAttribute("aria-current", "page");
  }

  function iniciar() {
    ConectaData.seed();
    const nomePagina = document.body.dataset.page;
    let sessao = null;
    if (!["login", "home"].includes(nomePagina)) {
      const perfis = (document.body.dataset.roles || "").split(",").filter(Boolean);
      sessao = Auth.exigir(perfis);
      if (!sessao) return;
      montarShell(sessao);
      if (param("negado")) toast("Você não tem permissão para acessar aquela área.", "erro", "Acesso negado");
    }
    manipuladores
      .filter((m) => m.nome === nomePagina && (!m.perfil || (sessao && m.perfil === sessao.role)))
      .forEach((m) => { try { m.fn(sessao); } catch (e) { console.error(e); toast("Não foi possível carregar parte desta página.", "erro"); } });
    icones();
    esconderLoader();
  }

  document.addEventListener("DOMContentLoaded", iniciar);

  /* API pública usada pelos demais scripts */
  window.Conecta = {
    Data: ConectaData, Auth, Store,
    pagina, definirAba, icones, toast, abrirModal, confirmar, tabela, opcoes, iniciarAbas, validarFormulario, dadosFormulario,
    baixarArquivo, imprimirDocumento, registrarAuditoria, notificar, atualizarContadorNotificacoes,
    esc, ico, badge, tipoTag, ICONE_TIPO, qs, qsa, param, novoId,
    validarCPF, formatarCPF, mascararCPF, formatarCNS, mascararCNS, somenteDigitos,
    fmtData, fmtHora, fmtDataHora, diaMes, hojeISO, agoraISO, mesmoDia, calcIdade, tempoRelativo, iniciais, primeiroNome, parseData,
    MODELOS_RESULTADO, TIPOS_EXAME, ESPECIALIDADES, NOMES_PERFIL
  };
})();
