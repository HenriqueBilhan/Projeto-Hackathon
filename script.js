(() => {
    "use strict";
  
    const $ = (id) => document.getElementById(id);
    const STORAGE_KEY = "conectasaude_dados_v1";
  
    const emptyData = () => ({
      patients: [], histories: [], exams: [], images: [], reports: [],
      prescriptions: [], families: [], risks: [], professionals: [],
      institutions: [], notifications: [], activities: [],
      profile: { nome: "", email: "", telefone: "", tipo: "" }
    });
  
    let db = loadData();
  
    function loadData() {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        return saved && typeof saved === "object"
          ? { ...emptyData(), ...saved }
          : emptyData();
      } catch {
        return emptyData();
      }
    }
  
    function saveData() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
        return true;
      } catch {
        toast("Não foi possível salvar. O armazenamento local pode estar cheio.");
        return false;
      }
    }
  
    const uid = () =>
      `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  
    const esc = (v) =>
      String(v ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[c]));
  
    const formValues = (form) => {
      const out = {};
  
      new FormData(form).forEach((v, k) => {
        if (v instanceof File) return;
  
        if (Object.prototype.hasOwnProperty.call(out, k)) {
          out[k] = Array.isArray(out[k]) ? [...out[k], v] : [out[k], v];
        } else {
          out[k] = v;
        }
      });
  
      form.querySelectorAll('input[type="checkbox"][name]').forEach(input => {
        if (!Object.prototype.hasOwnProperty.call(out, input.name)) {
          out[input.name] = [];
        }
      });
  
      return out;
    };
  
    const val = (id) => $(id)?.value?.trim() || "";
    const today = () => new Date().toISOString().slice(0, 10);
    const dateBR = (d) => d ? d.split("-").reverse().join("/") : "—";
  
    const patientName = (id) =>
      db.patients.find(p => p.id === id)?.nome || "Paciente não encontrado";
  
    const institutionName = (id) =>
      db.institutions.find(i => i.id === id)?.nome || "Não vinculada";
  
    function toast(message) {
      document.querySelector(".toast-conectasaude")?.remove();
  
      const el = document.createElement("div");
      el.className = "toast-conectasaude";
      el.setAttribute("role", "status");
      el.textContent = message;
  
      document.body.appendChild(el);
      window.setTimeout(() => el.remove(), 3000);
    }
  
    function logActivity(action, module) {
      db.activities.unshift({
        id: uid(),
        date: new Date().toLocaleString("pt-BR"),
        action,
        module
      });
  
      db.activities = db.activities.slice(0, 30);
    }
  
    function notify(title, message, type = "geral") {
      db.notifications.unshift({
        id: uid(),
        title,
        message,
        type,
        date: new Date().toLocaleString("pt-BR"),
        read: false
      });
    }
  
    function addEmptyRow(tableId, columns, message = "Nenhum registro cadastrado.") {
      const tbody = $(tableId)?.querySelector("tbody");
      if (!tbody) return;
  
      const tr = document.createElement("tr");
      const td = document.createElement("td");
  
      td.colSpan = columns;
      td.className = "mensagem-vazia";
      td.textContent = message;
  
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
  
    function renderTable(tableId, rows, columns, emptyMessage) {
      const tbody = $(tableId)?.querySelector("tbody");
      if (!tbody) return;
  
      tbody.innerHTML = "";
  
      if (!rows.length) {
        return addEmptyRow(tableId, columns, emptyMessage);
      }
  
      rows.forEach(row => {
        const tr = document.createElement("tr");
        tr.innerHTML = row;
        tbody.appendChild(tr);
      });
    }
  
    function actionButtons(id, details = "Detalhes") {
      return `
        <button type="button" class="acao-detalhes" data-id="${esc(id)}">
          ${esc(details)}
        </button>
        <button type="button" class="danger acao-excluir" data-id="${esc(id)}">
          Excluir
        </button>
      `;
    }
  
    function setOptions(selectId, options, firstLabel = "Selecione") {
      const select = $(selectId);
      if (!select) return;
  
      const previous = select.value;
  
      select.innerHTML = "";
  
      const first = document.createElement("option");
      first.value = "";
      first.textContent = firstLabel;
      select.appendChild(first);
  
      options.forEach(item => {
        const option = document.createElement("option");
        option.value = item.value;
        option.textContent = item.label;
        select.appendChild(option);
      });
  
      if (options.some(o => o.value === previous)) {
        select.value = previous;
      }
    }
  
    function refreshSelects() {
      const patients = db.patients.map(p => ({
        value: p.id,
        label: p.nome
      }));
  
      [
        "historico-paciente",
        "exame-paciente",
        "imagem-paciente",
        "prescricao-paciente",
        "familiar-paciente",
        "risco-paciente",
        "laudo-paciente"
      ].forEach(id => setOptions(id, patients));
  
      const institutions = db.institutions.map(i => ({
        value: i.id,
        label: `${i.nome} (${i.tipo})`
      }));
  
      [
        "profissional-instituicao",
        "exame-laboratorio"
      ].forEach(id => setOptions(id, institutions));
    }
  
    function renderDashboard() {
      const counts = {
        "indicador-pacientes": db.patients.length,
        "indicador-atendimentos": db.histories.filter(h => h.data === today()).length,
        "indicador-exames-pendentes": db.exams.filter(
          e => !["Concluído", "Cancelado"].includes(e.status)
        ).length,
        "indicador-laudos": db.reports.length,
        "indicador-instituicoes": db.institutions.length
      };
  
      Object.entries(counts).forEach(([id, count]) => {
        const el = $(`${id}`)?.querySelector(".valor-indicador");
        if (el) el.textContent = count;
      });
  
      const riskCounts = {
        vermelho: 0,
        laranja: 0,
        amarelo: 0,
        verde: 0,
        azul: 0
      };
  
      db.risks
        .filter(r => r.data.slice(0, 10) === today())
        .forEach(r => {
          if (riskCounts[r.categoria] !== undefined) {
            riskCounts[r.categoria]++;
          }
        });
  
      const tbody = $("tabela-resumo-classificacao")?.querySelector("tbody");
  
      if (tbody) {
        tbody.innerHTML = "";
  
        Object.entries(riskCounts).forEach(([key, count]) => {
          const tr = document.createElement("tr");
  
          tr.innerHTML = `
            <td>${key[0].toUpperCase() + key.slice(1)}</td>
            <td>${count}</td>
          `;
  
          tbody.appendChild(tr);
        });
      }
  
      renderTable(
        "tabela-atividades-recentes",
        db.activities.slice(0, 8).map(a => `
          <td>${esc(a.date)}</td>
          <td>${esc(a.action)}</td>
          <td>${esc(a.module)}</td>
          <td>${esc(db.profile.nome || "Usuário")}</td>
        `),
        4,
        "Nenhuma atividade registrada."
      );
    }
  
    function renderPatients() {
      renderTable(
        "tabela-pacientes",
        db.patients.map(p => `
          <td><strong>${esc(p.nome)}</strong></td>
          <td>${esc(p.cpf || "—")}</td>
          <td>${esc(p.telefone || "—")}</td>
          <td>Ativo</td>
          <td>${actionButtons(p.id, "Ver ficha")}</td>
        `),
        5,
        "Nenhum paciente cadastrado. Use o formulário acima para adicionar."
      );
    }
  
    function renderHistory() {
      const selected = val("historico-paciente");
      const list = $("historico-linha-do-tempo");
  
      if (!list) return;
  
      list.innerHTML = "";
  
      const patient = db.patients.find(p => p.id === selected);
  
      const summaryValues = {
        "resumo-condicoes": patient?.condicoes || "Não informado.",
        "resumo-alergias": patient?.alergias || "Não informado.",
        "resumo-medicamentos": patient?.medicamentos || "Não informado.",
        "resumo-cirurgias": patient?.cirurgias || "Não informado."
      };
  
      Object.entries(summaryValues).forEach(([id, text]) => {
        const node = $(id);
  
        if (node) {
          node.textContent = selected ? text : "Selecione um paciente.";
        }
      });
  
      if (!selected) {
        const p = document.createElement("p");
        p.className = "mensagem-vazia";
        p.textContent = "Selecione um paciente para consultar o histórico.";
        list.appendChild(p);
        return;
      }
  
      const records = db.histories.filter(h => h.paciente === selected);
  
      if (!records.length) {
        const p = document.createElement("p");
        p.className = "mensagem-vazia";
        p.textContent = "Este paciente ainda não possui registros no histórico.";
        list.appendChild(p);
        return;
      }
  
      records.forEach(h => {
        const article = document.createElement("article");
  
        article.innerHTML = `
          <strong>${esc(dateBR(h.data))} — ${esc(h.tipo)}</strong>
          <p>${esc(h.descricao)}</p>
          <small>Profissional: ${esc(h.profissional || "Não informado")}</small>
          <p>
            <button
              type="button"
              class="danger acao-excluir-historico"
              data-id="${esc(h.id)}">
              Excluir registro
            </button>
          </p>
        `;
  
        list.appendChild(article);
      });
    }
  
    function renderClinicalTables() {
      renderTable(
        "tabela-exames",
        db.exams.map(e => `
          <td>${esc(patientName(e.paciente))}</td>
          <td>${esc(e.tipo)}</td>
          <td>${esc(dateBR(e.data))}</td>
          <td>${esc(e.status)}</td>
          <td>${actionButtons(e.id)}</td>
        `),
        5,
        "Nenhum exame solicitado."
      );
  
      renderTable(
        "tabela-laudos",
        db.reports.map(r => `
          <td>${esc(patientName(r.paciente))}</td>
          <td>${esc(r.exame)}</td>
          <td>${esc(r.profissional)}</td>
          <td>${esc(dateBR(r.data))}</td>
          <td>${esc(r.arquivo || "Sem arquivo")} ${actionButtons(r.id)}</td>
        `),
        5,
        "Nenhum laudo registrado."
      );
  
      renderTable(
        "tabela-prescricoes",
        db.prescriptions.map(p => `
          <td>${esc(patientName(p.paciente))}</td>
          <td>${esc(p.texto)}</td>
          <td>${esc(dateBR(p.data))}</td>
          <td>${esc(dateBR(p.validade))}</td>
          <td>${actionButtons(p.id)}</td>
        `),
        5,
        "Nenhuma prescrição cadastrada."
      );
  
      const ul = $("lista-imagens");
  
      if (ul) {
        ul.innerHTML = "";
  
        if (!db.images.length) {
          const li = document.createElement("li");
          li.className = "mensagem-vazia";
          li.textContent = "Nenhuma imagem registrada.";
          ul.appendChild(li);
        } else {
          db.images.forEach(i => {
            const li = document.createElement("li");
  
            li.innerHTML = `
              ${esc(patientName(i.paciente))} —
              ${esc(i.modalidade)} —
              ${esc(i.nome)}
              <button
                type="button"
                class="danger acao-excluir-imagem"
                data-id="${esc(i.id)}">
                Excluir
              </button>
            `;
  
            ul.appendChild(li);
          });
        }
      }
    }
  
    function renderFamilies() {
      renderTable(
        "tabela-familiares",
        db.families.map(f => `
          <td>${esc(f.nome)}</td>
          <td>${esc(f.parentesco)}</td>
          <td>${esc(f.telefone || "—")}</td>
          <td>${esc((f.permissoes || []).join(", ") || "Sem permissões")}</td>
          <td>${esc(dateBR(f.validade))}</td>
          <td>
            <button type="button" class="acao-permissoes" data-id="${esc(f.id)}">
              Ver permissões
            </button>
            <button type="button" class="danger acao-revogar" data-id="${esc(f.id)}">
              Revogar acesso
            </button>
          </td>
        `),
        6,
        "Nenhum familiar ou responsável cadastrado."
      );
    }
  
    function renderRisks() {
      renderTable(
        "tabela-classificacoes-recentes",
        db.risks.map(r => `
          <td>${esc(patientName(r.paciente))}</td>
          <td>${esc(r.categoria)}</td>
          <td>${esc(r.data.replace("T", " "))}</td>
          <td>${esc(r.profissional || "—")}</td>
          <td>${actionButtons(r.id)}</td>
        `),
        5,
        "Nenhuma classificação de risco registrada."
      );
    }
  
    function renderProfessionals() {
      renderTable(
        "tabela-profissionais",
        db.professionals.map(p => `
          <td>${esc(p.nome)}</td>
          <td>${esc(p.categoria)}</td>
          <td>${esc(p.registro || "—")}</td>
          <td>${esc(institutionName(p.instituicao))}</td>
          <td>${p.habilitado ? "Capacitação declarada" : "Não declarado"}</td>
          <td>${actionButtons(p.id)}</td>
        `),
        6,
        "Nenhum profissional cadastrado."
      );
    }
  
    function renderInstitutions() {
      renderTable(
        "tabela-instituicoes",
        db.institutions.map(i => `
          <td>${esc(i.nome)}</td>
          <td>${esc(i.tipo)}</td>
          <td>${esc(i.cidade)}/${esc(i.uf)}</td>
          <td>${esc(i.telefone || "—")}</td>
          <td>Cadastrada localmente</td>
          <td>${actionButtons(i.id)}</td>
        `),
        6,
        "Nenhuma instituição cadastrada."
      );
    }
  
    function renderNotifications() {
      const list = $("lista-notificacoes");
      if (!list) return;
  
      list.innerHTML = "";
  
      if (!db.notifications.length) {
        const li = document.createElement("li");
        li.className = "mensagem-vazia";
        li.textContent = "Você ainda não possui notificações.";
        list.appendChild(li);
      }
  
      db.notifications.forEach(n => {
        const li = document.createElement("li");
        const article = document.createElement("article");
  
        article.className = `notificacao ${n.read ? "lida" : ""}`;
        article.dataset.tipo = n.type;
  
        article.innerHTML = `
          <h3>${esc(n.title)}</h3>
          <p>${esc(n.date)} · ${n.read ? "Lida" : "Não lida"}</p>
          <p>${esc(n.message)}</p>
          <button type="button" class="acao-lida" data-id="${esc(n.id)}">
            ${n.read ? "Lida" : "Marcar como lida"}
          </button>
        `;
  
        li.appendChild(article);
        list.appendChild(li);
      });
  
      const unread = db.notifications.filter(n => !n.read).length;
      const btn = $("botao-notificacoes-cabecalho");
  
      if (btn) {
        btn.textContent = `Notificações (${unread})`;
      }
    }
  
    function renderProfile() {
      const p = db.profile;
  
      if ($("nome-usuario-logado")) {
        $("nome-usuario-logado").textContent = p.nome || "Não identificado";
      }
  
      if ($("perfil-usuario-logado")) {
        $("perfil-usuario-logado").textContent = p.tipo || "Não definido";
      }
  
      if ($("instituicao-usuario-logado")) {
        $("instituicao-usuario-logado").textContent = "Não vinculada";
      }
  
      ["nome", "email", "telefone"].forEach(k => {
        const input = $(`perfil-${k}`);
  
        if (input && !input.value) {
          input.value = p[k] || "";
        }
      });
  
      if ($("perfil-tipo-acesso") && p.tipo) {
        $("perfil-tipo-acesso").value = p.tipo;
      }
    }
  
    function renderAll() {
      refreshSelects();
      renderPatients();
      renderHistory();
      renderClinicalTables();
      renderFamilies();
      renderRisks();
      renderProfessionals();
      renderInstitutions();
      renderNotifications();
      renderProfile();
      renderDashboard();
    }
  
    function bindForm(id, callback) {
      $(id)?.addEventListener("submit", event => {
        event.preventDefault();
  
        const form = event.currentTarget;
        callback(form, formValues(form));
      });
    }
  
    // NAVEGAÇÃO
    const sections = [
      ...document.querySelectorAll("#conteudo-principal > section")
    ];
  
    const menuLinks = [
      ...document.querySelectorAll("#menu-lateral a")
    ];
  
    function showSection(id, updateHash = true) {
      const target = $(id);
  
      if (!target || !target.matches("#conteudo-principal > section")) {
        return;
      }
  
      sections.forEach(s => {
        s.classList.toggle("active", s === target);
      });
  
      menuLinks.forEach(a => {
        const active = a.getAttribute("href") === `#${id}`;
  
        a.classList.toggle("active", active);
  
        if (active) {
          a.setAttribute("aria-current", "page");
        } else {
          a.removeAttribute("aria-current");
        }
      });
  
      if (updateHash) {
        history.replaceState(null, "", `#${id}`);
      }
  
      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    }
  
    menuLinks.forEach(a => {
      a.addEventListener("click", e => {
        const id = a.getAttribute("href")?.slice(1);
  
        if ($(id)) {
          e.preventDefault();
          showSection(id);
        }
      });
    });
  
    const initial = location.hash.slice(1);
  
    showSection(
      $(initial) ? initial : "secao-dashboard",
      false
    );
  
    $("botao-notificacoes-cabecalho")?.addEventListener(
      "click",
      () => showSection("secao-notificacoes")
    );
  
    $("botao-sair")?.addEventListener("click", () => {
      toast("Este protótipo não possui autenticação ou sessão de usuário.");
    });
  
    // CADASTRO DE PACIENTES
    bindForm("formulario-cadastro-paciente", (form, d) => {
      if (!form.querySelector('[name="consentimento"]')?.checked) {
        return toast("Confirme a autorização para registrar os dados.");
      }
  
      if (db.patients.some(p => d.cpf && p.cpf === d.cpf)) {
        return toast("Já existe um paciente com este CPF.");
      }
  
      db.patients.unshift({
        id: uid(),
        ...d
      });
  
      logActivity("Paciente cadastrado", "Pacientes");
      notify("Paciente cadastrado", `${d.nome} foi incluído na lista de pacientes.`);
  
      saveData();
      form.reset();
      renderAll();
  
      toast("Paciente cadastrado.");
    });
  
    bindForm("formulario-consulta-paciente", (form, d) => {
      const term = (d.termo || "").toLowerCase();
  
      const filtered = db.patients.filter(p =>
        !term || JSON.stringify(p).toLowerCase().includes(term)
      );
  
      renderTable(
        "tabela-pacientes",
        filtered.map(p => `
          <td><strong>${esc(p.nome)}</strong></td>
          <td>${esc(p.cpf || "—")}</td>
          <td>${esc(p.telefone || "—")}</td>
          <td>Ativo</td>
          <td>${actionButtons(p.id, "Ver ficha")}</td>
        `),
        5,
        "Nenhum paciente corresponde à busca."
      );
    });
  
    // HISTÓRICO MÉDICO
    $("historico-paciente")?.addEventListener("change", renderHistory);
  
    $("formulario-selecao-historico")?.addEventListener("submit", event => {
      event.preventDefault();
  
      if (!val("historico-paciente")) {
        return toast("Selecione um paciente.");
      }
  
      renderHistory();
    });
  
    bindForm("formulario-registro-historico", (form, d) => {
      if (!val("historico-paciente")) {
        return toast("Selecione um paciente antes de registrar o histórico.");
      }
  
      db.histories.unshift({
        id: uid(),
        paciente: val("historico-paciente"),
        ...d
      });
  
      logActivity("Registro adicionado ao histórico", "Histórico médico");
  
      notify(
        "Histórico atualizado",
        `Foi adicionado um registro para ${patientName(val("historico-paciente"))}.`
      );
  
      saveData();
      form.reset();
      renderAll();
  
      toast("Registro salvo.");
    });
  
    // EXAMES
    bindForm("formulario-solicitacao-exame", (form, d) => {
      if (!d.paciente || !d.tipo) {
        return toast("Selecione o paciente e informe o exame.");
      }
  
      db.exams.unshift({
        id: uid(),
        ...d,
        data: today(),
        status: "Solicitado"
      });
  
      logActivity("Exame solicitado", "Exames");
  
      notify(
        "Exame solicitado",
        `Solicitação registrada para ${patientName(d.paciente)}.`,
        "exames"
      );
  
      saveData();
      form.reset();
      renderAll();
  
      toast("Solicitação de exame salva.");
    });
  
    // IMAGENS
    // Registra o nome do arquivo escolhido, sem enviá-lo a um servidor.
    bindForm("formulario-envio-imagem", (form, d) => {
      const file = $("imagem-arquivo")?.files?.[0];
  
      if (!file || !d.paciente) {
        return toast("Selecione um paciente e um arquivo.");
      }
  
      db.images.unshift({
        id: uid(),
        paciente: d.paciente,
        modalidade: d.modalidade,
        nome: file.name,
        tamanho: file.size
      });
  
      logActivity("Imagem registrada", "Imagens");
  
      saveData();
      form.reset();
      renderAll();
  
      toast("Registro da imagem salvo. O arquivo não foi enviado a um servidor.");
    });
  
    // LAUDOS
    bindForm("formulario-cadastro-laudo", (form, d) => {
      const file = $("laudo-arquivo")?.files?.[0];
  
      if (!d.paciente || !d.exame || !d.profissional || !d.data) {
        return toast("Preencha os dados obrigatórios do laudo.");
      }
  
      db.reports.unshift({
        id: uid(),
        ...d,
        arquivo: file?.name || "Sem arquivo"
      });
  
      logActivity("Laudo registrado", "Laudos");
  
      notify(
        "Laudo registrado",
        `Laudo associado a ${patientName(d.paciente)}.`,
        "laudos"
      );
  
      saveData();
      form.reset();
      renderAll();
  
      toast("Laudo registrado. O arquivo não foi enviado a um servidor.");
    });
  
    // PRESCRIÇÕES
    bindForm("formulario-prescricao", (form, d) => {
      if (!d.paciente || !d.texto) {
        return toast("Selecione o paciente e preencha a prescrição.");
      }
  
      db.prescriptions.unshift({
        id: uid(),
        ...d,
        data: today()
      });
  
      logActivity("Prescrição cadastrada", "Prescrições");
  
      notify(
        "Prescrição cadastrada",
        `Uma prescrição foi registrada para ${patientName(d.paciente)}.`
      );
  
      saveData();
      form.reset();
      renderAll();
  
      toast("Prescrição salva.");
    });
  
    // REDE FAMILIAR
    bindForm("formulario-cadastro-familiar", (form, d) => {
      if (!d.paciente) {
        return toast("Selecione o paciente.");
      }
  
      if (!form.querySelector('[name="consentimento"]')?.checked) {
        return toast("É necessário confirmar a autorização do paciente.");
      }
  
      const permissions = [
        ...form.querySelectorAll('input[name="permissoes"]:checked')
      ].map(x => x.value);
  
      db.families.unshift({
        id: uid(),
        ...d,
        permissoes: permissions
      });
  
      logActivity("Contato familiar cadastrado", "Rede familiar");
  
      notify(
        "Rede familiar atualizada",
        `Um contato foi associado a ${patientName(d.paciente)}.`,
        "permissoes"
      );
  
      saveData();
      form.reset();
      renderAll();
  
      toast("Contato cadastrado.");
    });
  
    // CLASSIFICAÇÃO DE RISCO
    bindForm("formulario-classificacao-risco", (form, d) => {
      if (!d.paciente) {
        return toast("Selecione o paciente.");
      }
  
      if (!d.categoria) {
        return toast("Selecione uma categoria.");
      }
  
      if (!form.querySelector('[name="capacitacao"]')?.checked) {
        return toast("Confirme a capacitação do profissional.");
      }
  
      db.risks.unshift({
        id: uid(),
        ...d,
        data: d["data-hora"] || new Date().toLocaleString("pt-BR")
      });
  
      logActivity("Classificação de risco registrada", "Classificação de risco");
  
      notify(
        "Classificação registrada",
        `Avaliação registrada para ${patientName(d.paciente)}.`,
        "classificacao de risco"
      );
  
      saveData();
      form.reset();
      renderAll();
  
      toast("Classificação registrada.");
    });
  
    // PROFISSIONAIS
    bindForm("formulario-cadastro-profissional", (form, d) => {
      if (!d.nome || !d.categoria) {
        return toast("Informe o nome e a categoria profissional.");
      }
  
      db.professionals.unshift({
        id: uid(),
        ...d,
        habilitado: !!form.querySelector('[name="habilitado-classificacao"]')?.checked
      });
  
      logActivity("Profissional cadastrado", "Profissionais");
  
      saveData();
      form.reset();
      renderAll();
  
      toast("Profissional cadastrado.");
    });
  
    bindForm("formulario-consulta-profissional", (form, d) => {
      const term = (d.termo || "").toLowerCase();
  
      const rows = db.professionals.filter(p =>
        JSON.stringify(p).toLowerCase().includes(term)
      );
  
      renderTable(
        "tabela-profissionais",
        rows.map(p => `
          <td>${esc(p.nome)}</td>
          <td>${esc(p.categoria)}</td>
          <td>${esc(p.registro || "—")}</td>
          <td>${esc(institutionName(p.instituicao))}</td>
          <td>${p.habilitado ? "Capacitação declarada" : "Não declarado"}</td>
          <td>${actionButtons(p.id)}</td>
        `),
        6,
        "Nenhum profissional corresponde à busca."
      );
    });
  
    // INSTITUIÇÕES
    bindForm("formulario-cadastro-instituicao", (form, d) => {
      if (!d.nome || !d.tipo || !d.cidade || !d.uf) {
        return toast("Preencha nome, tipo, cidade e UF.");
      }
  
      db.institutions.unshift({
        id: uid(),
        ...d
      });
  
      logActivity("Instituição cadastrada", "Instituições");
  
      notify(
        "Instituição cadastrada",
        `${d.nome} foi adicionada à lista de instituições.`
      );
  
      saveData();
      form.reset();
      renderAll();
  
      toast("Instituição cadastrada.");
    });
  
    bindForm("formulario-consulta-instituicao", (form, d) => {
      const term = (d.termo || "").toLowerCase();
      const type = d.tipo || "";
  
      const rows = db.institutions.filter(i =>
        (!term || JSON.stringify(i).toLowerCase().includes(term)) &&
        (!type || i.tipo === type)
      );
  
      renderTable(
        "tabela-instituicoes",
        rows.map(i => `
          <td>${esc(i.nome)}</td>
          <td>${esc(i.tipo)}</td>
          <td>${esc(i.cidade)}/${esc(i.uf)}</td>
          <td>${esc(i.telefone || "—")}</td>
          <td>Cadastrada localmente</td>
          <td>${actionButtons(i.id)}</td>
        `),
        6,
        "Nenhuma instituição corresponde à busca."
      );
    });
  
    // PERFIL
    bindForm("formulario-perfil-usuario", (form, d) => {
      db.profile = {
        ...db.profile,
        ...d
      };
  
      logActivity("Perfil atualizado", "Configurações");
  
      saveData();
      renderProfile();
  
      toast("Perfil atualizado neste navegador.");
    });
  
    bindForm("formulario-alterar-senha", (form, d) => {
      toast("A alteração de senha exige autenticação e um servidor; não está disponível neste protótipo.");
      form.reset();
    });
  
    bindForm("formulario-preferencias", (form, d) => {
      db.preferences = d;
      saveData();
  
      toast("Preferências salvas neste navegador.");
    });
  
    // FILTRO DE NOTIFICAÇÕES
    bindForm("formulario-filtro-notificacoes", (form, d) => {
      document.querySelectorAll("#lista-notificacoes article").forEach(a => {
        const typeOk = !d.tipo || a.dataset.tipo === d.tipo;
  
        const statusOk = !d.situacao ||
          (d.situacao === "lidas"
            ? a.classList.contains("lida")
            : !a.classList.contains("lida"));
  
        a.hidden = !(typeOk && statusOk);
      });
    });
  
    $("botao-marcar-todas-lidas")?.addEventListener("click", () => {
      db.notifications.forEach(n => {
        n.read = true;
      });
  
      saveData();
      renderNotifications();
  
      toast("Todas as notificações foram marcadas como lidas.");
    });
  
    // AÇÕES DAS TABELAS E LISTAS
    document.addEventListener("click", event => {
      const button = event.target.closest("button");
      if (!button) return;
  
      const id = button.dataset.id;
  
      if (button.classList.contains("acao-lida")) {
        const n = db.notifications.find(x => x.id === id);
  
        if (n) {
          n.read = true;
        }
  
        saveData();
        renderNotifications();
  
      } else if (button.classList.contains("acao-revogar")) {
        if (confirm("Deseja revogar o acesso deste contato?")) {
          db.families = db.families.filter(x => x.id !== id);
  
          logActivity("Acesso familiar revogado", "Rede familiar");
  
          saveData();
          renderAll();
  
          toast("Acesso removido da lista local.");
        }
  
      } else if (button.classList.contains("acao-permissoes")) {
        const f = db.families.find(x => x.id === id);
  
        alert(
          f
            ? `Permissões: ${(f.permissoes || []).join(", ") || "Nenhuma"}`
            : "Registro não encontrado."
        );
  
      } else if (button.classList.contains("acao-excluir")) {
        if (!confirm("Excluir este registro?")) return;
  
        [
          "patients",
          "exams",
          "reports",
          "prescriptions",
          "risks",
          "professionals",
          "institutions"
        ].forEach(key => {
          db[key] = db[key].filter(x => x.id !== id);
        });
  
        saveData();
        renderAll();
  
        toast("Registro excluído.");
  
      } else if (button.classList.contains("acao-excluir-historico")) {
        db.histories = db.histories.filter(x => x.id !== id);
  
        saveData();
        renderHistory();
        renderDashboard();
  
        toast("Registro removido.");
  
      } else if (button.classList.contains("acao-excluir-imagem")) {
        db.images = db.images.filter(x => x.id !== id);
  
        saveData();
        renderClinicalTables();
  
        toast("Registro removido.");
  
      } else if (button.classList.contains("acao-detalhes")) {
        const record = [
          ...db.patients,
          ...db.exams,
          ...db.reports,
          ...db.prescriptions,
          ...db.risks,
          ...db.professionals,
          ...db.institutions
        ].find(x => x.id === id);
  
        if (record) {
          alert(
            Object.entries(record)
              .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
              .join("\n")
          );
        }
      }
    });
  
    // INICIALIZAÇÃO
    renderAll();
  
    document.documentElement.classList.add("js-ativo");
  })();