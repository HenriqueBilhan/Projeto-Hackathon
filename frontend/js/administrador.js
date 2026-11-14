/* ==========================================================================
   CONECTA — Área administrativa (administrador.js)
   Visão geral com indicadores reais (GET /admin/dashboard), pacientes (dados
   cadastrais mascarados), profissionais, unidades (inclusive importação do CNES),
   relatórios (Chart.js) e segurança/auditoria (LGPD).
   Administradores NÃO acessam conteúdo clínico — o backend também impede.
   ========================================================================== */
(function () {
  "use strict";
  const C = window.Conecta;
  const { esc, ico, badge, tipoTag, qs, qsa } = C;
  const D = C.Data;
  const Api = C.Api;
  const normalizar = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const TIPOS_UNIDADE = ["UBS", "UPA", "Hospital", "Laboratório", "Clínica"];
  const CORES = ["#1267b8", "#59d9e3", "#024eae", "#37a2cf", "#8ab4e8"];
  const CORES_TIPO = { UBS: "#1f9d68", UPA: "#d64545", Hospital: "#2d63d1", "Laboratório": "#8146d1", "Clínica": "#179aab" };
  const num = (n) => Number(n || 0).toLocaleString("pt-BR");

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
      scales: ["doughnut", "pie"].includes(config.type) ? {} : { x: { grid: { display: false } }, y: { grid: { color: "#eef2f7" }, border: { display: false }, beginAtZero: true, ticks: { precision: 0 } } }
    };
    config.options = Object.assign(base, config.options || {});
    graficos[id] = new window.Chart(canvas, config);
  }
  const semDados = (id, msg) => { const c = qs(`#${id}`); if (c) { c.parentElement.innerHTML = `<div class="empty">${ico("bar-chart-3")}<span>${esc(msg)}</span></div>`; C.icones(); } };
  const nomeCurto = (n) => String(n).replace("Laboratório Municipal de Análises Clínicas", "Lab. Municipal").replace("Centro de Especialidades Médicas", "C. Especialidades");
  const iconeOperacao = (op) => (op.includes("negada") || op.includes("Falha") ? "shield-x" : op.includes("Login") ? "log-in" : op.includes("Registro") || op.includes("Cadastro") ? "file-plus-2" : "eye");

  function graficosPorTipo(id, unidades) {
    const porTipo = TIPOS_UNIDADE.map((tp) => unidades.filter((u) => u.tipo === tp).reduce((s, u) => s + u.volume, 0));
    if (!porTipo.some(Boolean)) return semDados(id, "Ainda não há atendimentos registrados no período.");
    grafico(id, { type: "doughnut", data: { labels: TIPOS_UNIDADE, datasets: [{ data: porTipo, backgroundColor: TIPOS_UNIDADE.map((x) => CORES_TIPO[x]), borderWidth: 2, borderColor: "#fff" }] }, options: { cutout: "64%" } });
  }

  /* ------------------------------------------------------------------------
     Visão geral
     ------------------------------------------------------------------------ */
  C.pagina("admin", async function () {
    const d = await Api.get("/admin/dashboard");
    const t = d.totais;
    qs("#kpis-admin").innerHTML = [
      ["Pacientes cadastrados", num(t.pacientes), `${num(d.pacientesMes[d.pacientesMes.length - 1])} atendidos no mês`, "users", "", "pacientes.html"],
      ["Profissionais", num(t.profissionais), `${num(t.profissionaisAtivos)} com acesso ativo`, "user-cog", "c2", "profissionais.html"],
      ["Unidades integradas", `${t.unidadesIntegradas}/${t.unidades}`, `${t.unidades - t.unidadesIntegradas} em integração`, "building-2", "c3", "unidades.html"],
      ["Atendimentos realizados", num(t.atendimentos), `${num(d.atendimentosMes[d.atendimentosMes.length - 1])} no mês atual`, "stethoscope", "c4", "relatorios.html"],
      ["Exames registrados", num(t.exames), `${num(t.examesComResultado)} com resultado liberado`, "flask-conical", "c5", "relatorios.html"]
    ].map(([l, v, sub, i, c, href]) => `<a class="stat anim-rise" href="${href}"><span class="stat-ico ${c}">${ico(i)}</span><div><div class="stat-label">${l}</div><div class="stat-value">${v}</div><div class="stat-sub">${esc(sub)}</div></div></a>`).join("");

    grafico("g-volume", { type: "line", data: { labels: d.meses, datasets: [
      { label: "Atendimentos", data: d.atendimentosMes, borderColor: CORES[0], backgroundColor: "rgba(18,103,184,.10)", fill: true, tension: .35, pointRadius: 3 },
      { label: "Exames", data: d.examesMes, borderColor: CORES[1], backgroundColor: "rgba(89,217,227,.12)", fill: true, tension: .35, pointRadius: 3 }
    ] } });
    graficosPorTipo("g-tipos", d.unidades);
    const top = d.unidades.slice().sort((a, b) => b.volume - a.volume).slice(0, 8);
    if (top.some((u) => u.volume)) grafico("g-unidades", { type: "bar", data: { labels: top.map((u) => nomeCurto(u.nome)), datasets: [{ label: "Atendimentos (6 meses)", data: top.map((u) => u.volume), backgroundColor: CORES[0], borderRadius: 6, maxBarThickness: 28 }] }, options: { indexAxis: "y", plugins: { legend: { display: false } }, scales: { x: { grid: { color: "#eef2f7" }, ticks: { precision: 0 } }, y: { grid: { display: false } } } } });
    else semDados("g-unidades", d.unidades.length ? "Ainda não há atendimentos registrados nas unidades." : "Nenhuma unidade cadastrada. Importe unidades do CNES em Unidades de saúde.");

    qs("#atividades").innerHTML = d.atividadesRecentes.length ? `<ul class="list">${d.atividadesRecentes.map((l) => `<li class="list-item"><span class="li-ico">${ico(iconeOperacao(l.operacao))}</span><span class="li-main"><span class="li-title">${esc(l.usuario)} — ${esc(l.operacao)}${l.pacienteNome ? ` · paciente ${esc(l.pacienteNome)} (${esc(l.pacienteCpf)})` : ""}</span><span class="li-sub">${esc(l.unidadeId ? D.unidade(l.unidadeId).nome : "Plataforma")} · ${esc(C.tempoRelativo(l.data))}</span></span></li>`).join("")}</ul>` : `<div class="empty">${ico("inbox")}<span>Sem atividades registradas.</span></div>`;
    const dp = d.dadosPublicos;
    qs("#status-integracao").innerHTML = `${d.unidades.length ? `<ul class="list">${d.unidades.map((u) => `<li class="list-item"><span class="li-main"><span class="li-title">${esc(u.nome)}</span><span class="li-sub">${tipoTag(u.tipo)} ${u.cnes ? `CNES ${esc(u.cnes)}` : ""}</span></span>${badge(u.status)}</li>`).join("")}</ul>` : ""}
      <p class="small muted mt-2 mb-0">${ico("database")} Dados abertos do Ministério da Saúde na base local: <strong>${num(dp.estabelecimentosCnes)}</strong> estabelecimentos CNES · <strong>${num(dp.hospitais)}</strong> hospitais (${num(dp.leitosMaxPublicado)} leitos, maior valor publicado por hospital).</p>`;
  }, "admin");

  /* ------------------------------------------------------------------------
     Pacientes (dados cadastrais — sem conteúdo clínico)
     ------------------------------------------------------------------------ */
  C.pagina("pacientes", async function () {
    const busca = qs("#pac-busca"); const uni = qs("#pac-unidade");
    uni.insertAdjacentHTML("beforeend", C.opcoes(D.where("unidades", (u) => u.tipo === "UBS")));
    let espera;
    async function render() {
      const t = busca.value.trim(); const dig = C.somenteDigitos(t);
      const query = { unidadeRef: uni.value || undefined, limit: 200 };
      if (dig.length === 11 && C.validarCPF(dig)) query.cpf = dig;
      else if (dig.length >= 4 && dig.length === t.replace(/[\s.-]/g, "").length) query.cns = dig;
      else if (t.length >= 3) query.q = t;
      try {
        const r = await Api.list("/patients", query);
        D.set("pacientes", r.items);
        qs("#pac-contagem").textContent = `${r.meta.total} paciente(s)${t ? " encontrado(s)" : " cadastrados na rede"}`;
        C.tabela(qs("#pac-tabela"), {
          rotulo: "Pacientes cadastrados", linhas: r.items, vazio: "Nenhum paciente encontrado.",
          colunas: [
            { titulo: "Paciente", render: (p) => `<span class="flex items-center gap-2"><span class="avatar">${esc(C.iniciais(p.nome))}</span><span class="cell-strong">${esc(p.nome)}</span></span>` },
            { titulo: "CPF", render: (p) => esc(C.mascararCPF(p.cpf)) },
            { titulo: "CNS", render: (p) => esc(C.mascararCNS(p.cns)) },
            { titulo: "Nascimento", render: (p) => esc(C.fmtData(p.nascimento)) },
            { titulo: "Unidade de referência", render: (p) => esc(p.unidadeRef ? D.unidade(p.unidadeRef).nome : "—") },
            { titulo: "Registros", render: (p) => `${p.registros || 0} atend.` },
            { titulo: "Ações", render: (p) => `<div class="actions"><button type="button" class="btn btn-secondary btn-sm" data-ver="${p.id}" aria-label="Dados cadastrais de ${esc(p.nome)}">${ico("eye")}</button><button type="button" class="btn btn-ghost btn-sm text-danger" data-excluir="${p.id}" aria-label="Excluir ${esc(p.nome)}">${ico("trash-2")}</button></div>` }
          ]
        });
      } catch (e) { C.erroApi(e); }
    }
    busca.addEventListener("input", () => { clearTimeout(espera); espera = setTimeout(render, 350); });
    uni.addEventListener("change", render);
    qs("#pac-tabela").addEventListener("click", async (e) => {
      const v = e.target.closest("[data-ver]"); const x = e.target.closest("[data-excluir]");
      if (v) {
        try {
          const p = await Api.get(`/patients/${v.dataset.ver}`);
          C.abrirModal({ titulo: "Dados cadastrais", corpo: `<dl class="dl">
            <div class="full"><dt>Nome</dt><dd>${esc(p.nome)}</dd></div><div><dt>CPF</dt><dd>${esc(C.mascararCPF(p.cpf))}</dd></div><div><dt>CNS</dt><dd>${esc(C.mascararCNS(p.cns))}</dd></div>
            <div><dt>Nascimento</dt><dd>${esc(C.fmtData(p.nascimento))}</dd></div><div><dt>Cadastro</dt><dd>${esc(C.fmtData(p.cadastro))}</dd></div>
            <div><dt>Unidade de referência</dt><dd>${esc(p.unidadeRef ? D.unidade(p.unidadeRef).nome : "—")}</dd></div><div><dt>Telefone</dt><dd>${esc(p.telefone || "—")}</dd></div></dl>
            <div class="alert alert-alerta mt-3 mb-0">${ico("eye-off")}<span>Por política de privacidade, o perfil administrador não visualiza informações clínicas do paciente. Esta consulta foi registrada na auditoria.</span></div>` });
        } catch (err) { C.erroApi(err); }
      }
      if (x) {
        const p = D.getById("pacientes", x.dataset.excluir);
        if (await C.confirmar({ titulo: "Excluir cadastro", mensagem: `Remover o cadastro de ${p.nome}? Pacientes com registros clínicos não podem ser excluídos (retenção obrigatória de prontuários).`, rotulo: "Excluir", perigo: true })) {
          try { await Api.del(`/patients/${p.id}`); await render(); C.toast("Cadastro removido."); } catch (err) { C.erroApi(err, "Exclusão não permitida"); }
        }
      }
    });
    qs("#pac-exportar").addEventListener("click", async () => {
      try { await Api.download("/admin/exports/pacientes", "conecta-pacientes.csv"); C.toast("Arquivo CSV gerado com dados mascarados."); } catch (e) { C.erroApi(e, "Exportação não realizada"); }
    });
    await render();
  }, "admin");

  /* ------------------------------------------------------------------------
     Profissionais
     ------------------------------------------------------------------------ */
  C.pagina("profissionais", async function () {
    const form = qs("#filtros-prof");
    qs("#pf-unidade").insertAdjacentHTML("beforeend", C.opcoes(D.getAll("unidades")));
    qs("#pf-especialidade").insertAdjacentHTML("beforeend", C.ESPECIALIDADES.map((e) => `<option>${esc(e)}</option>`).join(""));
    const recarregar = () => D.fetch("profissionais", "/professionals", { limit: 500 });

    function render() {
      const f = C.dadosFormulario(form); const t = normalizar(f.busca);
      const todos = D.getAll("profissionais");
      const lista = todos.filter((p) => (!t || normalizar(`${p.nome} ${p.registro}`).includes(t)) && (!f.unidade || p.unidadeId === f.unidade) && (!f.especialidade || p.especialidade === f.especialidade) && (!f.status || (f.status === "ativo" ? p.ativo : !p.ativo)));
      qs("#pf-resumo").innerHTML = [["Total", todos.length, "users"], ["Ativos", todos.filter((p) => p.ativo).length, "user-check"], ["Inativos", todos.filter((p) => !p.ativo).length, "user-x"], ["Especialidades", new Set(todos.map((p) => p.especialidade)).size, "briefcase-medical"]]
        .map(([l, v, i], k) => `<div class="stat"><span class="stat-ico ${["", "c4", "c5", "c3"][k]}">${ico(i)}</span><div><div class="stat-label">${l}</div><div class="stat-value">${v}</div></div></div>`).join("");
      C.tabela(qs("#pf-tabela"), {
        rotulo: "Profissionais cadastrados", linhas: lista, vazio: todos.length ? "Nenhum profissional com esses filtros." : "Nenhum profissional cadastrado. Cadastre unidades e, em seguida, os profissionais.",
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
      if (!D.getAll("unidades").length) { C.toast("Cadastre ou importe uma unidade de saúde antes de cadastrar profissionais.", "alerta"); return; }
      C.abrirModal({
        titulo: novo ? "Cadastrar profissional" : "Editar profissional", tamanho: "lg",
        corpo: `<form id="form-prof" class="form-grid" novalidate>
          <div class="field span-all"><label for="fp-nome">Nome completo <span class="req">*</span></label><input class="input" id="fp-nome" name="nome" value="${esc(p.nome || "")}" required><span class="field-error" data-erro-de="fp-nome"></span></div>
          ${novo ? `<div class="field"><label for="fp-cpf">CPF <span class="req">*</span></label><input class="input" id="fp-cpf" name="cpf" maxlength="14" inputmode="numeric" required><span class="field-error" data-erro-de="fp-cpf"></span></div>` : `<div class="field"><span class="label">CPF</span><span class="input" aria-readonly="true">${esc(p.cpf || "")}</span></div>`}
          <div class="field"><label for="fp-cargo">Cargo <span class="req">*</span></label><select class="select" id="fp-cargo" name="cargo" required>${["Médico", "Enfermeiro", "Técnico de enfermagem", "Técnico de laboratório", "Farmacêutico", "Recepção"].map((c) => `<option ${c === p.cargo ? "selected" : ""}>${c}</option>`).join("")}</select></div>
          <div class="field"><label for="fp-reg">Registro profissional <span class="req">*</span></label><input class="input" id="fp-reg" name="registro" value="${esc(p.registro || "")}" placeholder="CRM-RS 000000" required><span class="field-error" data-erro-de="fp-reg"></span></div>
          <div class="field"><label for="fp-esp">Especialidade <span class="req">*</span></label><select class="select" id="fp-esp" name="especialidade" required><option value="">Selecione</option>${C.ESPECIALIDADES.map((e) => `<option ${e === p.especialidade ? "selected" : ""}>${esc(e)}</option>`).join("")}</select><span class="field-error" data-erro-de="fp-esp"></span></div>
          <div class="field span-all"><label for="fp-uni">Unidade de atuação <span class="req">*</span></label><select class="select" id="fp-uni" name="unidadeId" required><option value="">Selecione</option>${C.opcoes(D.getAll("unidades"), p.unidadeId, (u) => `${u.nome} (${u.tipo})`)}</select><span class="field-error" data-erro-de="fp-uni"></span></div>
          <div class="field"><label for="fp-email">E-mail institucional <span class="req">*</span></label><input class="input" id="fp-email" type="email" name="email" value="${esc(p.email || "")}" required><span class="field-error" data-erro-de="fp-email"></span></div>
          <div class="field"><label for="fp-tel">Telefone</label><input class="input" id="fp-tel" name="telefone" value="${esc(p.telefone || "")}"></div>
          <div class="field span-all"><label for="fp-senha">${novo ? "Senha inicial de acesso" : "Redefinir senha (opcional)"} ${novo ? '<span class="req">*</span>' : ""}</label><input class="input" id="fp-senha" type="password" name="${novo ? "senha" : "novaSenha"}" autocomplete="new-password" ${novo ? "required" : ""}><span class="field-hint">8+ caracteres, com letras e números. Informe ao profissional por canal seguro.</span><span class="field-error" data-erro-de="fp-senha"></span></div>
          <div class="field span-all"><label class="switch"><input type="checkbox" id="fp-ativo" ${p.ativo ? "checked" : ""}><span class="track"></span><span>Acesso ativo à plataforma</span></label></div>
        </form>`,
        aoAbrir: (m) => { const c = qs("#fp-cpf", m); if (c) c.addEventListener("input", () => { c.value = C.formatarCPF(c.value); }); },
        acoes: [{ label: "Cancelar", onClick: "fechar" }, { label: novo ? "Cadastrar" : "Salvar alterações", classe: "btn-primary", icone: "save", onClick: async (fechar, m) => {
          const f = qs("#form-prof", m);
          const senhaOk = (v) => (!v && !novo) || (v.length >= 8 && /[A-Za-z]/.test(v) && /\d/.test(v)) ? "" : "Use 8+ caracteres com letras e números.";
          if (!C.validarFormulario(f, { cpf: (v) => (C.validarCPF(v) ? "" : "CPF inválido."), email: (v) => (/^\S+@\S+\.\S+$/.test(v) ? "" : "E-mail inválido."), senha: senhaOk, novaSenha: senhaOk })) return;
          const d = C.dadosFormulario(f); d.ativo = qs("#fp-ativo", m).checked;
          if (d.cpf) d.cpf = C.somenteDigitos(d.cpf);
          if (!d.novaSenha) delete d.novaSenha;
          if (!d.telefone) delete d.telefone;
          try {
            const r = novo ? await Api.post("/professionals", d) : await Api.patch(`/professionals/${p.id}`, d);
            D.put("profissionais", r); fechar(); render();
            C.toast(novo ? "Profissional cadastrado. Ele já pode acessar com o CPF e a senha inicial." : "Cadastro atualizado.");
          } catch (err) { C.erroApi(err, "Não foi possível salvar"); }
        } }]
      });
    }

    form.addEventListener("input", render);
    form.addEventListener("reset", () => setTimeout(render, 0));
    qs("#btn-novo-prof").addEventListener("click", () => abrirForm());
    qs("#pf-tabela").addEventListener("click", async (e) => {
      const ed = e.target.closest("[data-editar]"); const x = e.target.closest("[data-excluir]");
      if (ed) abrirForm(D.getById("profissionais", ed.dataset.editar));
      if (x) {
        const p = D.getById("profissionais", x.dataset.excluir);
        if (await C.confirmar({ titulo: "Excluir profissional", mensagem: `Excluir o cadastro de ${p.nome}? Se houver registros clínicos assinados por ele, a exclusão é bloqueada — desative o acesso nesse caso.`, rotulo: "Excluir", perigo: true })) {
          try { await Api.del(`/professionals/${p.id}`); D.drop("profissionais", p.id); render(); C.toast("Profissional excluído."); }
          catch (err) { C.erroApi(err, "Exclusão não permitida"); }
        }
      }
    });
    qs("#pf-tabela").addEventListener("change", async (e) => {
      const t = e.target.closest("[data-toggle]"); if (!t) return;
      try {
        const p = await Api.patch(`/professionals/${t.dataset.toggle}`, { ativo: t.checked });
        D.put("profissionais", p); render();
        C.toast(`Acesso de ${p.nome} ${t.checked ? "ativado" : "desativado"}${t.checked ? "" : " — sessões ativas encerradas"}.`, t.checked ? "sucesso" : "alerta");
      } catch (err) { t.checked = !t.checked; C.erroApi(err); }
    });
    await recarregar();
    render();
  }, "admin");

  /* ------------------------------------------------------------------------
     Unidades de saúde (cadastro manual ou importação de estabelecimento real do CNES)
     ------------------------------------------------------------------------ */
  C.pagina("unidades", async function () {
    let filtroTipo = ""; const busca = qs("#un-busca");
    function render() {
      const todas = D.getAll("unidades");
      qs("#un-chips").innerHTML = ["", ...TIPOS_UNIDADE].map((t) => `<button type="button" class="filter-chip" data-tipo="${t}" aria-pressed="${filtroTipo === t}">${t ? `${ico(C.ICONE_TIPO[t])} ${t}` : "Todas"} <span>${t ? todas.filter((u) => u.tipo === t).length : todas.length}</span></button>`).join("");
      const tb = normalizar(busca.value);
      const lista = todas.filter((u) => (!filtroTipo || u.tipo === filtroTipo) && (!tb || normalizar(`${u.nome} ${u.endereco} ${u.cnes || ""}`).includes(tb)));
      qs("#un-grid").innerHTML = lista.length ? lista.map((u) => `
        <article class="unit-card">
          <div class="unit-top"><span class="unit-ico tipo-${esc(u.tipo)}">${ico(C.ICONE_TIPO[u.tipo] || "building-2")}</span><div class="li-main"><h3>${esc(u.nome)}</h3>${tipoTag(u.tipo)}</div>${badge(u.status)}</div>
          <ul class="unit-info">
            <li>${ico("map-pin")} ${esc(u.endereco)}</li><li>${ico("phone")} ${esc(u.telefone)}</li>
            <li>${ico("clock")} ${esc(u.horario)}</li><li>${ico("hash")} ${u.cnes ? `CNES ${esc(u.cnes)}` : "Sem CNES"}</li>
            <li>${ico("user-round")} ${esc(u.responsavel)}</li><li>${ico("users")} ${D.where("profissionais", (p) => p.unidadeId === u.id).length} profissional(is)</li>
          </ul>
          <div class="unit-actions">
            ${u.integrada ? `<span class="small muted">${ico("link")} Integrada desde ${esc(C.fmtData(u.desde))}</span>` : `<button type="button" class="btn btn-success btn-sm" data-homologar="${u.id}">${ico("plug-zap")} Homologar integração</button>`}
            <span class="actions"><button type="button" class="btn btn-secondary btn-sm" data-editar="${u.id}">${ico("pencil")} Editar</button><button type="button" class="btn btn-ghost btn-sm text-danger" data-excluir="${u.id}" aria-label="Excluir ${esc(u.nome)}">${ico("trash-2")}</button></span>
          </div>
        </article>`).join("") : `<div class="empty">${ico("building")}<span>${todas.length ? "Nenhuma unidade encontrada." : "Nenhuma unidade cadastrada. Use \"Importar do CNES\" para trazer estabelecimentos reais."}</span></div>`;
      C.icones();
    }

    function abrirForm(u, tipoInicial) {
      const nova = !u; u = u || { tipo: tipoInicial || "UBS", integrada: true };
      C.abrirModal({
        titulo: nova ? "Cadastrar unidade de saúde" : "Editar unidade", tamanho: "lg",
        corpo: `<form id="form-uni" class="form-grid" novalidate>
          <div class="field span-all"><label for="fu-nome">Nome da unidade <span class="req">*</span></label><input class="input" id="fu-nome" name="nome" value="${esc(u.nome || "")}" required><span class="field-error" data-erro-de="fu-nome"></span></div>
          <div class="field"><label for="fu-tipo">Tipo <span class="req">*</span></label><select class="select" id="fu-tipo" name="tipo" required>${TIPOS_UNIDADE.map((t) => `<option ${t === u.tipo ? "selected" : ""}>${t}</option>`).join("")}</select></div>
          <div class="field"><label for="fu-cnes">CNES</label><input class="input" id="fu-cnes" name="cnes" value="${esc(u.cnes || "")}" inputmode="numeric" maxlength="7"><span class="field-error" data-erro-de="fu-cnes"></span></div>
          <div class="field span-all"><label for="fu-end">Endereço <span class="req">*</span></label><input class="input" id="fu-end" name="endereco" value="${esc(u.endereco || "")}" required><span class="field-error" data-erro-de="fu-end"></span></div>
          <div class="field"><label for="fu-tel">Telefone</label><input class="input" id="fu-tel" name="telefone" value="${esc(u.telefone && u.telefone !== "—" ? u.telefone : "")}"></div>
          <div class="field"><label for="fu-hor">Horário de funcionamento</label><input class="input" id="fu-hor" name="horario" value="${esc(u.horario && u.horario !== "—" ? u.horario : "")}" placeholder="Ex.: 07h às 19h"></div>
          <div class="field span-all"><label for="fu-resp">Responsável técnico</label><input class="input" id="fu-resp" name="responsavel" value="${esc(u.responsavel && u.responsavel !== "—" ? u.responsavel : "")}"></div>
          <div class="field span-all"><label class="switch"><input type="checkbox" id="fu-int" ${u.integrada ? "checked" : ""}><span class="track"></span><span>Unidade integrada à rede Conecta (compartilha registros)</span></label></div>
        </form>`,
        acoes: [{ label: "Cancelar", onClick: "fechar" }, { label: nova ? "Cadastrar" : "Salvar", classe: "btn-primary", icone: "save", onClick: async (fechar, m) => {
          const f = qs("#form-uni", m);
          if (!C.validarFormulario(f, { cnes: (v) => (!v || /^\d{7}$/.test(v) ? "" : "O CNES deve ter 7 dígitos.") })) return;
          const d = C.dadosFormulario(f); d.integrada = qs("#fu-int", m).checked;
          ["cnes", "telefone", "horario", "responsavel"].forEach((k) => { if (!d[k]) { if (nova) delete d[k]; else d[k] = ""; } });
          if (!nova && d.cnes === "") delete d.cnes;
          try {
            const r = nova ? await Api.post("/health-units", d) : await Api.patch(`/health-units/${u.id}`, d);
            D.put("unidades", r); fechar(); render(); C.toast(nova ? `${d.tipo} cadastrada com sucesso.` : "Unidade atualizada.");
          } catch (err) { C.erroApi(err, "Não foi possível salvar"); }
        } }]
      });
    }

    /** Importação a partir dos estabelecimentos reais sincronizados do CNES (Ministério da Saúde). */
    function importarCnes() {
      C.abrirModal({
        titulo: "Importar unidade do CNES", tamanho: "lg",
        corpo: `<p class="muted small">Estabelecimentos públicos sincronizados da API de Dados Abertos do Ministério da Saúde (apenas tipos compatíveis: UBS, UPA, hospital, laboratório e clínica).</p>
          <div class="filters"><div class="field"><label for="cn-q">Nome ou código CNES</label><div class="input-icon">${ico("search")}<input class="input" id="cn-q" type="search" placeholder="Ex.: UBS, hospital, 2232014"></div></div>
          <div class="field"><label for="cn-mun">Município</label><select class="select" id="cn-mun"><option value="">Todos sincronizados</option></select></div></div>
          <div id="cn-lista"><p class="muted small">Carregando…</p></div>`,
        aoAbrir: async (m) => {
          let espera;
          const carregar = async () => {
            try {
              const r = await Api.list("/integrations/ministerio-saude/establishments", { q: qs("#cn-q", m).value.trim() || undefined, codigoMunicipio: qs("#cn-mun", m).value || undefined, somenteSuportados: "true", limit: 30, sort: "nome", order: "ASC" });
              qs("#cn-lista", m).innerHTML = r.items.length ? `<p class="filter-count">${r.meta.total} estabelecimento(s) — exibindo ${r.items.length}</p><ul class="list">${r.items.map((e) => `
                <li class="list-item"><span class="li-main"><span class="li-title">${esc(e.nomeFantasia || e.nomeRazaoSocial)}</span>
                <span class="li-sub">CNES ${esc(e.codigoCnes)} · ${esc(e.tipoDescricao || "")} · ${esc(e.municipio || "")} — ${esc([e.enderecoEstabelecimento, e.numeroEstabelecimento].filter(Boolean).join(", "))}</span></span>
                ${tipoTag(e.categoriaConecta)} ${e.importadoComoUnidade ? '<span class="badge badge-sucesso">Já cadastrada</span>' : `<button type="button" class="btn btn-primary btn-sm" data-importar="${esc(e.codigoCnes)}">${ico("download-cloud")} Importar</button>`}</li>`).join("")}</ul>`
                : `<div class="empty">${ico("database")}<span>Nenhum estabelecimento encontrado. Verifique se a sincronização do CNES foi executada (Integrações).</span></div>`;
              C.icones();
            } catch (err) { qs("#cn-lista", m).innerHTML = `<div class="alert alert-perigo">${esc(err.message)}</div>`; }
          };
          try {
            const muns = await Api.get("/integrations/ministerio-saude/stats");
            qs("#cn-mun", m).insertAdjacentHTML("beforeend", muns.estabelecimentosPorMunicipio.filter((x) => x.codigo).map((x) => `<option value="${esc(x.codigo)}">${esc(x.municipio || x.codigo)} (${x.total})</option>`).join(""));
          } catch (e) { /* filtro opcional */ }
          qs("#cn-q", m).addEventListener("input", () => { clearTimeout(espera); espera = setTimeout(carregar, 350); });
          qs("#cn-mun", m).addEventListener("change", carregar);
          qs("#cn-lista", m).addEventListener("click", async (e) => {
            const b = e.target.closest("[data-importar]"); if (!b) return;
            b.disabled = true;
            try { const u = await Api.post("/health-units/import-cnes", { codigoCnes: b.dataset.importar, integrada: true }); D.put("unidades", u); render(); C.toast(`${u.nome} importada do CNES.`, "sucesso"); await carregar(); }
            catch (err) { b.disabled = false; C.erroApi(err, "Importação não realizada"); }
          });
          await carregar();
        }
      });
    }

    qs("#un-chips").addEventListener("click", (e) => { const b = e.target.closest("[data-tipo]"); if (b) { filtroTipo = b.dataset.tipo; render(); } });
    busca.addEventListener("input", render);
    qsa("[data-nova]").forEach((b) => b.addEventListener("click", () => abrirForm(null, b.dataset.nova)));
    qs("#btn-importar-cnes").addEventListener("click", importarCnes);
    qs("#un-grid").addEventListener("click", async (e) => {
      const ed = e.target.closest("[data-editar]"); const x = e.target.closest("[data-excluir]"); const h = e.target.closest("[data-homologar]");
      if (ed) abrirForm(D.getById("unidades", ed.dataset.editar));
      if (h) {
        try { D.put("unidades", await Api.patch(`/health-units/${h.dataset.homologar}`, { integrada: true })); render(); C.toast("Integração homologada: a unidade passa a compartilhar registros na rede."); }
        catch (err) { C.erroApi(err); }
      }
      if (x) {
        const u = D.getById("unidades", x.dataset.excluir);
        if (await C.confirmar({ titulo: "Excluir unidade", mensagem: `Excluir ${u.nome}? Unidades com profissionais ou registros clínicos vinculados não podem ser excluídas.`, rotulo: "Excluir", perigo: true })) {
          try { await Api.del(`/health-units/${u.id}`); D.drop("unidades", u.id); render(); C.toast("Unidade excluída."); }
          catch (err) { C.erroApi(err, "Exclusão não permitida"); }
        }
      }
    });
    render();
  }, "admin");

  /* ------------------------------------------------------------------------
     Relatórios
     ------------------------------------------------------------------------ */
  C.pagina("relatorios", async function () {
    const sel = qs("#rel-periodo");
    async function render() {
      let d;
      try { d = await Api.get("/admin/reports", { meses: sel.value }); } catch (e) { C.erroApi(e); return; }
      const soma = (a) => a.reduce((s, v) => s + v, 0);
      const n = Number(sel.value);
      qs("#rel-kpis").innerHTML = [["Atendimentos no período", soma(d.atendimentosMes), "stethoscope", ""], ["Exames realizados", soma(d.examesMes), "flask-conical", "c2"], ["Pacientes atendidos (soma mensal)", soma(d.pacientesMes), "users", "c3"], ["Média diária de atendimentos", (soma(d.atendimentosMes) / (n * 30)).toFixed(1), "activity", "c4"]]
        .map(([l, v, i, c]) => `<div class="stat"><span class="stat-ico ${c}">${ico(i)}</span><div><div class="stat-label">${l}</div><div class="stat-value">${typeof v === "number" ? num(v) : v}</div></div></div>`).join("");
      const unidades = d.unidades.slice().sort((a, b) => b.volume - a.volume);
      if (unidades.some((u) => u.volume)) grafico("r-unidades", { type: "bar", data: { labels: unidades.map((u) => nomeCurto(u.nome)), datasets: [{ label: "Atendimentos", data: unidades.map((u) => u.volume), backgroundColor: unidades.map((u) => CORES_TIPO[u.tipo]), borderRadius: 6, maxBarThickness: 22 }] }, options: { indexAxis: "y", plugins: { legend: { display: false } }, scales: { x: { grid: { color: "#eef2f7" }, ticks: { precision: 0 } }, y: { grid: { display: false } } } } });
      else semDados("r-unidades", "Sem atendimentos registrados no período.");
      grafico("r-exames", { type: "bar", data: { labels: d.meses, datasets: [{ label: "Exames realizados", data: d.examesMes, backgroundColor: CORES[1], borderRadius: 6, maxBarThickness: 36 }] }, options: { plugins: { legend: { display: false } } } });
      grafico("r-pacientes", { type: "line", data: { labels: d.meses, datasets: [{ label: "Pacientes atendidos", data: d.pacientesMes, borderColor: CORES[2], backgroundColor: "rgba(2,78,174,.08)", fill: true, tension: .35 }] }, options: { plugins: { legend: { display: false } } } });
      grafico("r-volume", { type: "line", data: { labels: d.meses, datasets: [{ label: "Atendimentos", data: d.atendimentosMes, borderColor: CORES[0], tension: .35, pointRadius: 4 }, { label: "Exames", data: d.examesMes, borderColor: CORES[1], tension: .35, pointRadius: 4 }, { label: "Pacientes", data: d.pacientesMes, borderColor: CORES[2], borderDash: [6, 4], tension: .35, pointRadius: 3 }] } });
      graficosPorTipo("r-tipos", d.unidades);
      const tipos = d.tiposAtendimento;
      if (Object.keys(tipos).length) grafico("r-natureza", { type: "pie", data: { labels: Object.keys(tipos), datasets: [{ data: Object.values(tipos), backgroundColor: CORES, borderColor: "#fff", borderWidth: 2 }] } });
      else semDados("r-natureza", "Sem atendimentos registrados no período.");
    }
    sel.addEventListener("change", render);
    qs("#rel-csv").addEventListener("click", async () => {
      try { await Api.download("/admin/exports/indicadores", "conecta-indicadores.csv"); C.toast("Relatório exportado em CSV."); } catch (e) { C.erroApi(e, "Exportação não realizada"); }
    });
    qs("#rel-imprimir").addEventListener("click", () => window.print());
    await render();
  }, "admin");

  /* ------------------------------------------------------------------------
     Segurança, auditoria e privacidade
     ------------------------------------------------------------------------ */
  C.pagina("seguranca", async function () {
    const [settings, matriz] = await Promise.all([Api.get("/admin/settings"), Api.get("/admin/access-permissions")]);
    D.set("configuracoes", settings); D.set("permissoes", matriz);
    const abas = { auditoria: renderAuditoria, acesso: renderAcesso, compartilhamento: renderCompart, privacidade: renderPrivacidade, config: renderConfig };
    const ativar = C.iniciarAbas(qs("#abas-seg"), (nome) => { C.definirAba(nome); abas[nome](); });

    /* --- Auditoria (filtros aplicados no servidor) --- */
    const fa = qs("#filtros-auditoria");
    qs("#au-unidade").insertAdjacentHTML("beforeend", C.opcoes(D.getAll("unidades")));
    let operacoesCarregadas = false; let espera;
    async function renderAuditoria() {
      const f = C.dadosFormulario(fa);
      try {
        const r = await Api.list("/admin/audit-logs", { q: f.busca || undefined, operacao: f.operacao || undefined, unidadeId: f.unidade || undefined, data: f.data || undefined, limit: 100 });
        if (!operacoesCarregadas && r.meta.operacoes) { qs("#au-operacao").insertAdjacentHTML("beforeend", r.meta.operacoes.map((o) => `<option>${esc(o)}</option>`).join("")); operacoesCarregadas = true; }
        qs("#au-contagem").textContent = `${r.meta.total} registro(s) de auditoria${r.meta.total > r.items.length ? ` — exibindo os ${r.items.length} mais recentes` : ""}`;
        C.tabela(qs("#au-tabela"), {
          rotulo: "Registros de auditoria", linhas: r.items,
          colunas: [
            { titulo: "Profissional / usuário", render: (l) => `<span class="cell-strong">${esc(l.usuario)}</span><span class="cell-sub">${esc(l.perfil)}</span>` },
            { titulo: "Paciente consultado", render: (l) => (l.pacienteId ? `${esc(l.pacienteNome || "—")}<span class="cell-sub">CPF ${esc(l.pacienteCpf || "")}</span>` : '<span class="muted">—</span>') },
            { titulo: "Unidade de origem", render: (l) => esc(l.unidadeId ? D.unidade(l.unidadeId).nome : "—") },
            { titulo: "Data e horário", render: (l) => esc(C.fmtDataHora(l.data)) },
            { titulo: "Operação", render: (l) => `<span class="op-tag ${!l.sucesso || l.operacao.includes("negada") ? "op-neg" : l.operacao.includes("Visualiza") || l.operacao.includes("Exibição") || l.operacao.includes("Consulta") ? "op-ver" : "op-esc"}">${esc(l.operacao)}</span>${l.detalhe ? `<span class="cell-sub">${esc(l.detalhe)}</span>` : ""}` },
            { titulo: "IP", render: (l) => `<span class="mono small">${esc(l.ip || "—")}</span>` }
          ]
        });
      } catch (e) { C.erroApi(e); }
    }
    fa.addEventListener("input", () => { clearTimeout(espera); espera = setTimeout(renderAuditoria, 350); });
    fa.addEventListener("reset", () => setTimeout(renderAuditoria, 0));
    qs("#au-exportar").addEventListener("click", async () => {
      try { await Api.download("/admin/exports/auditoria", "conecta-auditoria.csv"); C.toast("Trilha de auditoria exportada."); } catch (e) { C.erroApi(e, "Exportação não realizada"); }
    });

    /* --- Controle de acesso por perfil --- */
    function renderAcesso() {
      const perm = D.getObj("permissoes");
      const profs = D.getAll("profissionais");
      qs("#ac-resumo").innerHTML = perm.perfis.map((pf) => {
        const n = pf === "Administrador" ? "—" : profs.filter((p) => p.cargo === pf && p.ativo).length;
        return `<div class="role-card"><span class="li-ico">${ico({ "Médico": "stethoscope", "Enfermeiro": "heart-pulse", "Técnico de laboratório": "flask-conical", "Recepção": "clipboard-list", "Administrador": "shield" }[pf] || "user")}</span><div><strong>${esc(pf)}</strong><span>${n} usuário(s) ativo(s)</span></div></div>`;
      }).join("");
      qs("#ac-matriz").innerHTML = `<div class="table-wrap"><table class="table perm-table"><caption class="sr-only">Matriz de permissões por perfil</caption>
        <thead><tr><th scope="col">Permissão</th>${perm.perfis.map((p) => `<th scope="col">${esc(p)}</th>`).join("")}</tr></thead>
        <tbody>${perm.recursos.map((r) => `<tr><th scope="row">${esc(r.nome)}</th>${perm.perfis.map((p) => `<td><label class="perm-check"><input type="checkbox" data-perfil="${esc(p)}" data-recurso="${r.id}" ${perm.matriz[p] && perm.matriz[p][r.id] ? "checked" : ""} aria-label="${esc(p)}: ${esc(r.nome)}"><span aria-hidden="true">${ico("check")}</span></label></td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
      C.icones();
    }
    qs("#ac-salvar").addEventListener("click", async () => {
      if (!(await C.confirmar({ titulo: "Salvar permissões", mensagem: "As novas permissões passam a valer imediatamente para todos os profissionais dos perfis alterados.", rotulo: "Salvar" }))) return;
      const matrizNova = {};
      qsa("#ac-matriz [data-perfil]").forEach((c) => { (matrizNova[c.dataset.perfil] = matrizNova[c.dataset.perfil] || {})[c.dataset.recurso] = c.checked; });
      try { D.set("permissoes", await Api.put("/admin/access-permissions", { matriz: matrizNova })); renderAcesso(); C.toast("Permissões atualizadas e registradas na auditoria."); }
      catch (e) { C.erroApi(e); }
    });
    qs("#ac-restaurar").addEventListener("click", renderAcesso);

    /* --- Compartilhamento --- */
    function toggleCfg(chave, rotulo, desc) {
      const cfg = D.getObj("configuracoes");
      return `<label class="switch pref"><input type="checkbox" data-cfg="${chave}" ${cfg[chave] ? "checked" : ""}><span class="track"></span><span><strong>${esc(rotulo)}</strong><span class="li-sub">${esc(desc)}</span></span></label>`;
    }
    function renderCompart() {
      qs("#cp-regras").innerHTML = [
        toggleCfg("compartilharEntreUnidades", "Compartilhar registros entre unidades integradas", "Atendimentos, exames e prescrições ficam visíveis para profissionais autorizados de outras unidades integradas."),
        toggleCfg("consentimentoPaciente", "Respeitar a preferência de compartilhamento do paciente", "Pacientes que restringirem o compartilhamento só têm o histórico visto pelas unidades onde são atendidos."),
        toggleCfg("exigirJustificativaEmergencia", "Exigir justificativa para acesso de emergência", "Sem vínculo assistencial ou consentimento, o acesso exige justificativa registrada na auditoria."),
        toggleCfg("bloquearExportacao", "Bloquear exportação de dados", "Impede a geração de arquivos CSV (pacientes, auditoria e indicadores).")
      ].join("");
      const unidades = D.getAll("unidades");
      qs("#cp-unidades").innerHTML = unidades.length ? `<ul class="list">${unidades.map((u) => `<li class="list-item"><span class="li-main"><span class="li-title">${esc(u.nome)}</span><span class="li-sub">${tipoTag(u.tipo)}</span></span><label class="switch"><input type="checkbox" data-uni-share="${u.id}" ${u.integrada ? "checked" : ""} aria-label="Compartilhamento: ${esc(u.nome)}"><span class="track"></span><span class="small">${u.integrada ? "Compartilhando" : "Bloqueado"}</span></label></li>`).join("")}</ul>` : `<div class="empty">${ico("building")}<span>Nenhuma unidade cadastrada.</span></div>`;
      C.icones();
    }
    /* --- Privacidade / mascaramento --- */
    function renderPrivacidade() {
      const cfg = D.getObj("configuracoes");
      qs("#pv-regras").innerHTML = toggleCfg("mascararDocumentos", "Mascarar CPF e CNS em listagens", "Os documentos aparecem parcialmente ocultos; a exibição completa exige permissão e gera auditoria.") +
        toggleCfg("notificarPacienteAcesso", "Notificar o paciente a cada acesso ao prontuário", "Transparência ativa: o paciente vê quem consultou seu histórico (uma notificação por profissional/dia).");
      qs("#pv-exemplo").innerHTML = `<table class="table"><thead><tr><th scope="col">Dado</th><th scope="col">Formato original (exemplo)</th><th scope="col">Exibição na plataforma</th></tr></thead><tbody>
        <tr><td>CPF</td><td class="mono">123.456.789-09</td><td class="mono"><strong>${cfg.mascararDocumentos ? "***.456.***-09" : "123.456.789-09"}</strong></td></tr>
        <tr><td>CNS</td><td class="mono">898 0012 3456 7890</td><td class="mono"><strong>${cfg.mascararDocumentos ? "898 **** **** 7890" : "898 0012 3456 7890"}</strong></td></tr>
        <tr><td>Nome na auditoria (gestor)</td><td>Nome completo</td><td><strong>Primeiro nome + CPF mascarado</strong></td></tr></tbody></table>`;
    }
    /* --- Configurações --- */
    function renderConfig() {
      qs("#cf-regras").innerHTML = "";
      qs("#cf-sessao").value = String(D.getObj("configuracoes").expirarSessao || 30);
    }
    qs("#painel-seg").addEventListener("change", async (e) => {
      const c = e.target.closest("[data-cfg]"); const u = e.target.closest("[data-uni-share]");
      try {
        if (c) {
          D.set("configuracoes", await Api.patch("/admin/settings", { [c.dataset.cfg]: c.checked }));
          C.toast("Configuração atualizada.");
          if (c.dataset.cfg === "mascararDocumentos") renderPrivacidade();
        }
        if (u) {
          D.put("unidades", await Api.patch(`/health-units/${u.dataset.uniShare}`, { integrada: u.checked }));
          renderCompart(); C.toast(`Compartilhamento ${u.checked ? "liberado" : "bloqueado"} para a unidade.`, u.checked ? "sucesso" : "alerta");
        }
        if (e.target.id === "cf-sessao") { D.set("configuracoes", await Api.patch("/admin/settings", { expirarSessao: Number(e.target.value) })); C.toast(`Sessões inativas encerram após ${e.target.value} minutos.`); }
      } catch (err) { if (c) c.checked = !c.checked; if (u) u.checked = !u.checked; C.erroApi(err); }
    });

    const inicial = C.param("aba");
    ativar(abas[inicial] ? inicial : "acesso");
  }, "admin");
})();
