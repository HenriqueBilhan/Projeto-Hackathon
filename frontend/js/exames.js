/* ==========================================================================
   CONECTA — Exames e componentes clínicos compartilhados (exames.js)
   --------------------------------------------------------------------------
   - Linha do tempo clínica (usada pelo paciente e pelo profissional).
   - Modal de detalhes de atendimento.
   - Visualização de resultados de exames e geração de PDF (impressão).
   - Visualização de receitas.
   - Página "Meus exames" do paciente (lista + filtros).
   ========================================================================== */
(function () {
  "use strict";
  const C = window.Conecta;
  const { esc, ico, badge, tipoTag, qs, qsa } = C;
  const D = C.Data;

  const ICONE_ATENDIMENTO = { "Atendimento de urgência": "siren", Consulta: "stethoscope", Exame: "flask-conical", "Internação": "bed-double", Procedimento: "syringe" };

  /** HTML da linha do tempo. Cada item é um botão acessível que abre os detalhes. */
  function timelineHTML(lista, { mostrarProfissional = true } = {}) {
    if (!lista.length) return `<div class="empty">${ico("calendar-x")}<span>Nenhum registro encontrado para os filtros selecionados.</span></div>`;
    return `<ol class="timeline">${lista.map((a) => {
      const u = D.unidade(a.unidadeId); const p = D.profissional(a.profissionalId);
      return `<li class="tl-item">
        <span class="tl-dot ${esc(u.tipo)}" aria-hidden="true">${ico(C.ICONE_TIPO[u.tipo] || "circle")}</span>
        <button type="button" class="tl-card" data-atendimento="${esc(a.id)}" aria-label="Ver detalhes: ${esc(a.tipo)} em ${esc(C.fmtData(a.data))} — ${esc(u.nome)}">
          <span class="tl-head"><span class="tl-date">${esc(C.fmtDataHora(a.data))}</span>${tipoTag(u.tipo)}<span class="badge badge-neutro no-dot">${ico(ICONE_ATENDIMENTO[a.tipo] || "file")} ${esc(a.tipo)}</span>${a.novo ? '<span class="badge badge-info">Novo</span>' : ""}</span>
          <span class="tl-title">${esc(u.nome)} — ${esc(a.motivo)}</span>
          <span class="tl-meta">
            ${mostrarProfissional ? `<span>${ico("user-round")} ${esc(p.nome)}</span>` : ""}
            <span>${ico("briefcase-medical")} ${esc(a.especialidade)}</span>
            ${a.documentos && a.documentos.length ? `<span>${ico("paperclip")} ${a.documentos.length} documento(s)</span>` : ""}
          </span>
          ${a.diagnostico ? `<span class="tl-diag"><b>Diagnóstico:</b> ${esc(a.diagnostico)}</span>` : ""}
          <span class="tl-more">Ver detalhes ${ico("chevron-right")}</span>
        </button>
      </li>`;
    }).join("")}</ol>`;
  }

  /** Liga cliques da linha do tempo a um container. */
  function ligarTimeline(container) {
    container.addEventListener("click", (e) => {
      const b = e.target.closest("[data-atendimento]");
      if (b) abrirAtendimento(D.getById("atendimentos", b.dataset.atendimento));
    });
  }

  /** Modal com todos os dados de um atendimento. */
  function abrirAtendimento(a) {
    if (!a) return;
    const u = D.unidade(a.unidadeId); const p = D.profissional(a.profissionalId); const pac = D.paciente(a.pacienteId);
    const s = a.sinais;
    const lista = (arr) => (arr && arr.length ? `<ul class="detail-list">${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : '<span class="muted">Não informado</span>');
    const sessao = C.Auth.sessao();
    C.abrirModal({
      titulo: `${a.tipo} — ${C.fmtData(a.data)}`, tamanho: "lg",
      corpo: `
        <div class="detail-origin">
          <span class="li-ico">${ico(C.ICONE_TIPO[u.tipo] || "building-2")}</span>
          <div><span class="small muted">Unidade responsável pelo registro</span><strong>${esc(u.nome)}</strong> ${tipoTag(u.tipo)}</div>
        </div>
        <dl class="dl">
          <div><dt>Data e horário</dt><dd>${esc(C.fmtDataHora(a.data))}</dd></div>
          <div><dt>Paciente</dt><dd>${esc(pac ? pac.nome : "—")}</dd></div>
          <div><dt>Profissional</dt><dd>${esc(p.nome)} <span class="muted small">${esc(p.registro || "")}</span></dd></div>
          <div><dt>Especialidade</dt><dd>${esc(a.especialidade)}</dd></div>
          <div class="full"><dt>Motivo do atendimento / queixa principal</dt><dd>${esc(a.motivo)}</dd></div>
          ${a.hda ? `<div class="full"><dt>Histórico da doença atual</dt><dd>${esc(a.hda)}</dd></div>` : ""}
          <div class="full"><dt>Diagnóstico registrado</dt><dd>${esc(a.diagnostico || "—")}</dd></div>
          ${a.avaliacao ? `<div class="full"><dt>Avaliação clínica</dt><dd>${esc(a.avaliacao)}</dd></div>` : ""}
        </dl>
        ${s ? `<h3 class="mt-3">Sinais vitais</h3><div class="vitals">
          ${[["PA", s.pa, "activity"], ["FC", s.fc, "heart-pulse"], ["Temp.", s.temp, "thermometer"], ["SpO₂", s.spo2, "wind"], ["FR", s.fr, "waves"], ["Peso", s.peso, "scale"], ["Glicemia", s.glicemia, "droplet"]]
            .filter((v) => v[1]).map((v) => `<div class="vital">${ico(v[2])}<span>${esc(v[0])}</span><strong>${esc(v[1])}</strong></div>`).join("")}
        </div>` : ""}
        <div class="grid grid-2 mt-3">
          <div><h3>Procedimentos realizados</h3>${lista(a.procedimentos)}</div>
          <div><h3>Exames solicitados</h3>${lista(a.exames)}</div>
        </div>
        ${a.prescricao ? `<h3 class="mt-3">Prescrição</h3><p class="detail-box">${esc(a.prescricao)}</p>` : ""}
        ${a.encaminhamento ? `<h3 class="mt-2">Encaminhamento</h3><p class="detail-box">${esc(a.encaminhamento)}</p>` : ""}
        ${a.observacoes ? `<h3 class="mt-2">Observações clínicas</h3><p class="detail-box">${esc(a.observacoes)}</p>` : ""}
        <h3 class="mt-3">Documentos relacionados</h3>
        ${a.documentos && a.documentos.length ? `<div class="docs">${a.documentos.map((d) => `<button type="button" class="doc-chip" data-doc="${esc(d)}">${ico("file-text")} ${esc(d)}</button>`).join("")}</div>` : '<p class="muted">Nenhum documento anexado.</p>'}
        <p class="small muted mt-3 mb-0">${ico("shield-check")} Registro compartilhado na rede Conecta${sessao && sessao.role === "medico" ? " — o acesso ao prontuário é registrado na auditoria." : "."}</p>`,
      acoes: [{ label: "Imprimir", classe: "btn-outline", icone: "printer", onClick: () => imprimirAtendimento(a) }, { label: "Fechar", classe: "btn-primary", onClick: "fechar" }],
      aoAbrir: (m) => qsa("[data-doc]", m).forEach((b) => b.addEventListener("click", () => imprimirAtendimento(a))),
    });
  }

  function cabecalhoDoc(titulo, u) {
    const base = location.href.replace(/[^/]*$/, "");
    return `<header class="doc-head"><img src="${base}../assets/img/logo-conecta.png" alt="Conecta" class="doc-logo"><div><strong>${esc(u.nome)}</strong><span>CNES ${esc(u.cnes || "—")} · ${esc(u.endereco || "")}</span></div></header><h1 class="doc-title">${esc(titulo)}</h1>`;
  }
  const rodapeDoc = () => `<footer class="doc-foot">Documento gerado pela plataforma Conecta em ${esc(C.fmtDataHora(C.agoraISO()))}. Via digital para consulta.</footer>`;

  function imprimirAtendimento(a) {
    const u = D.unidade(a.unidadeId); const p = D.profissional(a.profissionalId); const pac = D.paciente(a.pacienteId) || { nome: "—", cpf: "", cns: "" };
    C.imprimirDocumento("Registro de atendimento", `${cabecalhoDoc("Registro de atendimento", u)}
      <p><b>Paciente:</b> ${esc(pac.nome)} · <b>CPF:</b> ${esc(C.mascararCPF(pac.cpf))} · <b>CNS:</b> ${esc(C.mascararCNS(pac.cns))}</p>
      <p><b>Data:</b> ${esc(C.fmtDataHora(a.data))} · <b>Profissional:</b> ${esc(p.nome)} (${esc(p.registro || "")}) · <b>Especialidade:</b> ${esc(a.especialidade)}</p>
      <p><b>Motivo:</b> ${esc(a.motivo)}</p><p><b>Diagnóstico:</b> ${esc(a.diagnostico)}</p>
      <p><b>Procedimentos:</b> ${esc((a.procedimentos || []).join("; ") || "—")}</p>${a.prescricao ? `<p><b>Prescrição:</b> ${esc(a.prescricao)}</p>` : ""}${rodapeDoc()}`);
  }

  /** Tabela de resultado de exame. Valores alterados recebem destaque. */
  function tabelaResultado(ex) {
    return `<table class="table result-table"><thead><tr><th scope="col">Parâmetro</th><th scope="col">Resultado</th><th scope="col">Referência</th></tr></thead>
      <tbody>${ex.resultado.map((r) => `<tr class="${r[3] ? "alterado" : ""}"><td>${esc(r[0])}</td><td><strong>${esc(r[1])}</strong>${r[3] ? ' <span class="badge badge-alerta">Alterado</span>' : ""}</td><td>${esc(r[2])}</td></tr>`).join("")}</tbody></table>`;
  }

  function abrirResultado(ex) {
    if (!ex) return;
    if (ex.status !== "Resultado disponível" || !ex.resultado) {
      C.toast(`O resultado de "${ex.nome}" ainda não está disponível (status: ${ex.status}).`, "alerta", "Resultado indisponível");
      return;
    }
    const u = D.unidade(ex.unidadeId); const sol = D.profissional(ex.solicitanteId);
    C.abrirModal({
      titulo: ex.nome, tamanho: "lg",
      corpo: `<dl class="dl">
          <div><dt>Data de realização</dt><dd>${esc(C.fmtData(ex.data))}</dd></div>
          <div><dt>Unidade responsável</dt><dd>${esc(u.nome)} ${tipoTag(u.tipo)}</dd></div>
          <div><dt>Médico solicitante</dt><dd>${esc(sol.nome)}</dd></div>
          <div><dt>Status</dt><dd>${badge(ex.status)}</dd></div>
        </dl>
        <h3 class="mt-3">Resultado</h3>
        <div class="table-wrap">${tabelaResultado(ex)}</div>
        <div class="alert alert-info mt-3 mb-0">${ico("info")}<span>Laudo liberado pela unidade responsável. A interpretação de resultados deve ser feita por um profissional de saúde.</span></div>`,
      acoes: [{ label: "Baixar PDF", classe: "btn-outline", icone: "download", onClick: () => baixarPDF(ex) }, { label: "Fechar", classe: "btn-primary", onClick: "fechar" }]
    });
  }

  /** Gera o laudo em uma janela de impressão — o usuário escolhe "Salvar como PDF". */
  function baixarPDF(ex) {
    if (ex.status !== "Resultado disponível" || !ex.resultado) { C.toast("O PDF estará disponível quando o resultado for liberado.", "alerta"); return; }
    const u = D.unidade(ex.unidadeId); const sol = D.profissional(ex.solicitanteId); const pac = D.paciente(ex.pacienteId) || { nome: "—", nascimento: "", cns: "" };
    C.imprimirDocumento(`Laudo - ${ex.nome}`, `${cabecalhoDoc("Laudo de exame — " + ex.nome, u)}
      <p><b>Paciente:</b> ${esc(pac.nome)} · <b>Nascimento:</b> ${esc(C.fmtData(pac.nascimento))} · <b>CNS:</b> ${esc(C.mascararCNS(pac.cns))}</p>
      <p><b>Data de realização:</b> ${esc(C.fmtData(ex.data))} · <b>Solicitante:</b> ${esc(sol.nome)}</p>
      ${tabelaResultado(ex)}${rodapeDoc()}`);
    C.toast("Na janela de impressão, escolha \"Salvar como PDF\".", "info", "Gerando PDF");
  }

  /** Visualização de receita médica (com opção de impressão). */
  function abrirReceita(r) {
    const u = D.unidade(r.unidadeId); const p = D.profissional(r.profissionalId); const pac = D.paciente(r.pacienteId) || { nome: "—" };
    const corpoDoc = `<div class="rx">
        <div class="rx-head"><span class="rx-symbol">℞</span><div><strong>${esc(r.medicamento)}</strong><span>${esc(r.dosagem)}</span></div>${badge(r.status)}</div>
        <dl class="dl">
          <div><dt>Frequência</dt><dd>${esc(r.frequencia)}</dd></div>
          <div><dt>Duração</dt><dd>${esc(r.duracao)}</dd></div>
          <div><dt>Médico responsável</dt><dd>${esc(p.nome)} <span class="muted small">${esc(p.registro || "")}</span></dd></div>
          <div><dt>Data da prescrição</dt><dd>${esc(C.fmtData(r.data))}</dd></div>
          <div><dt>Unidade</dt><dd>${esc(u.nome)}</dd></div>
          <div><dt>Paciente</dt><dd>${esc(pac.nome)}</dd></div>
          <div class="full"><dt>Orientações</dt><dd>${esc(r.orientacoes || "—")}</dd></div>
        </dl>
        <div class="rx-sign"><span></span>${esc(p.nome)} — ${esc(p.registro || "")}<br><small>Registrada eletronicamente no Conecta em ${esc(C.fmtData(r.data))}</small></div>
      </div>`;
    C.abrirModal({
      titulo: "Receita médica", tamanho: "lg", corpo: corpoDoc,
      acoes: [
        { label: "Imprimir / PDF", classe: "btn-outline", icone: "printer", onClick: () => C.imprimirDocumento("Receita médica", `${cabecalhoDoc("Receita médica", u)}${corpoDoc}${rodapeDoc()}`) },
        { label: "Fechar", classe: "btn-primary", onClick: "fechar" }
      ]
    });
  }

  // Expõe os componentes para os demais scripts
  window.ConectaClinico = { timelineHTML, ligarTimeline, abrirAtendimento, abrirResultado, baixarPDF, abrirReceita, ICONE_ATENDIMENTO };

  /* ------------------------------------------------------------------------
     Página "Meus exames" (paciente)
     ------------------------------------------------------------------------ */
  C.pagina("exames", async function (s) {
    await D.fetch("exames", "/exams", { limit: 500 });
    D.set("pacientes", [await C.Api.get("/patients/me")]);
    const todos = () => D.where("exames", (e) => e.pacienteId === s.refId).sort((a, b) => b.data.localeCompare(a.data));
    const form = qs("#filtros-exames");
    const selUni = qs("#f-unidade");
    const unidadesUsadas = [...new Set(todos().map((e) => e.unidadeId))].map((id) => D.unidade(id));
    selUni.insertAdjacentHTML("beforeend", C.opcoes(unidadesUsadas));

    // Resumo
    const lista = todos();
    qs("#resumo-exames").innerHTML = [
      ["Total de exames", lista.length, "flask-conical", ""],
      ["Resultados disponíveis", lista.filter((e) => e.status === "Resultado disponível").length, "file-check-2", "c4"],
      ["Em análise", lista.filter((e) => e.status === "Em análise").length, "hourglass", "c5"],
      ["Agendados", lista.filter((e) => e.status === "Agendado" || e.status === "Solicitado").length, "calendar-clock", "c3"]
    ].map(([l, v, i, c]) => `<div class="stat"><span class="stat-ico ${c}">${ico(i)}</span><div><div class="stat-label">${l}</div><div class="stat-value">${v}</div></div></div>`).join("");

    function render() {
      const f = C.dadosFormulario(form);
      const termo = (f.nome || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      const filtrados = todos().filter((e) =>
        (!termo || e.nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(termo)) &&
        (!f.unidade || e.unidadeId === f.unidade) &&
        (!f.status || e.status === f.status) &&
        (!f.de || e.data >= f.de) && (!f.ate || e.data <= f.ate));
      qs("#contagem-exames").textContent = `${filtrados.length} exame(s) encontrado(s)`;
      C.tabela(qs("#tabela-exames"), {
        rotulo: "Lista de exames", vazio: "Nenhum exame encontrado com os filtros aplicados.",
        linhas: filtrados,
        colunas: [
          { titulo: "Exame", render: (e) => `<span class="cell-strong">${esc(e.nome)}</span><span class="cell-sub">${esc(e.categoria)}</span>` },
          { titulo: "Data", render: (e) => esc(C.fmtData(e.data)) },
          { titulo: "Unidade", render: (e) => esc(D.unidade(e.unidadeId).nome) },
          { titulo: "Solicitante", render: (e) => esc(D.profissional(e.solicitanteId).nome) },
          { titulo: "Status", render: (e) => badge(e.status) },
          { titulo: "Ações", render: (e) => {
            const disp = e.status === "Resultado disponível";
            return `<div class="actions"><button type="button" class="btn btn-secondary btn-sm" data-ver="${e.id}" ${disp ? "" : 'aria-disabled="true"'}>${ico("eye")} Visualizar resultado</button>
              <button type="button" class="btn btn-outline btn-sm" data-pdf="${e.id}" ${disp ? "" : 'aria-disabled="true"'} aria-label="Baixar PDF de ${esc(e.nome)}">${ico("download")} Baixar PDF</button></div>`;
          } }
        ]
      });
    }
    form.addEventListener("input", render);
    form.addEventListener("reset", () => setTimeout(render, 0));
    qs("#tabela-exames").addEventListener("click", (e) => {
      const v = e.target.closest("[data-ver]"); const p = e.target.closest("[data-pdf]");
      if (v) abrirResultado(D.getById("exames", v.dataset.ver));
      if (p) baixarPDF(D.getById("exames", p.dataset.pdf));
    });
    render();
  }, "paciente");
})();
