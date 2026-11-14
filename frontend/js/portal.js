/* ==========================================================================
   CONECTA — Portal institucional (portal.js)
   Banner rotativo, menu mobile, busca, acessibilidade (tamanho do texto e
   alto contraste), diretório público de unidades (GET /public/health-units) e orientações.
   ========================================================================== */
(function () {
  "use strict";
  const C = window.Conecta;
  const { esc, ico, badge, tipoTag, qs, qsa } = C;
  const D = C.Data;
  const TIPOS = ["UBS", "UPA", "Hospital", "Laboratório", "Clínica"];
  const normalizar = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  /** Orientações sobre o uso da plataforma. */
  const NOTICIAS = [
    { cor: "c1", icone: "building-2", cat: "Rede", data: "2026-11-14", titulo: "Unidades com dados oficiais do CNES", resumo: "As unidades da rede são cadastradas a partir do Cadastro Nacional de Estabelecimentos de Saúde.", texto: "Os dados de identificação das unidades (nome, endereço, tipo de estabelecimento) vêm da API de Dados Abertos do Ministério da Saúde e são atualizados periodicamente pela sincronização do Conecta." },
    { cor: "c2", icone: "flask-conical", cat: "Como usar", data: "2026-11-14", titulo: "Como acompanhar seus exames pelo Conecta", resumo: "Saiba quando o resultado fica pronto e como salvar o laudo em PDF.", texto: "Em “Meus exames” você vê o status de cada exame: solicitado, agendado, em análise ou resultado disponível. Quando o laudo é liberado pela unidade, você recebe uma notificação e pode salvá-lo em PDF." },
    { cor: "c3", icone: "shield-check", cat: "Privacidade", data: "2026-11-14", titulo: "Você sabe quem consultou seu prontuário?", resumo: "No Conecta, cada acesso é registrado e aparece para o paciente.", texto: "Seus dados de saúde são sensíveis. Apenas profissionais autorizados podem abrir seu prontuário, e cada acesso fica registrado com nome, unidade, data e horário. Você consulta esses registros em “Meu perfil”." }
  ];

  C.pagina("home", async function () {
    /* ---- Sessão ativa: atalho para a área do usuário ---- */
    const s = C.Auth.sessao();
    if (s) {
      const destino = { paciente: "pages/paciente.html", medico: "pages/medico.html", admin: "pages/administrador.html" }[s.role];
      const a = qs("#btn-area"); a.href = destino; a.innerHTML = `${ico("layout-dashboard")} Minha área`;
      qs("#btn-prof").classList.add("hidden");
    }

    /* ---- Menu mobile ---- */
    const nav = qs("#main-nav"); const btnMenu = qs("#btn-menu");
    btnMenu.addEventListener("click", () => {
      const aberto = nav.classList.toggle("open");
      btnMenu.setAttribute("aria-expanded", aberto);
      btnMenu.innerHTML = ico(aberto ? "x" : "menu"); C.icones();
    });
    qsa("a", nav).forEach((a) => a.addEventListener("click", () => { nav.classList.remove("open"); btnMenu.setAttribute("aria-expanded", "false"); btnMenu.innerHTML = ico("menu"); C.icones(); }));

    // Item do menu ativo conforme a seção visível
    const links = qsa(".main-nav ul a");
    if ("IntersectionObserver" in window) {
      const obs = new IntersectionObserver((ents) => ents.forEach((e) => {
        if (e.isIntersecting) links.forEach((l) => (l.getAttribute("href") === "#" + e.target.id ? l.setAttribute("aria-current", "page") : l.removeAttribute("aria-current")));
      }), { rootMargin: "-45% 0px -50% 0px" });
      ["inicio", "como-funciona", "unidades", "orientacoes", "contato"].forEach((id) => { const el = document.getElementById(id); if (el) obs.observe(el); });
    }

    /* ---- Busca no cabeçalho (leva ao diretório de unidades) ---- */
    const busca = qs("#busca-topo"); const btnBusca = qs("#btn-busca");
    btnBusca.addEventListener("click", () => {
      const aberto = busca.classList.toggle("hidden") === false;
      btnBusca.setAttribute("aria-expanded", aberto);
      if (aberto) qs("#busca-topo-input").focus();
    });
    busca.addEventListener("submit", (e) => {
      e.preventDefault();
      const t = qs("#busca-topo-input").value.trim();
      const tipo = TIPOS.find((x) => normalizar(x) === normalizar(t));
      if (tipo) { filtroTipo = tipo; qs("#un-termo").value = ""; } else qs("#un-termo").value = t;
      renderUnidades();
      busca.classList.add("hidden"); btnBusca.setAttribute("aria-expanded", "false");
      qs("#unidades").scrollIntoView({ behavior: "smooth" });
    });

    /* ---- Acessibilidade: tamanho do texto e alto contraste (preferência local) ---- */
    const prefs = C.Store.get("acessibilidade", { fonte: 0, contraste: false });
    function aplicarAcess() {
      document.documentElement.style.fontSize = `${100 + prefs.fonte * 12.5}%`;
      document.body.classList.toggle("alto-contraste", prefs.contraste);
      qs("#btn-contraste").setAttribute("aria-pressed", prefs.contraste);
      C.Store.set("acessibilidade", prefs);
    }
    qsa("[data-fonte]").forEach((b) => b.addEventListener("click", () => {
      const v = Number(b.dataset.fonte);
      prefs.fonte = v === 0 ? 0 : Math.max(-1, Math.min(2, prefs.fonte + v));
      aplicarAcess();
    }));
    qs("#btn-contraste").addEventListener("click", () => { prefs.contraste = !prefs.contraste; aplicarAcess(); });
    aplicarAcess();

    /* ---- Banner rotativo (pausa automática ao passar o mouse ou focar) ---- */
    const slides = qsa(".slide"); const dots = qsa(".hero-dots button");
    let atual = 0; let timer = null; let pausado = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function mostrar(i) {
      atual = (i + slides.length) % slides.length;
      slides.forEach((sl, k) => {
        const on = k === atual;
        sl.classList.toggle("ativo", on);
        sl.setAttribute("aria-hidden", on ? "false" : "true");
        qsa("a, button", sl).forEach((el) => { el.tabIndex = on ? 0 : -1; });
      });
      dots.forEach((d, k) => (k === atual ? d.setAttribute("aria-current", "true") : d.removeAttribute("aria-current")));
    }
    function iniciar() { clearInterval(timer); if (!pausado) timer = setInterval(() => mostrar(atual + 1), 7000); }
    qs("#slide-ant").addEventListener("click", () => { mostrar(atual - 1); iniciar(); });
    qs("#slide-prox").addEventListener("click", () => { mostrar(atual + 1); iniciar(); });
    dots.forEach((d) => d.addEventListener("click", () => { mostrar(Number(d.dataset.slide)); iniciar(); }));
    qs("#slide-pausa").addEventListener("click", (e) => {
      pausado = !pausado;
      e.currentTarget.setAttribute("aria-label", pausado ? "Retomar rotação dos destaques" : "Pausar rotação dos destaques");
      e.currentTarget.innerHTML = ico(pausado ? "play" : "pause"); C.icones();
      iniciar();
    });
    const hero = qs(".hero");
    hero.addEventListener("mouseenter", () => clearInterval(timer));
    hero.addEventListener("mouseleave", iniciar);
    hero.addEventListener("focusin", () => clearInterval(timer));
    hero.addEventListener("focusout", iniciar);
    mostrar(0); iniciar();

    /* ---- Diretório público (dados institucionais, sem dados de pacientes) ---- */
    try { D.set("unidades", (await C.Api.list("/public/health-units", { limit: 500 }, { auth: false })).items); } catch (e) { D.set("unidades", []); }
    /* ---- Números da rede (seção opcional na página) ---- */
    if (qs("#numeros")) {
      const st = await C.Api.get("/public/stats", null, { auth: false }).catch(() => null);
      const unidades = D.getAll("unidades");
      qs("#numeros").innerHTML = [
      [unidades.filter((u) => u.integrada).length, "unidades integradas", "building-2"],
      [st ? Number(st.estabelecimentosCnes).toLocaleString("pt-BR") : "—", "estabelecimentos CNES na base", "database"],
      [st ? Number(st.municipios).toLocaleString("pt-BR") : "—", "municípios com regiões de saúde", "map"],
      ["100%", "dos acessos auditados", "scroll-text"]
    ].map(([v, l, i]) => `<div class="number">${ico(i)}<strong>${esc(v)}</strong><span>${esc(l)}</span></div>`).join("");
    }

    /* ---- Diretório de unidades ---- */
    let filtroTipo = "";
    function renderUnidades() {
      const todas = D.getAll("unidades");
      qs("#un-tipos").innerHTML = ["", ...TIPOS].map((t) => `<button type="button" class="filter-chip" data-tipo="${t}" aria-pressed="${filtroTipo === t}">${t || "Todas"}</button>`).join("");
      const termo = normalizar(qs("#un-termo").value);
      const lista = todas.filter((u) => (!filtroTipo || u.tipo === filtroTipo) && (!termo || normalizar(`${u.nome} ${u.endereco} ${u.tipo}`).includes(termo)));
      qs("#un-contagem").textContent = `${lista.length} unidade(s) encontrada(s)`;
      qs("#un-lista").innerHTML = lista.length ? lista.map((u) => `
        <article class="unit-row">
          <span class="unit-badge tipo-${esc(u.tipo)}">${ico(C.ICONE_TIPO[u.tipo] || "building-2")}</span>
          <div class="unit-main">
            <div class="flex items-center gap-2">${tipoTag(u.tipo)}${badge(u.status)}</div>
            <h3>${esc(u.nome)}</h3>
            <p>${ico("map-pin")} ${esc(u.endereco)}</p>
          </div>
          <dl class="unit-meta"><div><dt>Funcionamento</dt><dd>${esc(u.horario)}</dd></div><div><dt>Telefone</dt><dd>${esc(u.telefone)}</dd></div></dl>
          <button type="button" class="btn btn-outline btn-sm" data-unidade="${u.id}">Ver detalhes</button>
        </article>`).join("") : `<div class="empty">${ico("building")}<span>Nenhuma unidade encontrada. Tente outro nome ou bairro.</span></div>`;
      C.icones();
    }
    qs("#un-termo").addEventListener("input", renderUnidades);
    qs("#un-tipos").addEventListener("click", (e) => { const b = e.target.closest("[data-tipo]"); if (b) { filtroTipo = b.dataset.tipo; renderUnidades(); } });
    qs("#un-lista").addEventListener("click", (e) => {
      const b = e.target.closest("[data-unidade]"); if (!b) return;
      const u = D.getById("unidades", b.dataset.unidade);
      const esp = u.especialidades || [];
      C.abrirModal({ titulo: u.nome, corpo: `<dl class="dl">
        <div><dt>Tipo</dt><dd>${tipoTag(u.tipo)}</dd></div><div><dt>Integração ao Conecta</dt><dd>${badge(u.status)}</dd></div>
        <div class="full"><dt>Endereço</dt><dd>${esc(u.endereco)}</dd></div>
        <div><dt>Telefone</dt><dd>${esc(u.telefone)}</dd></div><div><dt>Funcionamento</dt><dd>${esc(u.horario)}</dd></div>
        ${u.cnes ? `<div><dt>CNES</dt><dd>${esc(u.cnes)}</dd></div>` : ""}
        <div class="full"><dt>Especialidades com profissionais na rede</dt><dd>${esp.map((x) => `<span class="chip">${esc(x)}</span>`).join("") || "Informação não disponível"}</dd></div></dl>` });
    });
    renderUnidades();

    /* ---- Orientações ---- */
    qs("#noticias").innerHTML = NOTICIAS.map((n, i) => `
      <article class="news-card">
        <div class="news-thumb ${n.cor}" aria-hidden="true">${ico(n.icone)}</div>
        <div class="news-body">
          <span class="news-meta"><span class="news-cat">${esc(n.cat)}</span></span>
          <h3>${esc(n.titulo)}</h3>
          <p>${esc(n.resumo)}</p>
          <button type="button" class="link-arrow" data-noticia="${i}">Ler mais ${ico("arrow-right")}</button>
        </div>
      </article>`).join("");
    qs("#noticias").addEventListener("click", (e) => {
      const b = e.target.closest("[data-noticia]"); if (!b) return;
      const n = NOTICIAS[Number(b.dataset.noticia)];
      C.abrirModal({ titulo: n.titulo, corpo: `<p class="small muted">${esc(n.cat)}</p><p class="mb-0">${esc(n.texto)}</p>` });
    });

    /* ---- Política de privacidade ---- */
    qsa("[data-privacidade]").forEach((b) => b.addEventListener("click", () => C.abrirModal({
      titulo: "Política de privacidade (resumo)", tamanho: "lg",
      corpo: `<ul class="privacy-list">
        <li>${ico("lock")} Dados de saúde são <strong>dados pessoais sensíveis</strong> (LGPD, art. 11) e são usados apenas para cuidar da sua saúde.</li>
        <li>${ico("user-check")} Somente profissionais <strong>autorizados e vinculados</strong> a unidades da rede podem consultar prontuários.</li>
        <li>${ico("scroll-text")} Todo acesso é <strong>registrado em auditoria</strong>: quem, quando, de onde e qual operação.</li>
        <li>${ico("eye-off")} CPF e CNS aparecem <strong>mascarados</strong> sempre que possível.</li>
        <li>${ico("bell")} Você é <strong>avisado</strong> quando seu prontuário é acessado.</li>
      </ul>
      <div class="alert alert-info mb-0">${ico("info")}<span>Os cadastros de estabelecimentos vêm da API de Dados Abertos do Ministério da Saúde; os registros clínicos são feitos pelas unidades integradas ao Conecta.</span></div>`
    })));

  });
})();
