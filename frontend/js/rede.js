/* ==========================================================================
   CONECTA — Rede de Atendimento (rede.js)
   Diagrama interativo mostrando como o histórico clínico acompanha o
   paciente entre UBS, UPA, hospitais, laboratórios e clínicas.
   IMPORTANTE: a integração com o SUS é SIMULADA, com dados fictícios.
   ========================================================================== */
(function () {
  "use strict";
  const C = window.Conecta;
  const { esc, ico, badge, tipoTag, qs, qsa } = C;
  const D = C.Data;

  /** Etapas da demonstração: nós e conexões destacados em cada passo. */
  const PASSOS = [
    { titulo: "O paciente chega à UPA", texto: "Maria procura a UPA Central com febre e dor abdominal.", nos: ["UPA"], linhas: [], registro: null },
    { titulo: "O médico realiza o atendimento", texto: "A Dra. Juliana avalia a paciente. Antes de medicar, consulta o Conecta e vê a alergia a dipirona registrada pela UBS.", nos: ["UPA"], linhas: [], registro: null },
    { titulo: "Os dados clínicos são registrados no Conecta", texto: "Queixa, sinais vitais, diagnóstico, prescrição e exames solicitados são enviados de forma segura.", nos: ["UPA", "hub"], linhas: ["UPA"], registro: "envio" },
    { titulo: "O registro passa a compor o histórico", texto: "O atendimento entra na linha do tempo única da paciente, identificado com a unidade de origem.", nos: ["hub"], linhas: [], registro: "historico" },
    { titulo: "Dias depois, a paciente procura a UBS", texto: "Maria vai à UBS Jardim das Flores para o retorno.", nos: ["UBS"], linhas: [], registro: "historico" },
    { titulo: "O médico da UBS pesquisa a paciente", texto: "O Dr. Ricardo busca pelo CPF. O acesso é verificado conforme o perfil e registrado na auditoria.", nos: ["UBS", "hub"], linhas: ["UBS"], registro: "auditoria" },
    { titulo: "Ele consulta o atendimento anterior da UPA", texto: "Conforme suas permissões, vê o registro da UPA: diagnóstico de ITU e antibiótico prescrito.", nos: ["UBS", "hub", "UPA"], linhas: ["UBS", "UPA"], registro: "consulta" },
    { titulo: "Exames e informações clínicas ficam disponíveis", texto: "Os resultados do laboratório (EAS e urocultura) aparecem no prontuário, sem repetir exames.", nos: ["Laboratório", "hub", "UBS"], linhas: ["Laboratório", "UBS"], registro: "exames" },
    { titulo: "A paciente consulta o próprio histórico", texto: "Pelo Conecta, Maria acessa atendimentos, exames e receitas e vê quem consultou seu prontuário.", nos: ["Paciente", "hub"], linhas: ["Paciente"], registro: "paciente" }
  ];

  const NOS = [
    { id: "UBS", rotulo: "UBS", sub: "Atenção básica", icone: "house-plus" },
    { id: "Paciente", rotulo: "Paciente", sub: "Acesso pelo app", icone: "smartphone" },
    { id: "UPA", rotulo: "UPA", sub: "Urgência 24h", icone: "siren" },
    { id: "Hospital", rotulo: "Hospital", sub: "Internações e cirurgias", icone: "hospital" },
    { id: "hub", rotulo: "Conecta", sub: "Prontuário integrado", icone: "share-2" },
    { id: "Laboratório", rotulo: "Laboratório", sub: "Exames e laudos", icone: "flask-conical" },
    { id: "Clínica", rotulo: "Clínica especializada", sub: "Especialidades", icone: "stethoscope" }
  ];

  C.pagina("rede", function (s) {
    const diagrama = qs("#diagrama");
    const svg = qs("#diagrama-linhas");
    const unidades = D.getAll("unidades");

    // Ajustes de título conforme o perfil
    if (s.role === "paciente") { qs("#rede-titulo").textContent = "Unidades de saúde"; qs("#rede-sub").textContent = "Conheça a rede integrada e veja como seu histórico acompanha você em todas as unidades."; }
    if (s.role === "admin") { qs("#rede-titulo").textContent = "Integrações da rede"; }
    qs("#painel-integracao").classList.toggle("hidden", s.role === "paciente");

    /* ---- Monta os nós do diagrama ---- */
    diagrama.insertAdjacentHTML("beforeend", NOS.map((n) => {
      const qtd = n.id === "hub" || n.id === "Paciente" ? "" : `<span class="node-count">${unidades.filter((u) => u.tipo === n.id && u.integrada).length} integrada(s)</span>`;
      return `<div class="node node-${n.id === "hub" ? "hub" : "unit"} pos-${n.id.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()}" data-no="${n.id}">
        <span class="node-ico ${n.id !== "hub" && n.id !== "Paciente" ? "tipo-" + n.id : ""}">${ico(n.icone)}</span>
        <span class="node-txt"><strong>${esc(n.rotulo)}</strong><small>${esc(n.sub)}</small>${qtd}</span>
      </div>`;
    }).join(""));

    /** Desenha as linhas do centro (hub) até cada nó, a partir das posições reais na tela. */
    function desenharLinhas() {
      const caixa = diagrama.getBoundingClientRect();
      const centro = (el) => { const r = el.getBoundingClientRect(); return { x: r.left - caixa.left + r.width / 2, y: r.top - caixa.top + r.height / 2 }; };
      const hub = centro(qs('[data-no="hub"]', diagrama));
      svg.setAttribute("viewBox", `0 0 ${caixa.width} ${caixa.height}`);
      svg.innerHTML = NOS.filter((n) => n.id !== "hub").map((n) => {
        const c = centro(qs(`[data-no="${n.id}"]`, diagrama));
        return `<line class="link" data-linha="${n.id}" x1="${hub.x}" y1="${hub.y}" x2="${c.x}" y2="${c.y}"></line>
                <circle class="packet" data-pacote="${n.id}" r="6" cx="${c.x}" cy="${c.y}"><animate attributeName="cx" values="${c.x};${hub.x}" dur="1.4s" repeatCount="indefinite"/><animate attributeName="cy" values="${c.y};${hub.y}" dur="1.4s" repeatCount="indefinite"/></circle>`;
      }).join("");
      aplicarPasso(passo, false);
    }

    /* ---- Lista de etapas ---- */
    qs("#passos").innerHTML = PASSOS.map((p, i) => `<li><button type="button" class="step" data-passo="${i}"><span class="step-n">${i + 1}</span><span><strong>${esc(p.titulo)}</strong><small>${esc(p.texto)}</small></span></button></li>`).join("");

    /** Cartão de "registro" que evolui durante a demonstração. */
    function cartaoRegistro(tipo) {
      const a = D.getById("atendimentos", "a1") || {};
      const mapa = {
        envio: `<span class="rec-tag">${ico("upload-cloud")} Enviando registro…</span><strong>UPA Central · 10/11/2026 14:35</strong><span>Febre e dor abdominal → ${esc(a.diagnostico || "ITU")}</span>`,
        historico: `<span class="rec-tag ok">${ico("check-circle-2")} Registrado no histórico</span><strong>Linha do tempo de Maria A. Souza</strong><span>6 registros de 5 unidades diferentes</span>`,
        auditoria: `<span class="rec-tag warn">${ico("shield-check")} Acesso verificado e auditado</span><strong>Dr. Ricardo Almeida · UBS Jardim das Flores</strong><span>Perfil Médico — permissão "Visualizar prontuário"</span>`,
        consulta: `<span class="rec-tag ok">${ico("eye")} Registro da UPA visualizado</span><strong>${esc(a.diagnostico || "ITU")}</strong><span>Prescrição: Nitrofurantoína 100 mg 6/6h · 7 dias</span>`,
        exames: `<span class="rec-tag ok">${ico("flask-conical")} Exames disponíveis</span><strong>Urina tipo I (EAS) — alterado</strong><span>Urocultura: em análise no Laboratório Municipal</span>`,
        paciente: `<span class="rec-tag ok">${ico("smartphone")} Histórico no app do paciente</span><strong>Maria vê seus atendimentos e exames</strong><span>Notificação: "Seu prontuário foi acessado por Dr. Ricardo"</span>`
      };
      return tipo ? mapa[tipo] : `<span class="rec-tag">${ico("file-plus-2")} Aguardando registro</span><strong>Nenhum dado enviado ainda</strong><span>O registro será criado após o atendimento.</span>`;
    }

    let passo = -1; let timer = null;
    function aplicarPasso(i, anunciar = true) {
      passo = i;
      const p = PASSOS[i];
      qsa(".node", diagrama).forEach((n) => n.classList.toggle("active", !!p && p.nos.includes(n.dataset.no)));
      qsa(".link", svg).forEach((l) => l.classList.toggle("active", !!p && p.linhas.includes(l.dataset.linha)));
      qsa(".packet", svg).forEach((c) => c.classList.toggle("show", !!p && p.linhas.includes(c.dataset.pacote)));
      qsa(".step").forEach((b, k) => { b.classList.toggle("active", k === i); b.classList.toggle("done", k < i); b.setAttribute("aria-current", k === i ? "step" : "false"); });
      qs("#passo-atual").innerHTML = p ? `<span class="step-n">${i + 1}</span><div><strong>${esc(p.titulo)}</strong><p class="mb-0">${esc(p.texto)}</p></div>` : `<span class="step-n">${ico("play")}</span><div><strong>Clique em "Iniciar demonstração"</strong><p class="mb-0">Acompanhe, passo a passo, o caminho do histórico clínico da paciente Maria entre as unidades.</p></div>`;
      qs("#registro-demo").innerHTML = cartaoRegistro(p ? p.registro : null);
      qs("#progresso-demo").style.width = `${p ? ((i + 1) / PASSOS.length) * 100 : 0}%`;
      qs("#btn-anterior").disabled = i <= 0;
      qs("#btn-proximo").disabled = i >= PASSOS.length - 1;
      C.icones();
      if (anunciar && p) qs("#anuncio").textContent = `Etapa ${i + 1} de ${PASSOS.length}: ${p.titulo}`;
    }
    function parar() { clearInterval(timer); timer = null; qs("#btn-play").innerHTML = `${ico("play")} ${passo >= 0 && passo < PASSOS.length - 1 ? "Continuar" : "Iniciar demonstração"}`; C.icones(); }
    function tocar() {
      if (passo >= PASSOS.length - 1) passo = -1;
      aplicarPasso(passo + 1);
      timer = setInterval(() => { if (passo >= PASSOS.length - 1) { parar(); C.toast("Demonstração concluída: o histórico acompanhou a paciente em toda a rede.", "sucesso"); return; } aplicarPasso(passo + 1); }, 3200);
      qs("#btn-play").innerHTML = `${ico("pause")} Pausar`; C.icones();
    }
    qs("#btn-play").addEventListener("click", () => (timer ? parar() : tocar()));
    qs("#btn-anterior").addEventListener("click", () => { parar(); aplicarPasso(Math.max(0, passo - 1)); });
    qs("#btn-proximo").addEventListener("click", () => { parar(); aplicarPasso(Math.min(PASSOS.length - 1, passo + 1)); });
    qs("#btn-reiniciar").addEventListener("click", () => { parar(); aplicarPasso(-1); qs("#btn-play").innerHTML = `${ico("play")} Iniciar demonstração`; C.icones(); });
    qs("#passos").addEventListener("click", (e) => { const b = e.target.closest("[data-passo]"); if (b) { parar(); aplicarPasso(Number(b.dataset.passo)); } });

    // Clique em um nó: mostra as unidades daquele tipo
    diagrama.addEventListener("click", (e) => {
      const n = e.target.closest(".node-unit"); if (!n) return;
      const tipo = n.dataset.no;
      if (tipo === "Paciente") { C.toast("O paciente acessa o próprio histórico pelo Conecta, com notificações a cada acesso ao prontuário.", "info"); return; }
      qs("#filtro-tipo").value = tipo; renderUnidades();
      qs("#lista-unidades").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    qsa(".node-unit", diagrama).forEach((n) => { n.tabIndex = 0; n.setAttribute("role", "button"); n.setAttribute("aria-label", `${n.dataset.no}: ver unidades`); n.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); n.click(); } }); });

    /* ---- Diretório de unidades ---- */
    function renderUnidades() {
      const tipo = qs("#filtro-tipo").value; const t = qs("#filtro-unidade").value.toLowerCase();
      const lista = D.getAll("unidades").filter((u) => (!tipo || u.tipo === tipo) && (!t || `${u.nome} ${u.endereco}`.toLowerCase().includes(t)));
      qs("#lista-unidades").innerHTML = lista.length ? lista.map((u) => `
        <article class="dir-card">
          <div class="flex items-center gap-2">${tipoTag(u.tipo)} ${badge(u.status)}</div>
          <h3>${esc(u.nome)}</h3>
          <p class="small muted mb-0">${ico("map-pin")} ${esc(u.endereco)}</p>
          <p class="small muted mb-0">${ico("clock")} ${esc(u.horario)} · ${ico("phone")} ${esc(u.telefone)}</p>
          <button type="button" class="btn btn-outline btn-sm" data-unidade="${u.id}">${ico("info")} Detalhes</button>
        </article>`).join("") : `<div class="empty">${ico("building")}<span>Nenhuma unidade encontrada.</span></div>`;
      C.icones();
    }
    qs("#filtro-tipo").addEventListener("change", renderUnidades);
    qs("#filtro-unidade").addEventListener("input", renderUnidades);
    qs("#lista-unidades").addEventListener("click", (e) => {
      const b = e.target.closest("[data-unidade]"); if (!b) return;
      const u = D.unidade(b.dataset.unidade);
      const profs = D.getAll("profissionais").filter((p) => p.unidadeId === u.id && p.ativo);
      C.abrirModal({ titulo: u.nome, corpo: `<dl class="dl">
        <div><dt>Tipo</dt><dd>${tipoTag(u.tipo)}</dd></div><div><dt>Integração</dt><dd>${badge(u.status)}</dd></div>
        <div class="full"><dt>Endereço</dt><dd>${esc(u.endereco)}</dd></div>
        <div><dt>Telefone</dt><dd>${esc(u.telefone)}</dd></div><div><dt>Funcionamento</dt><dd>${esc(u.horario)}</dd></div>
        <div><dt>CNES (fictício)</dt><dd>${esc(u.cnes)}</dd></div><div><dt>Profissionais ativos</dt><dd>${profs.length}</dd></div>
        <div class="full"><dt>Especialidades disponíveis</dt><dd>${[...new Set(profs.map((p) => p.especialidade))].map((e) => `<span class="chip">${esc(e)}</span>`).join("") || "—"}</dd></div></dl>` });
    });

    /* ---- Painel de status das integrações (profissional e administrador) ---- */
    function renderIntegracao() {
      const agora = Date.now();
      C.tabela(qs("#tabela-integracao"), {
        rotulo: "Status das integrações", linhas: D.getAll("unidades"),
        colunas: [
          { titulo: "Unidade", render: (u) => `<span class="cell-strong">${esc(u.nome)}</span>` },
          { titulo: "Tipo", render: (u) => tipoTag(u.tipo) },
          { titulo: "Status", render: (u) => badge(u.status) },
          { titulo: "Última sincronização", render: (u, i) => (u.integrada ? esc(C.tempoRelativo(new Date(agora - ((u.cnes % 9) + 1) * 60000).toISOString())) : "—") },
          { titulo: "Registros hoje", render: (u) => (u.integrada ? String(Math.round(u.volume / 30)) : "0") }
        ]
      });
    }
    qs("#btn-sincronizar").addEventListener("click", (e) => {
      const b = e.currentTarget; b.disabled = true; b.innerHTML = `${ico("loader-2")} Sincronizando…`; C.icones();
      setTimeout(() => { b.disabled = false; b.innerHTML = `${ico("refresh-cw")} Sincronizar agora`; renderIntegracao(); C.icones(); C.toast("Sincronização simulada concluída com todas as unidades integradas.", "sucesso"); }, 1200);
    });

    renderUnidades();
    renderIntegracao();
    aplicarPasso(-1, false);
    requestAnimationFrame(desenharLinhas);
    let espera; window.addEventListener("resize", () => { clearTimeout(espera); espera = setTimeout(desenharLinhas, 120); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(desenharLinhas);
  });
})();
