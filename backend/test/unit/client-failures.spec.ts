/**
 * Tratamento de falhas do cliente HTTP contra um servidor local de teste
 * (simula indisponibilidade e respostas inesperadas — NÃO substitui a integração real,
 * coberta em test/external).
 */
import http from 'http';
import { AddressInfo } from 'net';
import { MinisterioSaudeApiError, MinisterioSaudeClient, UnexpectedResponseError } from '../../src/integrations/ministerio-saude/ministerio-saude.client';

describe('MinisterioSaudeClient — falhas', () => {
  let server: http.Server; let base = ''; let hits = 0; let mode = '';
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      hits++;
      if (mode === '500-then-ok') { if (hits < 3) { res.statusCode = 503; return res.end('{}'); } res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ tipos_unidade: [{ codigo_tipo_unidade: 1, descricao_tipo_unidade: 'X' }] })); }
      if (mode === 'html') { res.setHeader('Content-Type', 'text/html'); return res.end('<html>manutenção</html>'); }
      if (mode === 'wrong-shape') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ outra_coisa: [] })); }
      if (mode === '400') { res.statusCode = 400; return res.end(JSON.stringify({ message: { limit: 'invalid' } })); }
      if (mode === '404') { res.statusCode = 404; return res.end(JSON.stringify({ message: 'not found.' })); }
      if (mode === 'slow') return setTimeout(() => res.end('{}'), 2000);
      if (mode === 'pages') {
        const page = Number(new URL(req.url!, 'http://x').searchParams.get('offset'));
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ estabelecimentos: page < 2 ? Array.from({ length: 20 }, (_, i) => ({ codigo_cnes: page * 20 + i })) : Array.from({ length: 5 }, (_, i) => ({ codigo_cnes: 40 + i })) }));
      }
      res.end('{}');
    });
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise((r) => server.close(r)));
  beforeEach(() => { hits = 0; });
  const client = (o = {}) => new MinisterioSaudeClient({ baseUrl: base, minIntervalMs: 0, maxRetries: 3, timeoutMs: 500, ...o });

  it('repete com backoff em 5xx e recupera', async () => {
    mode = '500-then-ok';
    const body = await client().get('/cnes/tipounidades');
    expect(hits).toBe(3);
    expect((body as any).tipos_unidade).toHaveLength(1);
  });
  it('não repete erros 4xx e devolve erro tipado', async () => {
    mode = '400';
    await expect(client().get('/x')).rejects.toMatchObject({ status: 400, retriable: false });
    expect(hits).toBe(1);
  });
  it('404 retorna null (registro inexistente)', async () => { mode = '404'; expect(await client().get('/x')).toBeNull(); });
  it('timeout vira erro de conexão após as tentativas', async () => {
    mode = 'slow';
    await expect(client({ maxRetries: 1, timeoutMs: 200 }).get('/x')).rejects.toBeInstanceOf(MinisterioSaudeApiError);
    expect(hits).toBe(2);
  });
  it('servidor inacessível gera erro de conexão', async () => {
    await expect(new MinisterioSaudeClient({ baseUrl: 'http://127.0.0.1:1', maxRetries: 0, minIntervalMs: 0, timeoutMs: 500 }).get('/x')).rejects.toThrow(/Falha de conexão/);
  });
  it('resposta não-JSON ou fora do formato é rejeitada', async () => {
    mode = 'html';
    await expect(client().get('/x')).rejects.toBeInstanceOf(UnexpectedResponseError);
    mode = 'wrong-shape';
    const c = client(); const body = await c.get('/cnes/tipounidades');
    expect(() => c.extractList({ path: '/cnes/tipounidades', listKey: 'tipos_unidade', maxLimit: 0 }, body)).toThrow(UnexpectedResponseError);
  });
  it('pagina pelo número da página e para na página parcial', async () => {
    mode = 'pages';
    const pages: number[] = [];
    for await (const p of client().paginate({ path: '/cnes/estabelecimentos', listKey: 'estabelecimentos', maxLimit: 20 })) pages.push(p.items.length);
    expect(pages).toEqual([20, 20, 5]);
  });
});
