/**
 * Testes contra a API REAL do Ministério da Saúde (https://apidadosabertos.saude.gov.br).
 * Requer acesso à internet. Verifica endpoints, formato, paginação e a sincronização no MySQL de teste.
 */
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MinisterioSaudeClient } from '../../src/integrations/ministerio-saude/ministerio-saude.client';
import { ENDPOINTS } from '../../src/integrations/ministerio-saude/ministerio-saude.types';
import { SynchronizationService } from '../../src/modules/synchronization/synchronization.service';
import { createTestApp, resetTestDatabase } from '../helpers/app';

describe('API de Dados Abertos do Ministério da Saúde (real)', () => {
  const client = new MinisterioSaudeClient({ minIntervalMs: 300 });

  it('GET /cnes/tipounidades devolve a lista oficial de tipos', async () => {
    const body = await client.get(ENDPOINTS.tiposUnidade.path);
    const list = client.extractList<any>(ENDPOINTS.tiposUnidade, body);
    expect(list.length).toBeGreaterThan(20);
    expect(list[0]).toEqual(expect.objectContaining({ codigo_tipo_unidade: expect.any(Number), descricao_tipo_unidade: expect.any(String) }));
  });

  it('GET /cnes/estabelecimentos limita a 20 por página e offset é o número da página', async () => {
    const p0 = client.extractList<any>(ENDPOINTS.estabelecimentos, await client.get(ENDPOINTS.estabelecimentos.path, { codigo_municipio: 431340, limit: 50, offset: 0 }));
    const p1 = client.extractList<any>(ENDPOINTS.estabelecimentos, await client.get(ENDPOINTS.estabelecimentos.path, { codigo_municipio: 431340, limit: 50, offset: 1 }));
    expect(p0).toHaveLength(20);
    expect(p1[0].codigo_cnes).not.toBe(p0[0].codigo_cnes);
    expect(p0[0]).toEqual(expect.objectContaining({ codigo_cnes: expect.any(Number), codigo_municipio: 431340, codigo_tipo_unidade: expect.any(Number) }));
  });

  it('GET /cnes/estabelecimentos/{codigo} retorna 404 para código inexistente', async () => {
    expect(await client.get('/cnes/estabelecimentos/9999999999')).toBeNull();
  });

  it('parâmetro inválido gera erro 400 não repetível', async () => {
    await expect(client.get(ENDPOINTS.estabelecimentos.path, { limit: 'abc' })).rejects.toMatchObject({ status: 400, retriable: false });
  });

  it('swagger oficial publica o catálogo de endpoints', async () => {
    const spec: any = await client.get('/static/swagger.json');
    expect(Object.keys(spec.paths).length).toBeGreaterThan(100);
    expect(spec.paths['/cnes/estabelecimentos']).toBeDefined();
  });

  describe('sincronização com MySQL', () => {
    let app: INestApplication; let ds: DataSource; let sync: SynchronizationService;
    beforeAll(async () => { ds = await resetTestDatabase(); app = await createTestApp(); sync = app.get(SynchronizationService); });
    afterAll(async () => { await app?.close(); await ds?.destroy(); });

    it('insere registros novos e, na segunda execução, não duplica (inalterados)', async () => {
      const l1: any = await sync.start('cnes-tipos-unidade');
      expect(l1.status).toBe('success');
      expect(l1.recordsInserted).toBeGreaterThan(20);
      const l2: any = await sync.start('cnes-tipos-unidade');
      expect(l2.recordsInserted).toBe(0);
      expect(l2.recordsUnchanged).toBe(l1.recordsInserted);
      const [{ n }] = await ds.query('SELECT COUNT(*) n FROM external_unit_types');
      expect(Number(n)).toBe(l1.recordsInserted);
    });

    it('detecta alteração de conteúdo e atualiza o registro', async () => {
      await ds.query("UPDATE external_unit_types SET descricao_tipo_unidade = 'ALTERADO LOCALMENTE', content_hash = REPEAT('0', 64) WHERE codigo_tipo_unidade = 5");
      const l: any = await sync.start('cnes-tipos-unidade');
      expect(l.recordsUpdated).toBe(1);
      const [r] = await ds.query('SELECT descricao_tipo_unidade d FROM external_unit_types WHERE codigo_tipo_unidade = 5');
      expect(r.d).not.toBe('ALTERADO LOCALMENTE');
    });

    it('impede duas execuções simultâneas do mesmo conjunto', async () => {
      const a = sync.start('regioes-saude');
      await new Promise((r) => setTimeout(r, 50));
      await expect(sync.start('regioes-saude')).rejects.toMatchObject({ status: 409 });
      const log: any = await a;
      expect(log.status).toBe('success');
      expect(log.recordsFetched).toBeGreaterThan(5000);
    });

    it('sincroniza estabelecimentos do município configurado com paginação completa', async () => {
      const l: any = await sync.start('cnes-estabelecimentos', { mode: 'full' });
      expect(['success', 'partial']).toContain(l.status);
      expect(l.recordsInserted).toBeGreaterThan(100);
      expect(l.requestsMade).toBeGreaterThan(5);
      const [{ n }] = await ds.query("SELECT COUNT(*) n FROM external_establishments WHERE codigo_municipio = '431340'");
      expect(Number(n)).toBe(l.recordsInserted);
    }, 600000);
  });
});
