/* ==========================================================================
   CONECTA — Registro de atendimento e solicitação de exames (atendimento.js)
   Ao salvar (POST /attendances), o atendimento passa a compor a linha do tempo
   do paciente e fica visível para as unidades autorizadas e para o próprio paciente.
   Exames: POST /exam-requests, PATCH /exam-requests/{id}, POST /exam-results.
   ========================================================================== */
(function () {
  "use strict";
  const C = window.Conecta;
  const { esc, ico, badge, qs, qsa } = C;
  const D = C.Data;
  const Api = C.Api;
  const M = () => window.ConectaMedico;
  const porDataDesc = (a, b) => String(b.data).localeCompare(String(a.data));

  const PROCEDIMENTOS = ["Consulta médica", "Aferição de sinais vitais", "Medicação via oral", "Medicação endovenosa", "Nebulização", "Curativo", "Sutura", "Eletrocardiograma", "Coleta de exames", "Orientações em saúde"];
  const EXAMES_RAPIDOS = ["Hemograma completo", "Glicemia em jejum", "Hemoglobina glicada (HbA1c)", "Urina tipo I (EAS)", "Urocultura com antibiograma", "Perfil lipídico", "Creatinina", "TSH", "Eletrocardiograma", "Raio-X de tórax"];
  const FLUXO = ["Solicitado", "Agendado", "Em andamento", "Resultado disponível"];
  const vazioParaUndefined = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== "" && v !== null && v !== undefined));

  /** Cadastro de paciente pelo profissional (POST /patients). Retorna o paciente criado. */
  function cadastrarPaciente() {
    return new Promise((resolve) => {
      C.abrirModal({
        titulo: "Cadastrar paciente", tamanho: "lg",
        corpo: `<form id="form-novo-pac" class="form-grid" novalidate>
          <div class="field span-all"><label for="np-nome">Nome completo <span class="req">*</span></label><input class="input" id="np-nome" name="nome" required><span class="field-error" data-erro-de="np-nome"></span></div>
          <div class="field"><label for="np-cpf">CPF <span class="req">*</span></label><input class="input" id="np-cpf" name="cpf" inputmode="numeric" maxlength="14" required><span class="field-error" data-erro-de="np-cpf"></span></div>
          <div class="field"><label for="np-cns">CNS <span class="req">*</span></label><input class="input" id="np-cns" name="cns" inputmode="numeric" maxlength="18" required><span class="field-error" data-erro-de="np-cns"></span></div>
          <div class="field"><label for="np-nasc">Data de nascimento <span class="req">*</span></label><input class="input" id="np-nasc" name="nascimento" type="date" required><span class="field-error" data-erro-de="np-nasc"></span></div>
          <div class="field"><label for="np-sexo">Sexo</label><select class="select" id="np-sexo" name="sexo"><option>Não informado</option><option>Feminino</option><option>Masculino</option><option>Outro</option></select></div>
          <div class="field"><label for="np-tel">Telefone</label><input class="input" id="np-tel" name="telefone"></div>
          <div class="field"><label for="np-ts">Tipo sanguíneo</label><select class="select" id="np-ts" name="tipoSanguineo">${["Não informado", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((t) => `<option>${t}</option>`).join("")}</select></div>
          <div class="field span-all"><label for="np-alerg">Alergias (separe por vírgula)</label><input class="input" id="np-alerg" name="alergias" placeholder="Ex.: Dipirona, Penicilina"></div>
          <div class="field span-all"><label for="np-cron">Condições crônicas (separe por vírgula)</label><input class="input" id="np-cron" name="cronicas" placeholder="Ex.: Hipertensão arterial (CID I10)"></div>
        </form>`,
        aoAbrir: (m) => { const c = qs("#np-cpf", m); c.addEventListener("input", () => { c.value = C.formatarCPF(c.value); }); },
        acoes: [{ label: "Cancelar", onClick: (f) => { resolve(null); f(); } }, { label: "Cadastrar", classe: "btn-primary", icone: "user-plus", onClick: async (f, m) => {
          const form = qs("#form-novo-pac", m);
          if (!C.validarFormulario(form, { cpf: (v) => (C.validarCPF(v) ? "" : "CPF inválido."), cns: (v) => (C.somenteDigitos(v).length === 15 ? "" : "O CNS deve ter 15 dígitos.") })) return;
          const d = C.dadosFormulario(form);
          const lista = (v) => String(v || "").split(",").map((x) => x.trim()).filter(Boolean);
          try {
            const p = await Api.post("/patients", vazioParaUndefined({
              nome: d.nome.trim(), cpf: C.somenteDigitos(d.cpf), cns: C.somenteDigitos(d.cns), nascimento: d.nascimento, sexo: d.sexo,
              telefone: d.telefone, tipoSanguineo: d.tipoSanguineo, alergias: lista(d.alergias).map((nome) => ({ nome })), cronicas: lista(d.cronicas)
            }));
            D.put("pacientes", p); f(); resolve(p);
            C.toast(`${p.nome} cadastrado(a) na sua unidade.`, "sucesso");
          } catch (err) { C.erroApi(err, "Cadastro não realizado"); }
        } }]
      });
    });
  }
  window.ConectaAtendimento = { cadastrarPaciente };

  /* ------------------------------------------------------------------------
     Registro de atendimento
     ------------------------------------------------------------------------ */
  C.pagina("atendimento", async function (s) {
    const form = qs("#form-atendimento");
    let rascunhoId = C.param("rascunho") || "";
    let alterado = false;
    await M().carregarPacientes();

    qs("#at-paciente").insertAdjacentHTML("beforeend", M().opcoesPacientes(C.param("paciente")));
    qs("#at-paciente").insertAdjacentHTML("afterend", `<button type="button" class="link-btn small" id="btn-novo-paciente">${ico("user-plus")} Paciente não cadastrado? Cadastrar agora</button>`);
    // O atendimento é sempre registrado na unidade de atuação do profissional.
    qs("#at-unidade").insertAdjacentHTML("beforeend", C.opcoes(D.where("unidades", (u) => u.id === s.unidadeId), s.unidadeId));
    qs("#at-profissional").value = `${s.nome} — ${s.registro || ""}`;
    qs("#at-especialidade").insertAdjacentHTML("beforeend", C.ESPECIALIDADES.map((e) => `<option ${e === s.especialidade ? "selected" : ""}>${esc(e)}</option>`).join(""));
    qs("#at-data").value = C.agoraISO();
    qs("#at-data").max = C.agoraISO();
    qs("#at-procedimentos").innerHTML = PROCEDIMENTOS.map((p, i) => `<label class="check"><input type="checkbox" name="proc" value="${esc(p)}" id="proc-${i}"> ${esc(p)}</label>`).join("");
    qs("#at-exames").innerHTML = EXAMES_RAPIDOS.map((p, i) => `<label class="check"><input type="checkbox" name="exame" value="${esc(p)}" id="ex-${i}"> ${esc(p)}</label>`).join("");
    qs("#at-enc-especialidade").insertAdjacentHTML("beforeend", C.ESPECIALIDADES.map((e) => `<option>${esc(e)}</option>`).join(""));
    qs("#at-enc-destino").insertAdjacentHTML("beforeend", C.opcoes(D.where("unidades", (u) => u.integrada && u.ativa !== false)));

    qs("#btn-novo-paciente").addEventListener("click", async () => {
      const p = await cadastrarPaciente();
      if (!p) return;
      const sel = qs("#at-paciente");
      sel.insertAdjacentHTML("beforeend", C.opcoes([p], p.id, (x) => `${x.nome} — CPF ${C.mascararCPF(x.cpf)}`));
      sel.value = p.id; resumoPaciente();
    });

    /** Resumo clínico integrado do paciente selecionado (prontuário autorizado pelo servidor). */
    async function resumoPaciente() {
      const id = qs("#at-paciente").value;
      const alvo = qs("#at-resumo");
      if (!id) { alvo.innerHTML = `<div class="empty">${ico("user-search")}<span>Selecione um paciente para ver o resumo clínico integrado.</span></div>`; C.icones(); return; }
      alvo.innerHTML = `<p class="muted small">Carregando prontuário…</p>`;
      let p; let ultimo = null; let meds = [];
      try {
        p = (await M().obterProntuario(id)).paciente;
        D.put("pacientes", p);
        const [hist, presc] = await Promise.all([Api.list(`/patients/${id}/attendances`, { limit: 1 }), Api.list(`/patients/${id}/prescriptions`, { limit: 50 })]);
        ultimo = hist.items[0] || null; meds = presc.items.filter((r) => ["Em uso", "Uso contínuo"].includes(r.status));
      } catch (e) {
        alvo.innerHTML = `<div class="alert alert-alerta">${ico("lock")}<span>${esc(e.message)}</span></div>`; C.icones(); return;
      }
      alvo.innerHTML = `
        <div class="flex items-center gap-3"><span class="avatar lg">${esc(C.iniciais(p.nome))}</span><div><strong>${esc(p.nome)}</strong><span class="cell-sub">${C.calcIdade(p.nascimento)} anos · CNS ${esc(C.mascararCNS(p.cns))}</span></div></div>
        ${p.alergias.length ? `<div class="alert alert-perigo mt-2 mb-0">${ico("alert-octagon")}<span><strong>Alergias:</strong> ${p.alergias.map((a) => esc(a.nome)).join(", ")}</span></div>` : ""}
        <h3 class="mt-2">Condições crônicas</h3><div>${p.cronicas.map((c) => `<span class="chip">${esc(c)}</span>`).join("") || '<span class="muted small">Nenhuma</span>'}</div>
        <h3 class="mt-2">Medicamentos em uso</h3><div>${meds.map((m) => `<span class="chip">${esc(m.medicamento)}</span>`).join("") || '<span class="muted small">Nenhum</span>'}</div>
        ${ultimo ? `<h3 class="mt-2">Último atendimento na rede</h3><p class="small mb-0"><strong>${esc(C.fmtData(ultimo.data))} — ${esc(D.unidade(ultimo.unidadeId).nome)}</strong><br>${esc(ultimo.motivo)}<br><span class="muted">${esc(ultimo.diagnostico)}</span></p>` : ""}
        <a class="btn btn-outline btn-sm btn-block mt-2" href="perfil-paciente.html?id=${p.id}">${ico("clipboard-list")} Abrir prontuário completo</a>`;
      C.icones();
    }
    qs("#at-paciente").addEventListener("change", resumoPaciente);
    form.addEventListener("input", () => { alterado = true; });

    /** Conteúdo bruto do formulário (rascunho). */
    function dadosBrutos() {
      const d = C.dadosFormulario(form);
      d.proc = qsa('input[name="proc"]:checked', form).map((c) => c.value);
      d.exame = qsa('input[name="exame"]:checked', form).map((c) => c.value);
      return d;
    }
    /** Monta o corpo de POST/PATCH /attendances a partir do formulário. */
    function payload(rascunho) {
      const d = C.dadosFormulario(form);
      const sinais = vazioParaUndefined({ pa: d.pa, fc: d.fc, fr: d.fr, temp: d.temp, spo2: d.spo2, peso: d.peso, glicemia: d.glicemia });
      return vazioParaUndefined({
        pacienteId: d.paciente, unidadeId: d.unidade, data: d.data, tipo: d.tipo, especialidade: d.especialidade,
        queixa: d.queixa.trim(), hda: d.hda.trim(), avaliacao: d.avaliacao.trim(), diagnostico: d.diagnostico.trim(), cid: d.cid.trim(),
        sinais: Object.keys(sinais).length ? sinais : undefined,
        procedimentos: qsa('input[name="proc"]:checked', form).map((c) => c.value).concat(d.procOutros.trim() ? [d.procOutros.trim()] : []),
        prescricao: d.prescricao.trim(), exames: qsa('input[name="exame"]:checked', form).map((c) => c.value),
        encaminhamento: d.encEspecialidade ? { especialidade: d.encEspecialidade, destinoId: d.encDestino } : undefined,
        observacoes: d.observacoes.trim(), consultaId: C.param("consulta") || undefined,
        rascunho, dados: rascunho ? dadosBrutos() : undefined
      });
    }
    function preencher(r) {
      const d = r.dados || {};
      Object.keys(d).forEach((k) => { const el = form.elements[k]; if (el && el.type !== "checkbox" && !(el instanceof RadioNodeList)) el.value = d[k]; });
      qsa('input[name="proc"]', form).forEach((c) => { c.checked = (d.proc || []).includes(c.value); });
      qsa('input[name="exame"]', form).forEach((c) => { c.checked = (d.exame || []).includes(c.value); });
      if (d.paciente && !D.paciente(d.paciente)) qs("#at-paciente").insertAdjacentHTML("beforeend", `<option value="${esc(d.paciente)}">Paciente do rascunho</option>`);
      if (d.paciente) qs("#at-paciente").value = d.paciente;
      resumoPaciente();
    }

    // Salvar atendimento
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const ok = C.validarFormulario(form, {
        data: (v) => (v && v.slice(0, 10) <= C.hojeISO() ? "" : "A data não pode ser futura."),
        encDestino: (v) => (qs("#at-enc-especialidade").value && !v ? "Escolha a unidade de destino do encaminhamento." : ""),
        temp: (v) => (!v || (Number(v.replace(",", ".")) >= 30 && Number(v.replace(",", ".")) <= 45) ? "" : "Temperatura fora da faixa (30–45 °C)."),
        spo2: (v) => (!v || (Number(v) >= 50 && Number(v) <= 100) ? "" : "SpO₂ entre 50 e 100%."),
        pa: (v) => (!v || /^\d{2,3}\/\d{2,3}$/.test(v) ? "" : "Use o formato 120/80.")
      });
      if (!ok) { C.toast("Revise os campos destacados.", "erro", "Formulário incompleto"); return; }
      const body = payload(false);
      let at;
      try { at = rascunhoId ? await Api.patch(`/attendances/${rascunhoId}`, body) : await Api.post("/attendances", body); }
      catch (err) { C.erroApi(err, "Atendimento não registrado"); return; }
      alterado = false;
      const pac = D.paciente(at.pacienteId) || { nome: "o paciente" };
      C.toast("Atendimento salvo e adicionado à linha do tempo do paciente.", "sucesso", "Atendimento registrado");
      C.abrirModal({
        titulo: "Atendimento registrado", tamanho: "sm",
        corpo: `<div class="empty">${ico("check-circle-2")}<p class="mb-0">O registro de <strong>${esc(pac.nome)}</strong> foi salvo e já está disponível para as unidades autorizadas da rede e para o paciente.</p>
          ${at.exames.length ? `<p class="small muted mb-0">${at.exames.length} exame(s) solicitado(s).</p>` : ""}</div>`,
        acoes: [
          { label: "Novo atendimento", classe: "btn-outline", onClick: () => { location.href = "atendimento.html"; } },
          { label: "Ver na linha do tempo", classe: "btn-primary", icone: "history", onClick: () => { location.href = `perfil-paciente.html?id=${at.pacienteId}&novo=${at.id}`; } }
        ]
      });
    });

    // Salvar como rascunho (exige apenas o paciente)
    qs("#btn-rascunho").addEventListener("click", async () => {
      if (!qs("#at-paciente").value) { qs("#at-paciente").setAttribute("aria-invalid", "true"); qs('[data-erro-de="at-paciente"]').textContent = "Selecione o paciente para salvar o rascunho."; qs("#at-paciente").focus(); return; }
      try {
        const r = rascunhoId ? await Api.patch(`/attendances/${rascunhoId}`, payload(true)) : await Api.post("/attendances", payload(true));
        rascunhoId = r.id; history.replaceState(null, "", `?rascunho=${r.id}`);
        alterado = false;
        await renderListas();
        C.toast("Rascunho salvo. Você pode continuar depois.", "info", "Rascunho");
      } catch (err) { C.erroApi(err, "Rascunho não salvo"); }
    });

    // Cancelar
    qs("#btn-cancelar").addEventListener("click", async () => {
      if (alterado && !(await C.confirmar({ titulo: "Descartar alterações", mensagem: "As informações não salvas serão perdidas. Deseja cancelar o registro?", rotulo: "Descartar", perigo: true }))) return;
      form.reset(); rascunhoId = ""; alterado = false;
      history.replaceState(null, "", "atendimento.html");
      qs("#at-profissional").value = `${s.nome} — ${s.registro || ""}`; qs("#at-data").value = C.agoraISO(); qs("#at-unidade").value = s.unidadeId;
      resumoPaciente();
      C.toast("Registro cancelado.", "info");
    });

    async function renderListas() {
      await Promise.all([
        D.fetch("rascunhos", "/attendances", { status: "Rascunho", limit: 50 }),
        D.fetch("atendimentos", "/attendances", { escopo: "minhas", limit: 6 })
      ]);
      const nomePac = (id) => (D.paciente(id) || {}).nome || "—";
      C.tabela(qs("#lista-rascunhos"), {
        rotulo: "Rascunhos", linhas: D.getAll("rascunhos").slice().sort(porDataDesc), vazio: "Nenhum rascunho salvo.",
        colunas: [
          { titulo: "Paciente", render: (r) => esc(nomePac(r.pacienteId)) },
          { titulo: "Queixa", render: (r) => esc((r.dados && r.dados.queixa) || r.motivo || "—") },
          { titulo: "Salvo em", render: (r) => esc(C.fmtDataHora(r.criadoEm)) },
          { titulo: "Ações", render: (r) => `<div class="actions"><button type="button" class="btn btn-secondary btn-sm" data-continuar="${r.id}">${ico("pencil")} Continuar</button><button type="button" class="btn btn-ghost btn-sm text-danger" data-excluir="${r.id}" aria-label="Excluir rascunho">${ico("trash-2")}</button></div>` }
        ]
      });
      C.tabela(qs("#lista-atendimentos"), {
        rotulo: "Meus atendimentos recentes", linhas: D.getAll("atendimentos"), vazio: "Você ainda não registrou atendimentos.",
        colunas: [
          { titulo: "Data", render: (a) => esc(C.fmtDataHora(a.data)) },
          { titulo: "Paciente", render: (a) => `<span class="cell-strong">${esc(nomePac(a.pacienteId))}</span>` },
          { titulo: "Motivo", render: (a) => esc(a.motivo) },
          { titulo: "Diagnóstico", render: (a) => esc(a.diagnostico) },
          { titulo: "Ação", render: (a) => `<button type="button" class="btn btn-secondary btn-sm" data-ver-at="${a.id}">${ico("eye")} Ver</button>` }
        ]
      });
    }
    qs("#listas-atendimento").addEventListener("click", async (e) => {
      const c = e.target.closest("[data-continuar]"); const x = e.target.closest("[data-excluir]"); const v = e.target.closest("[data-ver-at]");
      if (c) { const r = D.getById("rascunhos", c.dataset.continuar); rascunhoId = r.id; history.replaceState(null, "", `?rascunho=${r.id}`); preencher(r); form.scrollIntoView({ behavior: "smooth" }); C.toast("Rascunho carregado.", "info"); }
      if (x && await C.confirmar({ titulo: "Excluir rascunho", mensagem: "Este rascunho será excluído permanentemente.", rotulo: "Excluir", perigo: true })) {
        try { await Api.del(`/attendances/${x.dataset.excluir}`); if (rascunhoId === x.dataset.excluir) rascunhoId = ""; await renderListas(); C.toast("Rascunho excluído."); }
        catch (err) { C.erroApi(err); }
      }
      if (v) window.ConectaClinico.abrirAtendimento(D.getById("atendimentos", v.dataset.verAt));
    });

    await renderListas();
    if (rascunhoId) { const r = D.getById("rascunhos", rascunhoId); if (r) preencher(r); else rascunhoId = ""; }
    if (C.param("consulta")) qs("#at-queixa").placeholder = "Consulta agendada: descreva a queixa principal";
    if (!rascunhoId) await resumoPaciente();
    window.addEventListener("beforeunload", (e) => { if (alterado) { e.preventDefault(); e.returnValue = ""; } });
  }, "medico");

  /* ------------------------------------------------------------------------
     Solicitação de exames e liberação de laudos
     ------------------------------------------------------------------------ */
  C.pagina("exames-medico", async function (s) {
    const form = qs("#form-exame");
    await M().carregarPacientes();
    qs("#ex-paciente").insertAdjacentHTML("beforeend", M().opcoesPacientes(C.param("paciente")));
    qs("#ex-tipo").insertAdjacentHTML("beforeend", C.TIPOS_EXAME.slice().sort().map((t) => `<option>${esc(t)}</option>`).join(""));
    qs("#ex-unidade").insertAdjacentHTML("beforeend", C.opcoes(D.where("unidades", (u) => u.id === s.unidadeId), s.unidadeId));

    async function carregar() {
      try { await D.fetch("solicitacoes", "/exam-requests", { escopo: qs("#ex-escopo").value, limit: 500 }); }
      catch (e) { C.erroApi(e); D.set("solicitacoes", []); }
      render();
    }
    function render() {
      const todas = D.getAll("solicitacoes");
      const porStatus = D.meta("solicitacoes").porStatus || {};
      const filtro = qs("#ex-filtro").value;
      qs("#fluxo-exames").innerHTML = FLUXO.map((st, i) => `
        <button type="button" class="flow-step ${filtro === st ? "active" : ""}" data-filtrar="${esc(st)}" aria-pressed="${filtro === st}">
          <span class="flow-n">${i + 1}</span><span><strong>${porStatus[st] || 0}</strong>${esc(st)}</span>
        </button>`).join(`<span class="flow-arrow" aria-hidden="true">${ico("chevron-right")}</span>`);
      const lista = todas.filter((x) => (!filtro || x.status === filtro)).sort(porDataDesc);
      C.tabela(qs("#lista-solicitacoes"), {
        rotulo: "Solicitações de exame", linhas: lista, vazio: "Nenhuma solicitação encontrada.",
        colunas: [
          { titulo: "Paciente", render: (x) => `<span class="cell-strong">${esc((D.paciente(x.pacienteId) || {}).nome || "—")}</span><span class="cell-sub">${esc(C.fmtDataHora(x.data))}</span>` },
          { titulo: "Exame", render: (x) => `${esc(x.exame)}<span class="cell-sub">${esc(x.justificativa)}</span>` },
          { titulo: "Prioridade", render: (x) => badge(x.prioridade) },
          { titulo: "Unidade solicitante", render: (x) => `${esc(D.unidade(x.unidadeId).nome)}<span class="cell-sub">${esc(D.profissional(x.profissionalId).nome)}</span>` },
          { titulo: "Status", render: (x) => (x.status === "Cancelado" ? "" : `<div class="mini-steps" aria-label="Etapa ${FLUXO.indexOf(x.status) + 1} de 4">${FLUXO.map((st, i) => `<span class="${i <= FLUXO.indexOf(x.status) ? "on" : ""}"></span>`).join("")}</div>`) + badge(x.status) },
          { titulo: "Ações", render: (x) => x.status === "Cancelado" ? "" : `<div class="actions">${x.status !== "Resultado disponível"
            ? `<button type="button" class="btn btn-secondary btn-sm" data-avancar="${x.id}">${ico(x.status === "Em andamento" ? "file-check-2" : "arrow-right-circle")} ${x.status === "Em andamento" ? "Liberar laudo" : "Avançar"}</button><button type="button" class="btn btn-ghost btn-sm text-danger" data-cancelar="${x.id}" aria-label="Cancelar solicitação">${ico("x")}</button>`
            : `<button type="button" class="btn btn-primary btn-sm" data-resultado="${x.id}">${ico("file-check-2")} Resultado</button>`}</div>` }
        ]
      });
    }

    /** Formulário de laudo: o resultado é digitado pelo profissional/laboratório (POST /exam-results). */
    function liberarLaudo(x) {
      const linha = (i) => `<div class="form-grid cols-4 result-row" data-linha="${i}">
          <div class="field"><label for="rp-${i}">Parâmetro</label><input class="input" id="rp-${i}" name="parametro" required></div>
          <div class="field"><label for="rv-${i}">Resultado</label><input class="input" id="rv-${i}" name="valor" required></div>
          <div class="field"><label for="rr-${i}">Referência</label><input class="input" id="rr-${i}" name="referencia"></div>
          <div class="field"><span class="label">&nbsp;</span><label class="check"><input type="checkbox" name="alterado"> Alterado</label></div>
        </div>`;
      let n = 1;
      C.abrirModal({
        titulo: `Liberar laudo — ${x.exame}`, tamanho: "lg",
        corpo: `<p class="muted small">Paciente: <strong>${esc((D.paciente(x.pacienteId) || {}).nome || "—")}</strong>. Informe os resultados conforme o laudo do exame.</p>
          <form id="form-laudo" novalidate>
            <div class="field"><label for="laudo-data">Data de realização</label><input class="input" id="laudo-data" type="date" value="${C.hojeISO()}" max="${C.hojeISO()}" required></div>
            <div id="linhas-laudo" class="mt-2">${linha(0)}</div>
            <button type="button" class="btn btn-ghost btn-sm mt-2" id="add-linha">${ico("plus")} Adicionar parâmetro</button>
          </form>`,
        aoAbrir: (m) => qs("#add-linha", m).addEventListener("click", () => { qs("#linhas-laudo", m).insertAdjacentHTML("beforeend", linha(n++)); C.icones(); }),
        acoes: [{ label: "Cancelar", onClick: "fechar" }, { label: "Liberar resultado", classe: "btn-primary", icone: "file-check-2", onClick: async (fechar, m) => {
          const resultados = qsa(".result-row", m).map((r) => ({
            parametro: qs('[name="parametro"]', r).value.trim(), valor: qs('[name="valor"]', r).value.trim(),
            referencia: qs('[name="referencia"]', r).value.trim() || undefined, alterado: qs('[name="alterado"]', r).checked
          })).filter((r) => r.parametro || r.valor);
          if (!resultados.length || resultados.some((r) => !r.parametro || !r.valor)) { C.toast("Preencha parâmetro e resultado de cada linha.", "erro"); return; }
          try {
            await Api.post("/exam-results", { exameId: x.exameId, data: qs("#laudo-data", m).value, resultados });
            fechar(); await carregar();
            C.toast("Laudo liberado. O paciente foi notificado.", "sucesso");
          } catch (err) { C.erroApi(err, "Laudo não liberado"); }
        } }]
      });
    }

    qs("#ex-filtro").addEventListener("change", render);
    qs("#ex-escopo").addEventListener("change", carregar);
    qs("#fluxo-exames").addEventListener("click", (e) => {
      const b = e.target.closest("[data-filtrar]"); if (!b) return;
      qs("#ex-filtro").value = qs("#ex-filtro").value === b.dataset.filtrar ? "" : b.dataset.filtrar; render();
    });
    qs("#lista-solicitacoes").addEventListener("click", async (e) => {
      const av = e.target.closest("[data-avancar]"); const ca = e.target.closest("[data-cancelar]"); const re = e.target.closest("[data-resultado]");
      if (av) {
        const x = D.getById("solicitacoes", av.dataset.avancar);
        const prox = FLUXO[FLUXO.indexOf(x.status) + 1];
        if (prox === "Resultado disponível") { liberarLaudo(x); return; }
        try { D.put("solicitacoes", await Api.patch(`/exam-requests/${x.id}`, { status: prox })); await carregar(); C.toast(`Status atualizado para "${prox}".`, "sucesso"); }
        catch (err) { C.erroApi(err); }
      }
      if (ca) {
        const x = D.getById("solicitacoes", ca.dataset.cancelar);
        if (await C.confirmar({ titulo: "Cancelar solicitação", mensagem: `Cancelar a solicitação de ${x.exame}? O registro é mantido com o status "Cancelado".`, rotulo: "Cancelar solicitação", perigo: true })) {
          try { await Api.patch(`/exam-requests/${x.id}`, { status: "Cancelado" }); await carregar(); C.toast("Solicitação cancelada."); }
          catch (err) { C.erroApi(err); }
        }
      }
      if (re) {
        const x = D.getById("solicitacoes", re.dataset.resultado);
        try { window.ConectaClinico.abrirResultado(await Api.get(`/exams/${x.exameId}`)); } catch (err) { C.erroApi(err); }
      }
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!C.validarFormulario(form, { justificativa: (v) => (v.trim().length >= 10 ? "" : "Informe a justificativa clínica (mínimo 10 caracteres).") })) return;
      const d = C.dadosFormulario(form);
      try {
        await Api.post("/exam-requests", { pacienteId: d.paciente, exame: d.exame, justificativa: d.justificativa.trim(), prioridade: d.prioridade, unidadeId: d.unidade });
        form.reset(); qs("#ex-unidade").value = s.unidadeId; qs("#ex-paciente").value = d.paciente;
        qs("#ex-filtro").value = ""; await carregar();
        C.toast(`Solicitação de ${d.exame} registrada.`, "sucesso", "Exame solicitado");
      } catch (err) { C.erroApi(err, "Solicitação não registrada"); }
    });
    await carregar();
  }, "medico");
})();
