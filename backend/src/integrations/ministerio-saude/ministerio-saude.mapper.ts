/**
 * Conversão e validação dos registros da API para as entidades locais.
 * Registros inválidos são rejeitados (contabilizados como inválidos) e nunca sobrescrevem dados existentes.
 */
import { stableHash } from '../../common/utils/hash';
import type { ExternalCnesProfessional, ExternalEstablishment, ExternalHospitalBeds, ExternalMunicipality, ExternalUnitType, UnitCategory } from '../../database/entities';
import type { CnesProfissionalApi, EstabelecimentoApi, HospitalLeitosApi, MunicipioRegiaoApi, TipoUnidadeApi } from './ministerio-saude.types';

export type Mapped<T> = { ok: true; key: string; value: T; hash: string } | { ok: false; error: string };
type Row<T> = Omit<T, 'syncedAt' | 'lastSyncLogId' | 'createdAt' | 'updatedAt' | 'contentHash' | 'id'>;

const str = (v: unknown, max = 255) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s.slice(0, max);
};
const int = (v: unknown) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Math.trunc(Number(v)));
const nonNeg = (v: unknown) => Math.max(0, int(v) ?? 0);
const digits = (v: unknown, len?: number) => { const s = str(v)?.replace(/\D/g, '') || null; return s && len ? s.slice(0, len) : s; };
const isoDate = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const coord = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 180 ? v.toFixed(7) : null);
const ok = <T>(key: string, value: T): Extract<Mapped<T>, { ok: true }> => ({ ok: true, key, value, hash: stableHash(value) });

export const normalizeCnes = (v: unknown) => { const d = digits(v); return d && d.length <= 7 ? d.padStart(7, '0') : null; };

export function mapTipoUnidade(r: TipoUnidadeApi): Mapped<Row<ExternalUnitType>> {
  const code = int(r?.codigo_tipo_unidade);
  const desc = str(r?.descricao_tipo_unidade, 150);
  if (code === null || code < 0 || !desc) return { ok: false, error: 'tipo de unidade sem código/descrição' };
  return ok(String(code), { codigoTipoUnidade: code, descricaoTipoUnidade: desc });
}

export function mapMunicipio(r: MunicipioRegiaoApi): Mapped<Row<ExternalMunicipality>> {
  const cod = digits(r?.codigo_municipio);
  if (!cod || cod.length !== 6) return { ok: false, error: `município com código inválido (${String(r?.codigo_municipio)})` };
  if (!str(r.municipio) || !str(r.codigo_uf)) return { ok: false, error: `município ${cod} sem nome/UF` };
  return ok(cod, {
    codigoMunicipio: cod, municipio: str(r.municipio, 120)!, codigoUf: digits(r.codigo_uf, 2)!, uf: str(r.uf, 60) || '',
    codigoRegiaoPais: digits(r.codigo_regiao_pais, 1) || '', regiaoPais: str(r.regiao_pais, 30) || '',
    codigoMacrorregiaoSaude: str(r.codigo_macrorregiao_saude, 10) || '', macrorregiaoSaude: str(r.macrorregiao_saude, 120) || '',
    codigoRegiaoSaude: str(r.codigo_regiao_saude, 10) || '', regiaoSaude: str(r.regiao_saude, 120) || '',
    populacaoEstimadaIbge2022: int(r.populacao_estimada_ibge_2022),
  });
}

export function mapEstabelecimento(r: EstabelecimentoApi): Mapped<Row<ExternalEstablishment>> {
  const cnes = normalizeCnes(r?.codigo_cnes);
  if (!cnes) return { ok: false, error: `estabelecimento com codigo_cnes inválido (${String(r?.codigo_cnes)})` };
  const razao = str(r.nome_razao_social) || str(r.nome_fantasia);
  if (!razao) return { ok: false, error: `estabelecimento ${cnes} sem nome` };
  const mun = digits(r.codigo_municipio);
  return ok(cnes, {
    codigoCnes: cnes, numeroCnpjEntidade: digits(r.numero_cnpj_entidade, 14), nomeRazaoSocial: razao, nomeFantasia: str(r.nome_fantasia),
    naturezaOrganizacaoEntidade: str(r.natureza_organizacao_entidade, 120), tipoGestao: str(r.tipo_gestao, 2), descricaoNivelHierarquia: str(r.descricao_nivel_hierarquia),
    descricaoEsferaAdministrativa: str(r.descricao_esfera_administrativa, 60), codigoTipoUnidade: int(r.codigo_tipo_unidade),
    codigoCepEstabelecimento: digits(r.codigo_cep_estabelecimento, 8), enderecoEstabelecimento: str(r.endereco_estabelecimento), numeroEstabelecimento: str(r.numero_estabelecimento, 20),
    bairroEstabelecimento: str(r.bairro_estabelecimento, 120), numeroTelefoneEstabelecimento: str(r.numero_telefone_estabelecimento, 40),
    latitude: coord(r.latitude_estabelecimento_decimo_grau), longitude: coord(r.longitude_estabelecimento_decimo_grau),
    enderecoEmailEstabelecimento: str(r.endereco_email_estabelecimento, 150), numeroCnpj: digits(r.numero_cnpj, 14),
    codigoIdentificadorTurnoAtendimento: str(r.codigo_identificador_turno_atendimento, 4), descricaoTurnoAtendimento: str(r.descricao_turno_atendimento, 150),
    fazAtendimentoAmbulatorialSus: str(r.estabelecimento_faz_atendimento_ambulatorial_sus, 3), codigoEstabelecimentoSaude: str(r.codigo_estabelecimento_saude, 20),
    codigoUf: int(r.codigo_uf), codigoMunicipio: mun && mun.length === 6 ? mun : null, descricaoNaturezaJuridica: str(r.descricao_natureza_juridica_estabelecimento, 10),
    codigoMotivoDesabilitacao: str(r.codigo_motivo_desabilitacao_estabelecimento, 10),
    possuiCentroCirurgico: int(r.estabelecimento_possui_centro_cirurgico), possuiCentroObstetrico: int(r.estabelecimento_possui_centro_obstetrico),
    possuiCentroNeonatal: int(r.estabelecimento_possui_centro_neonatal), possuiAtendimentoHospitalar: int(r.estabelecimento_possui_atendimento_hospitalar),
    possuiServicoApoio: int(r.estabelecimento_possui_servico_apoio), possuiAtendimentoAmbulatorial: int(r.estabelecimento_possui_atendimento_ambulatorial),
    codigoAtividadeEnsinoUnidade: str(r.codigo_atividade_ensino_unidade, 4), codigoNaturezaOrganizacaoUnidade: str(r.codigo_natureza_organizacao_unidade, 10),
    codigoNivelHierarquiaUnidade: str(r.codigo_nivel_hierarquia_unidade, 10), codigoEsferaAdministrativaUnidade: str(r.codigo_esfera_administrativa_unidade, 4),
    dataAtualizacao: isoDate(r.data_atualizacao),
  });
}

export function mapCnesProfissional(r: CnesProfissionalApi): Mapped<Row<ExternalCnesProfessional>> {
  const comp = int(r?.nu_comp); const cnes = normalizeCnes(r?.co_cnes); const ibge = digits(r?.co_ibge);
  const nome = str(r?.no_profissional, 200);
  if (!comp || !cnes || !ibge || ibge.length !== 6 || !nome) return { ok: false, error: 'profissional CNES sem competência/CNES/município/nome' };
  const value = {
    nuComp: comp, coIbge: ibge, coCnes: cnes, noFantasia: str(r.no_fantasia), noRazaoSocial: str(r.no_razao_social), nuCnpj: digits(r.nu_cnpj, 14),
    nuCnpjMantenedora: digits(r.nu_cnpj_mantenedora, 14), tpGestao: str(r.tp_gestao, 20), noProfissional: nome,
    nuCargaHorariaOutro: int(r.nu_carga_horaria_outro), nuCargaHorariaAmbul: int(r.nu_carga_horaria_ambul), nuCargaHorHospSus: int(r.nu_carga_hor_hosp_sus),
    nuCargaHorariaTotal: int(r.nu_carga_horaria_total), dsCbo: str(r.ds_cbo, 160), stAtendeSus: str(r.st_atende_sus, 5), coIndVinculo: str(r.co_ind_vinculo, 10),
    dsVinculo: str(r.ds_vinculo, 200), dtEntradaEquipe: str(r.dt_entrada_equipe, 30), dtDesligEquipe: str(r.dt_deslig_equipe, 30), coIne: str(r.co_ine, 20),
    coAreaEquipe: str(r.co_area_equipe, 20), noAreaEquipe: str(r.no_area_equipe, 120), tpEquipe: str(r.tp_equipe, 120), dsSubtipoEquipe: str(r.ds_subtipo_equipe, 200),
    dtAtivacaoEquipe: str(r.dt_ativacao_equipe, 30), dtDesatEquipe: str(r.dt_desat_equipe, 30),
  };
  // A API não fornece identificador do vínculo: a chave natural combina competência, estabelecimento, profissional, ocupação, vínculo e equipe.
  const key = stableHash([comp, cnes, nome, value.dsCbo, value.coIndVinculo, value.coIne, value.coAreaEquipe]);
  return { ...ok(key, { recordKey: key, ...value }), key };
}

export function mapHospitalLeitos(r: HospitalLeitosApi): Mapped<Row<ExternalHospitalBeds>> {
  const uf = str(r?.unidade_da_federacao_onde_fica_o_hospital, 2); const mun = str(r?.nome_do_municipio_onde_fica_o_hospital, 120); const nome = str(r?.nome_do_hospital);
  if (!uf || !mun || !nome) return { ok: false, error: 'hospital sem UF/município/nome' };
  const value = {
    regiao: str(r.nome_da_regiao_do_brasil_onde_fica_o_hospital, 30), uf, municipio: mun, motivoDesabilitacao: str(r['motivo_da_desabilitacao_do_hospital,_caso_esteja_desabilitado']),
    nomeHospital: nome, razaoSocial: str(r.nome_da_razao_social_do_hospital), tipoGestao: str(r.tipo_da_gestao_do_hospital, 2),
    codigoTipoUnidade: str(r.codigo_do_tipo_da_unidade, 4), descricaoTipoUnidade: str(r.descricao_do_tipo_da_unidade, 150),
    naturezaJuridica: str(r.natureza_juridica_do_hospital, 10), descricaoNaturezaJuridica: str(r.descricao_da_natureza_juridica_do_hosptial, 120),
    endereco: str(r.enderco_do_hospital), numero: str(r.numero_do_endereco_do_hospital, 20), complemento: str(r.complemento_do_endereco_do_hospital, 150),
    bairro: str(r.nome_do_bairro_do_endereco_do_hosptial, 120), cep: digits(r.numero_do_cep_do_hospital, 8),
    leitosTotal: nonNeg(r.quantidade_total_de_leitos_do_hosptial), leitosSus: nonNeg(r.quantidade_total_de_leitos_sus_do_hosptial),
    utiTotal: nonNeg(r.quantidade_de_leitos_de_uti_do_hosptial), utiSus: nonNeg(r.quantidade_de_leitos_de_uti_sus_do_hosptial),
    utiAdulto: nonNeg(r.quantidade_de_leitos_de_uti_adulto_do_hosptial), utiAdultoSus: nonNeg(r.quantidade_de_leitos_de_uti_sus_adulto_do_hosptial),
    utiPediatrico: nonNeg(r.quantidade_de_leitos_de_uti_pediatrico_do_hosptial), utiPediatricoSus: nonNeg(r.quantidade_de_leitos_de_uti_sus_pediatrico_do_hosptial),
    utiNeonatal: nonNeg(r.quantidade_de_leitos_de_uti_neonatal_do_hosptial), utiNeonatalSus: nonNeg(r.quantidade_de_leitos_de_uti_sus_neonatal_do_hosptial),
    utiQueimado: nonNeg(r.quantidade_de_leitos_de_uti_queimado_do_hosptial), utiQueimadoSus: nonNeg(r.quantidade_de_leitos_de_uti_sus_queimado_do_hosptial),
    utiCoronariana: nonNeg(r.quantidade_de_leitos_de_uti_coronariana_do_hosptial), utiCoronarianaSus: nonNeg(r.quantidade_de_leitos_de_uti_sus_coronariana_do_hosptial),
    codigoIbgeMunicipio: digits(r.codigo_ibge_do_municipio, 7),
  };
  // Sem identificador oficial e com várias versões por hospital (sem período): a chave é o conteúdo completo,
  // de modo que cada versão distinta publicada é armazenada uma única vez.
  const key = stableHash(value);
  return { ...ok(key, { recordKey: key, ...value }), key };
}

/** Correspondência entre os tipos CNES (/cnes/tipounidades) e as categorias de unidade do Conecta. */
const CATEGORY_BY_TIPO: Record<number, UnitCategory> = {
  1: 'UBS', 2: 'UBS', 71: 'UBS', 74: 'UBS',
  20: 'UPA', 21: 'UPA', 73: 'UPA',
  5: 'Hospital', 7: 'Hospital', 15: 'Hospital', 62: 'Hospital',
  39: 'Laboratório', 67: 'Laboratório', 80: 'Laboratório',
  4: 'Clínica', 22: 'Clínica', 36: 'Clínica', 70: 'Clínica',
};
export const categoryFromTipoUnidade = (tipo: number | null) => (tipo === null ? null : CATEGORY_BY_TIPO[tipo] || null);
export const SUPPORTED_TIPOS = Object.keys(CATEGORY_BY_TIPO).map(Number);

export function establishmentAddress(e: Pick<ExternalEstablishment, 'enderecoEstabelecimento' | 'numeroEstabelecimento' | 'bairroEstabelecimento'>) {
  const rua = [e.enderecoEstabelecimento, e.numeroEstabelecimento].filter(Boolean).join(', ');
  return [rua, e.bairroEstabelecimento].filter(Boolean).join(' — ') || 'Endereço não informado no CNES';
}
