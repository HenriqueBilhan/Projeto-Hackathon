import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError, AxiosInstance } from 'axios';
import { config } from '../../config/configuration';
import type { EndpointDef } from './ministerio-saude.types';

export class MinisterioSaudeApiError extends Error {
  constructor(message: string, public readonly status: number | null, public readonly retriable: boolean, public readonly path: string) { super(message); this.name = 'MinisterioSaudeApiError'; }
}
export class UnexpectedResponseError extends MinisterioSaudeApiError {
  constructor(path: string, detail: string) { super(`Resposta inesperada de ${path}: ${detail}`, 200, false, path); this.name = 'UnexpectedResponseError'; }
}

export interface ClientOptions { baseUrl: string; timeoutMs: number; maxRetries: number; minIntervalMs: number; maxPages: number }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Cliente HTTP da API de Dados Abertos do Ministério da Saúde.
 * Os recursos ficam na raiz do host (ex.: https://apidadosabertos.saude.gov.br/cnes/tipounidades);
 * o caminho /v1/ publica apenas a interface do Swagger.
 *  - timeout configurável; retry com backoff exponencial + jitter para falhas de rede, 429 e 5xx;
 *  - respeita Retry-After; intervalo mínimo entre requisições (fila única, respeito aos limites da API);
 *  - valida o formato da resposta antes de devolvê-la (nunca repassa dados incompletos como válidos).
 */
@Injectable()
export class MinisterioSaudeClient {
  private readonly logger = new Logger('MinisterioSaudeClient');
  private readonly http: AxiosInstance;
  private queue: Promise<unknown> = Promise.resolve();
  private lastRequestAt = 0;
  readonly opts: ClientOptions;
  /** Total de requisições feitas (métrica para os logs de sincronização). */
  requestCount = 0;

  constructor(opts?: Partial<ClientOptions>) {
    this.opts = {
      baseUrl: config.ministerio.baseUrl, timeoutMs: config.ministerio.timeoutMs, maxRetries: config.ministerio.maxRetries,
      minIntervalMs: config.ministerio.minIntervalMs, maxPages: config.ministerio.maxPagesPerRequest, ...opts,
    };
    this.http = axios.create({ baseURL: this.opts.baseUrl, timeout: this.opts.timeoutMs, headers: { Accept: 'application/json', 'User-Agent': 'Conecta/1.0 (integracao dados abertos)' }, validateStatus: () => true });
  }

  /** Serializa as chamadas respeitando o intervalo mínimo configurado. */
  private throttle<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const wait = this.lastRequestAt + this.opts.minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastRequestAt = Date.now();
      return fn();
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** GET com retry. Retorna null em 404 (registro inexistente). */
  async get<T = unknown>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T | null> {
    const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));
    let attempt = 0;
    for (;;) {
      try {
        const res = await this.throttle(() => { this.requestCount++; return this.http.get(path, { params: clean }); });
        if (res.status === 200) {
          if (res.data === null || typeof res.data !== 'object') throw new UnexpectedResponseError(path, 'corpo não é JSON');
          return res.data as T;
        }
        if (res.status === 404) return null;
        const retriable = res.status === 429 || res.status >= 500;
        const msg = typeof res.data?.message === 'string' ? res.data.message : JSON.stringify(res.data?.message ?? res.statusText ?? '').slice(0, 200);
        const err = new MinisterioSaudeApiError(`HTTP ${res.status} em ${path}: ${msg}`, res.status, retriable, path);
        if (!retriable || attempt >= this.opts.maxRetries) throw err;
        const retryAfter = Number(res.headers['retry-after']);
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : this.backoff(attempt));
      } catch (e) {
        if (e instanceof MinisterioSaudeApiError) throw e;
        const ax = e as AxiosError;
        const retriable = !ax.response; // timeout, DNS, conexão recusada/reiniciada
        if (!retriable || attempt >= this.opts.maxRetries) {
          throw new MinisterioSaudeApiError(`Falha de conexão com a API (${ax.code || ax.message}) em ${path}`, null, true, path);
        }
        this.logger.warn({ path, attempt: attempt + 1, code: ax.code }, 'Falha transitória, nova tentativa');
        await sleep(this.backoff(attempt));
      }
      attempt++;
    }
  }

  private backoff(attempt: number) { return Math.min(30000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250); }

  /** Extrai e valida a lista do envelope { <listKey>: [...] }. */
  extractList<T>(def: EndpointDef, body: unknown): T[] {
    const list = (body as Record<string, unknown> | null)?.[def.listKey];
    if (!Array.isArray(list)) throw new UnexpectedResponseError(def.path, `campo "${def.listKey}" ausente ou não é lista`);
    return list as T[];
  }

  /**
   * Percorre as páginas (offset = número da página, começando em 0).
   * O tamanho efetivo da página é detectado pela própria resposta, pois a API reduz o `limit`
   * silenciosamente (ex.: 20 em /cnes/estabelecimentos e 1 em /assistencia-a-saude/cnes-profissionais).
   * Termina quando uma página vem menor que o tamanho efetivo ou vazia.
   * `maxRequests` limita as requisições desta varredura (a continuação fica a cargo de quem chama).
   */
  async *paginate<T>(def: EndpointDef, params: Record<string, string | number | undefined> = {}, startPage = 0, opts: { maxRequests?: number } = {}): AsyncGenerator<{ page: number; items: T[]; pageSize: number }> {
    const limit = def.maxLimit;
    const maxRequests = Math.min(opts.maxRequests ?? this.opts.maxPages, this.opts.maxPages);
    let pageSize = 0;
    for (let page = startPage, n = 0; ; page++, n++) {
      if (n >= maxRequests) throw new PaginationLimitError(def.path, page);
      const body = await this.get(def.path, { ...params, limit, offset: page });
      const items = body === null ? [] : this.extractList<T>(def, body);
      if (!items.length) return;
      if (!pageSize) pageSize = items.length;          // primeira página define o tamanho efetivo
      yield { page, items, pageSize };
      if (items.length < pageSize) return;             // página parcial = última
      if (pageSize === limit && items.length < limit) return;
    }
  }
}

/** Limite de requisições por varredura atingido; `nextPage` permite retomar (reprocessamento). */
export class PaginationLimitError extends MinisterioSaudeApiError {
  constructor(path: string, public readonly nextPage: number) { super(`Limite de requisições por execução atingido em ${path} (retomar na página ${nextPage}).`, null, false, path); this.name = 'PaginationLimitError'; }
}
