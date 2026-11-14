/* ==========================================================================
   CONECTA — Área do profissional de saúde (medico.js)
   Dashboard, busca de pacientes, perfil clínico (prontuário integrado),
   prescrições e encaminhamentos — todos via API REST.
   O servidor autoriza cada acesso a prontuário (vínculo assistencial, consentimento
   ou acesso de emergência justificado) e grava a auditoria (LGPD).
   ========================================================================== */
(function () {
  "use strict";
  const C = window.Conecta;
  const { esc, ico, badge, tipoTag, qs, qsa } = C;
  const D = C.Data;
  const K = () => window.ConectaClinico;
  const porDataDesc = (a, b) => b.data.localeCompare(a.data);
  const normalizar = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  const Api = C.Api;

  /** Utilitário: <select> de pacientes reutilizado em vários formulários. */
  function opcoesPacientes(selecionado) {
    return C.opcoes(D.getAll("pacientes").slice().sort((a, b) => a.nome.localeCompare(b.nome)), selecionado, (p) => `${p.nome} — CPF ${C.mascararCPF(p.cpf)}`);
  }
  /** Lista de identificação de pacientes (dados cadastrais mascarados) para os formulários. */
  const carregarPacientes = () => D.fetch("pacientes", "/patients", { limit: 500 });

  /**
   * Abre o prontuário clínico (GET /patients/:id). Se o servidor exigir justificativa
   * (sem vínculo assistencial/consentimento), pede o motivo do acesso de emergência.
   */
  async function obterProntuario(id, extra = {}) {
    try { return { paciente: await Api.get(`/patients/${id}`, extra), justificativa: extra.justificativa }; }
    catch (e) {
      if (e.code !== "JUSTIFICATION_REQUIRED") throw e;
      const justificativa = await pedirJustificativa(e.message);
      if (!justificativa) throw e;
      return obterProntuario(id, { ...extra, justificativa });
    }
  }
  function pedirJustificativa(mensagem) {
    return new Promise((resolve) => {
      let feito = false;
      const m = C.abrirModal({
        titulo: "Acesso de emergência ao prontuário",
        corpo: `<div class="alert alert-alerta">${ico("shield-alert")}<span>${esc(mensagem)}</span></div>
          <form id="form-just" novalidate><div class="field"><label for="just-txt">Justificativa clínica (registrada na auditoria)</label>
          <textarea class="textarea" id="just-txt" name="justificativa" required minlength="10" placeholder="Ex.: paciente atendido em urgência, inconsciente, sem acompanhante"></textarea><span class="field-error" data-erro-de="just-txt"></span></div></form>`,
        acoes: [
          { label: "Cancelar", onClick: (f) => { feito = true; resolve(null); f(); } },
          { label: "Acessar com justificativa", classe: "btn-danger", icone: "unlock", onClick: (f, md) => {
            const t = qs("#just-txt", md).value.trim();
            if (t.length < 10) { qs('[data-erro-de="just-txt"]', md).textContent = "Descreva o motivo (mínimo 10 caracteres)."; return; }
            feito = true; resolve(t); f();
          } }
        ]
      });
      const obs = new MutationObserver(() => { if (!document.body.contains(m.modal)) { obs.disconnect(); if (!feito) resolve(null); } });
      obs.observe(document.body, { childList: true });
    });
  }
  window.ConectaMedico = { opcoesPacientes, carregarPacientes, obterProntuario };

  /* ------------------------------------------------------------------------
     Dashboard médico
     ------------------------------------------------------------------------ */
  C.pagina("dashboard", async function (s) {
    const hoje = C.hojeISO();
    await Promise.all([
      carregarPacientes(), D.fetch("atendimentos", "/attendances", { escopo: "minhas", limit: 500 }),
      D.fetch("consultas", "/appointments", { escopo: "minhas", limit: 500 }), D.fetch("solicitacoes", "/exam-requests", { escopo: "minhas", limit: 500 })
    ]);
    const prof = Object.assign({}, D.profissional(s.refId), { nome: s.nome, especialidade: s.especialidade, unidadeId: s.unidadeId });
    const meus = D.where("atendimentos", (a) => a.profissionalId === prof.id && a.status === "Finalizado").sort(porDataDesc);
    const hojeAt = meus.filter((a) => C.mesmoDia(a.data, hoje));
    const agendadas = D.where("consultas", (c) => c.profissionalId === prof.id && ["Agendada", "Confirmada"].includes(c.status));
    const agendaHoje = D.where("consultas", (c) => c.profissionalId === prof.id && C.mesmoDia(c.data, hoje)).sort((a, b) => a.data.localeCompare(b.data));
    const pendentes = D.where("solicitacoes", (x) => x.profissionalId === prof.id && x.status !== "Resultado disponível");
    const distintos = new Set(meus.map((a) => a.pacienteId)).size;
    const pacienteDe = (id) => D.paciente(id) || { id, nome: "Paciente", nascimento: C.hojeISO(), cpf: "" };

    const hora = new Date().getHours();
    qs("#saudacao-medico").innerHTML = `<h1>${hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite"}, ${esc(prof.nome)}</h1>
      <p>${esc(prof.especialidade)} · ${esc(D.unidade(prof.unidadeId).nome)} · ${esc(C.fmtData(hoje))}</p>`;

    qs("#cards-medico").innerHTML = [
      ["Total de pacientes atendidos", distintos, "Pacientes distintos atendidos por você", "users", "", "buscar-paciente.html"],
      ["Atendimentos hoje", hojeAt.length, `${agendaHoje.filter((c) => c.status !== "Realizada" && c.status !== "Cancelada").length} restante(s) na agenda`, "stethoscope", "c2", "atendimento.html"],
      ["Consultas agendadas", agendadas.length, "Próximos dias", "calendar-days", "c3", "#agenda-hoje"],
      ["Exames pendentes", pendentes.length, "Aguardando resultado", "flask-conical", "c5", "solicitar-exame.html"]
    ].map(([l, v, sub, i, c, href]) => `<a class="stat anim-rise" href="${href}"><span class="stat-ico ${c}">${ico(i)}</span><div><div class="stat-label">${l}</div><div class="stat-value">${v.toLocaleString("pt-BR")}</div><div class="stat-sub">${esc(sub)}</div></div></a>`).join("");

    // Agenda de hoje
    qs("#agenda-hoje").innerHTML = agendaHoje.length ? `<ul class="list">${agendaHoje.map((c) => {
      const p = pacienteDe(c.pacienteId);
      return `<li class="list-item"><span class="time-pill">${C.fmtHora(c.data)}</span>
        <span class="li-main"><span class="li-title">${esc(p.nome)}</span><span class="li-sub">${esc(c.tipo)} · ${C.calcIdade(p.nascimento)} anos</span></span>
        ${badge(c.status)}
        <span class="actions">
          <a class="btn btn-outline btn-sm" href="perfil-paciente.html?id=${p.id}" aria-label="Prontuário de ${esc(p.nome)}">${ico("clipboard-list")}<span class="hide-sm">Prontuário</span></a>
          ${c.status !== "Realizada" && c.status !== "Cancelada" ? `<a class="btn btn-primary btn-sm" href="atendimento.html?paciente=${p.id}&consulta=${c.id}">${ico("play")}<span class="hide-sm">Atender</span></a>` : ""}
        </span></li>`;
    }).join("")}</ul>` : `<div class="empty">${ico("calendar-check")}<span>Sem consultas na agenda de hoje.</span></div>`;

    // Últimos pacientes atendidos
    const vistos = []; meus.forEach((a) => { if (!vistos.find((x) => x.pacienteId === a.pacienteId)) vistos.push(a); });
    C.tabela(qs("#ultimos-pacientes"), {
      rotulo: "Últimos pacientes atendidos", linhas: vistos.slice(0, 6),
      colunas: [
        { titulo: "Paciente", render: (a) => { const p = pacienteDe(a.pacienteId); return `<span class="flex items-center gap-2"><span class="avatar">${esc(C.iniciais(p.nome))}</span><span><span class="cell-strong">${esc(p.nome)}</span><span class="cell-sub">CPF ${esc(C.mascararCPF(p.cpf))}</span></span></span>`; } },
        { titulo: "Último atendimento", render: (a) => `${esc(C.fmtData(a.data))}<span class="cell-sub">${esc(a.motivo)}</span>` },
        { titulo: "Diagnóstico", render: (a) => esc(a.diagnostico) },
        { titulo: "Ação", render: (a) => `<a class="btn btn-secondary btn-sm" href="perfil-paciente.html?id=${a.pacienteId}">${ico("clipboard-list")} Prontuário</a>` }
      ]
    });

    // Notificações recentes
    const notifs = D.getAll("notificacoes").slice().sort(porDataDesc).slice(0, 4);
    qs("#notif-medico").innerHTML = `<ul class="list">${notifs.map((n) => `<li class="list-item"><span class="li-ico">${ico(n.icone || "bell")}</span><span class="li-main"><a class="li-title" href="${esc(n.link)}">${esc(n.titulo)}</a><span class="li-sub">${esc(n.texto)} · ${esc(C.tempoRelativo(n.data))}</span></span>${n.lida ? "" : '<span class="badge badge-info">Nova</span>'}</li>`).join("") || '<li class="muted small">Nenhuma notificação.</li>'}</ul>`;

    // Busca rápida
    qs("#busca-rapida").addEventListener("submit", (e) => {
      e.preventDefault();
      const v = qs("#busca-rapida-input").value.trim();
      location.href = `buscar-paciente.html${v ? `?q=${encodeURIComponent(v)}` : ""}`;
    });
  }, "medico");

  /* ------------------------------------------------------------------------
     Buscar paciente (CPF, nome ou CNS)
     ------------------------------------------------------------------------ */
  C.pagina("buscar", async function (s) {
    const form = qs("#form-busca");
    const tipo = qs("#busca-tipo");
    const campo = qs("#busca-termo");
    const placeholders = { cpf: "000.000.000-00", nome: "Digite o nome completo ou parte dele", cns: "000 0000 0000 0000" };
    tipo.addEventListener("change", () => { campo.value = ""; campo.placeholder = placeholders[tipo.value]; campo.inputMode = tipo.value === "nome" ? "text" : "numeric"; campo.focus(); });
    campo.addEventListener("input", () => {
      if (tipo.value === "cpf") campo.value = C.formatarCPF(campo.value);
      if (tipo.value === "cns") { const d = C.somenteDigitos(campo.value).slice(0, 15); campo.value = d.length === 15 ? C.formatarCNS(d) : d; }
    });

    function render(lista, titulo) {
      qs("#resultado-titulo").textContent = titulo;
      C.tabela(qs("#resultado-busca"), {
        rotulo: "Resultados da busca", linhas: lista, vazio: "Nenhum paciente encontrado. Verifique os dados informados ou cadastre o paciente no primeiro atendimento.",
        colunas: [
          { titulo: "Nome", render: (p) => `<span class="flex items-center gap-2"><span class="avatar">${esc(C.iniciais(p.nome))}</span><span class="cell-strong">${esc(p.nome)}</span></span>` },
          { titulo: "CPF", render: (p) => `<span class="mono">${esc(C.mascararCPF(p.cpf))}</span>` },
          { titulo: "CNS", render: (p) => `<span class="mono">${esc(C.mascararCNS(p.cns))}</span>` },
          { titulo: "Nascimento", render: (p) => `${esc(C.fmtData(p.nascimento))}<span class="cell-sub">${C.calcIdade(p.nascimento)} anos</span>` },
          { titulo: "Último atendimento", render: (p) => { const a = p.ultimoAtendimento; return a ? `${esc(C.fmtData(a.data))}<span class="cell-sub">${esc(D.unidade(a.unidadeId).nome)}</span>` : "—"; } },
          { titulo: "Unidade de referência", render: (p) => esc(p.unidadeRef ? D.unidade(p.unidadeRef).nome : "—") },
          { titulo: "Ação", render: (p) => `<a class="btn btn-primary btn-sm" href="perfil-paciente.html?id=${p.id}">${ico("clipboard-list")} Visualizar prontuário</a>` }
        ]
      });
    }
    function erroCampo(msg) { campo.setAttribute("aria-invalid", msg ? "true" : "false"); qs("#erro-busca").textContent = msg; if (msg) campo.focus(); }
    async function buscar(termo) {
      const t = termo.trim();
      if (!t) return erroCampo("Informe um valor para pesquisar.");
      const consulta = {};
      if (tipo.value === "cpf") { if (!C.validarCPF(t)) return erroCampo("CPF inválido. Digite os 11 dígitos."); consulta.cpf = C.somenteDigitos(t); }
      else if (tipo.value === "cns") { if (C.somenteDigitos(t).length < 4) return erroCampo("Digite ao menos 4 dígitos do CNS."); consulta.cns = C.somenteDigitos(t); }
      else { if (t.length < 3) return erroCampo("Digite ao menos 3 letras."); consulta.q = t; }
      erroCampo("");
      try {
        const r = await Api.list("/patients", { ...consulta, limit: 50 });
        render(r.items, `${r.meta.total} paciente(s) encontrado(s)`);
        qs("#resultado-titulo").focus();
      } catch (e) { erroCampo(e.message); }
    }
    form.addEventListener("submit", (e) => { e.preventDefault(); buscar(campo.value); });
    // Cadastro de paciente ainda não registrado na rede (POST /patients)
    qs(".page-head").insertAdjacentHTML("beforeend", `<div class="btn-row"><button type="button" class="btn btn-primary" id="btn-cadastrar-paciente">${ico("user-plus")} Cadastrar paciente</button></div>`);
    qs("#btn-cadastrar-paciente").addEventListener("click", async () => {
      const p = await window.ConectaAtendimento.cadastrarPaciente();
      if (p) render([p], "Paciente cadastrado");
    });

    // Busca vinda do dashboard (?q=)
    const q = C.param("q");
    if (q) {
      const d = C.somenteDigitos(q);
      tipo.value = d.length === 11 ? "cpf" : d.length >= 4 && d.length === q.replace(/\s/g, "").length ? "cns" : "nome";
      campo.value = tipo.value === "cpf" ? C.formatarCPF(q) : q;
      await buscar(campo.value);
    } else {
      await Promise.all([carregarPacientes(), D.fetch("atendimentos", "/attendances", { escopo: "minhas", limit: 100 })]);
      const ids = [...new Set(D.getAll("atendimentos").sort(porDataDesc).map((a) => a.pacienteId))].slice(0, 5);
      render(ids.map((id) => D.paciente(id)).filter(Boolean), "Pacientes atendidos recentemente por você");
    }
  }, "medico");

  /* ------------------------------------------------------------------------
     Perfil clínico do paciente (prontuário integrado)
     ------------------------------------------------------------------------ */
  C.pagina("perfil", async function (s) {
    qs("#visao-paciente").remove();
    const raiz = qs("#visao-medico");
    raiz.classList.remove("hidden");
    const id = C.param("id") || C.Store.get("ultimoProntuario", "");
    let p = null; let justificativa;
    if (id) {
      try {
        const r = await obterProntuario(id);
        p = D.put("pacientes", r.paciente); justificativa = r.justificativa;
        const extra = justificativa ? { justificativa } : {};
        await Promise.all([
          D.fetch("atendimentos", `/patients/${id}/history`, extra), D.fetch("exames", `/patients/${id}/exams`),
          D.fetch("prescricoes", `/patients/${id}/prescriptions`), D.fetch("encaminhamentos", `/patients/${id}/referrals`)
        ]);
      } catch (e) {
        C.Store.remove("ultimoProntuario");
        if (e.status === 404) C.toast("Paciente não encontrado.", "erro");
        else if (e.code !== "JUSTIFICATION_REQUIRED") C.erroApi(e, "Prontuário indisponível");
        p = null;
      }
    }

    if (!p) {
      await carregarPacientes();
      raiz.innerHTML = `<div class="page-head"><div><h1>Histórico clínico</h1><p>Selecione um paciente para abrir o prontuário integrado.</p></div></div>
        <div class="card"><form id="form-sel" class="form-grid" novalidate><div class="field span-2"><label for="sel-pac">Paciente</label><select class="select" id="sel-pac" name="pac" required><option value="">Selecione um paciente</option>${opcoesPacientes()}</select><span class="field-error" data-erro-de="sel-pac"></span></div>
        <div class="btn-row span-all"><button class="btn btn-primary" type="submit">${ico("clipboard-list")} Abrir prontuário</button><a class="btn btn-outline" href="buscar-paciente.html">${ico("search")} Buscar por CPF/CNS</a></div></form></div>`;
      qs("#form-sel").addEventListener("submit", (e) => { e.preventDefault(); if (C.validarFormulario(e.target)) location.href = `perfil-paciente.html?id=${qs("#sel-pac").value}`; });
      return;
    }
    if (!C.param("id")) history.replaceState(null, "", `?id=${p.id}`);
    C.Store.set("ultimoProntuario", p.id);
    document.title = `Prontuário de ${p.nome} | Conecta`;

    const prof = { nome: s.nome, unidadeId: s.unidadeId };
    if (p.acessoEmergencia) C.toast("Acesso de emergência registrado na auditoria com a sua justificativa.", "alerta", "Acesso excepcional");

    let mostrarDocs = false;
    const ats = () => D.where("atendimentos", (a) => a.pacienteId === p.id && a.status === "Finalizado").sort(porDataDesc);
    const meds = () => D.where("prescricoes", (r) => r.pacienteId === p.id && ["Em uso", "Uso contínuo"].includes(r.status));
    const exs = () => D.where("exames", (e) => e.pacienteId === p.id).sort(porDataDesc);
    const encs = () => D.where("encaminhamentos", (e) => e.pacienteId === p.id).sort(porDataDesc);

    function renderCabecalho() {
      p = D.paciente(p.id);
      qs("#pc-cabecalho").innerHTML = `
        <span class="avatar xl">${esc(C.iniciais(p.nome))}</span>
        <div class="li-main">
          <div class="breadcrumb"><a href="buscar-paciente.html">Buscar paciente</a> ${ico("chevron-right")} Prontuário</div>
          <h1 class="mb-0">${esc(p.nome)}</h1>
          <dl class="pc-dados">
            <div><dt>Nascimento</dt><dd>${esc(C.fmtData(p.nascimento))}</dd></div>
            <div><dt>Idade</dt><dd>${C.calcIdade(p.nascimento)} anos</dd></div>
            <div><dt>Sexo</dt><dd>${esc(p.sexo)}</dd></div>
            <div><dt>CPF</dt><dd class="mono">${esc(mostrarDocs ? C.formatarCPF(p.cpf) : C.mascararCPF(p.cpf))}</dd></div>
            <div><dt>CNS</dt><dd class="mono">${esc(mostrarDocs ? C.formatarCNS(p.cns) : C.mascararCNS(p.cns))}</dd></div>
            <div><dt>Telefone</dt><dd>${esc(p.telefone || "—")}</dd></div>
            <div><dt>Tipo sanguíneo</dt><dd>${esc(p.tipoSanguineo)}</dd></div>
            <div><dt>Unidade de referência</dt><dd>${esc(p.unidadeRef ? D.unidade(p.unidadeRef).nome : "—")}</dd></div>
          </dl>
        </div>
        <div class="pc-acoes">
          <button type="button" class="btn btn-ghost btn-sm" id="btn-docs" aria-pressed="${mostrarDocs}">${ico(mostrarDocs ? "eye-off" : "eye")} ${mostrarDocs ? "Mascarar" : "Exibir"} documentos</button>
          <a class="btn btn-primary" href="atendimento.html?paciente=${p.id}">${ico("stethoscope")} Registrar atendimento</a>
          <div class="btn-row">
            <a class="btn btn-outline btn-sm" href="solicitar-exame.html?paciente=${p.id}">${ico("flask-conical")} Exame</a>
            <a class="btn btn-outline btn-sm" href="prescricoes.html?paciente=${p.id}">${ico("pill")} Prescrever</a>
            <a class="btn btn-outline btn-sm" href="encaminhamentos.html?paciente=${p.id}">${ico("send")} Encaminhar</a>
          </div>
        </div>`;
      qs("#pc-alergias").innerHTML = p.alergias.length
        ? `<div class="alert alert-perigo allergy-banner" role="alert">${ico("alert-octagon")}<span><strong>ALERGIAS REGISTRADAS:</strong> ${p.alergias.map((a) => `${esc(a.nome)} <em>(${esc(a.gravidade)} — ${esc(a.reacao)})</em>`).join(" · ")}</span></div>`
        : `<div class="alert alert-sucesso">${ico("check-circle-2")}<span>Nenhuma alergia registrada para este paciente.</span></div>`;
      C.icones();
    }

    function renderClinico() {
      const lista = ats();
      // Coluna lateral: informações clínicas
      const diagnosticos = lista.filter((a) => a.diagnostico).map((a) => ({ d: a.diagnostico, data: a.data, u: a.unidadeId }));
      qs("#pc-cronicas").innerHTML = p.cronicas.length ? p.cronicas.map((c) => `<span class="chip">${esc(c)}</span>`).join("") : '<span class="muted small">Nenhuma registrada</span>';
      qs("#pc-medicamentos").innerHTML = meds().length ? `<ul class="list">${meds().map((m) => `<li class="list-item"><span class="li-ico">${ico("pill")}</span><span class="li-main"><span class="li-title">${esc(m.medicamento)} ${esc(m.dosagem.split("—")[0])}</span><span class="li-sub">${esc(m.frequencia)} · ${esc(D.unidade(m.unidadeId).nome)}</span></span></li>`).join("")}</ul>` : '<span class="muted small">Nenhum em uso</span>';
      qs("#pc-diagnosticos").innerHTML = diagnosticos.length ? `<ul class="list">${diagnosticos.slice(0, 6).map((x) => `<li class="list-item"><span class="li-main"><span class="li-title">${esc(x.d)}</span><span class="li-sub">${esc(C.fmtData(x.data))} · ${esc(D.unidade(x.u).nome)}</span></span></li>`).join("")}</ul>` : '<span class="muted small">Nenhum</span>';
      qs("#pc-internacoes").innerHTML = p.internacoes.length ? `<ul class="list">${p.internacoes.map((i) => `<li class="list-item"><span class="li-ico">${ico("bed-double")}</span><span class="li-main"><span class="li-title">${esc(i.motivo)}</span><span class="li-sub">${esc(C.fmtData(i.entrada))} a ${esc(C.fmtData(i.alta))} · ${esc(D.unidade(i.unidadeId).nome)}</span></span></li>`).join("")}</ul>` : '<span class="muted small">Nenhuma internação registrada</span>';
      qs("#pc-encaminhamentos").innerHTML = encs().length ? `<ul class="list">${encs().map((e) => `<li class="list-item"><span class="li-ico">${ico("send")}</span><span class="li-main"><span class="li-title">${esc(e.especialidade)} — ${esc(D.unidade(e.destinoId).nome)}</span><span class="li-sub">${esc(C.fmtData(e.data))} · origem ${esc(D.unidade(e.origemId).nome)}</span></span>${badge(e.status)}</li>`).join("")}</ul>` : '<span class="muted small">Nenhum encaminhamento</span>';

      // Unidades que contribuíram com o histórico
      const unidades = [...new Set(lista.map((a) => a.unidadeId))].map((u) => D.unidade(u));
      qs("#pc-unidades").innerHTML = unidades.map((u) => `<span class="unit-pill">${tipoTag(u.tipo)} ${esc(u.nome)}</span>`).join("");

      // Exames
      C.tabela(qs("#pc-exames"), {
        rotulo: "Exames do paciente", linhas: exs(),
        colunas: [
          { titulo: "Exame", render: (e) => `<span class="cell-strong">${esc(e.nome)}</span>` },
          { titulo: "Data", render: (e) => esc(C.fmtData(e.data)) },
          { titulo: "Unidade", render: (e) => esc(D.unidade(e.unidadeId).nome) },
          { titulo: "Status", render: (e) => badge(e.status) },
          { titulo: "Ação", render: (e) => `<button type="button" class="btn btn-secondary btn-sm" data-exame="${e.id}">${ico("eye")} Ver</button>` }
        ]
      });
      renderTimeline();
    }

    function renderTimeline() {
      const f = qs("#pc-filtro").value;
      const lista = ats().filter((a) => !f || D.unidade(a.unidadeId).tipo === f);
      qs("#pc-timeline").innerHTML = K().timelineHTML(lista);
      C.icones();
    }

    raiz.addEventListener("click", async (e) => {
      if (e.target.closest("#btn-docs")) {
        try {
          // Documentos completos exigem permissão "dados_cadastrais" e geram auditoria no servidor.
          const r = await Api.get(`/patients/${p.id}`, mostrarDocs ? (justificativa ? { justificativa } : {}) : { reveal: "true", ...(justificativa ? { justificativa } : {}) });
          D.put("pacientes", r); mostrarDocs = !mostrarDocs; renderCabecalho();
        } catch (err) { C.erroApi(err); }
      }
      const ex = e.target.closest("[data-exame]");
      if (ex) {
        try { const exame = await Api.get(`/exams/${ex.dataset.exame}`); D.put("exames", exame); K().abrirResultado(exame); }
        catch (err) { C.erroApi(err); }
      }
    });
    qs("#pc-filtro").addEventListener("change", renderTimeline);
    K().ligarTimeline(qs("#pc-timeline"));
    qs("#pc-nome-acesso").textContent = `${prof.nome} · ${D.unidade(prof.unidadeId).nome} · ${C.fmtDataHora(C.agoraISO())}`;
    renderCabecalho();
    renderClinico();

    // Destaca registro recém-criado (vindo do formulário de atendimento)
    const novo = C.param("novo");
    if (novo) { const b = qs(`[data-atendimento="${novo}"]`); if (b) { b.classList.add("highlight"); b.scrollIntoView({ behavior: "smooth", block: "center" }); } }
  }, "medico");

  /* ------------------------------------------------------------------------
     Prescrições
     ------------------------------------------------------------------------ */
  C.pagina("prescricoes", async function (s) {
    const prof = { id: s.refId, nome: s.nome, registro: s.registro || "" };
    const form = qs("#form-prescricao");
    await carregarPacientes();
    qs("#rx-paciente").insertAdjacentHTML("beforeend", opcoesPacientes(C.param("paciente")));
    qs("#rx-profissional").value = `${prof.nome} — ${prof.registro}`;
    const avisoAlergia = qs("#rx-alerta");
    let alergiasPaciente = [];

    /** Alergias vêm do prontuário (acesso autorizado e auditado pelo servidor). */
    async function carregarAlergias() {
      const id = qs("#rx-paciente").value;
      alergiasPaciente = [];
      if (!id) { avisoAlergia.innerHTML = ""; return; }
      try { const r = await obterProntuario(id); alergiasPaciente = r.paciente.alergias || []; }
      catch (e) { avisoAlergia.innerHTML = `<div class="alert alert-alerta">${ico("lock")}<span>${esc(e.message)}</span></div>`; C.icones(); return; }
      verificarAlergia();
    }
    function verificarAlergia() {
      const med = normalizar(qs("#rx-medicamento").value);
      if (!qs("#rx-paciente").value) { avisoAlergia.innerHTML = ""; return; }
      const conflito = med && alergiasPaciente.find((a) => med.includes(normalizar(a.nome)) || normalizar(a.nome).includes(med));
      avisoAlergia.innerHTML = conflito
        ? `<div class="alert alert-perigo" role="alert">${ico("alert-octagon")}<span><strong>Atenção: possível alergia!</strong> O paciente tem alergia registrada a ${esc(conflito.nome)} (${esc(conflito.reacao || conflito.gravidade)}).</span></div>`
        : alergiasPaciente.length ? `<div class="alert alert-alerta">${ico("alert-triangle")}<span>Alergias do paciente: ${alergiasPaciente.map((a) => esc(a.nome)).join(", ")}.</span></div>` : "";
      C.icones();
    }
    qs("#rx-paciente").addEventListener("change", async () => { await carregarAlergias(); if (qs("#rx-filtro").value === "paciente") await recarregar(); });
    qs("#rx-medicamento").addEventListener("input", verificarAlergia);

    async function recarregar() {
      const f = qs("#rx-filtro").value; const pac = qs("#rx-paciente").value;
      try {
        if (f === "paciente") { if (!pac) { D.set("prescricoes", []); render(); return; } await D.fetch("prescricoes", "/prescriptions", { pacienteId: pac }); }
        else await D.fetch("prescricoes", "/prescriptions", { escopo: f });
      } catch (e) { C.erroApi(e); D.set("prescricoes", []); }
      render();
    }
    function render() {
      const lista = D.getAll("prescricoes").slice().sort(porDataDesc);
      C.tabela(qs("#rx-lista"), {
        rotulo: "Prescrições anteriores", linhas: lista, vazio: qs("#rx-filtro").value === "paciente" && !qs("#rx-paciente").value ? "Selecione um paciente." : "Nenhuma prescrição encontrada.",
        colunas: [
          { titulo: "Paciente", render: (r) => esc((D.paciente(r.pacienteId) || {}).nome || "—") },
          { titulo: "Medicamento", render: (r) => `<span class="cell-strong">${esc(r.medicamento)}</span><span class="cell-sub">${esc(r.dosagem)}</span>` },
          { titulo: "Frequência / duração", render: (r) => `${esc(r.frequencia)}<span class="cell-sub">${esc(r.duracao)}</span>` },
          { titulo: "Profissional", render: (r) => `${esc(D.profissional(r.profissionalId).nome)}<span class="cell-sub">${esc(C.fmtData(r.data))}</span>` },
          { titulo: "Status", render: (r) => badge(r.status) },
          { titulo: "Ações", render: (r) => `<div class="actions"><button type="button" class="btn btn-secondary btn-sm" data-ver="${r.id}" aria-label="Visualizar">${ico("eye")}</button>${r.profissionalId === prof.id && r.status !== "Concluído" ? `<button type="button" class="btn btn-outline btn-sm" data-suspender="${r.id}" aria-label="Encerrar prescrição">${ico("square")} Encerrar</button>` : ""}</div>` }
        ]
      });
    }
    qs("#rx-filtro").addEventListener("change", recarregar);
    qs("#rx-lista").addEventListener("click", async (e) => {
      const v = e.target.closest("[data-ver]"); const sp = e.target.closest("[data-suspender]");
      if (v) K().abrirReceita(D.getById("prescricoes", v.dataset.ver));
      if (sp && await C.confirmar({ titulo: "Encerrar prescrição", mensagem: "O medicamento deixará de constar como em uso para o paciente.", rotulo: "Encerrar", perigo: true })) {
        try { D.put("prescricoes", await Api.patch(`/prescriptions/${sp.dataset.suspender}`, { status: "Concluído" })); render(); C.toast("Prescrição encerrada."); }
        catch (err) { C.erroApi(err); }
      }
    });
    async function enviar(dados, confirmarAlergia) {
      return Api.post("/prescriptions", { pacienteId: dados.paciente, confirmarAlergia, medicamentos: [{ medicamento: dados.medicamento.trim(), dosagem: dados.dosagem.trim(), frequencia: dados.frequencia, duracao: dados.duracao.trim(), orientacoes: dados.orientacoes.trim() || undefined }] });
    }
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!C.validarFormulario(form)) return;
      const d = C.dadosFormulario(form);
      let itens;
      try { itens = await enviar(d, false); }
      catch (err) {
        if (err.code !== "ALLERGY_CONFLICT") { C.erroApi(err, "Prescrição não registrada"); return; }
        const ok = await C.confirmar({ titulo: "Alerta de alergia", mensagem: `${err.message} Deseja prescrever mesmo assim? A decisão ficará registrada na auditoria.`, rotulo: "Prescrever mesmo assim", perigo: true });
        if (!ok) return;
        try { itens = await enviar(d, true); } catch (err2) { C.erroApi(err2, "Prescrição não registrada"); return; }
      }
      itens.forEach((it) => D.put("prescricoes", it));
      form.reset(); qs("#rx-profissional").value = `${prof.nome} — ${prof.registro}`; qs("#rx-paciente").value = d.paciente;
      verificarAlergia();
      render();
      C.toast(`Prescrição de ${itens[0].medicamento} registrada e disponível para o paciente.`, "sucesso", "Prescrição salva");
    });
    qs("#rx-limpar").addEventListener("click", () => { form.reset(); qs("#rx-profissional").value = `${prof.nome} — ${prof.registro}`; alergiasPaciente = []; avisoAlergia.innerHTML = ""; });
    if (qs("#rx-paciente").value) await carregarAlergias();
    await recarregar();
  }, "medico");

  /* ------------------------------------------------------------------------
     Encaminhamentos
     ------------------------------------------------------------------------ */
  C.pagina("encaminhamentos", async function (s) {
    const form = qs("#form-enc");
    await Promise.all([carregarPacientes(), D.fetch("encaminhamentos", "/referrals", { escopo: "unidade", limit: 500 })]);
    qs("#en-paciente").insertAdjacentHTML("beforeend", opcoesPacientes(C.param("paciente")));
    qs("#en-especialidade").insertAdjacentHTML("beforeend", C.ESPECIALIDADES.slice().sort().map((e) => `<option>${esc(e)}</option>`).join(""));
    qs("#en-destino").insertAdjacentHTML("beforeend", C.opcoes(D.where("unidades", (u) => u.integrada && u.ativa !== false), "", (u) => `${u.nome} (${u.tipo})`));

    function render() {
      const f = qs("#en-filtro").value;
      const lista = D.where("encaminhamentos", (e) => !f || e.status === f).sort(porDataDesc);
      C.tabela(qs("#en-lista"), {
        rotulo: "Encaminhamentos", linhas: lista, vazio: "Nenhum encaminhamento envolvendo a sua unidade.",
        colunas: [
          { titulo: "Paciente", render: (e) => `<span class="cell-strong">${esc((D.paciente(e.pacienteId) || {}).nome || "—")}</span><span class="cell-sub">${esc(C.fmtData(e.data))}</span>` },
          { titulo: "Especialidade / destino", render: (e) => `${esc(e.especialidade)}<span class="cell-sub">${esc(D.unidade(e.destinoId).nome)}</span>` },
          { titulo: "Origem", render: (e) => `${esc(D.unidade(e.origemId).nome)}<span class="cell-sub">${esc(D.profissional(e.profissionalId).nome)}</span>` },
          { titulo: "Prioridade", render: (e) => badge(e.prioridade) },
          { titulo: "Status", render: (e) => badge(e.status) },
          { titulo: "Ações", render: (e) => `<div class="actions"><button type="button" class="btn btn-secondary btn-sm" data-ver="${e.id}" aria-label="Detalhes">${ico("eye")}</button>${e.status === "Pendente" ? `<button type="button" class="btn btn-outline btn-sm" data-agendar="${e.id}">${ico("calendar-check")} Agendar</button>` : ""}${e.status === "Agendado" ? `<button type="button" class="btn btn-outline btn-sm" data-realizar="${e.id}">${ico("check")} Realizado</button>` : ""}</div>` }
        ]
      });
    }
    qs("#en-filtro").addEventListener("change", render);
    qs("#en-lista").addEventListener("click", async (e) => {
      const v = e.target.closest("[data-ver]"); const a = e.target.closest("[data-agendar]"); const rz = e.target.closest("[data-realizar]");
      if (v) {
        const x = D.getById("encaminhamentos", v.dataset.ver);
        C.abrirModal({ titulo: `Encaminhamento — ${x.especialidade}`, corpo: `<dl class="dl">
          <div><dt>Paciente</dt><dd>${esc((D.paciente(x.pacienteId) || {}).nome || "—")}</dd></div><div><dt>Data</dt><dd>${esc(C.fmtData(x.data))}</dd></div>
          <div><dt>Origem</dt><dd>${esc(D.unidade(x.origemId).nome)}</dd></div><div><dt>Destino</dt><dd>${esc(D.unidade(x.destinoId).nome)}</dd></div>
          <div><dt>Profissional</dt><dd>${esc(D.profissional(x.profissionalId).nome)}</dd></div><div><dt>Prioridade</dt><dd>${badge(x.prioridade)}</dd></div>
          <div class="full"><dt>Motivo / justificativa clínica</dt><dd>${esc(x.motivo)}</dd></div><div><dt>Status</dt><dd>${badge(x.status)}</dd></div></dl>` });
      }
      const alvo = a || rz;
      if (alvo) {
        try {
          D.put("encaminhamentos", await Api.patch(`/referrals/${alvo.dataset.agendar || alvo.dataset.realizar}`, { status: a ? "Agendado" : "Realizado" }));
          render(); C.toast(a ? "Encaminhamento marcado como agendado na unidade de destino." : "Encaminhamento concluído.");
        } catch (err) { C.erroApi(err); }
      }
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!C.validarFormulario(form, { motivo: (v) => (v.trim().length >= 10 ? "" : "Descreva o motivo (mínimo 10 caracteres).") })) return;
      const d = C.dadosFormulario(form);
      try {
        D.put("encaminhamentos", await Api.post("/referrals", { pacienteId: d.paciente, especialidade: d.especialidade, destinoId: d.destino, prioridade: d.prioridade, motivo: d.motivo.trim() }));
        form.reset(); render();
        C.toast("Encaminhamento registrado e compartilhado com a unidade de destino.", "sucesso");
      } catch (err) { C.erroApi(err, "Encaminhamento não registrado"); }
    });
    render();
  }, "medico");
})();
