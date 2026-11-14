/**
 * Validação/normalização dos registros da API. As entradas reproduzem a ESTRUTURA real
 * dos endpoints (campos e tipos), apenas para exercitar as regras de validação.
 */
import { categoryFromTipoUnidade, mapEstabelecimento, mapHospitalLeitos, mapMunicipio, mapTipoUnidade, normalizeCnes } from '../../src/integrations/ministerio-saude/ministerio-saude.mapper';

describe('Mapper — API de Dados Abertos', () => {
  it('normaliza o código CNES para 7 dígitos', () => {
    expect(normalizeCnes(7498)).toBe('0007498');
    expect(normalizeCnes('2232014')).toBe('2232014');
    expect(normalizeCnes('12345678')).toBeNull();
    expect(normalizeCnes(null)).toBeNull();
  });
  it('rejeita registros incompletos e aceita válidos', () => {
    expect(mapTipoUnidade({ codigo_tipo_unidade: 5, descricao_tipo_unidade: 'HOSPITAL GERAL' }).ok).toBe(true);
    expect(mapTipoUnidade({ codigo_tipo_unidade: null as any, descricao_tipo_unidade: '' }).ok).toBe(false);
    expect(mapMunicipio({ codigo_municipio: '43' } as any).ok).toBe(false);
    expect(mapEstabelecimento({ codigo_cnes: 'abc' } as any).ok).toBe(false);
    const r = mapEstabelecimento({ codigo_cnes: 7498, nome_razao_social: 'X', nome_fantasia: null, codigo_municipio: 430920, codigo_uf: 43, codigo_tipo_unidade: 22, latitude_estabelecimento_decimo_grau: -29.94, longitude_estabelecimento_decimo_grau: -50.99, data_atualizacao: '2025-09-03' } as any);
    expect(r.ok && r.value.codigoCnes).toBe('0007498');
    expect(r.ok && r.value.codigoMunicipio).toBe('430920');
  });
  it('gera hash estável: mesmo conteúdo = mesmo hash; conteúdo diferente = hash diferente', () => {
    const base = { codigo_cnes: 1, nome_razao_social: 'A' } as any;
    const a = mapEstabelecimento(base); const b = mapEstabelecimento({ ...base }); const c = mapEstabelecimento({ ...base, nome_razao_social: 'B' });
    expect(a.ok && b.ok && a.hash === b.hash).toBe(true);
    expect(a.ok && c.ok && a.hash !== c.hash).toBe(true);
  });
  it('hospitais: cada versão distinta tem chave própria (a API não informa período)', () => {
    const h = { unidade_da_federacao_onde_fica_o_hospital: 'RS', nome_do_municipio_onde_fica_o_hospital: 'CAXIAS DO SUL', nome_do_hospital: 'HOSPITAL GERAL', quantidade_total_de_leitos_do_hosptial: 201 } as any;
    const v1 = mapHospitalLeitos(h); const v2 = mapHospitalLeitos({ ...h, quantidade_total_de_leitos_do_hosptial: 196 });
    expect(v1.ok && v2.ok && v1.key !== v2.key).toBe(true);
  });
  it('mapeia tipos CNES para categorias do Conecta', () => {
    expect(categoryFromTipoUnidade(2)).toBe('UBS');
    expect(categoryFromTipoUnidade(73)).toBe('UPA');
    expect(categoryFromTipoUnidade(5)).toBe('Hospital');
    expect(categoryFromTipoUnidade(80)).toBe('Laboratório');
    expect(categoryFromTipoUnidade(43)).toBeNull();
  });
});
