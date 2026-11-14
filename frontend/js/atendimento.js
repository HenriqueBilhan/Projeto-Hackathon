/* ==========================================================================
   CONECTA — Registro de atendimento e solicitação de exames (atendimento.js)
   Ao salvar, o atendimento passa a compor a linha do tempo do paciente e fica
   visível para outras unidades autorizadas e para o próprio paciente.
   PONTO DE INTEGRAÇÃO: POST /api/atendimentos e POST /api/solicitacoes-exame.
   ========================================================================== */
(function () {
  "use strict";
  const C = window.Conecta;
  const { esc, ico, badge, qs, qsa } = C;
  const D = C.Data;
  const porDataDesc = (a, b) => b.data.localeCompare(a.data);
  const pacientes = () => window.ConectaMedico.opcoesPacientes;

  const PROCEDIMENTOS = ["Consulta médica", "Aferição de sinais vitais", "Medicação via oral", "Medicação endovenosa", "Nebulização", "Curativo", "Sutura", "Eletrocardiograma", "Coleta de exames", "Orientações em saúde"];
  const EXAMES_RAPIDOS = ["Hemograma completo", "Glicemia em jejum", "Hemoglobina glicada (HbA1c)", "Urina tipo I (EAS)", "Urocultura com antibiograma", "Perfil lipídico", "Creatinina", "TSH", "Eletrocardiograma", "Raio-X de tórax"];
  const FLUXO = ["Solicitado", "Agendado", "Em andamento", "Resultado disponível"];
  const STATUS_EXAME = { Solicitado: "Solicitado", Agendado: "Agendado", "Em andamento": "Em análise", "Resultado disponível": "Resultado disponível" };

  /** Cria a solicitação de exame e o registro correspondente na lista do paciente. */
  function criarSolicitacao({ pacienteId, exame, justificativa, prioridade, unidadeId, profissionalId }) {
    const ex = D.add("exames", { pacienteId, nome: exame, data: C.hojeISO(), unidadeId, solicitanteId: profissionalId, status: "Solicitado", categoria: "Laboratorial", resultado: null }, "e");
    return D.add("solicitacoes", { pacienteId, exame, justificativa, prioridade, unidadeId, profissionalId, data: C.agoraISO(), status: "Solicitado", exameId: ex.id }, "s");
  }

  /* ------------------------------------------------------------------------
     Registro de atendimento
     ------------------------------------------------------------------------ */
  C.pagina("atendimento", function (s) {
    const prof = D.profissional(s.refId);
    const form = qs("#form-atendimento");
    let rascunhoId = C.param("rascunho") || "";
    let alterado = false;

    // Preenchimento dos campos de seleção
    qs("#at-paciente").insertAdjacentHTML("beforeend", pacientes()(C.param("paciente")));
    qs("#at-unidade").insertAdjacentHTML("beforeend", C.opcoes(D.getAll("unidades").filter((u) => u.integrada), prof.unidadeId));
    qs("#at-profissional").value = `${prof.nome} — ${prof.registro}`;
    qs("#at-especialidade").insertAdjacentHTML("beforeend", C.ESPECIALIDADES.map((e) => `<option ${e === prof.especialidade ? "selected" : ""}>${esc(e)}</option>`).join(""));
    qs("#at-data").value = C.agoraISO();
    qs("#at-procedimentos").innerHTML = PROCEDIMENTOS.map((p, i) => `<label class="check"><input type="checkbox" name="proc" value="${esc(p)}" id="proc-${i}"> ${esc(p)}</label>`).join("");
    qs("#at-exames").innerHTML = EXAMES_RAPIDOS.map((p, i) => `<label class="check"><input type="checkbox" name="exame" value="${esc(p)}" id="ex-${i}"> ${esc(p)}</label>`).join("");
    qs("#at-enc-especialidade").insertAdjacentHTML("beforeend", C.ESPECIALIDADES.map((e) => `<option>${esc(e)}</option>`).join(""));
    qs("#at-enc-destino").insertAdjacentHTML("beforeend", C.opcoes(D.getAll("unidades").filter((u) => u.integrada)));

    /** Resumo do paciente selecionado: integra informações de outras unidades. */
    function resumoPaciente() {
      const p = D.paciente(qs("#at-paciente").value);
      const alvo = qs("#at-resumo");
      if (!p) { alvo.innerHTML = `<div class="empty">${ico("user-search")}<span>Selecione um paciente para ver o resumo clínico integrado.</span></div>`; C.icones(); return; }
      const ultimo = D.where("atendimentos", (a) => a.pacienteId === p.id && a.status === "Finalizado").sort(porDataDesc)[0];
      const meds = D.where("prescricoes", (r) => r.pacienteId === p.id && ["Em uso", "Uso contínuo"].includes(r.status));
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

    /** Lê todos os campos do formulário em um objeto de atendimento. */
    function coletar() {
      const d = C.dadosFormulario(form);
      return {
        pacienteId: d.paciente, unidadeId: d.unidade, profissionalId: prof.id, data: d.data, tipo: d.tipo, especialidade: d.especialidade,
        motivo: d.queixa.trim(), hda: d.hda.trim(), avaliacao: d.avaliacao.trim(),
        diagnostico: d.diagnostico.trim() + (d.cid.trim() ? ` (CID ${d.cid.trim().toUpperCase()})` : ""), cid: d.cid.trim(),
        sinais: { pa: d.pa, fc: d.fc ? `${d.fc} bpm` : "", temp: d.temp ? `${d.temp} °C` : "", spo2: d.spo2 ? `${d.spo2}%` : "", fr: d.fr ? `${d.fr} irpm` : "", peso: d.peso ? `${d.peso} kg` : "", glicemia: d.glicemia ? `${d.glicemia} mg/dL` : "" },
        procedimentos: qsa('input[name="proc"]:checked', form).map((c) => c.value).concat(d.procOutros.trim() ? [d.procOutros.trim()] : []),
        prescricao: d.prescricao.trim(), exames: qsa('input[name="exame"]:checked', form).map((c) => c.value),
        encEspecialidade: d.encEspecialidade, encDestino: d.encDestino,
        encaminhamento: d.encEspecialidade ? `${d.encEspecialidade}${d.encDestino ? " — " + D.unidade(d.encDestino).nome : ""}` : "",
        observacoes: d.observacoes.trim()
      };
    }
    /** Preenche o formulário a partir de um rascunho salvo. */
    function preencher(r) {
      const d = r.dados;
      Object.keys(d).forEach((k) => { const el = form.elements[k]; if (el && el.type !== "checkbox" && !(el instanceof RadioNodeList)) el.value = d[k]; });
      qsa('input[name="proc"]', form).forEach((c) => { c.checked = (d.proc || []).includes(c.value); });
      qsa('input[name="exame"]', form).forEach((c) => { c.checked = (d.exame || []).includes(c.value); });
      resumoPaciente();
    }
    function dadosBrutos() {
      const d = C.dadosFormulario(form);
      d.proc = qsa('input[name="proc"]:checked', form).map((c) => c.value);
      d.exame = qsa('input[name="exame"]:checked', form).map((c) => c.value);
      return d;
    }

    // Salvar atendimento
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const ok = C.validarFormulario(form, {
        data: (v) => (v && v.slice(0, 10) <= C.hojeISO() ? "" : "A data não pode ser futura."),
        temp: (v) => (!v || (Number(v.replace(",", ".")) >= 30 && Number(v.replace(",", ".")) <= 45) ? "" : "Temperatura fora da faixa (30–45 °C)."),
        spo2: (v) => (!v || (Number(v) >= 50 && Number(v) <= 100) ? "" : "SpO₂ entre 50 e 100%.")
      });
      if (!ok) { C.toast("Revise os campos destacados.", "erro", "Formulário incompleto"); return; }
      const dados = coletar();
      const pac = D.paciente(dados.pacienteId);
      const at = D.add("atendimentos", Object.assign({}, dados, {
        status: "Finalizado", novo: true,
        documentos: ["Ficha de atendimento"].concat(dados.prescricao ? ["Receita médica"] : [], dados.exames.length ? ["Requisição de exames"] : [], dados.encaminhamento ? ["Encaminhamento"] : [])
      }), "a");
      dados.exames.forEach((ex) => criarSolicitacao({ pacienteId: pac.id, exame: ex, justificativa: `Solicitado no atendimento: ${dados.motivo}`, prioridade: dados.tipo === "Atendimento de urgência" ? "Urgente" : "Rotina", unidadeId: dados.unidadeId, profissionalId: prof.id }));
      if (dados.encEspecialidade) D.add("encaminhamentos", { pacienteId: pac.id, profissionalId: prof.id, origemId: dados.unidadeId, destinoId: dados.encDestino || dados.unidadeId, especialidade: dados.encEspecialidade, data: C.hojeISO(), motivo: dados.motivo, prioridade: "Rotina", status: "Pendente" }, "en");
      const consulta = C.param("consulta");
      if (consulta) D.update("consultas", consulta, { status: "Realizada" });
      if (rascunhoId) D.remove("rascunhos", rascunhoId);
      C.registrarAuditoria("Registro de atendimento", { pacienteId: pac.id });
      C.notificar(`paciente:${pac.id}`, "Novo atendimento no seu histórico", `${D.unidade(dados.unidadeId).nome}: ${dados.motivo}.`, "historico.html", "stethoscope");
      alterado = false;
      C.toast("Atendimento salvo e adicionado à linha do tempo do paciente.", "sucesso", "Atendimento registrado");
      C.abrirModal({
        titulo: "Atendimento registrado", tamanho: "sm",
        corpo: `<div class="empty">${ico("check-circle-2")}<p class="mb-0">O registro de <strong>${esc(pac.nome)}</strong> foi salvo e já está disponível para as unidades autorizadas da rede e para o paciente.</p>
          ${dados.exames.length ? `<p class="small muted mb-0">${dados.exames.length} exame(s) solicitado(s).</p>` : ""}</div>`,
        acoes: [
          { label: "Novo atendimento", classe: "btn-outline", onClick: () => { location.href = "atendimento.html"; } },
          { label: "Ver na linha do tempo", classe: "btn-primary", icone: "history", onClick: () => { location.href = `perfil-paciente.html?id=${pac.id}&novo=${at.id}`; } }
        ]
      });
    });

    // Salvar como rascunho (exige apenas o paciente)
    qs("#btn-rascunho").addEventListener("click", () => {
      if (!qs("#at-paciente").value) { qs("#at-paciente").setAttribute("aria-invalid", "true"); qs('[data-erro-de="at-paciente"]').textContent = "Selecione o paciente para salvar o rascunho."; qs("#at-paciente").focus(); return; }
      const d = dadosBrutos();
      if (rascunhoId && D.getById("rascunhos", rascunhoId)) D.update("rascunhos", rascunhoId, { dados: d, data: C.agoraISO() });
      else { rascunhoId = D.add("rascunhos", { profissionalId: prof.id, pacienteId: d.paciente, dados: d, data: C.agoraISO() }, "rs").id; history.replaceState(null, "", `?rascunho=${rascunhoId}`); }
      alterado = false;
      renderListas();
      C.toast("Rascunho salvo. Você pode continuar depois.", "info", "Rascunho");
    });

    // Cancelar
    qs("#btn-cancelar").addEventListener("click", async () => {
      if (alterado && !(await C.confirmar({ titulo: "Descartar alterações", mensagem: "As informações não salvas serão perdidas. Deseja cancelar o registro?", rotulo: "Descartar", perigo: true }))) return;
      form.reset(); rascunhoId = ""; alterado = false;
      history.replaceState(null, "", "atendimento.html");
      qs("#at-profissional").value = `${prof.nome} — ${prof.registro}`; qs("#at-data").value = C.agoraISO(); qs("#at-unidade").value = prof.unidadeId;
      resumoPaciente();
      C.toast("Registro cancelado.", "info");
    });

    function renderListas() {
      const rasc = D.where("rascunhos", (r) => r.profissionalId === prof.id).sort(porDataDesc);
      C.tabela(qs("#lista-rascunhos"), {
        rotulo: "Rascunhos", linhas: rasc, vazio: "Nenhum rascunho salvo.",
        colunas: [
          { titulo: "Paciente", render: (r) => esc((D.paciente(r.pacienteId) || {}).nome || "—") },
          { titulo: "Queixa", render: (r) => esc(r.dados.queixa || "—") },
          { titulo: "Salvo em", render: (r) => esc(C.fmtDataHora(r.data)) },
          { titulo: "Ações", render: (r) => `<div class="actions"><button type="button" class="btn btn-secondary btn-sm" data-continuar="${r.id}">${ico("pencil")} Continuar</button><button type="button" class="btn btn-ghost btn-sm text-danger" data-excluir="${r.id}" aria-label="Excluir rascunho">${ico("trash-2")}</button></div>` }
        ]
      });
      const meus = D.where("atendimentos", (a) => a.profissionalId === prof.id && a.status === "Finalizado").sort(porDataDesc).slice(0, 6);
      C.tabela(qs("#lista-atendimentos"), {
        rotulo: "Meus atendimentos recentes", linhas: meus,
        colunas: [
          { titulo: "Data", render: (a) => esc(C.fmtDataHora(a.data)) },
          { titulo: "Paciente", render: (a) => `<span class="cell-strong">${esc(D.paciente(a.pacienteId).nome)}</span>` },
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
        D.remove("rascunhos", x.dataset.excluir); if (rascunhoId === x.dataset.excluir) rascunhoId = ""; renderListas(); C.toast("Rascunho excluído.");
      }
      if (v) window.ConectaClinico.abrirAtendimento(D.getById("atendimentos", v.dataset.verAt));
    });

    if (rascunhoId) { const r = D.getById("rascunhos", rascunhoId); if (r) preencher(r); else rascunhoId = ""; }
    if (C.param("consulta")) { const c = D.getById("consultas", C.param("consulta")); if (c) qs("#at-queixa").placeholder = `Consulta: ${c.tipo}`; }
    resumoPaciente();
    renderListas();
    window.addEventListener("beforeunload", (e) => { if (alterado) { e.preventDefault(); e.returnValue = ""; } });
  }, "medico");

  /* ------------------------------------------------------------------------
     Solicitação de exames
     ------------------------------------------------------------------------ */
  C.pagina("exames-medico", function (s) {
    const prof = D.profissional(s.refId);
    const form = qs("#form-exame");
    qs("#ex-paciente").insertAdjacentHTML("beforeend", pacientes()(C.param("paciente")));
    qs("#ex-tipo").insertAdjacentHTML("beforeend", C.TIPOS_EXAME.slice().sort().map((t) => `<option>${esc(t)}</option>`).join(""));
    qs("#ex-unidade").insertAdjacentHTML("beforeend", C.opcoes(D.getAll("unidades").filter((u) => u.integrada), prof.unidadeId));

    function render() {
      const todas = D.getAll("solicitacoes");
      qs("#fluxo-exames").innerHTML = FLUXO.map((st, i) => `
        <button type="button" class="flow-step ${qs("#ex-filtro").value === st ? "active" : ""}" data-filtrar="${esc(st)}" aria-pressed="${qs("#ex-filtro").value === st}">
          <span class="flow-n">${i + 1}</span><span><strong>${todas.filter((x) => x.status === st).length}</strong>${esc(st)}</span>
        </button>`).join(`<span class="flow-arrow" aria-hidden="true">${ico("chevron-right")}</span>`);
      const f = qs("#ex-filtro").value; const escopo = qs("#ex-escopo").value;
      const lista = todas.filter((x) => (!f || x.status === f) && (escopo === "todas" || x.profissionalId === prof.id)).sort(porDataDesc);
      C.tabela(qs("#lista-solicitacoes"), {
        rotulo: "Solicitações de exame", linhas: lista, vazio: "Nenhuma solicitação encontrada.",
        colunas: [
          { titulo: "Paciente", render: (x) => `<span class="cell-strong">${esc(D.paciente(x.pacienteId).nome)}</span><span class="cell-sub">${esc(C.fmtDataHora(x.data))}</span>` },
          { titulo: "Exame", render: (x) => `${esc(x.exame)}<span class="cell-sub">${esc(x.justificativa)}</span>` },
          { titulo: "Prioridade", render: (x) => badge(x.prioridade) },
          { titulo: "Unidade solicitante", render: (x) => `${esc(D.unidade(x.unidadeId).nome)}<span class="cell-sub">${esc(D.profissional(x.profissionalId).nome)}</span>` },
          { titulo: "Status", render: (x) => `<div class="mini-steps" aria-label="Etapa ${FLUXO.indexOf(x.status) + 1} de 4">${FLUXO.map((st, i) => `<span class="${i <= FLUXO.indexOf(x.status) ? "on" : ""}"></span>`).join("")}</div>${badge(x.status)}` },
          { titulo: "Ações", render: (x) => `<div class="actions">${x.status !== "Resultado disponível" ? `<button type="button" class="btn btn-secondary btn-sm" data-avancar="${x.id}">${ico("arrow-right-circle")} Avançar</button><button type="button" class="btn btn-ghost btn-sm text-danger" data-cancelar="${x.id}" aria-label="Cancelar solicitação">${ico("x")}</button>` : `<button type="button" class="btn btn-primary btn-sm" data-resultado="${x.id}">${ico("file-check-2")} Resultado</button>`}</div>` }
        ]
      });
    }
    qs("#ex-filtro").addEventListener("change", render);
    qs("#ex-escopo").addEventListener("change", render);
    qs("#fluxo-exames").addEventListener("click", (e) => {
      const b = e.target.closest("[data-filtrar]"); if (!b) return;
      qs("#ex-filtro").value = qs("#ex-filtro").value === b.dataset.filtrar ? "" : b.dataset.filtrar; render();
    });
    qs("#lista-solicitacoes").addEventListener("click", async (e) => {
      const av = e.target.closest("[data-avancar]"); const ca = e.target.closest("[data-cancelar]"); const re = e.target.closest("[data-resultado]");
      if (av) {
        const x = D.getById("solicitacoes", av.dataset.avancar);
        const prox = FLUXO[FLUXO.indexOf(x.status) + 1];
        D.update("solicitacoes", x.id, { status: prox });
        if (x.exameId) {
          const alt = { status: STATUS_EXAME[prox] };
          if (prox === "Resultado disponível") { alt.resultado = C.MODELOS_RESULTADO[x.exame] || [["Resultado", "Dentro dos parâmetros de referência", "—"]]; alt.data = C.hojeISO(); }
          D.update("exames", x.exameId, alt);
        }
        if (prox === "Resultado disponível") C.notificar(`paciente:${x.pacienteId}`, "Resultado disponível", `O resultado do exame ${x.exame} já pode ser consultado.`, "exames.html", "flask-conical");
        render(); C.toast(`Status atualizado para "${prox}".`, "sucesso");
      }
      if (ca) {
        const x = D.getById("solicitacoes", ca.dataset.cancelar);
        if (await C.confirmar({ titulo: "Cancelar solicitação", mensagem: `Cancelar a solicitação de ${x.exame} para ${D.paciente(x.pacienteId).nome}?`, rotulo: "Cancelar solicitação", perigo: true })) {
          D.remove("solicitacoes", x.id); if (x.exameId) D.remove("exames", x.exameId); render(); C.toast("Solicitação cancelada.");
        }
      }
      if (re) { const x = D.getById("solicitacoes", re.dataset.resultado); window.ConectaClinico.abrirResultado(D.getById("exames", x.exameId) || { status: "—", nome: x.exame }); }
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!C.validarFormulario(form, { justificativa: (v) => (v.trim().length >= 10 ? "" : "Informe a justificativa clínica (mínimo 10 caracteres).") })) return;
      const d = C.dadosFormulario(form);
      criarSolicitacao({ pacienteId: d.paciente, exame: d.exame, justificativa: d.justificativa.trim(), prioridade: d.prioridade, unidadeId: d.unidade, profissionalId: prof.id });
      C.registrarAuditoria("Solicitação de exame", { pacienteId: d.paciente, detalhe: d.exame });
      C.notificar(`paciente:${d.paciente}`, "Exame solicitado", `${prof.nome} solicitou o exame ${d.exame}.`, "exames.html", "flask-conical");
      form.reset(); qs("#ex-unidade").value = prof.unidadeId; qs("#ex-paciente").value = d.paciente;
      qs("#ex-filtro").value = ""; render();
      C.toast(`Solicitação de ${d.exame} registrada.`, "sucesso", "Exame solicitado");
    });
    render();
  }, "medico");
})();
