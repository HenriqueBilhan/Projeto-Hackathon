/**
 * Testes de integração da API REST com MySQL real (banco conecta_test recriado pelas migrations).
 * Cobrem: conexão, usuários, JWT, permissões (RBAC + matriz clínica + autorização por paciente),
 * cadastros, atendimentos, exames, prescrições, histórico, paginação, validação, erros e auditoria.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ADMIN, cns, cpf, createTestApp, resetTestDatabase } from '../helpers/app';

describe('API Conecta (e2e)', () => {
  let app: INestApplication; let ds: DataSource; let http: ReturnType<typeof request>;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const docs = { medA: cpf(), medB: cpf(), rec: cpf(), pac: cpf(), cns: cns() };
  const api = (method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string, who?: string) => {
    const r = (request(app.getHttpServer()) as any)[method](`/api/v1${path}`);
    return who ? r.set('Authorization', `Bearer ${tokens[who]}`) : r;
  };
  const login = async (who: string, cpfV: string, senha: string, perfil: string) => {
    const r = await api('post', '/auth/login').send({ cpf: cpfV, senha, perfil });
    expect(r.status).toBe(200); tokens[who] = r.body.data.accessToken; return r;
  };
  const agora = () => { const d = new Date(Date.now() - 3 * 3600000); return d.toISOString().slice(0, 16); };

  beforeAll(async () => { ds = await resetTestDatabase(); app = await createTestApp(); http = request(app.getHttpServer()); void http; });
  afterAll(async () => { await app?.close(); await ds?.destroy(); });

  it('conecta ao MySQL e aplica todas as migrations', async () => {
    const [{ v }] = await ds.query('SELECT VERSION() v');
    expect(v).toMatch(/^8\./);
    const pending = await ds.showMigrations();
    expect(pending).toBe(false);
    const tables = await ds.query("SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema = DATABASE()");
    expect(Number(tables[0].n)).toBeGreaterThanOrEqual(36);
  });

  it('autenticação: rejeita credenciais inválidas e emite JWT válido', async () => {
    expect((await api('post', '/auth/login').send({ cpf: ADMIN.cpf, senha: 'errada123', perfil: 'profissional' })).status).toBe(401);
    expect((await api('post', '/auth/login').send({ cpf: '123', senha: 'x' })).status).toBe(400);
    await login('admin', ADMIN.cpf, ADMIN.senha, 'profissional');
    const me = await api('get', '/auth/me', 'admin');
    expect(me.body.data.role).toBe('admin');
    expect((await api('get', '/auth/me').set('Authorization', 'Bearer abc.def.ghi')).status).toBe(401);
    expect((await api('get', '/patients')).body.error.code).toBe('TOKEN_MISSING');
  });

  it('gestor cadastra unidades e profissionais (com validação de entrada)', async () => {
    const u1 = await api('post', '/health-units', 'admin').send({ nome: 'UBS Teste Centro', tipo: 'UBS', endereco: 'Rua A, 1', integrada: true });
    const u2 = await api('post', '/health-units', 'admin').send({ nome: 'UPA Teste Norte', tipo: 'UPA', endereco: 'Rua B, 2', integrada: true });
    expect(u1.status).toBe(201); expect(u2.status).toBe(201);
    ids.uA = u1.body.data.id; ids.uB = u2.body.data.id;
    const bad = await api('post', '/health-units', 'admin').send({ nome: 'X', tipo: 'Shopping', endereco: '' });
    expect(bad.status).toBe(400); expect(bad.body.error.details.length).toBeGreaterThan(0);
    const mk = (nome: string, c: string, cargo: string, esp: string, unidadeId: string) => api('post', '/professionals', 'admin').send({ nome, cpf: c, cargo, registro: 'REG 1', especialidade: esp, unidadeId, email: `${c}@teste.local`, senha: 'Senha1234' });
    expect((await mk('Médico A', docs.medA, 'Médico', 'Clínica Médica', ids.uA)).status).toBe(201);
    expect((await mk('Médico B', docs.medB, 'Médico', 'Medicina de Emergência', ids.uB)).status).toBe(201);
    expect((await mk('Recepção B', docs.rec, 'Recepção', 'Recepção', ids.uB)).status).toBe(201);
    expect((await mk('Dup', docs.medA, 'Médico', 'Clínica Médica', ids.uA)).status).toBe(409);
    const list = await api('get', '/professionals?limit=2&page=1', 'admin');
    expect(list.body.meta).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2 });
  });

  it('paciente se cadastra e faz login; usuário é persistido com senha em hash', async () => {
    const r = await api('post', '/auth/register').send({ nome: 'Paciente E2E', cpf: docs.pac, cns: docs.cns, nascimento: '1985-02-10', email: 'pac@teste.local', senha: 'Senha1234', aceiteLgpd: true });
    expect(r.status).toBe(201);
    const [u] = await ds.query('SELECT password_hash h FROM users WHERE cpf = ?', [docs.pac]);
    expect(u.h).toMatch(/^\$2[aby]\$/);
    expect((await api('post', '/auth/register').send({ nome: 'Duplicado', cpf: docs.pac, cns: cns(), nascimento: '1985-02-10', email: 'x@teste.local', senha: 'Senha1234', aceiteLgpd: true })).status).toBe(409);
    expect((await api('post', '/auth/register').send({ nome: 'Sem Aceite', cpf: cpf(), cns: docs.cns, nascimento: '1985-02-10', email: 'x@teste.local', senha: 'Senha1234', aceiteLgpd: false })).status).toBe(400);
    const l = await login('pac', docs.pac, 'Senha1234', 'paciente');
    ids.pac = l.body.data.user.pacienteId;
    await login('medA', docs.medA, 'Senha1234', 'profissional');
    await login('medB', docs.medB, 'Senha1234', 'profissional');
    await login('rec', docs.rec, 'Senha1234', 'profissional');
  });

  it('profissional busca o paciente (dados mascarados) e registra resumo clínico', async () => {
    const r = await api('get', `/patients?cpf=${docs.pac}`, 'medA');
    expect(r.body.meta.total).toBe(1); expect(r.body.data[0].cpf).toContain('*');
    const up = await api('patch', `/patients/${ids.pac}`, 'medA').send({ alergias: [{ nome: 'Dipirona', gravidade: 'Grave' }], cronicas: ['Asma'] });
    expect(up.status).toBe(200);
  });

  it('registra atendimento (transação com sinais vitais, exames e encaminhamento)', async () => {
    const body = { pacienteId: ids.pac, unidadeId: ids.uA, data: agora(), tipo: 'Consulta', queixa: 'Tosse há 5 dias', diagnostico: 'Bronquite aguda', cid: 'J20',
      sinais: { pa: '120/80', fc: '88', temp: '37,8' }, procedimentos: ['Consulta médica'], exames: ['Hemograma completo'], encaminhamento: { especialidade: 'Pneumologia', destinoId: ids.uA } };
    const r = await api('post', '/attendances', 'medA').send(body);
    expect(r.status).toBe(201); ids.at = r.body.data.id;
    expect(r.body.data.sinais.temp).toBe('37,8 °C');
    expect((await api('post', '/attendances', 'medA').send({ ...body, unidadeId: ids.uB })).status).toBe(403);
    expect((await api('post', '/attendances', 'medA').send({ ...body, sinais: { spo2: '120' } })).status).toBe(400);
    const draft = await api('post', '/attendances', 'medA').send({ pacienteId: ids.pac, unidadeId: ids.uA, data: agora(), rascunho: true, dados: { queixa: 'parcial' } });
    expect(draft.body.data.status).toBe('Rascunho');
    expect((await api('delete', `/attendances/${draft.body.data.id}`, 'medA')).status).toBe(200);
  });

  it('fluxo de exame: etapas, transição inválida e liberação de laudo', async () => {
    const rq = await api('get', '/exam-requests?escopo=minhas', 'medA');
    const req = rq.body.data[0];
    expect((await api('patch', `/exam-requests/${req.id}`, 'medA').send({ status: 'Em andamento' })).status).toBe(400);
    expect((await api('patch', `/exam-requests/${req.id}`, 'medA').send({ status: 'Agendado' })).status).toBe(200);
    expect((await api('patch', `/exam-requests/${req.id}`, 'medA').send({ status: 'Em andamento' })).status).toBe(200);
    const res = await api('post', '/exam-results', 'medA').send({ exameId: req.exameId, resultados: [{ parametro: 'Leucócitos', valor: '9.800 /mm³', referencia: '4.000–11.000' }] });
    expect(res.status).toBe(201); expect(res.body.data.resultado[0][0]).toBe('Leucócitos');
  });

  it('prescrição respeita alergias registradas', async () => {
    const conflito = await api('post', '/prescriptions', 'medA').send({ pacienteId: ids.pac, medicamentos: [{ medicamento: 'Dipirona sódica', dosagem: '500 mg', frequencia: '6/6h', duracao: '3 dias' }] });
    expect(conflito.status).toBe(409); expect(conflito.body.error.code).toBe('ALLERGY_CONFLICT');
    const ok = await api('post', '/prescriptions', 'medA').send({ pacienteId: ids.pac, medicamentos: [{ medicamento: 'Amoxicilina', dosagem: '500 mg', frequencia: '8/8h', duracao: '7 dias' }] });
    expect(ok.status).toBe(201);
  });

  it('paciente consulta o próprio histórico, exames, receitas e acessos', async () => {
    const h = await api('get', `/patients/${ids.pac}/history`, 'pac');
    expect(h.body.data.map((a: any) => a.id)).toContain(ids.at);
    expect((await api('get', '/exams', 'pac')).body.data.some((e: any) => e.resultado)).toBe(true);
    expect((await api('get', '/prescriptions', 'pac')).body.data).toHaveLength(1);
    expect((await api('get', `/patients/${ids.pac}/access-logs`, 'pac')).body.data.length).toBeGreaterThan(0);
    expect((await api('get', '/notifications', 'pac')).body.meta.naoLidas).toBeGreaterThan(0);
    expect((await api('get', '/patients', 'pac')).status).toBe(403);
  });

  it('autorização por paciente: consentimento, emergência e matriz de acesso', async () => {
    await api('patch', `/patients/${ids.pac}`, 'pac').send({ preferencias: { compartilhar: false } }).expect(200);
    const negado = await api('get', `/patients/${ids.pac}`, 'medB');
    expect(negado.status).toBe(403); expect(negado.body.error.code).toBe('JUSTIFICATION_REQUIRED');
    const emerg = await api('get', `/patients/${ids.pac}?justificativa=${encodeURIComponent('Paciente inconsciente na urgência')}`, 'medB');
    expect(emerg.status).toBe(200); expect(emerg.body.data.acessoEmergencia).toBe(true);
    expect((await api('get', `/patients/${ids.pac}/history`, 'rec')).status).toBe(403);
  });

  it('gestor não acessa conteúdo clínico; vê indicadores e auditoria', async () => {
    expect((await api('get', '/attendances', 'admin')).status).toBe(403);
    expect((await api('get', `/patients/${ids.pac}/history`, 'admin')).status).toBe(403);
    const cad = await api('get', `/patients/${ids.pac}`, 'admin');
    expect(cad.body.data.alergias).toBeUndefined();
    const dash = await api('get', '/admin/dashboard', 'admin');
    expect(dash.body.data.totais.atendimentos).toBe(1);
    const audit = await api('get', '/admin/audit-logs?operacao=Acesso%20de%20emerg%C3%AAncia%20ao%20prontu%C3%A1rio', 'admin');
    expect(audit.body.meta.total).toBe(1);
    expect((await api('get', '/admin/dashboard', 'medA')).status).toBe(403);
    expect((await api('delete', `/patients/${ids.pac}`, 'admin')).status).toBe(409);
  });

  it('erros padronizados: 404 e UUID inválido', async () => {
    const nf = await api('get', '/health-units/00000000-0000-4000-8000-000000000000', 'admin');
    expect(nf.status).toBe(404); expect(nf.body).toMatchObject({ success: false, error: { statusCode: 404 } });
    expect((await api('get', '/health-units/abc', 'admin')).status).toBe(400);
  });

  it('desativar profissional encerra suas sessões imediatamente', async () => {
    const prof = (await api('get', '/professionals?q=Médico%20B', 'admin')).body.data[0];
    await api('patch', `/professionals/${prof.id}`, 'admin').send({ ativo: false }).expect(200);
    expect((await api('get', '/auth/me', 'medB')).status).toBe(401);
  });
});
