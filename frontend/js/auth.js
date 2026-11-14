/* ==========================================================================
   CONECTA — Autenticação (tela inicial)
   Login demonstrativo por perfil, máscara/validação de CPF, recuperação de
   senha, cadastro de paciente e atalhos de acesso de demonstração.
   PONTO DE INTEGRAÇÃO: substituir Conecta.Auth.login por POST /api/auth/login.
   ========================================================================== */
(function () {
  "use strict";
  const C = window.Conecta;
  const { qs, qsa, ico, esc } = C;

  /** Credenciais fictícias usadas pelos botões de demonstração. */
  const DEMO = {
    paciente: { cpf: "123.456.789-09", senha: "paciente123", perfil: "paciente" },
    medico: { cpf: "111.444.777-35", senha: "medico123", perfil: "profissional" },
    admin: { cpf: "529.982.247-25", senha: "admin123", perfil: "profissional" }
  };

  C.pagina("login", function () {
    // Já autenticado? Vai direto para o painel do perfil.
    const s = C.Auth.sessao();
    if (s && !C.param("expirada")) {
      const destinos = { paciente: "paciente.html", medico: "medico.html", admin: "administrador.html" };
      location.replace("pages/" + destinos[s.role]);
      return;
    }
    if (C.param("expirada")) C.toast("Faça login para continuar.", "info", "Sessão encerrada");
    // Destino vindo dos atalhos do portal (somente páginas internas do paciente)
    const destinoPortal = /^[a-z-]+\.html(\?aba=[a-z]+)?$/.test(C.param("destino") || "") ? C.param("destino") : "";

    const form = qs("#form-login");
    const cpf = qs("#cpf");
    const senha = qs("#senha");
    const caixaErro = qs("#login-erro");
    let perfil = "paciente";

    // CPF lembrado
    const lembrado = C.Store.get("cpfLembrado", "");
    if (lembrado) { cpf.value = C.formatarCPF(lembrado); qs("#lembrar").checked = true; }

    /* ---- Alternância Paciente / Profissional ---- */
    const abas = qsa(".access-switch [role=tab]");
    function definirPerfil(p, foco) {
      perfil = p;
      abas.forEach((b) => {
        const ativo = b.dataset.perfil === p;
        b.setAttribute("aria-selected", ativo); b.tabIndex = ativo ? 0 : -1;
        if (ativo && foco) b.focus();
      });
      qs("#signup-line").classList.toggle("hidden", p !== "paciente");
      qs("#prof-line").classList.toggle("hidden", p === "paciente");
      esconderErro();
    }
    if (C.param("perfil") === "profissional") setTimeout(() => definirPerfil("profissional"), 0);
    abas.forEach((b, i) => {
      b.addEventListener("click", () => definirPerfil(b.dataset.perfil));
      b.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") definirPerfil(abas[(i + 1) % 2].dataset.perfil, true);
      });
    });

    /* ---- Máscara de CPF ---- */
    cpf.addEventListener("input", () => { cpf.value = C.formatarCPF(cpf.value); });

    /* ---- Mostrar/ocultar senha ---- */
    qs("#toggle-senha").addEventListener("click", (e) => {
      const btn = e.currentTarget;
      const mostrar = senha.type === "password";
      senha.type = mostrar ? "text" : "password";
      btn.setAttribute("aria-pressed", mostrar);
      btn.setAttribute("aria-label", mostrar ? "Ocultar senha" : "Mostrar senha");
      btn.innerHTML = ico(mostrar ? "eye-off" : "eye");
      C.icones();
    });

    function mostrarErro(msg) { caixaErro.classList.remove("hidden"); qs("span", caixaErro).textContent = msg; }
    function esconderErro() { caixaErro.classList.add("hidden"); }

    /* ---- Envio do formulário ---- */
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      esconderErro();
      const ok = C.validarFormulario(form, {
        cpf: (v) => (C.validarCPF(v) ? "" : "Informe um CPF válido (11 dígitos)."),
        senha: (v) => (v.length >= 6 ? "" : "A senha deve ter pelo menos 6 caracteres.")
      });
      if (!ok) return;
      const r = C.Auth.login(cpf.value, senha.value, perfil);
      if (r.erro) { mostrarErro(r.erro); senha.focus(); return; }
      if (qs("#lembrar").checked) C.Store.set("cpfLembrado", C.somenteDigitos(cpf.value)); else C.Store.remove("cpfLembrado");
      const btn = qs("#btn-entrar");
      btn.disabled = true;
      btn.innerHTML = `${ico("loader-2")} Entrando…`;
      C.icones();
      const final = destinoPortal && r.sessao.role === "paciente" ? "pages/" + destinoPortal : r.destino;
      setTimeout(() => { location.href = final; }, 450);
    });

    /* ---- Acessos de demonstração ---- */
    qsa("[data-demo]").forEach((b) => b.addEventListener("click", () => {
      const d = DEMO[b.dataset.demo];
      definirPerfil(d.perfil);
      cpf.value = d.cpf; senha.value = d.senha;
      form.requestSubmit();
    }));

    /* ---- Esqueci minha senha ---- */
    qs("#btn-esqueci").addEventListener("click", () => {
      C.abrirModal({
        titulo: "Recuperar senha",
        corpo: `<p class="muted">Informe seu CPF e o e-mail cadastrado. Enviaremos um link seguro para redefinir sua senha.</p>
          <form id="form-rec" class="form-grid" novalidate>
            <div class="field span-all"><label for="rec-cpf">CPF</label><input class="input" id="rec-cpf" name="cpf" inputmode="numeric" maxlength="14" required value="${esc(cpf.value)}"><span class="field-error" data-erro-de="rec-cpf"></span></div>
            <div class="field span-all"><label for="rec-email">E-mail cadastrado</label><input class="input" id="rec-email" name="email" type="email" required><span class="field-error" data-erro-de="rec-email"></span></div>
          </form>`,
        aoAbrir: (m) => { const c = qs("#rec-cpf", m); c.addEventListener("input", () => { c.value = C.formatarCPF(c.value); }); },
        acoes: [
          { label: "Cancelar", onClick: "fechar" },
          { label: "Enviar link", classe: "btn-primary", icone: "send", onClick: (fechar, m) => {
            const f = qs("#form-rec", m);
            if (!C.validarFormulario(f, { cpf: (v) => (C.validarCPF(v) ? "" : "CPF inválido."), email: (v) => (/^\S+@\S+\.\S+$/.test(v) ? "" : "E-mail inválido.") })) return;
            fechar();
            C.toast("Se os dados estiverem corretos, você receberá um link em instantes (simulação).", "sucesso", "Solicitação enviada");
          } }
        ]
      });
    });

    /* ---- Cadastro de paciente ---- */
    qs("#btn-cadastro").addEventListener("click", abrirCadastro);
    function abrirCadastro() {
      C.abrirModal({
        titulo: "Cadastro de paciente", tamanho: "lg",
        corpo: `<p class="muted">Crie seu acesso para consultar seu histórico. Seus dados são protegidos conforme a LGPD.</p>
          <form id="form-cad" class="form-grid" novalidate>
            <div class="field span-all"><label for="cad-nome">Nome completo <span class="req">*</span></label><input class="input" id="cad-nome" name="nome" required autocomplete="name"><span class="field-error" data-erro-de="cad-nome"></span></div>
            <div class="field"><label for="cad-cpf">CPF <span class="req">*</span></label><input class="input" id="cad-cpf" name="cpf" inputmode="numeric" maxlength="14" required><span class="field-error" data-erro-de="cad-cpf"></span></div>
            <div class="field"><label for="cad-cns">Cartão Nacional de Saúde (CNS) <span class="req">*</span></label><input class="input" id="cad-cns" name="cns" inputmode="numeric" maxlength="18" required placeholder="000 0000 0000 0000"><span class="field-error" data-erro-de="cad-cns"></span></div>
            <div class="field"><label for="cad-nasc">Data de nascimento <span class="req">*</span></label><input class="input" id="cad-nasc" name="nascimento" type="date" required><span class="field-error" data-erro-de="cad-nasc"></span></div>
            <div class="field"><label for="cad-tel">Telefone</label><input class="input" id="cad-tel" name="telefone" inputmode="tel" placeholder="(00) 00000-0000"><span class="field-error" data-erro-de="cad-tel"></span></div>
            <div class="field span-all"><label for="cad-email">E-mail <span class="req">*</span></label><input class="input" id="cad-email" name="email" type="email" required autocomplete="email"><span class="field-error" data-erro-de="cad-email"></span></div>
            <div class="field"><label for="cad-senha">Senha <span class="req">*</span></label><input class="input" id="cad-senha" name="senha" type="password" required autocomplete="new-password" aria-describedby="cad-forca-txt"><div class="strength" aria-hidden="true"><span id="cad-forca"></span></div><span class="field-hint" id="cad-forca-txt">Mínimo de 8 caracteres, com letras e números.</span><span class="field-error" data-erro-de="cad-senha"></span></div>
            <div class="field"><label for="cad-senha2">Confirmar senha <span class="req">*</span></label><input class="input" id="cad-senha2" name="senha2" type="password" required autocomplete="new-password"><span class="field-error" data-erro-de="cad-senha2"></span></div>
            <div class="field span-all"><label class="check"><input type="checkbox" id="cad-lgpd" name="lgpd" required> Li e concordo com a Política de Privacidade e autorizo o compartilhamento do meu histórico entre unidades de saúde autorizadas.</label><span class="field-error" data-erro-de="cad-lgpd"></span></div>
          </form>`,
        aoAbrir: (m) => {
          const c = qs("#cad-cpf", m); c.addEventListener("input", () => { c.value = C.formatarCPF(c.value); });
          const n = qs("#cad-cns", m); n.addEventListener("input", () => { n.value = C.formatarCNS(n.value.replace(/\D/g, "").slice(0, 15)) || n.value.replace(/\D/g, "").slice(0, 15); });
          const s = qs("#cad-senha", m); const barra = qs("#cad-forca", m);
          s.addEventListener("input", () => {
            const v = s.value; let f = 0;
            if (v.length >= 8) f++; if (/[A-Za-z]/.test(v) && /\d/.test(v)) f++; if (/[^A-Za-z0-9]/.test(v) || v.length >= 12) f++;
            barra.style.width = `${(f / 3) * 100}%`;
            barra.style.background = ["var(--perigo)", "var(--perigo)", "#d97706", "var(--sucesso)"][f];
          });
        },
        acoes: [
          { label: "Cancelar", onClick: "fechar" },
          { label: "Criar conta", classe: "btn-primary", icone: "user-plus", onClick: (fechar, m) => {
            const f = qs("#form-cad", m);
            const senha1 = qs("#cad-senha", m).value;
            const ok = C.validarFormulario(f, {
              cpf: (v) => {
                if (!C.validarCPF(v)) return "CPF inválido.";
                return C.Data.getAll("usuarios").some((u) => u.cpf === C.somenteDigitos(v)) ? "CPF já cadastrado." : "";
              },
              cns: (v) => (C.somenteDigitos(v).length === 15 ? "" : "O CNS deve ter 15 dígitos."),
              email: (v) => (/^\S+@\S+\.\S+$/.test(v) ? "" : "E-mail inválido."),
              nascimento: (v) => (v && new Date(v) < new Date() ? "" : "Data inválida."),
              senha: (v) => (v.length >= 8 && /[A-Za-z]/.test(v) && /\d/.test(v) ? "" : "Use 8+ caracteres com letras e números."),
              senha2: (v) => (v === senha1 ? "" : "As senhas não conferem.")
            });
            const lgpd = qs("#cad-lgpd", m);
            if (!lgpd.checked) { qs('[data-erro-de="cad-lgpd"]', m).textContent = "É necessário aceitar a política de privacidade."; if (ok) lgpd.focus(); return; }
            if (!ok) return;
            const d = C.dadosFormulario(f);
            const pac = C.Data.add("pacientes", {
              nome: d.nome.trim(), cpf: C.somenteDigitos(d.cpf), cns: C.somenteDigitos(d.cns), nascimento: d.nascimento, telefone: d.telefone, email: d.email,
              sexo: "Não informado", tipoSanguineo: "Não informado", alergias: [], cronicas: [], internacoes: [], endereco: "Não informado", unidadeRef: "u2", nomeMae: "—", cadastro: C.hojeISO()
            }, "p");
            C.Data.add("usuarios", { cpf: pac.cpf, senha: d.senha, role: "paciente", refId: pac.id }, "us");
            fechar();
            definirPerfil("paciente");
            cpf.value = C.formatarCPF(pac.cpf); senha.value = ""; senha.focus();
            C.toast("Conta criada! Digite sua senha para entrar.", "sucesso", "Cadastro concluído");
          } }
        ]
      });
    }

    /* ---- Solicitar acesso profissional ---- */
    qs("#btn-solicitar").addEventListener("click", () => {
      C.abrirModal({
        titulo: "Solicitar acesso profissional",
        corpo: `<p class="muted">A solicitação será encaminhada ao gestor da unidade para validação do registro profissional.</p>
          <form id="form-sol" class="form-grid" novalidate>
            <div class="field span-all"><label for="sol-nome">Nome completo</label><input class="input" id="sol-nome" name="nome" required><span class="field-error" data-erro-de="sol-nome"></span></div>
            <div class="field"><label for="sol-reg">Registro profissional (CRM/COREN)</label><input class="input" id="sol-reg" name="registro" required><span class="field-error" data-erro-de="sol-reg"></span></div>
            <div class="field"><label for="sol-uni">Unidade</label><select class="select" id="sol-uni" name="unidade" required><option value="">Selecione</option>${C.opcoes(C.Data.getAll("unidades"))}</select><span class="field-error" data-erro-de="sol-uni"></span></div>
          </form>`,
        acoes: [
          { label: "Cancelar", onClick: "fechar" },
          { label: "Enviar solicitação", classe: "btn-primary", icone: "send", onClick: (fechar, m) => {
            if (!C.validarFormulario(qs("#form-sol", m))) return;
            C.notificar("admin:ad1", "Nova solicitação de acesso", `${qs("#sol-nome", m).value} (${qs("#sol-reg", m).value}) solicitou acesso.`, "profissionais.html", "user-plus");
            fechar();
            C.toast("Solicitação enviada ao gestor da unidade.", "sucesso");
          } }
        ]
      });
    });

    /* ---- Política de privacidade ---- */
    qs("#btn-privacidade").addEventListener("click", () => {
      C.abrirModal({
        titulo: "Política de privacidade (resumo)", tamanho: "lg",
        corpo: `<ul class="privacy-list">
          <li>${ico("lock")} Dados de saúde são <strong>dados pessoais sensíveis</strong> (LGPD, art. 11) e são tratados exclusivamente para a tutela da saúde.</li>
          <li>${ico("user-check")} Somente profissionais <strong>autorizados e vinculados</strong> a unidades da rede podem consultar prontuários.</li>
          <li>${ico("scroll-text")} Todo acesso é <strong>registrado em auditoria</strong> (quem, quando, de onde e qual operação).</li>
          <li>${ico("eye-off")} CPF e CNS são exibidos de forma <strong>mascarada</strong> sempre que possível.</li>
          <li>${ico("bell")} O paciente é <strong>notificado</strong> quando seu prontuário é acessado.</li>
        </ul>
        <div class="alert alert-info mb-0">${ico("info")}<span>Este é um protótipo: nenhum dado real é coletado, e a integração com sistemas oficiais é apenas simulada.</span></div>`
      });
    });

    /* ---- Restaurar dados ---- */
    qs("#btn-reset").addEventListener("click", async () => {
      const ok = await C.confirmar({ titulo: "Restaurar dados", mensagem: "Todos os registros criados durante a demonstração serão apagados e os dados fictícios originais serão restaurados.", rotulo: "Restaurar", perigo: true });
      if (ok) { C.Data.reset(); C.toast("Dados de demonstração restaurados."); }
    });
  });
})();
