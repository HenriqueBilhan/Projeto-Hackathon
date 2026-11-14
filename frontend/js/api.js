/* ==========================================================================
   CONECTA — Camada de comunicação HTTP com o backend (api.js)
   --------------------------------------------------------------------------
   - Monta a URL da API (config.js), envia JSON e o token de acesso (Bearer).
   - Renova a sessão automaticamente (POST /auth/refresh com cookie httpOnly)
     quando o token expira, repetindo a requisição original uma única vez.
   - Interpreta o envelope padrão { success, data, meta } / { success:false, error }.
   - Mostra uma barra de carregamento global durante as requisições.
   O token de acesso fica apenas em sessionStorage (encerrado ao fechar o navegador);
   o refresh token nunca é acessível a scripts (cookie httpOnly).
   ========================================================================== */
(function () {
  "use strict";

  function baseUrl() {
    const cfg = (window.CONECTA_CONFIG || {}).apiUrl;
    if (cfg) return cfg.replace(/\/$/, "");
    const sameOrigin = /^https?:$/.test(location.protocol) && (location.port === "3000" || location.port === "");
    return sameOrigin ? `${location.origin}/api/v1` : "http://localhost:3000/api/v1";
  }

  const TOKEN_KEY = "conecta:token";
  const SESSION_KEY = "conecta:sessao";
  const ss = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* indisponível */ } },
    del(k) { try { sessionStorage.removeItem(k); } catch (e) { /* indisponível */ } }
  };

  /** Erro de API com status HTTP, código e detalhes de validação. */
  class ApiError extends Error {
    constructor(status, code, message, details) { super(message); this.name = "ApiError"; this.status = status; this.code = code; this.details = details; }
  }

  /* ---------- Barra de carregamento ---------- */
  let pending = 0; let bar = null; let barTimer = null;
  function loading(delta) {
    pending = Math.max(0, pending + delta);
    if (!bar && document.body) {
      bar = document.createElement("div");
      bar.className = "api-progress";
      bar.setAttribute("aria-hidden", "true");
      document.body.appendChild(bar);
    }
    if (!bar) return;
    clearTimeout(barTimer);
    if (pending > 0) bar.classList.add("ativo");
    else barTimer = setTimeout(() => bar.classList.remove("ativo"), 150);
    document.body.setAttribute("aria-busy", pending > 0 ? "true" : "false");
  }

  /* ---------- Sessão ---------- */
  const Session = {
    token() { return ss.get(TOKEN_KEY); },
    user() { try { return JSON.parse(ss.get(SESSION_KEY) || "null"); } catch (e) { return null; } },
    save(token, user) { if (token) ss.set(TOKEN_KEY, token); if (user) ss.set(SESSION_KEY, JSON.stringify(user)); },
    clear() { ss.del(TOKEN_KEY); ss.del(SESSION_KEY); }
  };

  let refreshing = null;
  /** Renova o token (uma renovação por vez, compartilhada entre requisições simultâneas). */
  function refresh() {
    if (!refreshing) {
      refreshing = fetch(`${baseUrl()}/auth/refresh`, { method: "POST", credentials: "include", headers: { Accept: "application/json" } })
        .then(async (r) => {
          const body = await r.json().catch(() => null);
          if (!r.ok || !body || !body.success) throw new ApiError(r.status, (body && body.error && body.error.code) || "REFRESH_FAILED", "Sessão expirada.");
          Session.save(body.data.accessToken, body.data.user);
          return body.data.accessToken;
        })
        .finally(() => { setTimeout(() => { refreshing = null; }, 0); });
    }
    return refreshing;
  }

  function buildQuery(query) {
    if (!query) return "";
    const p = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") p.append(k, v); });
    const s = p.toString();
    return s ? `?${s}` : "";
  }

  /**
   * Requisição genérica. Retorna { data, meta } (ou o texto/blob quando raw).
   * opts: { body, query, auth = true, raw = false, silent = false }
   */
  async function request(method, path, opts = {}) {
    const url = `${baseUrl()}${path}${buildQuery(opts.query)}`;
    const doFetch = (token) => {
      const headers = { Accept: opts.raw ? "*/*" : "application/json" };
      if (opts.body !== undefined) headers["Content-Type"] = "application/json";
      if (opts.auth !== false && token) headers.Authorization = `Bearer ${token}`;
      return fetch(url, { method, headers, credentials: "include", body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
    };
    if (!opts.silent) loading(1);
    try {
      let res;
      try { res = await doFetch(Session.token()); }
      catch (e) { throw new ApiError(0, "NETWORK_ERROR", "Não foi possível conectar ao servidor do Conecta. Verifique sua conexão ou se o backend está em execução."); }

      if (res.status === 401 && opts.auth !== false && !opts._retried) {
        const body = await res.clone().json().catch(() => null);
        const code = body && body.error && body.error.code;
        if (["TOKEN_EXPIRED", "TOKEN_INVALID", "TOKEN_MISSING"].includes(code)) {
          try { const t = await refresh(); res = await doFetch(t); }
          catch (e) { sessionExpired(); throw new ApiError(401, "SESSION_EXPIRED", "Sua sessão expirou. Faça login novamente."); }
        } else if (["SESSION_REVOKED", "ACCOUNT_DISABLED", "SESSION_IDLE"].includes(code)) {
          sessionExpired(); throw new ApiError(401, code, body.error.message);
        }
      }
      if (opts.raw && res.ok) return res;
      const body = await res.json().catch(() => null);
      if (!res.ok || !body || body.success === false) {
        const err = (body && body.error) || {};
        let msg = err.message || `Erro ${res.status}.`;
        if (Array.isArray(err.details) && typeof err.details[0] === "string") msg = `${msg} ${err.details.slice(0, 3).join(" ")}`;
        throw new ApiError(res.status, err.code || "HTTP_ERROR", msg, err.details);
      }
      return { data: body.data, meta: body.meta || null };
    } finally {
      if (!opts.silent) loading(-1);
    }
  }

  function sessionExpired() {
    Session.clear();
    if (!/login\.html|index\.html$|\/$/.test(location.pathname)) {
      const toRoot = location.pathname.includes("/pages/") ? "../" : "";
      location.replace(`${toRoot}login.html?expirada=1`);
    }
  }

  const Api = {
    baseUrl, ApiError, Session, request, refresh,
    get: (path, query, opts) => request("GET", path, { ...opts, query }).then((r) => r.data),
    /** GET de lista paginada: { items, meta }. */
    list: (path, query, opts) => request("GET", path, { ...opts, query: { limit: 500, ...query } }).then((r) => ({ items: r.data || [], meta: r.meta })),
    post: (path, body, opts) => request("POST", path, { ...opts, body }).then((r) => r.data),
    patch: (path, body, opts) => request("PATCH", path, { ...opts, body }).then((r) => r.data),
    put: (path, body, opts) => request("PUT", path, { ...opts, body }).then((r) => r.data),
    del: (path, opts) => request("DELETE", path, opts).then((r) => r.data),
    /** Baixa um arquivo gerado pelo backend (ex.: CSV) usando o token atual. */
    async download(path, filename) {
      const res = await request("GET", path, { raw: true });
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 300);
    }
  };
  window.ConectaApi = Api;
})();
