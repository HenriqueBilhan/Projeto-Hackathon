/* ==========================================================================
   CONECTA — Área do profissional de saúde (medico.js)
   Dashboard, busca de pacientes, perfil clínico (prontuário integrado),
   prescrições e encaminhamentos.
   Todo acesso a prontuário gera um registro de auditoria (LGPD).
   ========================================================================== */
(function () {
  "use strict";
  const C = window.Conecta;
  const { esc, ico, badge, tipoTag, qs, qsa } = C;
  const D = C.Data;
  const K = () => window.ConectaClinico;
  const porDataDesc = (a, b) => b.data.localeCompare(a.data);
  const normalizar = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  /** Utilitário: <select> de pacientes reutilizado em vários formulários. */
  function opcoesPacientes(selecionado) {
    return C.opcoes(D.getAll("pacientes").slice().sort((a, b) => a.nome.localeCompare(b.nome)), selecionado, (p) => `${p.nome} — CPF ${C.mascararCPF(p.cpf)}`);
  }
  window.ConectaMedico = { opcoesPacientes };

  /* ------------------------------------------------------------------------
     Dashboard médico
     ------------------------------------------------------------------------ */
  C.pagina("dashboard", function (s) {
    const prof = D.profissional(s.refId);
    const hoje = C.hojeISO();
    const meus = D.where("atendimentos", (a) => a.profissionalId === prof.id && a.status === "Finalizado").sort(porDataDesc);
    const hojeAt = meus.filter((a) => C.mesmoDia(a.data, hoje));
    const agendadas = D.where("consultas", (c) => c.profissionalId === prof.id && ["Agendada", "Confirmada"].includes(c.status));
    const agendaHoje = D.where("consultas", (c) => c.profissionalId === prof.id && C.mesmoDia(c.data, hoje)).sort((a, b) => a.data.localeCompare(b.data));
    const pendentes = D.where("solicitacoes", (x) => x.profissionalId === prof.id && x.status !== "Resultado disponível");
    const distintos = new Set(meus.map((a) => a.pacienteId)).size;

    const hora = new Date().getHours();
    qs("#saudacao-medico").innerHTML = `<h1>${hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite"}, ${esc(prof.nome)}</h1>
      <p>${esc(prof.especialidade)} · ${esc(D.unidade(prof.unidadeId).nome)} · ${esc(C.fmtData(hoje))}</p>`;

    qs("#cards-medico").innerHTML = [
      ["Total de pacientes atendidos", (prof.pacientesBase || 0) + distintos, "Desde o início na rede", "users", "", "buscar-paciente.html"],
      ["Atendimentos hoje", hojeAt.length, `${agendaHoje.filter((c) => c.status !== "Realizada" && c.status !== "Cancelada").length} restante(s) na agenda`, "stethoscope", "c2", "atendimento.html"],
      ["Consultas agendadas", agendadas.length, "Próximos dias", "calendar-days", "c3", "#agenda-hoje"],
      ["Exames pendentes", pendentes.length, "Aguardando resultado", "flask-conical", "c5", "solicitar-exame.html"]
    ].map(([l, v, sub, i, c, href]) => `<a class="stat anim-rise" href="${href}"><span class="stat-ico ${c}">${ico(i)}</span><div><div class="stat-label">${l}</div><div class="stat-value">${v.toLocaleString("pt-BR")}</div><div class="stat-sub">${esc(sub)}</div></div></a>`).join("");

    // Agenda de hoje
    qs("#agenda-hoje").innerHTML = agendaHoje.length ? `<ul class="list">${agendaHoje.map((c) => {
      const p = D.paciente(c.pacienteId);
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
        { titulo: "Paciente", render: (a) => { const p = D.paciente(a.pacienteId); return `<span class="flex items-center gap-2"><span class="avatar">${esc(C.iniciais(p.nome))}</span><span><span class="cell-strong">${esc(p.nome)}</span><span class="cell-sub">CPF ${esc(C.mascararCPF(p.cpf))}</span></span></span>`; } },
        { titulo: "Último atendimento", render: (a) => `${esc(C.fmtData(a.data))}<span class="cell-sub">${esc(a.motivo)}</span>` },
        { titulo: "Diagnóstico", render: (a) => esc(a.diagnostico) },
        { titulo: "Ação", render: (a) => `<a class="btn btn-secondary btn-sm" href="perfil-paciente.html?id=${a.pacienteId}">${ico("clipboard-list")} Prontuário</a>` }
      ]
    });

    // Notificações recentes
    const notifs = D.where("notificacoes", (n) => n.para === `medico:${prof.id}`).sort(porDataDesc).slice(0, 4);
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
  C.pagina("buscar", function (s) {
    const form = qs("#form-busca");
    const tipo = qs("#busca-tipo");
    const campo = qs("#busca-termo");
    const placeholders = { cpf: "000.000.000-00", nome: "Digite o nome completo ou parte dele", cns: "000 0000 0000 0000" };
    tipo.addEventListener("change", () => { campo.value = ""; campo.placeholder = placeholders[tipo.value]; campo.inputMode = tipo.value === "nome" ? "text" : "numeric"; campo.focus(); });
    campo.addEventListener("input", () => {
      if (tipo.value === "cpf") campo.value = C.formatarCPF(campo.value);
      if (tipo.value === "cns") { const d = C.somenteDigitos(campo.value).slice(0, 15); campo.value = d.length === 15 ? C.formatarCNS(d) : d; }
    });

    function ultimoAtendimento(pid) { return D.where("atendimentos", (a) => a.pacienteId === pid && a.status === "Finalizado").sort(porDataDesc)[0]; }
    function render(lista, titulo) {
      qs("#resultado-titulo").textContent = titulo;
      C.tabela(qs("#resultado-busca"), {
        rotulo: "Resultados da busca", linhas: lista, vazio: "Nenhum paciente encontrado. Verifique os dados informados.",
        colunas: [
          { titulo: "Nome", render: (p) => `<span class="flex items-center gap-2"><span class="avatar">${esc(C.iniciais(p.nome))}</span><span class="cell-strong">${esc(p.nome)}</span></span>` },
          { titulo: "CPF", render: (p) => `<span class="mono">${esc(C.mascararCPF(p.cpf))}</span>` },
          { titulo: "CNS", render: (p) => `<span class="mono">${esc(C.mascararCNS(p.cns))}</span>` },
          { titulo: "Nascimento", render: (p) => `${esc(C.fmtData(p.nascimento))}<span class="cell-sub">${C.calcIdade(p.nascimento)} anos</span>` },
          { titulo: "Último atendimento", render: (p) => { const a = ultimoAtendimento(p.id); return a ? `${esc(C.fmtData(a.data))}<span class="cell-sub">${esc(D.unidade(a.unidadeId).nome)}</span>` : "—"; } },
          { titulo: "Unidade de referência", render: (p) => esc(D.unidade(p.unidadeRef).nome) },
          { titulo: "Ação", render: (p) => `<a class="btn btn-primary btn-sm" href="perfil-paciente.html?id=${p.id}">${ico("clipboard-list")} Visualizar prontuário</a>` }
        ]
      });
    }
    function buscar(termo) {
      const t = termo.trim();
      if (!t) { campo.setAttribute("aria-invalid", "true"); qs("#erro-busca").textContent = "Informe um valor para pesquisar."; campo.focus(); return; }
      let lista = [];
      if (tipo.value === "cpf") {
        const d = C.somenteDigitos(t);
        if (d.length !== 11 || !C.validarCPF(d)) { campo.setAttribute("aria-invalid", "true"); qs("#erro-busca").textContent = "CPF inválido. Digite os 11 dígitos."; return; }
        lista = D.where("pacientes", (p) => p.cpf === d);
      } else if (tipo.value === "cns") {
        const d = C.somenteDigitos(t);
        if (d.length < 4) { campo.setAttribute("aria-invalid", "true"); qs("#erro-busca").textContent = "Digite ao menos 4 dígitos do CNS."; return; }
        lista = D.where("pacientes", (p) => p.cns.includes(d));
      } else {
        if (t.length < 3) { campo.setAttribute("aria-invalid", "true"); qs("#erro-busca").textContent = "Digite ao menos 3 letras."; return; }
        lista = D.where("pacientes", (p) => normalizar(p.nome).includes(normalizar(t)));
      }
      campo.setAttribute("aria-invalid", "false"); qs("#erro-busca").textContent = "";
      C.registrarAuditoria("Pesquisa de paciente", { detalhe: `Busca por ${tipo.value.toUpperCase()}` });
      render(lista, `${lista.length} paciente(s) encontrado(s)`);
      qs("#resultado-titulo").focus();
    }
    form.addEventListener("submit", (e) => { e.preventDefault(); buscar(campo.value); });
    qsa("[data-exemplo]").forEach((b) => b.addEventListener("click", () => { tipo.value = b.dataset.tipo; tipo.dispatchEvent(new Event("change")); campo.value = b.dataset.exemplo; buscar(b.dataset.exemplo); }));

    // Busca vinda do dashboard (?q=)
    const q = C.param("q");
    if (q) {
      const d = C.somenteDigitos(q);
      tipo.value = d.length === 11 ? "cpf" : d.length >= 4 && d.length === q.replace(/\s/g, "").length ? "cns" : "nome";
      campo.value = tipo.value === "cpf" ? C.formatarCPF(q) : q;
      buscar(campo.value);
    } else {
      const recentes = [...new Set(D.where("atendimentos", (a) => a.profissionalId === s.refId).sort(porDataDesc).map((a) => a.pacienteId))].slice(0, 5).map((id) => D.paciente(id));
      render(recentes, "Pacientes atendidos recentemente por você");
    }
  }, "medico");

  /* ------------------------------------------------------------------------
     Perfil clínico do paciente (prontuário integrado)
     ------------------------------------------------------------------------ */
  C.pagina("perfil", function (s) {
    qs("#visao-paciente").remove();
    const raiz = qs("#visao-medico");
    raiz.classList.remove("hidden");
    let id = C.param("id") || C.Store.get("ultimoProntuario", "");
    let p = id ? D.paciente(id) : null;

    if (!p) {
      raiz.innerHTML = `<div class="page-head"><div><h1>Histórico clínico</h1><p>Selecione um paciente para abrir o prontuário integrado.</p></div></div>
        <div class="card"><form id="form-sel" class="form-grid" novalidate><div class="field span-2"><label for="sel-pac">Paciente</label><select class="select" id="sel-pac" name="pac" required><option value="">Selecione um paciente</option>${opcoesPacientes()}</select><span class="field-error" data-erro-de="sel-pac"></span></div>
        <div class="btn-row span-all"><button class="btn btn-primary" type="submit">${ico("clipboard-list")} Abrir prontuário</button><a class="btn btn-outline" href="buscar-paciente.html">${ico("search")} Buscar por CPF/CNS</a></div></form></div>`;
      qs("#form-sel").addEventListener("submit", (e) => { e.preventDefault(); if (C.validarFormulario(e.target)) location.href = `perfil-paciente.html?id=${qs("#sel-pac").value}`; });
      return;
    }
    if (!C.param("id")) history.replaceState(null, "", `?id=${p.id}`);
    C.Store.set("ultimoProntuario", p.id);
    document.title = `Prontuário de ${p.nome} | Conecta`;

    // Auditoria + aviso ao paciente (transparência)
    C.registrarAuditoria("Visualização de prontuário", { pacienteId: p.id });
    const prof = D.profissional(s.refId);
    const cfg = D.getObj("configuracoes");
    const jaAvisado = D.where("notificacoes", (n) => n.para === `paciente:${p.id}` && n.titulo === "Seu prontuário foi acessado" && C.mesmoDia(n.data, C.hojeISO()) && n.texto.includes(prof.nome)).length;
    if (cfg.notificarPacienteAcesso && !jaAvisado) C.notificar(`paciente:${p.id}`, "Seu prontuário foi acessado", `${prof.nome} (${D.unidade(prof.unidadeId).nome}) consultou seu histórico.`, "historico.html", "shield-check");

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
            <div><dt>Telefone</dt><dd>${esc(p.telefone)}</dd></div>
            <div><dt>Tipo sanguíneo</dt><dd>${esc(p.tipoSanguineo)}</dd></div>
            <div><dt>Unidade de referência</dt><dd>${esc(D.unidade(p.unidadeRef).nome)}</dd></div>
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

    raiz.addEventListener("click", (e) => {
      if (e.target.closest("#btn-docs")) {
        mostrarDocs = !mostrarDocs;
        if (mostrarDocs) C.registrarAuditoria("Exibição de dados sensíveis (CPF/CNS)", { pacienteId: p.id });
        renderCabecalho();
      }
      const ex = e.target.closest("[data-exame]");
      if (ex) { C.registrarAuditoria("Visualização de resultado de exame", { pacienteId: p.id }); K().abrirResultado(D.getById("exames", ex.dataset.exame)); }
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
  C.pagina("prescricoes", function (s) {
    const prof = D.profissional(s.refId);
    const form = qs("#form-prescricao");
    qs("#rx-paciente").insertAdjacentHTML("beforeend", opcoesPacientes(C.param("paciente")));
    qs("#rx-profissional").value = `${prof.nome} — ${prof.registro}`;
    const avisoAlergia = qs("#rx-alerta");

    function verificarAlergia() {
      const p = D.paciente(qs("#rx-paciente").value);
      const med = normalizar(qs("#rx-medicamento").value);
      if (!p) { avisoAlergia.innerHTML = ""; return; }
      const conflito = med && p.alergias.find((a) => med.includes(normalizar(a.nome)) || normalizar(a.nome).includes(med));
      avisoAlergia.innerHTML = conflito
        ? `<div class="alert alert-perigo" role="alert">${ico("alert-octagon")}<span><strong>Atenção: possível alergia!</strong> O paciente tem alergia registrada a ${esc(conflito.nome)} (${esc(conflito.reacao)}).</span></div>`
        : p.alergias.length ? `<div class="alert alert-alerta">${ico("alert-triangle")}<span>Alergias do paciente: ${p.alergias.map((a) => esc(a.nome)).join(", ")}.</span></div>` : "";
      C.icones();
    }
    qs("#rx-paciente").addEventListener("change", () => { verificarAlergia(); render(); });
    qs("#rx-medicamento").addEventListener("input", verificarAlergia);

    function render() {
      const filtroPac = qs("#rx-filtro").value;
      const lista = D.where("prescricoes", (r) => (filtroPac === "minhas" ? r.profissionalId === prof.id : filtroPac === "paciente" ? r.pacienteId === qs("#rx-paciente").value : true)).sort(porDataDesc);
      C.tabela(qs("#rx-lista"), {
        rotulo: "Prescrições anteriores", linhas: lista, vazio: "Nenhuma prescrição encontrada.",
        colunas: [
          { titulo: "Paciente", render: (r) => esc(D.paciente(r.pacienteId).nome) },
          { titulo: "Medicamento", render: (r) => `<span class="cell-strong">${esc(r.medicamento)}</span><span class="cell-sub">${esc(r.dosagem)}</span>` },
          { titulo: "Frequência / duração", render: (r) => `${esc(r.frequencia)}<span class="cell-sub">${esc(r.duracao)}</span>` },
          { titulo: "Profissional", render: (r) => `${esc(D.profissional(r.profissionalId).nome)}<span class="cell-sub">${esc(C.fmtData(r.data))}</span>` },
          { titulo: "Status", render: (r) => badge(r.status) },
          { titulo: "Ações", render: (r) => `<div class="actions"><button type="button" class="btn btn-secondary btn-sm" data-ver="${r.id}" aria-label="Visualizar">${ico("eye")}</button>${r.profissionalId === prof.id && r.status !== "Concluído" ? `<button type="button" class="btn btn-outline btn-sm" data-suspender="${r.id}" aria-label="Encerrar prescrição">${ico("square")} Encerrar</button>` : ""}</div>` }
        ]
      });
    }
    qs("#rx-filtro").addEventListener("change", render);
    qs("#rx-lista").addEventListener("click", async (e) => {
      const v = e.target.closest("[data-ver]"); const sp = e.target.closest("[data-suspender]");
      if (v) K().abrirReceita(D.getById("prescricoes", v.dataset.ver));
      if (sp && await C.confirmar({ titulo: "Encerrar prescrição", mensagem: "O medicamento deixará de constar como em uso para o paciente.", rotulo: "Encerrar", perigo: true })) {
        D.update("prescricoes", sp.dataset.suspender, { status: "Concluído" }); render(); C.toast("Prescrição encerrada.");
      }
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!C.validarFormulario(form)) return;
      const d = C.dadosFormulario(form);
      const r = D.add("prescricoes", {
        pacienteId: d.paciente, profissionalId: prof.id, unidadeId: prof.unidadeId, data: C.hojeISO(), medicamento: d.medicamento.trim(),
        dosagem: d.dosagem.trim(), frequencia: d.frequencia, duracao: d.duracao.trim(), orientacoes: d.orientacoes.trim(), status: /contínuo/i.test(d.duracao) ? "Uso contínuo" : "Em uso"
      }, "r");
      C.registrarAuditoria("Prescrição médica", { pacienteId: d.paciente });
      C.notificar(`paciente:${d.paciente}`, "Nova receita registrada", `${prof.nome} prescreveu ${r.medicamento}.`, "receitas.html", "file-text");
      form.reset(); qs("#rx-profissional").value = `${prof.nome} — ${prof.registro}`; qs("#rx-paciente").value = d.paciente;
      avisoAlergia.innerHTML = "";
      render();
      C.toast(`Prescrição de ${r.medicamento} registrada e disponível para o paciente.`, "sucesso", "Prescrição salva");
    });
    qs("#rx-limpar").addEventListener("click", () => { form.reset(); qs("#rx-profissional").value = `${prof.nome} — ${prof.registro}`; avisoAlergia.innerHTML = ""; });
    verificarAlergia();
    render();
  }, "medico");

  /* ------------------------------------------------------------------------
     Encaminhamentos
     ------------------------------------------------------------------------ */
  C.pagina("encaminhamentos", function (s) {
    const prof = D.profissional(s.refId);
    const form = qs("#form-enc");
    qs("#en-paciente").insertAdjacentHTML("beforeend", opcoesPacientes(C.param("paciente")));
    qs("#en-especialidade").insertAdjacentHTML("beforeend", C.ESPECIALIDADES.concat(["Pneumologia"]).sort().map((e) => `<option>${esc(e)}</option>`).join(""));
    qs("#en-destino").insertAdjacentHTML("beforeend", C.opcoes(D.getAll("unidades").filter((u) => u.integrada), "", (u) => `${u.nome} (${u.tipo})`));

    function render() {
      const f = qs("#en-filtro").value;
      const lista = D.where("encaminhamentos", (e) => !f || e.status === f).sort(porDataDesc);
      C.tabela(qs("#en-lista"), {
        rotulo: "Encaminhamentos", linhas: lista,
        colunas: [
          { titulo: "Paciente", render: (e) => `<span class="cell-strong">${esc(D.paciente(e.pacienteId).nome)}</span><span class="cell-sub">${esc(C.fmtData(e.data))}</span>` },
          { titulo: "Especialidade / destino", render: (e) => `${esc(e.especialidade)}<span class="cell-sub">${esc(D.unidade(e.destinoId).nome)}</span>` },
          { titulo: "Origem", render: (e) => `${esc(D.unidade(e.origemId).nome)}<span class="cell-sub">${esc(D.profissional(e.profissionalId).nome)}</span>` },
          { titulo: "Prioridade", render: (e) => badge(e.prioridade) },
          { titulo: "Status", render: (e) => badge(e.status) },
          { titulo: "Ações", render: (e) => `<div class="actions"><button type="button" class="btn btn-secondary btn-sm" data-ver="${e.id}" aria-label="Detalhes">${ico("eye")}</button>${e.status === "Pendente" ? `<button type="button" class="btn btn-outline btn-sm" data-agendar="${e.id}">${ico("calendar-check")} Agendar</button>` : ""}</div>` }
        ]
      });
    }
    qs("#en-filtro").addEventListener("change", render);
    qs("#en-lista").addEventListener("click", (e) => {
      const v = e.target.closest("[data-ver]"); const a = e.target.closest("[data-agendar]");
      if (v) {
        const x = D.getById("encaminhamentos", v.dataset.ver);
        C.abrirModal({ titulo: `Encaminhamento — ${x.especialidade}`, corpo: `<dl class="dl">
          <div><dt>Paciente</dt><dd>${esc(D.paciente(x.pacienteId).nome)}</dd></div><div><dt>Data</dt><dd>${esc(C.fmtData(x.data))}</dd></div>
          <div><dt>Origem</dt><dd>${esc(D.unidade(x.origemId).nome)}</dd></div><div><dt>Destino</dt><dd>${esc(D.unidade(x.destinoId).nome)}</dd></div>
          <div><dt>Profissional</dt><dd>${esc(D.profissional(x.profissionalId).nome)}</dd></div><div><dt>Prioridade</dt><dd>${badge(x.prioridade)}</dd></div>
          <div class="full"><dt>Motivo / justificativa clínica</dt><dd>${esc(x.motivo)}</dd></div><div><dt>Status</dt><dd>${badge(x.status)}</dd></div></dl>` });
      }
      if (a) { D.update("encaminhamentos", a.dataset.agendar, { status: "Agendado" }); render(); C.toast("Encaminhamento marcado como agendado na unidade de destino."); }
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!C.validarFormulario(form, { motivo: (v) => (v.trim().length >= 10 ? "" : "Descreva o motivo (mínimo 10 caracteres).") })) return;
      const d = C.dadosFormulario(form);
      D.add("encaminhamentos", { pacienteId: d.paciente, profissionalId: prof.id, origemId: prof.unidadeId, destinoId: d.destino, especialidade: d.especialidade, data: C.hojeISO(), motivo: d.motivo.trim(), prioridade: d.prioridade, status: "Pendente" }, "en");
      C.registrarAuditoria("Encaminhamento", { pacienteId: d.paciente });
      C.notificar(`paciente:${d.paciente}`, "Novo encaminhamento", `Você foi encaminhado(a) para ${d.especialidade}. Aguarde contato da unidade.`, "consultas.html", "send");
      form.reset(); render();
      C.toast("Encaminhamento registrado e compartilhado com a unidade de destino.", "sucesso");
    });
    render();
  }, "medico");
})();
