/* ==========================================================================
   CONECTA — Área administrativa (administrador.js)
   Visão geral com indicadores, pacientes, profissionais, unidades,
   relatórios (Chart.js) e segurança/auditoria (LGPD).
   Administradores NÃO acessam conteúdo clínico — apenas gestão e auditoria.
   ========================================================================== */
(function () {
  "use strict";
  const C = window.Conecta;
  const { esc, ico, badge, tipoTag, qs, qsa } = C;
  const D = C.Data;
  const porDataDesc = (a, b) => b.data.localeCompare(a.data);
  const normalizar = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const TIPOS_UNIDADE = ["UBS", "UPA", "Hospital", "Laboratório", "Clínica"];
  const CORES = ["#1769c2", "#5ad8e6", "#0047ab", "#2aa9c4", "#8ab4e8"];
  const CORES_TIPO = { UBS: "#1f9d68", UPA: "#d64545", Hospital: "#2d63d1", "Laboratório": "#8146d1", "Clínica": "#179aab" };
  const num = (n) => Number(n).toLocaleString("pt-BR");

  /* ------------------------------------------------------------------------
     Gráficos (Chart.js) — com mensagem amigável se a biblioteca não carregar
     ------------------------------------------------------------------------ */
  const graficos = {};
  function grafico(id, config) {
    const canvas = qs(`#${id}`);
    if (!canvas) return;
    if (!window.Chart) { canvas.parentElement.innerHTML = `<div class="empty">${ico("wifi-off")}<span>Não foi possível carregar a biblioteca de gráficos (Chart.js). Verifique sua conexão.</span></div>`; C.icones(); return; }
    if (graficos[id]) graficos[id].destroy();
    window.Chart.defaults.font.family = "Inter, system-ui, sans-serif";
    window.Chart.defaults.color = "#5b6b80";
    const base = {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8, padding: 16 } }, tooltip: { backgroundColor: "#0f2440", padding: 10, cornerRadius: 8 } },
      scales: config.type === "doughnut" ? {} : { x: { grid: { display: false } }, y: { grid: { color: "#eef2f7" }, border: { display: false }, beginAtZero: true } }
    };
    config.options = Object.assign(base, config.options || {});
    graficos[id] = new window.Chart(canvas, config);
  }

  function totais() {
    const ind = D.getObj("indicadores");
    const unidades = D.getAll("unidades");
    return {
      ind, unidades,
      pacientes: ind.pacientesBase + D.getAll("pacientes").length,
      profissionais: D.getAll("profissionais"),
      integradas: unidades.filter((u) => u.integrada).length,
      atendimentos: ind.atendimentosBase + D.getAll("atendimentos").length,
      exames: ind.examesBase + D.getAll("exames").length
    };
  }

  function descricaoAtividade(l) {
    const pac = l.pacienteId ? D.paciente(l.pacienteId) : null;
    return `${esc(l.usuario)} — ${esc(l.operacao)}${pac ? ` · paciente ${esc(pac.nome.split(" ")[0])} (${esc(C.mascararCPF(pac.cpf))})` : ""}`;
  }

  /* ------------------------------------------------------------------------
     Visão geral
     ------------------------------------------------------------------------ */
  C.pagina("admin", function () {
    const t = totais();
    qs("#kpis-admin").innerHTML = [
      ["Pacientes cadastrados", num(t.pacientes), "+3,2% no mês", "users", "", "pacientes.html"],
      ["Profissionais", num(t.profissionais.length), `${t.profissionais.filter((p) => p.ativo).length} com acesso ativo`, "user-cog", "c2", "profissionais.html"],
      ["Unidades integradas", `${t.integradas}/${t.unidades.length}`, `${t.unidades.length - t.integradas} em integração`, "building-2", "c3", "unidades.html"],
      ["Atendimentos realizados", num(t.atendimentos), "+8,4% vs. mês anterior", "stethoscope", "c4", "relatorios.html"],
      ["Exames registrados", num(t.exames), "+5,1% vs. mês anterior", "flask-conical", "c5", "relatorios.html"]
    ].map(([l, v, sub, i, c, href]) => `<a class="stat anim-rise" href="${href}"><span class="stat-ico ${c}">${ico(i)}</span><div><div class="stat-label">${l}</div><div class="stat-value">${v}</div><div class="stat-sub">${sub.startsWith("+") ? `<span class="up">${sub.split(" ")[0]}</span> ${sub.split(" ").slice(1).join(" ")}` : esc(sub)}</div></div></a>`).join("");

    grafico("g-volume", { type: "line", data: { labels: t.ind.meses, datasets: [
      { label: "Atendimentos", data: t.ind.atendimentosMes, borderColor: CORES[0], backgroundColor: "rgba(23,105,194,.10)", fill: true, tension: .35, pointRadius: 3 },
      { label: "Exames", data: t.ind.examesMes, borderColor: CORES[1], backgroundColor: "rgba(90,216,230,.12)", fill: true, tension: .35, pointRadius: 3 }
    ] } });
    const porTipo = TIPOS_UNIDADE.map((tp) => t.unidades.filter((u) => u.tipo === tp).reduce((s, u) => s + u.volume, 0));
    grafico("g-tipos", { type: "doughnut", data: { labels: TIPOS_UNIDADE, datasets: [{ data: porTipo, backgroundColor: TIPOS_UNIDADE.map((x) => CORES_TIPO[x]), borderWidth: 2, borderColor: "#fff" }] }, options: { cutout: "64%" } });
    const top = t.unidades.slice().sort((a, b) => b.volume - a.volume).slice(0, 6);
    grafico("g-unidades", { type: "bar", data: { labels: top.map((u) => u.nome.replace("Laboratório Municipal de Análises Clínicas", "Lab. Municipal")), datasets: [{ label: "Atendimentos no mês", data: top.map((u) => u.volume), backgroundColor: CORES[0], borderRadius: 6, maxBarThickness: 28 }] }, options: { indexAxis: "y", plugins: { legend: { display: false } }, scales: { x: { grid: { color: "#eef2f7" } }, y: { grid: { display: false } } } } });

    const atividades = D.getAll("auditoria").sort(porDataDesc).slice(0, 7);
    qs("#atividades").innerHTML = `<ul class="list">${atividades.map((l) => `<li class="list-item"><span class="li-ico">${ico(l.operacao.includes("negada") ? "shield-x" : l.operacao.includes("Login") ? "log-in" : l.operacao.includes("Registro") ? "file-plus-2" : "eye")}</span><span class="li-main"><span class="li-title">${descricaoAtividade(l)}</span><span class="li-sub">${esc(l.unidadeId ? D.unidade(l.unidadeId).nome : "Plataforma")} · ${esc(C.tempoRelativo(l.data))}</span></span></li>`).join("")}</ul>`;

    qs("#status-integracao").innerHTML = `<ul class="list">${t.unidades.map((u) => `<li class="list-item"><span class="li-main"><span class="li-title">${esc(u.nome)}</span><span class="li-sub">${tipoTag(u.tipo)}</span></span>${badge(u.status)}</li>`).join("")}</ul>`;
  }, "admin");

  /* ------------------------------------------------------------------------
     Pacientes (dados cadastrais — sem conteúdo clínico)
     ------------------------------------------------------------------------ */
  C.pagina("pacientes", function () {
    const busca = qs("#pac-busca"); const uni = qs("#pac-unidade");
    uni.insertAdjacentHTML("beforeend", C.opcoes(D.getAll("unidades").filter((u) => u.tipo === "UBS")));
    function lista() {
      const t = normalizar(busca.value); const dig = C.somenteDigitos(busca.value);
      return D.getAll("pacientes").filter((p) => (!t || normalizar(p.nome).includes(t) || (dig.length >= 3 && (p.cpf.includes(dig) || p.cns.includes(dig)))) && (!uni.value || p.unidadeRef === uni.value));
    }
    function render() {
      const l = lista();
      qs("#pac-contagem").textContent = `${l.length} paciente(s) exibido(s) · ${num(D.getObj("indicadores").pacientesBase + D.getAll("pacientes").length)} cadastrados na rede`;
      C.tabela(qs("#pac-tabela"), {
        rotulo: "Pacientes cadastrados", linhas: l,
        colunas: [
          { titulo: "Paciente", render: (p) => `<span class="flex items-center gap-2"><span class="avatar">${esc(C.iniciais(p.nome))}</span><span class="cell-strong">${esc(p.nome)}</span></span>` },
          { titulo: "CPF", render: (p) => esc(C.mascararCPF(p.cpf)) },
          { titulo: "CNS", render: (p) => esc(C.mascararCNS(p.cns)) },
          { titulo: "Nascimento", render: (p) => esc(C.fmtData(p.nascimento)) },
          { titulo: "Unidade de referência", render: (p) => esc(D.unidade(p.unidadeRef).nome) },
          { titulo: "Registros", render: (p) => `${D.where("atendimentos", (a) => a.pacienteId === p.id).length} atend.` },
          { titulo: "Ações", render: (p) => `<div class="actions"><button type="button" class="btn btn-secondary btn-sm" data-ver="${p.id}" aria-label="Dados cadastrais de ${esc(p.nome)}">${ico("eye")}</button><button type="button" class="btn btn-ghost btn-sm text-danger" data-excluir="${p.id}" aria-label="Excluir ${esc(p.nome)}">${ico("trash-2")}</button></div>` }
        ]
      });
    }
    busca.addEventListener("input", render); uni.addEventListener("change", render);
    qs("#pac-tabela").addEventListener("click", async (e) => {
      const v = e.target.closest("[data-ver]"); const x = e.target.closest("[data-excluir]");
      if (v) {
        const p = D.paciente(v.dataset.ver);
        C.abrirModal({ titulo: "Dados cadastrais", corpo: `<dl class="dl">
          <div class="full"><dt>Nome</dt><dd>${esc(p.nome)}</dd></div><div><dt>CPF</dt><dd>${esc(C.mascararCPF(p.cpf))}</dd></div><div><dt>CNS</dt><dd>${esc(C.mascararCNS(p.cns))}</dd></div>
          <div><dt>Nascimento</dt><dd>${esc(C.fmtData(p.nascimento))}</dd></div><div><dt>Cadastro</dt><dd>${esc(C.fmtData(p.cadastro))}</dd></div>
          <div><dt>Unidade de referência</dt><dd>${esc(D.unidade(p.unidadeRef).nome)}</dd></div><div><dt>Telefone</dt><dd>${esc(p.telefone)}</dd></div></dl>
          <div class="alert alert-alerta mt-3 mb-0">${ico("eye-off")}<span>Por política de privacidade, o perfil administrador não visualiza informações clínicas do paciente.</span></div>` });
      }
      if (x) {
        const p = D.paciente(x.dataset.excluir);
        if (await C.confirmar({ titulo: "Excluir cadastro (demonstração)", mensagem: `Remover ${p.nome} da base de demonstração? Em produção, a exclusão seguiria as regras de retenção de prontuários.`, rotulo: "Excluir", perigo: true })) {
          if (p.id === "p1") { C.toast("A paciente de demonstração não pode ser excluída.", "alerta"); return; }
          D.remove("pacientes", p.id); C.registrarAuditoria("Exclusão de cadastro de paciente", { detalhe: p.nome }); render(); C.toast("Cadastro removido.");
        }
      }
    });
    qs("#pac-exportar").addEventListener("click", () => {
      const linhas = [["Nome", "CPF (mascarado)", "CNS (mascarado)", "Nascimento", "Unidade de referência"]].concat(lista().map((p) => [p.nome, C.mascararCPF(p.cpf), C.mascararCNS(p.cns), C.fmtData(p.nascimento), D.unidade(p.unidadeRef).nome]));
      C.baixarArquivo("conecta-pacientes.csv", "﻿" + linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n"), "text/csv;charset=utf-8");
      C.registrarAuditoria("Exportação de relatório", { detalhe: "Lista de pacientes (dados mascarados)" });
      C.toast("Arquivo CSV gerado com dados mascarados.");
    });
    render();
  }, "admin");

  /* ------------------------------------------------------------------------
     Profissionais
     ------------------------------------------------------------------------ */
  C.pagina("profissionais", function () {
    const form = qs("#filtros-prof");
    qs("#pf-unidade").insertAdjacentHTML("beforeend", C.opcoes(D.getAll("unidades")));
    qs("#pf-especialidade").insertAdjacentHTML("beforeend", C.ESPECIALIDADES.map((e) => `<option>${esc(e)}</option>`).join(""));

    function render() {
      const f = C.dadosFormulario(form); const t = normalizar(f.busca);
      const todos = D.getAll("profissionais");
      const lista = todos.filter((p) => (!t || normalizar(`${p.nome} ${p.registro}`).includes(t)) && (!f.unidade || p.unidadeId === f.unidade) && (!f.especialidade || p.especialidade === f.especialidade) && (!f.status || (f.status === "ativo" ? p.ativo : !p.ativo)));
      qs("#pf-resumo").innerHTML = [["Total", todos.length, "users"], ["Ativos", todos.filter((p) => p.ativo).length, "user-check"], ["Inativos", todos.filter((p) => !p.ativo).length, "user-x"], ["Especialidades", new Set(todos.map((p) => p.especialidade)).size, "briefcase-medical"]]
        .map(([l, v, i], k) => `<div class="stat"><span class="stat-ico ${["", "c4", "c5", "c3"][k]}">${ico(i)}</span><div><div class="stat-label">${l}</div><div class="stat-value">${v}</div></div></div>`).join("");
      C.tabela(qs("#pf-tabela"), {
        rotulo: "Profissionais cadastrados", linhas: lista,
        colunas: [
          { titulo: "Profissional", render: (p) => `<span class="flex items-center gap-2"><span class="avatar">${esc(C.iniciais(p.nome))}</span><span><span class="cell-strong">${esc(p.nome)}</span><span class="cell-sub">${esc(p.cargo)} · ${esc(p.registro)}</span></span></span>` },
          { titulo: "Especialidade", render: (p) => esc(p.especialidade) },
          { titulo: "Unidade de atuação", render: (p) => `${esc(D.unidade(p.unidadeId).nome)}<span class="cell-sub">${esc(D.unidade(p.unidadeId).tipo)}</span>` },
          { titulo: "Acesso", render: (p) => `<label class="switch"><input type="checkbox" data-toggle="${p.id}" ${p.ativo ? "checked" : ""} aria-label="Acesso de ${esc(p.nome)}"><span class="track"></span><span class="small">${p.ativo ? "Ativo" : "Inativo"}</span></label>` },
          { titulo: "Ações", render: (p) => `<div class="actions"><button type="button" class="btn btn-secondary btn-sm" data-editar="${p.id}">${ico("pencil")} Editar</button><button type="button" class="btn btn-ghost btn-sm text-danger" data-excluir="${p.id}" aria-label="Excluir ${esc(p.nome)}">${ico("trash-2")}</button></div>` }
        ]
      });
    }

    function abrirForm(p) {
      const novo = !p; p = p || { ativo: true, cargo: "Médico" };
      C.abrirModal({
        titulo: novo ? "Cadastrar profissional" : "Editar profissional", tamanho: "lg",
        corpo: `<form id="form-prof" class="form-grid" novalidate>
          <div class="field span-all"><label for="fp-nome">Nome completo <span class="req">*</span></label><input class="input" id="fp-nome" name="nome" value="${esc(p.nome || "")}" required><span class="field-error" data-erro-de="fp-nome"></span></div>
          <div class="field"><label for="fp-cpf">CPF <span class="req">*</span></label><input class="input" id="fp-cpf" name="cpf" value="${esc(p.cpf ? C.formatarCPF(p.cpf) : "")}" maxlength="14" inputmode="numeric" required ${novo ? "" : "readonly"}><span class="field-error" data-erro-de="fp-cpf"></span></div>
          <div class="field"><label for="fp-cargo">Cargo <span class="req">*</span></label><select class="select" id="fp-cargo" name="cargo" required>${["Médico", "Enfermeiro", "Técnico de enfermagem", "Técnico de laboratório", "Farmacêutico", "Recepção"].map((c) => `<option ${c === p.cargo ? "selected" : ""}>${c}</option>`).join("")}</select></div>
          <div class="field"><label for="fp-reg">Registro profissional <span class="req">*</span></label><input class="input" id="fp-reg" name="registro" value="${esc(p.registro || "")}" placeholder="CRM-SP 000000" required><span class="field-error" data-erro-de="fp-reg"></span></div>
          <div class="field"><label for="fp-esp">Especialidade <span class="req">*</span></label><select class="select" id="fp-esp" name="especialidade" required><option value="">Selecione</option>${C.ESPECIALIDADES.map((e) => `<option ${e === p.especialidade ? "selected" : ""}>${e}</option>`).join("")}</select><span class="field-error" data-erro-de="fp-esp"></span></div>
          <div class="field span-all"><label for="fp-uni">Unidade de atuação <span class="req">*</span></label><select class="select" id="fp-uni" name="unidadeId" required><option value="">Selecione</option>${C.opcoes(D.getAll("unidades"), p.unidadeId, (u) => `${u.nome} (${u.tipo})`)}</select><span class="field-error" data-erro-de="fp-uni"></span></div>
          <div class="field"><label for="fp-email">E-mail institucional <span class="req">*</span></label><input class="input" id="fp-email" type="email" name="email" value="${esc(p.email || "")}" required><span class="field-error" data-erro-de="fp-email"></span></div>
          <div class="field"><label for="fp-tel">Telefone</label><input class="input" id="fp-tel" name="telefone" value="${esc(p.telefone || "")}"></div>
          <div class="field span-all"><label class="switch"><input type="checkbox" id="fp-ativo" ${p.ativo ? "checked" : ""}><span class="track"></span><span>Acesso ativo à plataforma</span></label></div>
        </form>`,
        aoAbrir: (m) => { const c = qs("#fp-cpf", m); c.addEventListener("input", () => { c.value = C.formatarCPF(c.value); }); },
        acoes: [{ label: "Cancelar", onClick: "fechar" }, { label: novo ? "Cadastrar" : "Salvar alterações", classe: "btn-primary", icone: "save", onClick: (fechar, m) => {
          const f = qs("#form-prof", m);
          if (!C.validarFormulario(f, {
            cpf: (v) => (!C.validarCPF(v) ? "CPF inválido." : novo && D.getAll("profissionais").some((x) => x.cpf === C.somenteDigitos(v)) ? "CPF já cadastrado." : ""),
            email: (v) => (/^\S+@\S+\.\S+$/.test(v) ? "" : "E-mail inválido.")
          })) return;
          const d = C.dadosFormulario(f); d.cpf = C.somenteDigitos(d.cpf); d.ativo = qs("#fp-ativo", m).checked;
          if (novo) { D.add("profissionais", Object.assign(d, { cadastro: C.hojeISO() }), "pr"); C.registrarAuditoria("Cadastro de profissional", { detalhe: d.nome }); }
          else { D.update("profissionais", p.id, d); C.registrarAuditoria("Edição de profissional", { detalhe: d.nome }); }
          fechar(); render(); C.toast(novo ? "Profissional cadastrado com sucesso." : "Cadastro atualizado.");
        } }]
      });
    }

    form.addEventListener("input", render);
    form.addEventListener("reset", () => setTimeout(render, 0));
    qs("#btn-novo-prof").addEventListener("click", () => abrirForm());
    qs("#pf-tabela").addEventListener("click", async (e) => {
      const ed = e.target.closest("[data-editar]"); const x = e.target.closest("[data-excluir]");
      if (ed) abrirForm(D.profissional(ed.dataset.editar));
      if (x) {
        const p = D.profissional(x.dataset.excluir);
        if (p.id === "pr1") { C.toast("O profissional de demonstração não pode ser excluído.", "alerta"); return; }
        if (await C.confirmar({ titulo: "Excluir profissional", mensagem: `Excluir o cadastro de ${p.nome}? O histórico de registros clínicos será preservado.`, rotulo: "Excluir", perigo: true })) {
          D.remove("profissionais", p.id); C.registrarAuditoria("Exclusão de profissional", { detalhe: p.nome }); render(); C.toast("Profissional excluído (demonstração).");
        }
      }
    });
    qs("#pf-tabela").addEventListener("change", (e) => {
      const t = e.target.closest("[data-toggle]"); if (!t) return;
      const p = D.update("profissionais", t.dataset.toggle, { ativo: t.checked });
      C.registrarAuditoria(t.checked ? "Ativação de acesso" : "Desativação de acesso", { detalhe: p.nome });
      render(); C.toast(`Acesso de ${p.nome} ${t.checked ? "ativado" : "desativado"}.`, t.checked ? "sucesso" : "alerta");
    });
    render();
  }, "admin");

  /* ------------------------------------------------------------------------
     Unidades de saúde
     ------------------------------------------------------------------------ */
  C.pagina("unidades", function () {
    let filtroTipo = ""; const busca = qs("#un-busca");
    function render() {
      const todas = D.getAll("unidades");
      qs("#un-chips").innerHTML = ["", ...TIPOS_UNIDADE].map((t) => `<button type="button" class="filter-chip" data-tipo="${t}" aria-pressed="${filtroTipo === t}">${t ? `${ico(C.ICONE_TIPO[t])} ${t}` : "Todas"} <span>${t ? todas.filter((u) => u.tipo === t).length : todas.length}</span></button>`).join("");
      const tb = normalizar(busca.value);
      const lista = todas.filter((u) => (!filtroTipo || u.tipo === filtroTipo) && (!tb || normalizar(`${u.nome} ${u.endereco} ${u.cnes}`).includes(tb)));
      qs("#un-grid").innerHTML = lista.length ? lista.map((u) => `
        <article class="unit-card">
          <div class="unit-top"><span class="unit-ico tipo-${esc(u.tipo)}">${ico(C.ICONE_TIPO[u.tipo] || "building-2")}</span><div class="li-main"><h3>${esc(u.nome)}</h3>${tipoTag(u.tipo)}</div>${badge(u.status)}</div>
          <ul class="unit-info">
            <li>${ico("map-pin")} ${esc(u.endereco)}</li><li>${ico("phone")} ${esc(u.telefone)}</li>
            <li>${ico("clock")} ${esc(u.horario)}</li><li>${ico("hash")} CNES ${esc(u.cnes)}</li>
            <li>${ico("user-round")} ${esc(u.responsavel)}</li><li>${ico("users")} ${D.getAll("profissionais").filter((p) => p.unidadeId === u.id).length} profissional(is)</li>
          </ul>
          <div class="unit-actions">
            ${u.integrada ? `<span class="small muted">${ico("link")} Integrada desde ${esc(C.fmtData(u.desde))}</span>` : `<button type="button" class="btn btn-success btn-sm" data-homologar="${u.id}">${ico("plug-zap")} Homologar integração</button>`}
            <span class="actions"><button type="button" class="btn btn-secondary btn-sm" data-editar="${u.id}">${ico("pencil")} Editar</button><button type="button" class="btn btn-ghost btn-sm text-danger" data-excluir="${u.id}" aria-label="Excluir ${esc(u.nome)}">${ico("trash-2")}</button></span>
          </div>
        </article>`).join("") : `<div class="empty">${ico("building")}<span>Nenhuma unidade encontrada.</span></div>`;
      C.icones();
    }

    function abrirForm(u, tipoInicial) {
      const nova = !u; u = u || { tipo: tipoInicial || "UBS", integrada: true };
      C.abrirModal({
        titulo: nova ? "Cadastrar unidade de saúde" : "Editar unidade", tamanho: "lg",
        corpo: `<form id="form-uni" class="form-grid" novalidate>
          <div class="field span-all"><label for="fu-nome">Nome da unidade <span class="req">*</span></label><input class="input" id="fu-nome" name="nome" value="${esc(u.nome || "")}" required><span class="field-error" data-erro-de="fu-nome"></span></div>
          <div class="field"><label for="fu-tipo">Tipo <span class="req">*</span></label><select class="select" id="fu-tipo" name="tipo" required>${TIPOS_UNIDADE.map((t) => `<option ${t === u.tipo ? "selected" : ""}>${t}</option>`).join("")}</select></div>
          <div class="field"><label for="fu-cnes">CNES <span class="req">*</span></label><input class="input" id="fu-cnes" name="cnes" value="${esc(u.cnes || "")}" inputmode="numeric" maxlength="7" required><span class="field-error" data-erro-de="fu-cnes"></span></div>
          <div class="field span-all"><label for="fu-end">Endereço <span class="req">*</span></label><input class="input" id="fu-end" name="endereco" value="${esc(u.endereco || "")}" required><span class="field-error" data-erro-de="fu-end"></span></div>
          <div class="field"><label for="fu-tel">Telefone</label><input class="input" id="fu-tel" name="telefone" value="${esc(u.telefone || "")}"></div>
          <div class="field"><label for="fu-hor">Horário de funcionamento</label><input class="input" id="fu-hor" name="horario" value="${esc(u.horario || "")}" placeholder="Ex.: 07h às 19h"></div>
          <div class="field span-all"><label for="fu-resp">Responsável técnico</label><input class="input" id="fu-resp" name="responsavel" value="${esc(u.responsavel || "")}"></div>
          <div class="field span-all"><label class="switch"><input type="checkbox" id="fu-int" ${u.integrada ? "checked" : ""}><span class="track"></span><span>Unidade integrada à rede Conecta (compartilha registros)</span></label></div>
        </form>`,
        acoes: [{ label: "Cancelar", onClick: "fechar" }, { label: nova ? "Cadastrar" : "Salvar", classe: "btn-primary", icone: "save", onClick: (fechar, m) => {
          const f = qs("#form-uni", m);
          if (!C.validarFormulario(f, { cnes: (v) => (/^\d{7}$/.test(v) ? "" : "O CNES deve ter 7 dígitos.") })) return;
          const d = C.dadosFormulario(f); d.integrada = qs("#fu-int", m).checked; d.status = d.integrada ? "Integrada" : "Em integração";
          if (d.integrada && !u.desde) d.desde = C.hojeISO();
          if (nova) { D.add("unidades", Object.assign(d, { volume: 0, horario: d.horario || "—", telefone: d.telefone || "—", responsavel: d.responsavel || "—" }), "u"); C.registrarAuditoria("Cadastro de unidade", { detalhe: d.nome }); }
          else { D.update("unidades", u.id, d); C.registrarAuditoria("Edição de unidade", { detalhe: d.nome }); }
          fechar(); render(); C.toast(nova ? `${d.tipo} cadastrada com sucesso.` : "Unidade atualizada.");
        } }]
      });
    }

    qs("#un-chips").addEventListener("click", (e) => { const b = e.target.closest("[data-tipo]"); if (b) { filtroTipo = b.dataset.tipo; render(); } });
    busca.addEventListener("input", render);
    qsa("[data-nova]").forEach((b) => b.addEventListener("click", () => abrirForm(null, b.dataset.nova)));
    qs("#un-grid").addEventListener("click", async (e) => {
      const ed = e.target.closest("[data-editar]"); const x = e.target.closest("[data-excluir]"); const h = e.target.closest("[data-homologar]");
      if (ed) abrirForm(D.unidade(ed.dataset.editar));
      if (h) { D.update("unidades", h.dataset.homologar, { integrada: true, status: "Integrada", desde: C.hojeISO() }); C.registrarAuditoria("Homologação de integração", { detalhe: D.unidade(h.dataset.homologar).nome }); render(); C.toast("Integração homologada. A unidade já compartilha registros na rede (simulação)."); }
      if (x) {
        const u = D.unidade(x.dataset.excluir);
        const vinculos = D.getAll("profissionais").filter((p) => p.unidadeId === u.id).length;
        if (vinculos) { C.toast(`Não é possível excluir: ${vinculos} profissional(is) vinculado(s) a esta unidade.`, "erro", "Exclusão bloqueada"); return; }
        if (await C.confirmar({ titulo: "Excluir unidade", mensagem: `Excluir ${u.nome}? Os registros clínicos já gerados serão preservados.`, rotulo: "Excluir", perigo: true })) { D.remove("unidades", u.id); render(); C.toast("Unidade excluída (demonstração)."); }
      }
    });
    render();
  }, "admin");

  /* ------------------------------------------------------------------------
     Relatórios
     ------------------------------------------------------------------------ */
  C.pagina("relatorios", function () {
    const sel = qs("#rel-periodo");
    function render() {
      const t = totais(); const n = Number(sel.value);
      const meses = t.ind.meses.slice(-n);
      const at = t.ind.atendimentosMes.slice(-n), ex = t.ind.examesMes.slice(-n), pc = t.ind.pacientesMes.slice(-n);
      const soma = (a) => a.reduce((s, v) => s + v, 0);
      qs("#rel-kpis").innerHTML = [["Atendimentos no período", soma(at), "stethoscope", ""], ["Exames realizados", soma(ex), "flask-conical", "c2"], ["Pacientes atendidos", soma(pc), "users", "c3"], ["Média diária de atendimentos", Math.round(soma(at) / (n * 30)), "activity", "c4"]]
        .map(([l, v, i, c]) => `<div class="stat"><span class="stat-ico ${c}">${ico(i)}</span><div><div class="stat-label">${l}</div><div class="stat-value">${num(v)}</div></div></div>`).join("");
      const unidades = t.unidades.slice().sort((a, b) => b.volume - a.volume);
      const fator = n / 6;
      grafico("r-unidades", { type: "bar", data: { labels: unidades.map((u) => u.nome.replace("Laboratório Municipal de Análises Clínicas", "Lab. Municipal").replace("Centro de Especialidades Médicas", "C. Especialidades")), datasets: [{ label: "Atendimentos", data: unidades.map((u) => Math.round(u.volume * 6 * fator)), backgroundColor: unidades.map((u) => CORES_TIPO[u.tipo]), borderRadius: 6, maxBarThickness: 22 }] }, options: { indexAxis: "y", plugins: { legend: { display: false } }, scales: { x: { grid: { color: "#eef2f7" } }, y: { grid: { display: false } } } } });
      grafico("r-exames", { type: "bar", data: { labels: meses, datasets: [{ label: "Exames realizados", data: ex, backgroundColor: CORES[1], borderRadius: 6, maxBarThickness: 36 }] }, options: { plugins: { legend: { display: false } } } });
      grafico("r-pacientes", { type: "line", data: { labels: meses, datasets: [{ label: "Pacientes atendidos", data: pc, borderColor: CORES[2], backgroundColor: "rgba(0,71,171,.08)", fill: true, tension: .35 }] }, options: { plugins: { legend: { display: false } } } });
      grafico("r-volume", { type: "line", data: { labels: meses, datasets: [{ label: "Atendimentos", data: at, borderColor: CORES[0], tension: .35, pointRadius: 4 }, { label: "Exames", data: ex, borderColor: CORES[1], tension: .35, pointRadius: 4 }, { label: "Pacientes", data: pc, borderColor: CORES[2], borderDash: [6, 4], tension: .35, pointRadius: 3 }] } });
      const tipos = t.ind.tiposAtendimento;
      grafico("r-tipos", { type: "doughnut", data: { labels: TIPOS_UNIDADE, datasets: [{ data: TIPOS_UNIDADE.map((tp) => t.unidades.filter((u) => u.tipo === tp).reduce((s, u) => s + u.volume, 0)), backgroundColor: TIPOS_UNIDADE.map((x) => CORES_TIPO[x]), borderColor: "#fff", borderWidth: 2 }] }, options: { cutout: "62%" } });
      grafico("r-natureza", { type: "pie", data: { labels: Object.keys(tipos), datasets: [{ data: Object.values(tipos), backgroundColor: CORES, borderColor: "#fff", borderWidth: 2 }] }, options: { scales: {} } });
    }
    sel.addEventListener("change", render);
    qs("#rel-csv").addEventListener("click", () => {
      const t = totais();
      const linhas = [["Unidade", "Tipo", "Atendimentos/mês", "Status"]].concat(t.unidades.map((u) => [u.nome, u.tipo, u.volume, u.status]));
      linhas.push([], ["Mês", "Atendimentos", "Exames", "Pacientes"]);
      t.ind.meses.forEach((m, i) => linhas.push([m, t.ind.atendimentosMes[i], t.ind.examesMes[i], t.ind.pacientesMes[i]]));
      C.baixarArquivo("conecta-relatorio.csv", "﻿" + linhas.map((l) => l.join(";")).join("\n"), "text/csv;charset=utf-8");
      C.registrarAuditoria("Exportação de relatório", { detalhe: "Indicadores agregados" });
      C.toast("Relatório exportado em CSV.");
    });
    qs("#rel-imprimir").addEventListener("click", () => window.print());
    render();
  }, "admin");

  /* ------------------------------------------------------------------------
     Segurança, auditoria e privacidade
     ------------------------------------------------------------------------ */
  C.pagina("seguranca", function () {
    const abas = { auditoria: renderAuditoria, acesso: renderAcesso, compartilhamento: renderCompart, privacidade: renderPrivacidade, config: renderConfig };
    const ativar = C.iniciarAbas(qs("#abas-seg"), (nome) => { C.definirAba(nome); abas[nome](); });

    /* --- Auditoria --- */
    const fa = qs("#filtros-auditoria");
    qs("#au-operacao").insertAdjacentHTML("beforeend", [...new Set(D.getAll("auditoria").map((l) => l.operacao))].sort().map((o) => `<option>${esc(o)}</option>`).join(""));
    qs("#au-unidade").insertAdjacentHTML("beforeend", C.opcoes(D.getAll("unidades")));
    function filtrarAuditoria() {
      const f = C.dadosFormulario(fa); const t = normalizar(f.busca);
      return D.getAll("auditoria").filter((l) => {
        const pac = l.pacienteId ? D.paciente(l.pacienteId) : null;
        return (!t || normalizar(`${l.usuario} ${pac ? pac.nome : ""}`).includes(t)) && (!f.operacao || l.operacao === f.operacao) && (!f.unidade || l.unidadeId === f.unidade) && (!f.data || C.mesmoDia(l.data, f.data));
      }).sort(porDataDesc);
    }
    function renderAuditoria() {
      const lista = filtrarAuditoria();
      qs("#au-contagem").textContent = `${lista.length} registro(s) de auditoria`;
      C.tabela(qs("#au-tabela"), {
        rotulo: "Registros de auditoria", linhas: lista.slice(0, 80),
        colunas: [
          { titulo: "Profissional / usuário", render: (l) => `<span class="cell-strong">${esc(l.usuario)}</span><span class="cell-sub">${esc(l.perfil)}</span>` },
          { titulo: "Paciente consultado", render: (l) => { const p = l.pacienteId ? D.paciente(l.pacienteId) : null; return p ? `${esc(p.nome)}<span class="cell-sub">CPF ${esc(C.mascararCPF(p.cpf))}</span>` : '<span class="muted">—</span>'; } },
          { titulo: "Unidade de origem", render: (l) => esc(l.unidadeId ? D.unidade(l.unidadeId).nome : "—") },
          { titulo: "Data e horário", render: (l) => esc(C.fmtDataHora(l.data)) },
          { titulo: "Operação", render: (l) => `<span class="op-tag ${l.operacao.includes("negada") ? "op-neg" : l.operacao.includes("Visualiza") || l.operacao.includes("Exibição") ? "op-ver" : "op-esc"}">${esc(l.operacao)}</span>${l.detalhe ? `<span class="cell-sub">${esc(l.detalhe)}</span>` : ""}` },
          { titulo: "IP", render: (l) => `<span class="mono small">${esc(l.ip)}</span>` }
        ]
      });
    }
    fa.addEventListener("input", renderAuditoria);
    fa.addEventListener("reset", () => setTimeout(renderAuditoria, 0));
    qs("#au-exportar").addEventListener("click", () => {
      const linhas = [["Usuário", "Perfil", "Paciente", "Unidade", "Data/hora", "Operação", "IP"]].concat(filtrarAuditoria().map((l) => [l.usuario, l.perfil, l.pacienteId ? (D.paciente(l.pacienteId) || {}).nome || "" : "", l.unidadeId ? D.unidade(l.unidadeId).nome : "", C.fmtDataHora(l.data), l.operacao, l.ip]));
      C.baixarArquivo("conecta-auditoria.csv", "﻿" + linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n"), "text/csv;charset=utf-8");
      C.registrarAuditoria("Exportação de relatório", { detalhe: "Trilha de auditoria" });
      C.toast("Trilha de auditoria exportada.");
    });

    /* --- Controle de acesso por perfil --- */
    function renderAcesso() {
      const perm = D.getObj("permissoes");
      const profs = D.getAll("profissionais");
      qs("#ac-resumo").innerHTML = perm.perfis.map((pf) => {
        const n = pf === "Administrador" ? D.getAll("administradores").length : profs.filter((p) => (pf === "Médico" ? p.cargo === "Médico" : pf === "Enfermeiro" ? p.cargo === "Enfermeiro" : p.cargo === pf) && p.ativo).length;
        return `<div class="role-card"><span class="li-ico">${ico({ "Médico": "stethoscope", "Enfermeiro": "heart-pulse", "Técnico de laboratório": "flask-conical", "Recepção": "clipboard-list", "Administrador": "shield" }[pf])}</span><div><strong>${esc(pf)}</strong><span>${n} usuário(s) ativo(s)</span></div></div>`;
      }).join("");
      qs("#ac-matriz").innerHTML = `<div class="table-wrap"><table class="table perm-table"><caption class="sr-only">Matriz de permissões por perfil</caption>
        <thead><tr><th scope="col">Permissão</th>${perm.perfis.map((p) => `<th scope="col">${esc(p)}</th>`).join("")}</tr></thead>
        <tbody>${perm.recursos.map((r) => `<tr><th scope="row">${esc(r.nome)}</th>${perm.perfis.map((p) => `<td><label class="perm-check"><input type="checkbox" data-perfil="${esc(p)}" data-recurso="${r.id}" ${perm.matriz[p][r.id] ? "checked" : ""} aria-label="${esc(p)}: ${esc(r.nome)}"><span aria-hidden="true">${ico("check")}</span></label></td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
      C.icones();
    }
    qs("#ac-salvar").addEventListener("click", async () => {
      if (!(await C.confirmar({ titulo: "Salvar permissões", mensagem: "As novas permissões passam a valer imediatamente para todos os usuários dos perfis alterados.", rotulo: "Salvar" }))) return;
      const perm = D.getObj("permissoes");
      qsa("#ac-matriz [data-perfil]").forEach((c) => { perm.matriz[c.dataset.perfil][c.dataset.recurso] = c.checked; });
      D.setObj("permissoes", perm);
      C.registrarAuditoria("Alteração de permissões", { detalhe: "Matriz de acesso por perfil" });
      C.toast("Permissões atualizadas e registradas na auditoria.");
    });
    qs("#ac-restaurar").addEventListener("click", renderAcesso);

    /* --- Compartilhamento --- */
    function toggleCfg(chave, rotulo, desc) {
      const cfg = D.getObj("configuracoes");
      return `<label class="switch pref"><input type="checkbox" data-cfg="${chave}" ${cfg[chave] ? "checked" : ""}><span class="track"></span><span><strong>${esc(rotulo)}</strong><span class="li-sub">${esc(desc)}</span></span></label>`;
    }
    function renderCompart() {
      qs("#cp-regras").innerHTML = [
        toggleCfg("compartilharEntreUnidades", "Compartilhar registros entre unidades integradas", "Atendimentos, exames e prescrições ficam visíveis para profissionais autorizados de outras unidades."),
        toggleCfg("consentimentoPaciente", "Respeitar preferência de compartilhamento do paciente", "Pacientes podem restringir o compartilhamento pelo aplicativo (exceto emergências)."),
        toggleCfg("exigirJustificativaEmergencia", "Exigir justificativa para acesso de emergência", "Acessos fora do vínculo assistencial exigem justificativa registrada."),
        toggleCfg("bloquearExportacao", "Bloquear exportação de dados clínicos", "Impede downloads em massa de informações de pacientes.")
      ].join("");
      qs("#cp-unidades").innerHTML = `<ul class="list">${D.getAll("unidades").map((u) => `<li class="list-item"><span class="li-main"><span class="li-title">${esc(u.nome)}</span><span class="li-sub">${tipoTag(u.tipo)}</span></span><label class="switch"><input type="checkbox" data-uni-share="${u.id}" ${u.integrada ? "checked" : ""} aria-label="Compartilhamento: ${esc(u.nome)}"><span class="track"></span><span class="small">${u.integrada ? "Compartilhando" : "Bloqueado"}</span></label></li>`).join("")}</ul>`;
      C.icones();
    }
    /* --- Privacidade / mascaramento --- */
    function renderPrivacidade() {
      const p = D.paciente("p1");
      const cfg = D.getObj("configuracoes");
      qs("#pv-regras").innerHTML = toggleCfg("mascararDocumentos", "Mascarar CPF e CNS em listagens", "Os documentos aparecem parcialmente ocultos; a exibição completa gera registro de auditoria.") +
        toggleCfg("notificarPacienteAcesso", "Notificar o paciente a cada acesso ao prontuário", "Transparência ativa: o paciente vê quem consultou seu histórico.");
      qs("#pv-exemplo").innerHTML = `<table class="table"><thead><tr><th scope="col">Dado</th><th scope="col">Valor original</th><th scope="col">Exibição na plataforma</th></tr></thead><tbody>
        <tr><td>CPF</td><td class="mono">${esc(C.formatarCPF(p.cpf).replace(/\d/g, "•"))}</td><td class="mono"><strong>${esc(cfg.mascararDocumentos ? C.mascararCPF(p.cpf) : C.formatarCPF(p.cpf))}</strong></td></tr>
        <tr><td>CNS</td><td class="mono">${esc(C.formatarCNS(p.cns).replace(/\d/g, "•"))}</td><td class="mono"><strong>${esc(cfg.mascararDocumentos ? C.mascararCNS(p.cns) : C.formatarCNS(p.cns))}</strong></td></tr>
        <tr><td>Nome em relatórios</td><td>Nome completo</td><td><strong>Primeiro nome + CPF mascarado</strong></td></tr></tbody></table>`;
    }
    /* --- Configurações --- */
    function renderConfig() {
      const cfg = D.getObj("configuracoes");
      qs("#cf-regras").innerHTML = toggleCfg("mfaProfissionais", "Autenticação em dois fatores para profissionais", "Exige código adicional no login de profissionais de saúde.");
      qs("#cf-sessao").value = String(cfg.expirarSessao);
    }
    qs("#painel-seg").addEventListener("change", (e) => {
      const c = e.target.closest("[data-cfg]"); const u = e.target.closest("[data-uni-share]");
      if (c) {
        const cfg = D.getObj("configuracoes"); cfg[c.dataset.cfg] = c.checked; D.setObj("configuracoes", cfg);
        C.registrarAuditoria("Alteração de configuração de privacidade", { detalhe: c.dataset.cfg });
        C.toast("Configuração atualizada.");
        if (c.dataset.cfg === "mascararDocumentos") renderPrivacidade();
      }
      if (u) {
        D.update("unidades", u.dataset.uniShare, { integrada: u.checked, status: u.checked ? "Integrada" : "Em integração" });
        C.registrarAuditoria(u.checked ? "Compartilhamento liberado" : "Compartilhamento bloqueado", { detalhe: D.unidade(u.dataset.uniShare).nome });
        renderCompart(); C.toast(`Compartilhamento ${u.checked ? "liberado" : "bloqueado"} para a unidade.`, u.checked ? "sucesso" : "alerta");
      }
      if (e.target.id === "cf-sessao") { const cfg = D.getObj("configuracoes"); cfg.expirarSessao = Number(e.target.value); D.setObj("configuracoes", cfg); C.toast(`Sessões expiram após ${e.target.value} minutos de inatividade.`); }
    });
    qs("#cf-reset").addEventListener("click", async () => {
      if (await C.confirmar({ titulo: "Restaurar dados de demonstração", mensagem: "Todos os registros criados durante a demonstração serão apagados.", rotulo: "Restaurar", perigo: true })) {
        D.reset(); C.toast("Dados de demonstração restaurados."); setTimeout(() => location.reload(), 600);
      }
    });

    const inicial = C.param("aba");
    ativar(abas[inicial] ? inicial : "acesso");
  }, "admin");
})();
