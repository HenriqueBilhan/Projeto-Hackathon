/**
 * Tipos dos endpoints REAIS da API de Dados Abertos do Ministério da Saúde
 * (documentação em https://apidadosabertos.saude.gov.br/v1/, especificação em /static/swagger.json).
 *  - Os recursos são servidos na RAIZ do host (ex.: GET https://apidadosabertos.saude.gov.br/cnes/estabelecimentos).
 *
 * Observações verificadas na API (e diferentes do texto do swagger, que não traz esquemas de resposta):
 *  - `offset` é o NÚMERO DA PÁGINA (0, 1, 2...), não o deslocamento de registros.
 *  - `limit` acima do máximo é reduzido silenciosamente (ex.: /cnes/estabelecimentos devolve no máx. 20;
 *    /assistencia-a-saude/cnes-profissionais devolve 1 registro por requisição, e o offset avança registro a registro).
 *  - /assistencia-a-saude/hospitais-e-leitos publica várias versões do mesmo hospital (apenas os totais de leitos
 *    mudam) sem campo de período: cada versão distinta é armazenada; indicadores usam o maior valor publicado.
 *  - `data_atualizacao` em /cnes/estabelecimentos exige AAAA-MM-DD e filtra pelo DIA exato.
 *  - Erros: 400 { message: {...} }, 404 { message: "... not found." }.
 */

export interface TipoUnidadeApi { codigo_tipo_unidade: number; descricao_tipo_unidade: string }

export interface EstabelecimentoApi {
  codigo_cnes: number; numero_cnpj_entidade: string | null; nome_razao_social: string; nome_fantasia: string | null;
  natureza_organizacao_entidade: string | null; tipo_gestao: string | null; descricao_nivel_hierarquia: string | null;
  descricao_esfera_administrativa: string | null; codigo_tipo_unidade: number | null; codigo_cep_estabelecimento: string | null;
  endereco_estabelecimento: string | null; numero_estabelecimento: string | null; bairro_estabelecimento: string | null;
  numero_telefone_estabelecimento: string | null; latitude_estabelecimento_decimo_grau: number | null; longitude_estabelecimento_decimo_grau: number | null;
  endereco_email_estabelecimento: string | null; numero_cnpj: string | null; codigo_identificador_turno_atendimento: string | null;
  descricao_turno_atendimento: string | null; estabelecimento_faz_atendimento_ambulatorial_sus: string | null; codigo_estabelecimento_saude: string | null;
  codigo_uf: number | null; codigo_municipio: number | null; descricao_natureza_juridica_estabelecimento: string | null;
  codigo_motivo_desabilitacao_estabelecimento: string | null; estabelecimento_possui_centro_cirurgico: number | null;
  estabelecimento_possui_centro_obstetrico: number | null; estabelecimento_possui_centro_neonatal: number | null;
  estabelecimento_possui_atendimento_hospitalar: number | null; estabelecimento_possui_servico_apoio: number | null;
  estabelecimento_possui_atendimento_ambulatorial: number | null; codigo_atividade_ensino_unidade: string | null;
  codigo_natureza_organizacao_unidade: string | null; codigo_nivel_hierarquia_unidade: string | null;
  codigo_esfera_administrativa_unidade: string | null; data_atualizacao: string | null;
}

export interface MunicipioRegiaoApi {
  codigo_regiao_pais: string; regiao_pais: string; codigo_uf: string; uf: string; codigo_macrorregiao_saude: string; macrorregiao_saude: string;
  codigo_regiao_saude: string; regiao_saude: string; codigo_municipio: string; municipio: string; populacao_estimada_ibge_2022: number | null;
}

export interface CnesProfissionalApi {
  nu_comp: number; co_ibge: number; co_cnes: string; no_fantasia: string | null; no_razao_social: string | null; nu_cnpj: string | null;
  nu_cnpj_mantenedora: string | null; tp_gestao: string | null; no_profissional: string; nu_carga_horaria_outro: number | null;
  nu_carga_horaria_ambul: number | null; nu_carga_hor_hosp_sus: number | null; nu_carga_horaria_total: number | null; ds_cbo: string | null;
  st_atende_sus: string | null; co_ind_vinculo: string | null; ds_vinculo: string | null; dt_entrada_equipe: string | null; dt_deslig_equipe: string | null;
  co_ine: string | null; co_area_equipe: string | null; no_area_equipe: string | null; tp_equipe: string | null; ds_subtipo_equipe: string | null;
  dt_ativacao_equipe: string | null; dt_desat_equipe: string | null;
}

/** Campos como publicados (inclusive grafias originais: "hosptial", "enderco"). */
export interface HospitalLeitosApi {
  nome_da_regiao_do_brasil_onde_fica_o_hospital: string | null; unidade_da_federacao_onde_fica_o_hospital: string;
  nome_do_municipio_onde_fica_o_hospital: string; 'motivo_da_desabilitacao_do_hospital,_caso_esteja_desabilitado': string | null;
  nome_do_hospital: string; nome_da_razao_social_do_hospital: string | null; tipo_da_gestao_do_hospital: string | null;
  codigo_do_tipo_da_unidade: string | null; descricao_do_tipo_da_unidade: string | null; natureza_juridica_do_hospital: string | null;
  descricao_da_natureza_juridica_do_hosptial: string | null; enderco_do_hospital: string | null; numero_do_endereco_do_hospital: string | null;
  complemento_do_endereco_do_hospital: string | null; nome_do_bairro_do_endereco_do_hosptial: string | null; numero_do_cep_do_hospital: string | null;
  quantidade_total_de_leitos_do_hosptial: number | null; quantidade_total_de_leitos_sus_do_hosptial: number | null;
  quantidade_de_leitos_de_uti_do_hosptial: number | null; quantidade_de_leitos_de_uti_sus_do_hosptial: number | null;
  quantidade_de_leitos_de_uti_adulto_do_hosptial: number | null; quantidade_de_leitos_de_uti_sus_adulto_do_hosptial: number | null;
  quantidade_de_leitos_de_uti_pediatrico_do_hosptial: number | null; quantidade_de_leitos_de_uti_sus_pediatrico_do_hosptial: number | null;
  quantidade_de_leitos_de_uti_neonatal_do_hosptial: number | null; quantidade_de_leitos_de_uti_sus_neonatal_do_hosptial: number | null;
  quantidade_de_leitos_de_uti_queimado_do_hosptial: number | null; quantidade_de_leitos_de_uti_sus_queimado_do_hosptial: number | null;
  quantidade_de_leitos_de_uti_coronariana_do_hosptial: number | null; quantidade_de_leitos_de_uti_sus_coronariana_do_hosptial: number | null;
  codigo_ibge_do_municipio: string | number | null;
}

/** Definição de cada endpoint paginado consumido. */
export interface EndpointDef { path: string; listKey: string; maxLimit: number }

export const ENDPOINTS = {
  tiposUnidade: { path: '/cnes/tipounidades', listKey: 'tipos_unidade', maxLimit: 0 },
  estabelecimentos: { path: '/cnes/estabelecimentos', listKey: 'estabelecimentos', maxLimit: 20 },
  municipios: { path: '/macrorregiao-e-regiao-de-saude/municipio', listKey: 'macrorregiao_regiao_saude_municipios', maxLimit: 860 },
  profissionais: { path: '/assistencia-a-saude/cnes-profissionais', listKey: 'cnes_profissionais', maxLimit: 1000 },
  hospitaisLeitos: { path: '/assistencia-a-saude/hospitais-e-leitos', listKey: 'hospitais_leitos', maxLimit: 1000 },
} satisfies Record<string, EndpointDef>;

/** Conjuntos sincronizados pelo Conecta (ordem de execução da sincronização completa). */
export const DATASETS = ['cnes-tipos-unidade', 'regioes-saude', 'cnes-estabelecimentos', 'hospitais-leitos', 'cnes-profissionais', 'catalogo'] as const;
export type DatasetCode = (typeof DATASETS)[number];

export const DATASET_INFO: Record<DatasetCode, { nome: string; endpoint: string; descricao: string }> = {
  'cnes-tipos-unidade': { nome: 'Tipos de unidade (CNES)', endpoint: '/cnes/tipounidades', descricao: 'Classificação oficial dos tipos de estabelecimento.' },
  'regioes-saude': { nome: 'Municípios, regiões e macrorregiões de saúde', endpoint: '/macrorregiao-e-regiao-de-saude/municipio', descricao: 'Organização territorial da rede (IBGE + regiões de saúde).' },
  'cnes-estabelecimentos': { nome: 'Estabelecimentos de saúde (CNES)', endpoint: '/cnes/estabelecimentos', descricao: 'Cadastro público de estabelecimentos; base para importar unidades.' },
  'hospitais-leitos': { nome: 'Hospitais e leitos', endpoint: '/assistencia-a-saude/hospitais-e-leitos', descricao: 'Capacidade hospitalar (leitos gerais, SUS e UTI).' },
  'cnes-profissionais': { nome: 'Profissionais por estabelecimento (CNES)', endpoint: '/assistencia-a-saude/cnes-profissionais', descricao: 'Vínculos públicos de profissionais (CBO, carga horária) por competência.' },
  catalogo: { nome: 'Catálogo de conjuntos de dados', endpoint: '/static/swagger.json', descricao: 'Todos os endpoints publicados na documentação oficial.' },
};

/** Códigos IBGE das UFs (padrão oficial), usados no filtro codigo_uf de /cnes/estabelecimentos. */
export const UF_IBGE: Record<string, number> = {
  RO: 11, AC: 12, AM: 13, RR: 14, PA: 15, AP: 16, TO: 17, MA: 21, PI: 22, CE: 23, RN: 24, PB: 25, PE: 26, AL: 27, SE: 28, BA: 29,
  MG: 31, ES: 32, RJ: 33, SP: 35, PR: 41, SC: 42, RS: 43, MS: 50, MT: 51, GO: 52, DF: 53,
};
