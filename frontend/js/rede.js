/* ==========================================================================
   CONECTA — Rede de Atendimento (rede.js)
   Diagrama interativo (exemplo ilustrativo) mostrando como o histórico clínico
   acompanha o paciente entre UBS, UPA, hospitais, laboratórios e clínicas.
   Diretório de unidades e painel de integração usam dados reais da API:
   GET /health-units e GET /integrations/ministerio-saude/status | sync-logs.
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

  C.pagina("rede", async function (s) {
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
      const a = { diagnostico: "Infecção do trato urinário (CID N39.0)" };
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

    /* ---- Painel de integração com a API de Dados Abertos do Ministério da Saúde ---- */
    const Api = C.Api;
    const ehAdmin = s.role === "admin";
    const ROTULO = { idle: "Aguardando", running: "Em execução", success: "Concluída", partial: "Parcial", failed: "Falhou" };
    const badgeSync = (st) => `<span class="badge badge-${{ success: "sucesso", partial: "alerta", failed: "perigo", running: "info" }[st] || "neutro"}">${esc(ROTULO[st] || st || "Nunca executada")}</span>`;
    async function renderIntegracao() {
      if (s.role === "paciente") return;
      let st;
      try { st = await Api.get("/integrations/ministerio-saude/status"); }
      catch (e) { qs("#tabela-integracao").innerHTML = `<div class="alert alert-perigo">${esc(e.message)}</div>`; return; }
      const api = st.api;
      const base = st.baseLocal;
      qs("#tabela-integracao").innerHTML = `
        <div class="alert ${api.disponivel ? "alert-sucesso" : "alert-perigo"}">${ico(api.disponivel ? "check-circle-2" : "wifi-off")}<span>
          API oficial (${esc(api.baseUrl)}): <strong>${api.disponivel ? `disponível — ${api.latenciaMs} ms` : "indisponível"}</strong>${api.erro ? ` · ${esc(api.erro)}` : ""}.
          Base local: ${Number(base.estabelecimentos).toLocaleString("pt-BR")} estabelecimentos, ${Number(base.municipios).toLocaleString("pt-BR")} municípios, ${base.tiposUnidade} tipos de unidade, ${Number(base.profissionaisCnes).toLocaleString("pt-BR")} vínculos de profissionais, ${Number(base.hospitaisLeitos).toLocaleString("pt-BR")} versões de hospitais/leitos e ${base.endpointsCatalogados} endpoints catalogados.</span></div>
        <div id="tabela-conjuntos"></div>
        ${ehAdmin ? `<h3 class="mt-3">Últimas execuções</h3><div id="tabela-logs"></div>` : ""}`;
      C.tabela(qs("#tabela-conjuntos"), {
        rotulo: "Conjuntos de dados sincronizados", linhas: st.conjuntos,
        colunas: [
          { titulo: "Conjunto", render: (c) => `<span class="cell-strong">${esc(c.nome)}</span><span class="cell-sub mono">${esc(c.endpoint)}</span>` },
          { titulo: "Situação", render: (c) => badgeSync(c.sincronizacao && c.sincronizacao.status) },
          { titulo: "Última sincronização bem-sucedida", render: (c) => (c.sincronizacao && c.sincronizacao.lastSuccessAt ? esc(C.fmtDataHora(c.sincronizacao.lastSuccessAt)) : "—") },
          { titulo: "Último erro", render: (c) => `<span class="small">${esc((c.sincronizacao && c.sincronizacao.lastError) || "—")}</span>` },
          ...(ehAdmin ? [{ titulo: "Ação", render: (c) => `<button type="button" class="btn btn-outline btn-sm" data-sync="${esc(c.codigo)}" ${c.sincronizacao && c.sincronizacao.status === "running" ? "disabled" : ""}>${ico("refresh-cw")} Sincronizar</button>` }] : [])
        ]
      });
      if (ehAdmin) {
        const logs = await Api.list("/integrations/ministerio-saude/sync-logs", { limit: 10 });
        C.tabela(qs("#tabela-logs"), {
          rotulo: "Execuções de sincronização", linhas: logs.items, vazio: "Nenhuma sincronização executada ainda.",
          colunas: [
            { titulo: "Início", render: (l) => `${esc(C.fmtDataHora(l.startedAt))}<span class="cell-sub">${esc(l.trigger)} · ${esc(l.mode)}</span>` },
            { titulo: "Conjunto", render: (l) => esc(l.dataset) },
            { titulo: "Situação", render: (l) => badgeSync(l.status) },
            { titulo: "Registros", render: (l) => `<span class="small">${l.recordsFetched} lidos · ${l.recordsInserted} novos · ${l.recordsUpdated} alterados · ${l.recordsUnchanged} inalterados${l.recordsInvalid ? ` · ${l.recordsInvalid} inválidos` : ""}</span><span class="cell-sub">${l.requestsMade} requisição(ões)</span>` },
            { titulo: "Erros", render: (l) => (l.errorCount ? `<span class="small">${esc((l.errors || [])[0] || "")}</span>` : "—") },
            { titulo: "Ação", render: (l) => (["failed", "partial"].includes(l.status) ? `<button type="button" class="btn btn-secondary btn-sm" data-reprocessar="${esc(l.id)}">${ico("rotate-ccw")} Reprocessar</button>` : "") }
          ]
        });
      }
      C.icones();
    }
    const painel = qs("#painel-integracao");
    painel.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-sync]"); const r = e.target.closest("[data-reprocessar]");
      try {
        if (b) { b.disabled = true; await Api.post("/integrations/ministerio-saude/sync", { dataset: b.dataset.sync }); C.toast("Sincronização iniciada. Acompanhe o andamento nesta tela.", "info"); setTimeout(renderIntegracao, 1500); }
        if (r) { r.disabled = true; await Api.post("/integrations/ministerio-saude/reprocess", { logId: r.dataset.reprocessar }); C.toast("Reprocessamento iniciado.", "info"); setTimeout(renderIntegracao, 1500); }
      } catch (err) { C.erroApi(err); renderIntegracao(); }
    });
    const btnSync = qs("#btn-sincronizar");
    if (!ehAdmin) btnSync.classList.add("hidden");
    btnSync.innerHTML = `${ico("refresh-cw")} Sincronizar tudo`;
    btnSync.addEventListener("click", async () => {
      btnSync.disabled = true;
      try { await Api.post("/integrations/ministerio-saude/sync", { dataset: "todos" }); C.toast("Sincronização completa iniciada em segundo plano.", "info"); }
      catch (err) { C.erroApi(err); }
      setTimeout(() => { btnSync.disabled = false; renderIntegracao(); }, 2000);
    });
    qs("#painel-integracao .card-header h2").lastChild.textContent = " Integração com a API de Dados Abertos do Ministério da Saúde";

    renderUnidades();
    await renderIntegracao();
    aplicarPasso(-1, false);
    requestAnimationFrame(desenharLinhas);
    let espera; window.addEventListener("resize", () => { clearTimeout(espera); espera = setTimeout(desenharLinhas, 120); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(desenharLinhas);
  });
})();
