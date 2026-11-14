/* ==========================================================================
   CONECTA — Núcleo da aplicação (main.js)
   --------------------------------------------------------------------------
   Carregado em TODAS as páginas. Responsável por:
     1. Armazenamento local apenas para preferências de interface.
     2. Camada de dados (ConectaData): cache em memória alimentado pela API REST.
     3. Sessão/autenticação JWT (via api.js) e proteção de rotas por perfil.
     4. Utilitários (máscaras, datas, escape de HTML, badges).
     5. Componentes de interface (toast, modal, confirmação, tabelas).
     6. Estrutura comum dos painéis (menu lateral, cabeçalho, notificações).

   Os dados vêm do backend (NestJS + MySQL). O LocalStorage guarda somente
   preferências de interface (ex.: CPF lembrado, acessibilidade) — nunca dados de saúde.
   A auditoria (LGPD) é registrada pelo servidor em cada operação.
   ========================================================================== */
(function () {
  "use strict";

  const PREFIXO = "conecta:v1:";

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
    if (String(v || "").includes("*")) return String(v);
    const s = somenteDigitos(v).slice(0, 11);
    return s.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  };
  /** Máscara de privacidade: exibe apenas parte do CPF (LGPD). */
  const mascararCPF = (v) => {
    if (String(v || "").includes("*")) return String(v);
    const s = somenteDigitos(v);
    if (s.length !== 11) return "***.***.***-**";
    return `***.${s.slice(3, 6)}.***-${s.slice(9)}`;
  };
  const formatarCNS = (v) => (String(v || "").includes("*") ? String(v) : somenteDigitos(v).replace(/(\d{3})(\d{4})(\d{4})(\d{4})/, "$1 $2 $3 $4"));
  const mascararCNS = (v) => {
    if (String(v || "").includes("*")) return String(v);
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
     3. Catálogos de apoio (listas de seleção dos formulários)
     ------------------------------------------------------------------------ */
  /** Nomes de exames oferecidos nos formulários (o resultado é sempre informado pelo laboratório/profissional). */
  const TIPOS_EXAME = ["Hemograma completo", "Glicemia em jejum", "Hemoglobina glicada (HbA1c)", "Urina tipo I (EAS)", "Urocultura com antibiograma", "Perfil lipídico",
    "Creatinina", "TSH", "Ultrassonografia de abdome", "Eletrocardiograma", "Raio-X de tórax", "Espirometria", "Ácido úrico", "Vitamina D", "Tomografia de crânio", "Mamografia", "PSA total"];
  /** Preenchido com o catálogo do backend (GET /professionals/specialties) na inicialização. */
  const ESPECIALIDADES = [];

  /* ------------------------------------------------------------------------
     4. Camada de dados — cache em memória alimentado pela API REST
     ------------------------------------------------------------------------
     As páginas continuam lendo os dados de forma síncrona (getAll, getById, where),
     mas a fonte é o backend: os carregadores (load*) buscam na API e preenchem o cache.
     Toda gravação é feita por chamadas HTTP (ConectaApi) nas próprias páginas.
     ------------------------------------------------------------------------ */
  const Api = window.ConectaApi;
  const cache = {};
  const ConectaData = {
    getAll(colecao) { return cache[colecao] || []; },
    getObj(colecao) { return cache[colecao] || {}; },
    getById(colecao, id) { return this.getAll(colecao).find((x) => String(x.id) === String(id)) || null; },
    where(colecao, fn) { return this.getAll(colecao).filter(fn); },
    set(colecao, valor) { cache[colecao] = valor; return valor; },
    /** Insere ou substitui um item no cache após uma gravação bem-sucedida na API. */
    put(colecao, item) {
      const lista = this.getAll(colecao).filter((x) => String(x.id) !== String(item.id));
      lista.unshift(item); cache[colecao] = lista; return item;
    },
    drop(colecao, id) { cache[colecao] = this.getAll(colecao).filter((x) => String(x.id) !== String(id)); },
    /** Carrega uma lista paginada da API para o cache. */
    async fetch(colecao, path, query) { const r = await Api.list(path, query); cache[colecao] = r.items; cache[`${colecao}:meta`] = r.meta; return r.items; },
    meta(colecao) { return cache[`${colecao}:meta`] || {}; },
    // Atalhos de leitura (com valores neutros para registros fora do cache)
    unidade(id) { return this.getById("unidades", id) || { id, nome: "Unidade", tipo: "", endereco: "", cnes: "" }; },
    profissional(id) { return this.getById("profissionais", id) || { id, nome: "Profissional", especialidade: "", registro: "" }; },
    paciente(id) { return this.getById("pacientes", id); }
  };

  /* ------------------------------------------------------------------------
     5. Autenticação (JWT emitido pelo backend)
     ------------------------------------------------------------------------ */
  const ROTAS_INICIAIS = { paciente: "paciente.html", medico: "medico.html", admin: "administrador.html" };
  const NOMES_PERFIL = { paciente: "Paciente", medico: "Profissional de saúde", admin: "Administrador" };
  /** O backend usa "profissional"; as páginas do frontend usam "medico" para o ambiente do profissional. */
  const papelFront = (role) => (role === "profissional" ? "medico" : role);
  const sessaoDe = (u) => ({
    role: papelFront(u.role), refId: u.refId, nome: u.nome, cpf: u.cpf, unidadeId: u.unidadeId || "", cargo: u.cargo || null,
    pacienteId: u.pacienteId, profissionalId: u.profissionalId, permissoes: u.permissoes || [], especialidade: u.especialidade, registro: u.registro,
    unidadeNome: u.unidadeNome, email: u.email, cargoTitulo: u.cargoTitulo, userId: u.id
  });

  const Auth = {
    sessao() { const u = Api.Session.user(); return u && Api.Session.token() ? sessaoDe(u) : null; },
    /** Login real: POST /auth/login. Retorna { sessao, destino } ou { erro }. */
    async login(cpf, senha, perfilEsperado) {
      try {
        const r = await Api.post("/auth/login", { cpf, senha, perfil: perfilEsperado }, { auth: false });
        Api.Session.save(r.accessToken, r.user);
        try { sessionStorage.removeItem("conecta:loaderVisto"); } catch (e) { /* ignora */ }
        const s = sessaoDe(r.user);
        return { sessao: s, destino: "pages/" + ROTAS_INICIAIS[s.role] };
      } catch (e) {
        return { erro: e.message, codigo: e.code };
      }
    },
    async logout() {
      try { await Api.post("/auth/logout", {}); } catch (e) { /* sessão já encerrada no servidor */ }
      Api.Session.clear();
      location.href = "../login.html";
    },
    /** Protege uma página: exige sessão e perfil autorizado (o backend revalida tudo a cada requisição). */
    exigir(perfis) {
      const s = this.sessao();
      if (!s) { location.replace("../login.html?expirada=1"); return null; }
      if (perfis && perfis.length && !perfis.includes(s.role)) { location.replace(ROTAS_INICIAIS[s.role] + "?negado=1"); return null; }
      return s;
    },
    /** Atualiza os dados da sessão a partir do backend (GET /auth/me). */
    async atualizar() { const u = await Api.get("/auth/me"); Api.Session.save(null, u); return sessaoDe(u); }
  };

  /** Mensagem amigável para erros da API (e retorno do texto para exibição em formulários). */
  function erroApi(e, titulo) {
    const msg = e && e.message ? e.message : "Erro inesperado.";
    toast(msg, "erro", titulo || (e && e.status === 403 ? "Acesso negado" : "Não foi possível concluir"));
    return msg;
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
    if (s.role === "paciente") return { nome: s.nome, sub: "Paciente" };
    if (s.role === "medico") return { nome: s.nome, sub: `${s.especialidade || s.cargo || "Profissional"} · ${s.unidadeNome || ConectaData.unidade(s.unidadeId).nome}` };
    return { nome: s.nome, sub: s.cargoTitulo || "Administrador" };
  }

  /** Notificações do usuário logado (carregadas de GET /notifications). */
  const minhasNotificacoes = () => ConectaData.getAll("notificacoes").slice().sort((a, b) => String(b.data).localeCompare(String(a.data)));
  async function carregarNotificacoes() {
    try { await ConectaData.fetch("notificacoes", "/notifications", { limit: 50 }); } catch (e) { ConectaData.set("notificacoes", []); }
  }

  /** Monta o menu lateral e o cabeçalho ao redor do <main> existente na página. */
  function montarShell(s) {
    const main = qs("main");
    const pagina = document.body.dataset.page;
    const abaAtual = param("aba") || document.body.dataset.abaPadrao || "";
    const usuario = dadosUsuario(s);
    const naoLidas = minhasNotificacoes().filter((n) => !n.lida).length;
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
          <span>${ico("lock")} Conecta · Dados pessoais protegidos (LGPD) — acessos aos prontuários são auditados.</span>
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
    const lista = minhasNotificacoes();
    const painel = document.createElement("section");
    painel.className = "notif-panel";
    painel.setAttribute("aria-label", "Notificações");
    painel.innerHTML = `
      <header><h2>Notificações</h2><button type="button" class="btn btn-ghost btn-sm" data-marcar-todas>${ico("check-check")} Marcar todas como lidas</button></header>
      ${lista.length ? `<ul class="notif-list">${lista.map((n) => `
        <li><button type="button" class="notif-item ${n.lida ? "" : "unread"}" data-notif="${esc(n.id)}">
          <span class="ni-ico">${ico(n.icone || "bell")}</span>
          <span><span class="ni-title">${esc(n.titulo)}</span><span class="ni-text">${esc(n.texto)}</span><span class="ni-time">${esc(tempoRelativo(n.data))}</span></span>
        </button></li>`).join("")}</ul>` : `<div class="empty">${ico("bell-off")}<span>Nenhuma notificação.</span></div>`}`;
    qs(".topbar").appendChild(painel);
    qs(".notif-btn").setAttribute("aria-expanded", "true");
    icones();
    painel.addEventListener("click", async (e) => {
      if (e.target.closest("[data-marcar-todas]")) {
        try {
          await Api.patch("/notifications/read-all", {});
          ConectaData.set("notificacoes", lista.map((n) => Object.assign({}, n, { lida: true })));
          atualizarContadorNotificacoes(s);
          qsa(".notif-item", painel).forEach((el) => el.classList.remove("unread"));
          toast("Todas as notificações foram marcadas como lidas.", "info");
        } catch (err) { erroApi(err); }
        return;
      }
      const item = e.target.closest("[data-notif]");
      if (item) {
        const n = ConectaData.getById("notificacoes", item.dataset.notif);
        try { if (n && !n.lida) { await Api.patch(`/notifications/${n.id}/read`, {}); ConectaData.put("notificacoes", Object.assign({}, n, { lida: true })); } } catch (err) { /* segue para o link */ }
        if (n && n.link) location.href = n.link; else { fecharNotificacoes(); atualizarContadorNotificacoes(s); }
      }
    });
    setTimeout(() => document.addEventListener("mousedown", cliqueFora), 0);
    const primeiro = qs("button", painel); if (primeiro) primeiro.focus();
  }

  function atualizarContadorNotificacoes() {
    const n = minhasNotificacoes().filter((x) => !x.lida).length;
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

  /** Perfil do profissional (somente leitura: cadastro e permissões são geridos pelo gestor da rede). */
  function perfilProfissional(s) {
    const u = ConectaData.unidade(s.unidadeId);
    abrirModal({
      titulo: "Meu perfil profissional",
      corpo: `
        <div class="flex items-center gap-3 mb-0"><span class="avatar lg">${esc(iniciais(s.nome))}</span>
          <div><h3 class="mb-0">${esc(s.nome)}</h3><span class="muted small">${esc(s.cargo || "")} · ${esc(s.registro || "")}</span></div></div>
        <dl class="dl mt-3">
          <div><dt>Especialidade</dt><dd>${esc(s.especialidade || "—")}</dd></div>
          <div><dt>Unidade de atuação</dt><dd>${esc(s.unidadeNome || u.nome)}</dd></div>
          <div><dt>CPF</dt><dd>${esc(mascararCPF(s.cpf))}</dd></div>
          <div><dt>E-mail</dt><dd>${esc(s.email || "—")}</dd></div>
        </dl>
        <div class="alert alert-info mt-3 mb-0">${ico("shield-check")}<span>Seus dados cadastrais e permissões (matriz de acesso do perfil <strong>${esc(s.cargo || "")}</strong>) são definidos pelo gestor da rede.</span></div>`
    });
  }

  function perfilAdmin(s) {
    abrirModal({
      titulo: "Meu perfil",
      corpo: `<div class="flex items-center gap-3"><span class="avatar lg">${esc(iniciais(s.nome))}</span><div><h3 class="mb-0">${esc(s.nome)}</h3><span class="muted small">${esc(s.cargoTitulo || "Administrador")}</span></div></div>
        <dl class="dl mt-3"><div><dt>CPF</dt><dd>${esc(mascararCPF(s.cpf))}</dd></div><div><dt>E-mail</dt><dd>${esc(s.email || "—")}</dd></div>
        <div class="full"><dt>Perfil de acesso</dt><dd>Administrador da rede</dd></div></dl>
        <div class="alert alert-alerta mt-3 mb-0">${ico("eye-off")}<span>Administradores não têm acesso ao conteúdo clínico dos prontuários — apenas a dados de gestão e auditoria.</span></div>`
    });
  }

  async function sair() {
    const ok = await confirmar({ titulo: "Sair do Conecta", mensagem: "Deseja realmente encerrar sua sessão?", rotulo: "Sair" });
    if (ok) await Auth.logout();
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

  /** Dados comuns a todas as áreas autenticadas: unidades, profissionais, especialidades e notificações. */
  async function carregarBase() {
    const tarefas = [
      ConectaData.fetch("unidades", "/health-units", { limit: 500 }),
      ConectaData.fetch("profissionais", "/professionals", { limit: 500 }),
      Api.get("/professionals/specialties").then((l) => { ESPECIALIDADES.splice(0, ESPECIALIDADES.length, ...l.map((x) => x.nome)); }),
      carregarNotificacoes()
    ];
    await Promise.all(tarefas);
  }

  async function iniciar() {
    const nomePagina = document.body.dataset.page;
    let sessao = null;
    if (!["login", "home"].includes(nomePagina)) {
      const perfis = (document.body.dataset.roles || "").split(",").filter(Boolean);
      sessao = Auth.exigir(perfis);
      if (!sessao) return;
      try {
        sessao = await Auth.atualizar();
        if (perfis.length && !perfis.includes(sessao.role)) { location.replace(ROTAS_INICIAIS[sessao.role] + "?negado=1"); return; }
        await carregarBase();
      } catch (e) {
        esconderLoader();
        if (e.status !== 401) toast(e.message, "erro", "Falha ao carregar dados");
        return;
      }
      montarShell(sessao);
      if (param("negado")) toast("Você não tem permissão para acessar aquela área.", "erro", "Acesso negado");
    }
    for (const m of manipuladores.filter((x) => x.nome === nomePagina && (!x.perfil || (sessao && x.perfil === sessao.role)))) {
      try { await m.fn(sessao); }
      catch (e) { console.error(e); erroApi(e, "Não foi possível carregar parte desta página"); }
    }
    icones();
    esconderLoader();
  }

  document.addEventListener("DOMContentLoaded", iniciar);

  /* API pública usada pelos demais scripts */
  window.Conecta = {
    Data: ConectaData, Auth, Store,
    pagina, definirAba, icones, toast, abrirModal, confirmar, tabela, opcoes, iniciarAbas, validarFormulario, dadosFormulario,
    Api, erroApi, carregarNotificacoes, baixarArquivo, imprimirDocumento, atualizarContadorNotificacoes,
    esc, ico, badge, tipoTag, ICONE_TIPO, qs, qsa, param, novoId,
    validarCPF, formatarCPF, mascararCPF, formatarCNS, mascararCNS, somenteDigitos,
    fmtData, fmtHora, fmtDataHora, diaMes, hojeISO, agoraISO, mesmoDia, calcIdade, tempoRelativo, iniciais, primeiroNome, parseData,
    TIPOS_EXAME, ESPECIALIDADES, NOMES_PERFIL, papelFront
  };
})();
