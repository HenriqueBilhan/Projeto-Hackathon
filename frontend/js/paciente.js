/* ==========================================================================
   CONECTA — Área do paciente (paciente.js)
   Visão geral, histórico médico, consultas, receitas/medicamentos,
   meu perfil e ajuda. Os exames ficam em exames.js.
   Todos os dados vêm da API (GET /patients/me, /attendances, /appointments,
   /prescriptions, /exams, /patients/{id}/access-logs).
   ========================================================================== */
(function () {
  "use strict";
  const C = window.Conecta;
  const { esc, ico, badge, tipoTag, qs, qsa } = C;
  const D = C.Data;
  const K = () => window.ConectaClinico;

  const doPaciente = (col, id) => D.where(col, (x) => x.pacienteId === id);
  const porDataDesc = (a, b) => b.data.localeCompare(a.data);
  const porDataAsc = (a, b) => a.data.localeCompare(b.data);
  const FUTURAS = ["Agendada", "Confirmada"];
  const ATIVOS = ["Em uso", "Uso contínuo"];
  const Api = C.Api;

  /** Carrega o próprio cadastro (com resumo clínico) para o cache. */
  async function carregarEu() { const p = await Api.get("/patients/me"); D.set("pacientes", [p]); return p; }

  /* ------------------------------------------------------------------------
     Visão geral
     ------------------------------------------------------------------------ */
  C.pagina("visao-geral", async function (s) {
    const [p] = await Promise.all([
      carregarEu(), D.fetch("atendimentos", "/attendances", { limit: 200 }), D.fetch("exames", "/exams", { limit: 200 }),
      D.fetch("consultas", "/appointments", { limit: 200 }), D.fetch("prescricoes", "/prescriptions", { limit: 200 }),
      D.fetch("acessos", `/patients/${s.refId}/access-logs`, { limit: 4 })
    ]);
    const atend = doPaciente("atendimentos", p.id).filter((a) => a.status === "Finalizado").sort(porDataDesc);
    const exames = doPaciente("exames", p.id);
    const proximas = doPaciente("consultas", p.id).filter((c) => FUTURAS.includes(c.status)).sort(porDataAsc);
    const meds = doPaciente("prescricoes", p.id).filter((r) => ATIVOS.includes(r.status));
    const naoLidas = D.where("notificacoes", (n) => !n.lida).length;

    qs("#boas-vindas").innerHTML = `
      <span class="avatar lg">${esc(C.iniciais(p.nome))}</span>
      <div class="w-info">
        <h1>Olá, ${esc(C.primeiroNome(p.nome))}!</h1>
        <p>${esc(p.nome)} — que bom ter você por aqui. Seu histórico está atualizado com todas as unidades da rede.</p>
        <div class="w-meta">
          <span>${ico("id-card")} CPF ${esc(C.mascararCPF(p.cpf))}</span>
          <span>${ico("credit-card")} CNS ${esc(C.mascararCNS(p.cns))}</span>
          <span>${ico("bell")} ${naoLidas} notificação(ões) nova(s)</span>
        </div>
      </div>
      <a class="btn" href="historico.html">${ico("history")} Ver meu histórico</a>`;

    qs("#cards-paciente").innerHTML = [
      ["Próximas consultas", proximas.length, proximas[0] ? `Próxima: ${C.fmtData(proximas[0].data)} às ${C.fmtHora(proximas[0].data)}` : "Nenhuma agendada", "calendar-days", "", "consultas.html"],
      ["Exames disponíveis", exames.filter((e) => e.status === "Resultado disponível").length, `${exames.filter((e) => e.status !== "Resultado disponível").length} aguardando resultado`, "flask-conical", "c2", "exames.html"],
      ["Atendimentos realizados", atend.length, `Em ${new Set(atend.map((a) => a.unidadeId)).size} unidades diferentes`, "stethoscope", "c3", "historico.html"],
      ["Medicamentos registrados", meds.length, "Em uso atualmente", "pill", "c4", "receitas.html?aba=medicamentos"]
    ].map(([l, v, sub, i, c, href]) => `<a class="stat anim-rise" href="${href}"><span class="stat-ico ${c}">${ico(i)}</span><div><div class="stat-label">${l}</div><div class="stat-value">${v}</div><div class="stat-sub">${esc(sub)}</div></div></a>`).join("");

    // Últimos atendimentos
    qs("#ultimos-atendimentos").innerHTML = atend.length ? `<ul class="list">${atend.slice(0, 4).map((a) => {
      const u = D.unidade(a.unidadeId); const d = C.diaMes(a.data);
      return `<li class="list-item"><span class="date-box"><b>${d.dia}</b><small>${d.mes}</small></span>
        <span class="li-main"><span class="li-title">${esc(u.nome)}</span><span class="li-sub">${esc(a.motivo)} · ${esc(D.profissional(a.profissionalId).nome)}</span></span>
        ${tipoTag(u.tipo)}<button type="button" class="btn-icon" data-atendimento="${a.id}" aria-label="Ver detalhes do atendimento de ${esc(C.fmtData(a.data))}">${ico("chevron-right")}</button></li>`;
    }).join("")}</ul>` : `<div class="empty">${ico("inbox")}<span>Nenhum atendimento registrado.</span></div>`;
    qs("#ultimos-atendimentos").addEventListener("click", (e) => { const b = e.target.closest("[data-atendimento]"); if (b) K().abrirAtendimento(D.getById("atendimentos", b.dataset.atendimento)); });

    // Resumo da minha saúde
    const ultimoComSinais = atend.find((a) => a.sinais);
    const sv = ultimoComSinais ? ultimoComSinais.sinais : null;
    qs("#resumo-saude").innerHTML = `
      <div class="health-grid">
        <div class="health-item"><span>${ico("droplet")} Tipo sanguíneo</span><strong>${esc(p.tipoSanguineo)}</strong></div>
        <div class="health-item"><span>${ico("cake")} Idade</span><strong>${C.calcIdade(p.nascimento)} anos</strong></div>
        ${sv ? `<div class="health-item"><span>${ico("activity")} Última pressão</span><strong>${esc(sv.pa)}</strong></div>
        <div class="health-item"><span>${ico("scale")} Peso</span><strong>${esc(sv.peso || "—")}</strong></div>` : ""}
      </div>
      <h3 class="mt-2">Alergias</h3>
      <div>${p.alergias.length ? p.alergias.map((a) => `<span class="chip chip-perigo">${ico("alert-triangle")} ${esc(a.nome)}</span>`).join("") : '<span class="muted small">Nenhuma alergia registrada</span>'}</div>
      <h3 class="mt-2">Condições crônicas</h3>
      <div>${p.cronicas.length ? p.cronicas.map((c) => `<span class="chip">${esc(c)}</span>`).join("") : '<span class="muted small">Nenhuma condição registrada</span>'}</div>
      <h3 class="mt-2">Medicamentos em uso</h3>
      <ul class="list">${meds.slice(0, 4).map((m) => `<li class="list-item"><span class="li-ico">${ico("pill")}</span><span class="li-main"><span class="li-title">${esc(m.medicamento)}</span><span class="li-sub">${esc(m.dosagem)} · ${esc(m.frequencia)}</span></span></li>`).join("") || '<li class="muted small">Nenhum medicamento em uso</li>'}</ul>
      ${sv ? `<p class="small muted mb-0">Sinais vitais aferidos em ${esc(C.fmtData(ultimoComSinais.data))} — ${esc(D.unidade(ultimoComSinais.unidadeId).nome)}.</p>` : ""}`;

    // Próximas consultas
    qs("#proximas-consultas").innerHTML = proximas.length ? `<ul class="list">${proximas.slice(0, 3).map((c) => {
      const d = C.diaMes(c.data);
      return `<li class="list-item"><span class="date-box"><b>${d.dia}</b><small>${d.mes}</small></span><span class="li-main"><span class="li-title">${esc(c.especialidade)} · ${C.fmtHora(c.data)}</span><span class="li-sub">${esc(D.profissional(c.profissionalId).nome)} — ${esc(D.unidade(c.unidadeId).nome)}</span></span>${badge(c.status)}</li>`;
    }).join("")}</ul>` : `<div class="empty">${ico("calendar-x")}<span>Nenhuma consulta agendada.</span></div>`;

    // Quem acessou meu prontuário (transparência LGPD)
    const acessos = D.getAll("acessos").slice(0, 4);
    qs("#acessos-prontuario").innerHTML = `<ul class="list">${acessos.map((l) => `<li class="list-item"><span class="li-ico">${ico(l.operacao.includes("negada") ? "shield-x" : "eye")}</span><span class="li-main"><span class="li-title">${esc(l.usuario)}</span><span class="li-sub">${esc(l.operacao)} · ${esc(l.unidadeId ? D.unidade(l.unidadeId).nome : "—")} · ${esc(C.fmtDataHora(l.data))}</span></span></li>`).join("") || '<li class="muted small">Nenhum acesso registrado.</li>'}</ul>`;
  }, "paciente");

  /* ------------------------------------------------------------------------
     Meu histórico médico (linha do tempo)
     ------------------------------------------------------------------------ */
  C.pagina("historico", async function (s) {
    await Promise.all([carregarEu(), D.fetch("atendimentos", `/patients/${s.refId}/history`)]);
    const todos = doPaciente("atendimentos", s.refId).filter((a) => a.status === "Finalizado").sort(porDataDesc);
    const selUni = qs("#h-unidade");
    selUni.insertAdjacentHTML("beforeend", C.opcoes([...new Set(todos.map((a) => a.unidadeId))].map((id) => D.unidade(id))));
    const selTipo = qs("#h-tipo");
    selTipo.insertAdjacentHTML("beforeend", [...new Set(todos.map((a) => a.tipo))].map((t) => `<option>${esc(t)}</option>`).join(""));
    const anos = [...new Set(todos.map((a) => a.data.slice(0, 4)))];
    qs("#h-ano").insertAdjacentHTML("beforeend", anos.map((a) => `<option>${a}</option>`).join(""));

    // Resumo por tipo de unidade
    const porTipo = {};
    todos.forEach((a) => { const t = D.unidade(a.unidadeId).tipo; porTipo[t] = (porTipo[t] || 0) + 1; });
    qs("#h-resumo").innerHTML = Object.keys(porTipo).map((t) => `<span class="legend-item">${tipoTag(t)} <b>${porTipo[t]}</b></span>`).join("");

    const form = qs("#filtros-historico");
    const alvo = qs("#timeline-paciente");
    function render() {
      const f = C.dadosFormulario(form);
      const termo = (f.busca || "").toLowerCase();
      const lista = todos.filter((a) => (!f.unidade || a.unidadeId === f.unidade) && (!f.tipo || a.tipo === f.tipo) && (!f.ano || a.data.startsWith(f.ano)) &&
        (!termo || `${a.motivo} ${a.diagnostico} ${D.profissional(a.profissionalId).nome} ${D.unidade(a.unidadeId).nome}`.toLowerCase().includes(termo)));
      qs("#h-contagem").textContent = `${lista.length} registro(s)`;
      alvo.innerHTML = K().timelineHTML(lista);
      C.icones();
    }
    form.addEventListener("input", render);
    form.addEventListener("reset", () => setTimeout(render, 0));
    K().ligarTimeline(alvo);
    render();
    qs("#btn-imprimir-historico").addEventListener("click", () => window.print());
  }, "paciente");

  /* ------------------------------------------------------------------------
     Minhas consultas
     ------------------------------------------------------------------------ */
  C.pagina("consultas", async function (s) {
    await D.fetch("consultas", "/appointments", { limit: 500 });
    const form = qs("#filtros-consultas");
    const todas = () => doPaciente("consultas", s.refId);
    qs("#c-especialidade").insertAdjacentHTML("beforeend", [...new Set(todas().map((c) => c.especialidade))].map((e) => `<option>${esc(e)}</option>`).join(""));
    qs("#c-unidade").insertAdjacentHTML("beforeend", C.opcoes([...new Set(todas().map((c) => c.unidadeId))].map((id) => D.unidade(id))));
    let aba = C.param("aba") === "anteriores" ? "anteriores" : "proximas";

    function filtrar(lista) {
      const f = C.dadosFormulario(form);
      return lista.filter((c) => (!f.especialidade || c.especialidade === f.especialidade) && (!f.unidade || c.unidadeId === f.unidade) && (!f.status || c.status === f.status));
    }
    function cardConsulta(c, futura) {
      const d = C.diaMes(c.data); const p = D.profissional(c.profissionalId); const u = D.unidade(c.unidadeId);
      return `<article class="appt ${futura ? "" : "past"}">
        <span class="date-box"><b>${d.dia}</b><small>${d.mes}</small></span>
        <div class="appt-main">
          <div class="appt-top"><h3>${esc(c.especialidade)}</h3>${badge(c.status)}</div>
          <div class="tl-meta"><span>${ico("clock")} ${esc(C.fmtData(c.data))} às ${C.fmtHora(c.data)}</span><span>${ico("user-round")} ${esc(p.nome)}</span><span>${ico("map-pin")} ${esc(u.nome)}</span><span>${ico("tag")} ${esc(c.tipo)}</span></div>
        </div>
        <div class="appt-actions">
          <button type="button" class="btn btn-outline btn-sm" data-detalhe="${c.id}">${ico("info")} Detalhes</button>
          ${futura ? `<button type="button" class="btn btn-ghost btn-sm text-danger" data-cancelar="${c.id}">${ico("x-circle")} Cancelar</button>` : ""}
        </div>
      </article>`;
    }
    function render() {
      const prox = filtrar(todas().filter((c) => FUTURAS.includes(c.status))).sort(porDataAsc);
      const ant = filtrar(todas().filter((c) => !FUTURAS.includes(c.status))).sort(porDataDesc);
      qs("#n-proximas").textContent = prox.length; qs("#n-anteriores").textContent = ant.length;
      qs("#lista-proximas").innerHTML = prox.length ? prox.map((c) => cardConsulta(c, true)).join("") : `<div class="empty">${ico("calendar-x")}<span>Nenhuma consulta futura com esses filtros.</span></div>`;
      qs("#lista-anteriores").innerHTML = ant.length ? ant.map((c) => cardConsulta(c, false)).join("") : `<div class="empty">${ico("calendar-x")}<span>Nenhuma consulta anterior com esses filtros.</span></div>`;
      C.icones();
    }
    const ativar = C.iniciarAbas(qs("#abas-consultas"), (nome) => { aba = nome; C.definirAba(nome); });
    ativar(aba);
    form.addEventListener("input", render);
    form.addEventListener("reset", () => setTimeout(render, 0));

    qs("#abas-consultas").addEventListener("click", async (e) => {
      const det = e.target.closest("[data-detalhe]"); const can = e.target.closest("[data-cancelar]");
      if (det) {
        const c = D.getById("consultas", det.dataset.detalhe); const u = D.unidade(c.unidadeId); const p = D.profissional(c.profissionalId);
        C.abrirModal({ titulo: `Consulta — ${c.especialidade}`, corpo: `<dl class="dl">
          <div><dt>Data e horário</dt><dd>${esc(C.fmtDataHora(c.data))}</dd></div><div><dt>Status</dt><dd>${badge(c.status)}</dd></div>
          <div><dt>Profissional</dt><dd>${esc(p.nome)}</dd></div><div><dt>Especialidade</dt><dd>${esc(c.especialidade)}</dd></div>
          <div class="full"><dt>Unidade de atendimento</dt><dd>${esc(u.nome)} — ${esc(u.endereco)}</dd></div>
          <div><dt>Telefone da unidade</dt><dd>${esc(u.telefone)}</dd></div><div><dt>Tipo</dt><dd>${esc(c.tipo)}</dd></div></dl>
          ${FUTURAS.includes(c.status) ? `<div class="alert alert-info mt-3 mb-0">${ico("info")}<span>Chegue com 15 minutos de antecedência e leve um documento com foto e o Cartão SUS.</span></div>` : ""}` });
      }
      if (can) {
        const c = D.getById("consultas", can.dataset.cancelar);
        const ok = await C.confirmar({ titulo: "Cancelar consulta", mensagem: `Deseja cancelar a consulta de ${c.especialidade} em ${C.fmtDataHora(c.data)}? A vaga será liberada para outro paciente.`, rotulo: "Cancelar consulta", perigo: true });
        if (ok) {
          try { D.put("consultas", await Api.del(`/appointments/${c.id}`)); render(); C.toast("Consulta cancelada com sucesso."); }
          catch (err) { C.erroApi(err); }
        }
      }
    });

    // Solicitar agendamento: especialidades reais dos profissionais ativos de cada unidade
    qs("#btn-agendar").addEventListener("click", () => {
      const especialidadesDe = (uid) => [...new Set(D.where("profissionais", (p) => p.unidadeId === uid && p.ativo && ["Médico", "Enfermeiro"].includes(p.cargo)).map((p) => p.especialidade))].sort();
      const unidades = D.where("unidades", (u) => u.ativa !== false && (u.tipo === "UBS" || u.tipo === "Clínica") && especialidadesDe(u.id).length);
      if (!unidades.length) { C.toast("Ainda não há unidades com agenda disponível na rede.", "alerta"); return; }
      C.abrirModal({
        titulo: "Solicitar agendamento",
        corpo: `<form id="form-agendar" class="form-grid" novalidate>
          <div class="field span-all"><label for="ag-uni">Unidade</label><select class="select" id="ag-uni" name="unidade" required><option value="">Selecione</option>${C.opcoes(unidades)}</select><span class="field-error" data-erro-de="ag-uni"></span></div>
          <div class="field span-all"><label for="ag-esp">Especialidade</label><select class="select" id="ag-esp" name="especialidade" required disabled><option value="">Escolha a unidade primeiro</option></select><span class="field-error" data-erro-de="ag-esp"></span></div>
          <div class="field"><label for="ag-data">Data preferida</label><input class="input" type="date" id="ag-data" name="data" required min="${C.hojeISO()}"><span class="field-error" data-erro-de="ag-data"></span></div>
          <div class="field"><label for="ag-hora">Horário</label><select class="select" id="ag-hora" name="hora">${["08:00", "09:00", "10:00", "11:00", "14:00", "15:00", "16:00"].map((h) => `<option>${h}</option>`).join("")}</select></div>
        </form><p class="small muted mt-2 mb-0">A consulta fica "Agendada" e a unidade pode confirmá-la ou propor outro horário.</p>`,
        aoAbrir: (m) => {
          const uni = qs("#ag-uni", m); const esp = qs("#ag-esp", m);
          uni.addEventListener("change", () => {
            const lista = especialidadesDe(uni.value);
            esp.disabled = !lista.length;
            esp.innerHTML = lista.length ? `<option value="">Selecione</option>${lista.map((e) => `<option>${esc(e)}</option>`).join("")}` : `<option value="">Sem especialidades disponíveis</option>`;
          });
        },
        acoes: [{ label: "Cancelar", onClick: "fechar" }, { label: "Solicitar", classe: "btn-primary", icone: "calendar-plus", onClick: async (fechar, m) => {
          const f = qs("#form-agendar", m);
          if (!C.validarFormulario(f, { data: (v) => (v >= C.hojeISO() ? "" : "Escolha uma data futura.") })) return;
          const d = C.dadosFormulario(f);
          try {
            D.put("consultas", await Api.post("/appointments", { unidadeId: d.unidade, especialidade: d.especialidade, data: `${d.data}T${d.hora}` }));
            fechar(); ativar("proximas"); render();
            C.toast("Consulta agendada. Acompanhe a confirmação pela unidade.", "sucesso");
          } catch (err) { C.erroApi(err, "Agendamento não realizado"); }
        } }]
      });
    });
    render();
  }, "paciente");

  /* ------------------------------------------------------------------------
     Minhas receitas e Meus medicamentos
     ------------------------------------------------------------------------ */
  C.pagina("receitas", async function (s) {
    const [p] = await Promise.all([carregarEu(), D.fetch("prescricoes", "/prescriptions", { limit: 500 })]);
    const todas = doPaciente("prescricoes", s.refId).sort(porDataDesc);
    const form = qs("#filtros-receitas");

    function renderReceitas() {
      const f = C.dadosFormulario(form);
      const termo = (f.busca || "").toLowerCase();
      const lista = todas.filter((r) => (!f.status || (f.status === "ativas" ? ATIVOS.includes(r.status) : r.status === "Concluído")) &&
        (!termo || `${r.medicamento} ${D.profissional(r.profissionalId).nome}`.toLowerCase().includes(termo)));
      qs("#lista-receitas").innerHTML = lista.length ? lista.map((r) => `
        <article class="rx-card">
          <div class="rx-card-top"><span class="li-ico">${ico("pill")}</span><div class="li-main"><h3>${esc(r.medicamento)}</h3><span class="muted small">${esc(r.dosagem)}</span></div>${badge(r.status)}</div>
          <dl class="rx-info">
            <div><dt>${ico("repeat")} Frequência</dt><dd>${esc(r.frequencia)}</dd></div>
            <div><dt>${ico("timer")} Duração</dt><dd>${esc(r.duracao)}</dd></div>
            <div><dt>${ico("user-round")} Médico</dt><dd>${esc(D.profissional(r.profissionalId).nome)}</dd></div>
            <div><dt>${ico("calendar")} Prescrição</dt><dd>${esc(C.fmtData(r.data))}</dd></div>
          </dl>
          <p class="rx-orient">${ico("info")} ${esc(r.orientacoes)}</p>
          <button type="button" class="btn btn-secondary btn-sm btn-block" data-receita="${r.id}">${ico("file-text")} Visualizar receita</button>
        </article>`).join("") : `<div class="empty">${ico("file-x")}<span>Nenhuma receita encontrada.</span></div>`;
      C.icones();
    }

    function renderMedicamentos() {
      const ativos = todas.filter((r) => ATIVOS.includes(r.status));
      const tomados = C.Store.get("tomados", {});
      const hoje = tomados[C.hojeISO()] || {};
      qs("#alergia-alerta").innerHTML = p.alergias.length ? `<div class="alert alert-perigo">${ico("alert-triangle")}<span><strong>Alergias registradas:</strong> ${p.alergias.map((a) => esc(a.nome)).join(", ")}. Informe sempre ao profissional antes de usar qualquer medicamento.</span></div>` : "";
      qs("#lista-medicamentos").innerHTML = ativos.length ? `<ul class="list med-list">${ativos.map((r) => `
        <li class="list-item"><span class="li-ico">${ico("pill")}</span>
          <span class="li-main"><span class="li-title">${esc(r.medicamento)} — ${esc(r.dosagem)}</span><span class="li-sub">${esc(r.frequencia)} · ${esc(r.duracao)} · ${esc(D.profissional(r.profissionalId).nome)}</span></span>
          ${badge(r.status)}
          <label class="switch"><input type="checkbox" data-tomado="${r.id}" ${hoje[r.id] ? "checked" : ""}><span class="track"></span><span class="small">Tomei hoje</span></label>
        </li>`).join("")}</ul>` : `<div class="empty">${ico("pill")}<span>Nenhum medicamento em uso.</span></div>`;
      const feitos = ativos.filter((r) => hoje[r.id]).length;
      qs("#progresso-med").textContent = `${feitos} de ${ativos.length} registrados hoje`;
      C.icones();
    }

    qs("#lista-medicamentos").addEventListener("change", (e) => {
      const cb = e.target.closest("[data-tomado]"); if (!cb) return;
      const tomados = C.Store.get("tomados", {});
      tomados[C.hojeISO()] = Object.assign({}, tomados[C.hojeISO()], { [cb.dataset.tomado]: cb.checked });
      C.Store.set("tomados", tomados);
      renderMedicamentos();
      if (cb.checked) C.toast("Registro de uso salvo para hoje.", "sucesso");
    });
    qs("#lista-receitas").addEventListener("click", (e) => { const b = e.target.closest("[data-receita]"); if (b) K().abrirReceita(D.getById("prescricoes", b.dataset.receita)); });
    form.addEventListener("input", renderReceitas);
    const ativar = C.iniciarAbas(qs("#abas-receitas"), (nome) => C.definirAba(nome));
    ativar(C.param("aba") === "medicamentos" ? "medicamentos" : "receitas");
    renderReceitas(); renderMedicamentos();
  }, "paciente");

  /* ------------------------------------------------------------------------
     Meu perfil (perfil-paciente.html acessado pelo paciente)
     ------------------------------------------------------------------------ */
  C.pagina("perfil", async function (s) {
    qs("#visao-medico").remove();
    await Promise.all([carregarEu(), D.fetch("acessos", `/patients/${s.refId}/access-logs`, { limit: 50 })]);
    qs("#visao-paciente").classList.remove("hidden");
    document.title = "Meu perfil | Conecta";
    const t = qs(".topbar-title strong"); if (t) t.textContent = "Meu perfil";
    let mostrarDocs = false;

    function render() {
      const p = D.paciente(s.refId);
      const cfg = p.preferencias || { notificarAcesso: true, compartilhar: true };
      qs("#perfil-cabecalho").innerHTML = `
        <span class="avatar xl">${esc(C.iniciais(p.nome))}</span>
        <div class="li-main"><h1 class="mb-0">${esc(p.nome)}</h1><p class="muted mb-0">Paciente desde ${esc(C.fmtData(p.cadastro))} · Unidade de referência: ${esc(D.unidade(p.unidadeRef).nome)}</p></div>
        <div class="btn-row"><button type="button" class="btn btn-outline" id="btn-docs" aria-pressed="${mostrarDocs}">${ico(mostrarDocs ? "eye-off" : "eye")} ${mostrarDocs ? "Ocultar" : "Exibir"} documentos</button>
        <button type="button" class="btn btn-primary" id="btn-editar">${ico("pencil")} Editar dados</button></div>`;
      qs("#perfil-dados").innerHTML = `<dl class="dl">
        <div class="full"><dt>Nome completo</dt><dd>${esc(p.nome)}</dd></div>
        <div><dt>CPF</dt><dd>${esc(mostrarDocs ? C.formatarCPF(p.cpf) : C.mascararCPF(p.cpf))}</dd></div>
        <div><dt>CNS (Cartão Nacional de Saúde)</dt><dd>${esc(mostrarDocs ? C.formatarCNS(p.cns) : C.mascararCNS(p.cns))}</dd></div>
        <div><dt>Data de nascimento</dt><dd>${esc(C.fmtData(p.nascimento))} (${C.calcIdade(p.nascimento)} anos)</dd></div>
        <div><dt>Sexo</dt><dd>${esc(p.sexo)}</dd></div>
        <div><dt>Telefone</dt><dd>${esc(p.telefone || "—")}</dd></div>
        <div><dt>E-mail</dt><dd>${esc(p.email || "—")}</dd></div>
        <div class="full"><dt>Endereço</dt><dd>${esc(p.endereco)}</dd></div>
        <div><dt>Nome da mãe</dt><dd>${esc(p.nomeMae)}</dd></div>
        <div><dt>Contato de emergência</dt><dd>${esc(p.contatoEmergencia || "—")}</dd></div>
      </dl>`;
      qs("#perfil-clinico").innerHTML = `<dl class="dl">
        <div><dt>Tipo sanguíneo</dt><dd>${esc(p.tipoSanguineo)}</dd></div>
        <div><dt>Unidade de referência</dt><dd>${esc(D.unidade(p.unidadeRef).nome)}</dd></div>
        <div class="full"><dt>Alergias</dt><dd>${p.alergias.map((a) => `<span class="chip chip-perigo">${esc(a.nome)} (${esc(a.gravidade)})</span>`).join("") || "Nenhuma"}</dd></div>
        <div class="full"><dt>Condições crônicas</dt><dd>${p.cronicas.map((c) => `<span class="chip">${esc(c)}</span>`).join("") || "Nenhuma"}</dd></div>
      </dl>`;
      qs("#perfil-privacidade").innerHTML = `
        <label class="switch pref"><input type="checkbox" data-pref="notificarAcesso" ${cfg.notificarAcesso ? "checked" : ""}><span class="track"></span><span><strong>Avisar quando meu prontuário for acessado</strong><span class="li-sub">Receba uma notificação a cada consulta ao seu histórico.</span></span></label>
        <label class="switch pref"><input type="checkbox" data-pref="compartilhar" ${cfg.compartilhar ? "checked" : ""}><span class="track"></span><span><strong>Compartilhar histórico entre unidades da rede</strong><span class="li-sub">Permite que profissionais autorizados vejam seus atendimentos anteriores.</span></span></label>`;
      const acessos = D.getAll("acessos");
      C.tabela(qs("#perfil-acessos"), {
        rotulo: "Acessos ao meu prontuário", linhas: acessos, vazio: "Nenhum acesso de profissionais registrado até o momento.",
        colunas: [
          { titulo: "Quem acessou", render: (l) => `<span class="cell-strong">${esc(l.usuario)}</span><span class="cell-sub">${esc(l.perfil)}</span>` },
          { titulo: "Unidade", render: (l) => esc(l.unidadeId ? D.unidade(l.unidadeId).nome : "—") },
          { titulo: "Operação", render: (l) => esc(l.operacao) },
          { titulo: "Data e horário", render: (l) => esc(C.fmtDataHora(l.data)) }
        ]
      });
      C.icones();
    }

    qs("#visao-paciente").addEventListener("click", (e) => {
      if (e.target.closest("#btn-docs")) { mostrarDocs = !mostrarDocs; render(); }
      if (e.target.closest("#btn-editar")) editar();
    });
    async function salvarPreferencia(chave, valor) {
      try { D.set("pacientes", [await Api.patch(`/patients/${s.refId}`, { preferencias: { [chave]: valor } })]); return true; }
      catch (err) { C.erroApi(err); return false; }
    }
    qs("#visao-paciente").addEventListener("change", async (e) => {
      const cb = e.target.closest("[data-pref]"); if (!cb) return;
      if (cb.dataset.pref === "compartilhar" && !cb.checked) {
        const ok = await C.confirmar({ titulo: "Restringir compartilhamento", mensagem: "Sem o compartilhamento, profissionais de outras unidades não verão seu histórico (exceto em acesso de emergência justificado e auditado). Deseja continuar?", rotulo: "Restringir", perigo: true });
        if (!ok) { cb.checked = true; return; }
        if (await salvarPreferencia("compartilhar", false)) C.toast("Compartilhamento restrito às unidades onde você é atendido(a).", "alerta"); else cb.checked = true;
        return;
      }
      if (await salvarPreferencia(cb.dataset.pref, cb.checked)) C.toast("Preferência de privacidade atualizada."); else cb.checked = !cb.checked;
    });

    function editar() {
      const p = D.paciente(s.refId);
      C.abrirModal({
        titulo: "Editar dados de contato",
        corpo: `<form id="form-edit" class="form-grid" novalidate>
          <div class="field"><label for="ed-tel">Telefone</label><input class="input" id="ed-tel" name="telefone" value="${esc(p.telefone || "")}" required><span class="field-error" data-erro-de="ed-tel"></span></div>
          <div class="field"><label for="ed-email">E-mail</label><input class="input" id="ed-email" type="email" name="email" value="${esc(p.email || "")}" required><span class="field-error" data-erro-de="ed-email"></span></div>
          <div class="field span-all"><label for="ed-end">Endereço</label><input class="input" id="ed-end" name="endereco" value="${esc(p.endereco === "Não informado" ? "" : p.endereco)}" required><span class="field-error" data-erro-de="ed-end"></span></div>
          <div class="field span-all"><label for="ed-emerg">Contato de emergência</label><input class="input" id="ed-emerg" name="contatoEmergencia" value="${esc(p.contatoEmergencia || "")}"></div>
        </form><p class="small muted mt-2 mb-0">Nome, CPF, CNS e data de nascimento só podem ser alterados presencialmente na unidade de saúde.</p>`,
        acoes: [{ label: "Cancelar", onClick: "fechar" }, { label: "Salvar", classe: "btn-primary", icone: "save", onClick: async (fechar, m) => {
          const f = qs("#form-edit", m);
          if (!C.validarFormulario(f, { email: (v) => (/^\S+@\S+\.\S+$/.test(v) ? "" : "E-mail inválido."), telefone: (v) => (C.somenteDigitos(v).length >= 10 ? "" : "Telefone inválido.") })) return;
          try { D.set("pacientes", [await Api.patch(`/patients/${p.id}`, C.dadosFormulario(f))]); fechar(); render(); C.toast("Seus dados foram atualizados."); }
          catch (err) { C.erroApi(err); }
        } }]
      });
    }
    render();
  }, "paciente");

  /* ------------------------------------------------------------------------
     Ajuda e suporte
     ------------------------------------------------------------------------ */
  C.pagina("ajuda", async function (s) {
    const p = await carregarEu();
    const busca = qs("#busca-faq");
    busca.addEventListener("input", () => {
      const t = busca.value.toLowerCase(); let n = 0;
      qsa(".faq details").forEach((d) => { const ok = d.textContent.toLowerCase().includes(t); d.classList.toggle("hidden", !ok); if (ok) n++; });
      qs("#faq-vazio").classList.toggle("hidden", n > 0);
    });
    // Canal real: a unidade de referência do paciente (dados do cadastro da rede).
    const u = p.unidadeRef ? D.unidade(p.unidadeRef) : null;
    qs("#contato-unidade").innerHTML = u && u.nome !== "Unidade" ? `
      <p class="mb-0"><strong>${esc(u.nome)}</strong> ${tipoTag(u.tipo)}</p>
      <ul class="privacy-list mt-2">
        <li>${ico("map-pin")} ${esc(u.endereco)}</li>
        <li>${ico("phone")} ${esc(u.telefone)}</li>
        <li>${ico("clock")} ${esc(u.horario)}</li>
      </ul>
      <p class="small muted mb-0">Para corrigir informações do seu histórico ou dúvidas sobre atendimentos, procure a recepção da unidade.</p>`
      : `<p class="muted mb-0">Sua unidade de referência ainda não foi definida. Ela é registrada no seu primeiro atendimento na rede.</p>
         <a class="btn btn-outline btn-sm mt-2" href="rede.html">${ico("building-2")} Ver unidades da rede</a>`;
  }, "paciente");
})();
