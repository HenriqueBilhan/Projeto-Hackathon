/**
 * Dados públicos importados da API de Dados Abertos do Ministério da Saúde
 * (https://apidadosabertos.saude.gov.br/v1/). Os nomes das colunas seguem os
 * campos reais retornados por cada endpoint (ver integrations/ministerio-saude/ministerio-saude.types.ts).
 * Não há dados de pacientes aqui: apenas cadastros públicos (CNES, territórios, leitos).
 */
import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Colunas de controle de sincronização comuns às tabelas externas. */
export abstract class SyncedRecord {
  @Column({ name: 'content_hash', type: 'char', length: 64 }) contentHash: string;
  @Column({ name: 'synced_at', type: 'datetime' }) syncedAt: Date;
  @Column({ name: 'last_sync_log_id', type: 'bigint', unsigned: true, nullable: true }) lastSyncLogId: string | null;
  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 }) updatedAt: Date;
}

/** GET /cnes/tipounidades → { tipos_unidade: [...] } */
@Entity('external_unit_types')
export class ExternalUnitType extends SyncedRecord {
  @PrimaryColumn({ name: 'codigo_tipo_unidade', type: 'smallint', unsigned: true }) codigoTipoUnidade: number;
  @Column({ name: 'descricao_tipo_unidade', length: 150 }) descricaoTipoUnidade: string;
}

/** GET /macrorregiao-e-regiao-de-saude/municipio → { macrorregiao_regiao_saude_municipios: [...] } */
@Entity('external_municipalities')
@Index(['codigoUf'])
@Index(['codigoRegiaoSaude'])
@Index(['codigoMacrorregiaoSaude'])
export class ExternalMunicipality extends SyncedRecord {
  @PrimaryColumn({ name: 'codigo_municipio', type: 'char', length: 6 }) codigoMunicipio: string;
  @Column({ length: 120 }) municipio: string;
  @Column({ name: 'codigo_uf', type: 'char', length: 2 }) codigoUf: string;
  @Column({ length: 60 }) uf: string;
  @Column({ name: 'codigo_regiao_pais', type: 'char', length: 1 }) codigoRegiaoPais: string;
  @Column({ name: 'regiao_pais', length: 30 }) regiaoPais: string;
  @Column({ name: 'codigo_macrorregiao_saude', length: 10 }) codigoMacrorregiaoSaude: string;
  @Column({ name: 'macrorregiao_saude', length: 120 }) macrorregiaoSaude: string;
  @Column({ name: 'codigo_regiao_saude', length: 10 }) codigoRegiaoSaude: string;
  @Column({ name: 'regiao_saude', length: 120 }) regiaoSaude: string;
  @Column({ name: 'populacao_estimada_ibge_2022', type: 'int', unsigned: true, nullable: true }) populacaoEstimadaIbge2022: number | null;
}

/** GET /cnes/estabelecimentos e /cnes/estabelecimentos/{codigo_cnes} */
@Entity('external_establishments')
@Index(['codigoMunicipio', 'codigoTipoUnidade'])
@Index(['codigoUf'])
@Index(['dataAtualizacao'])
@Index(['nomeFantasia'])
export class ExternalEstablishment extends SyncedRecord {
  /** codigo_cnes normalizado com 7 dígitos (a API retorna inteiro). */
  @PrimaryColumn({ name: 'codigo_cnes', type: 'char', length: 7 }) codigoCnes: string;
  @Column({ name: 'numero_cnpj_entidade', type: 'varchar', length: 14, nullable: true }) numeroCnpjEntidade: string | null;
  @Column({ name: 'nome_razao_social', length: 255 }) nomeRazaoSocial: string;
  @Column({ name: 'nome_fantasia', type: 'varchar', length: 255, nullable: true }) nomeFantasia: string | null;
  @Column({ name: 'natureza_organizacao_entidade', type: 'varchar', length: 120, nullable: true }) naturezaOrganizacaoEntidade: string | null;
  @Column({ name: 'tipo_gestao', type: 'varchar', length: 2, nullable: true }) tipoGestao: string | null;
  @Column({ name: 'descricao_nivel_hierarquia', type: 'varchar', length: 255, nullable: true }) descricaoNivelHierarquia: string | null;
  @Column({ name: 'descricao_esfera_administrativa', type: 'varchar', length: 60, nullable: true }) descricaoEsferaAdministrativa: string | null;
  @Column({ name: 'codigo_tipo_unidade', type: 'smallint', unsigned: true, nullable: true }) codigoTipoUnidade: number | null;
  @Column({ name: 'codigo_cep_estabelecimento', type: 'varchar', length: 8, nullable: true }) codigoCepEstabelecimento: string | null;
  @Column({ name: 'endereco_estabelecimento', type: 'varchar', length: 255, nullable: true }) enderecoEstabelecimento: string | null;
  @Column({ name: 'numero_estabelecimento', type: 'varchar', length: 20, nullable: true }) numeroEstabelecimento: string | null;
  @Column({ name: 'bairro_estabelecimento', type: 'varchar', length: 120, nullable: true }) bairroEstabelecimento: string | null;
  @Column({ name: 'numero_telefone_estabelecimento', type: 'varchar', length: 40, nullable: true }) numeroTelefoneEstabelecimento: string | null;
  @Column({ name: 'latitude_estabelecimento_decimo_grau', type: 'decimal', precision: 10, scale: 7, nullable: true }) latitude: string | null;
  @Column({ name: 'longitude_estabelecimento_decimo_grau', type: 'decimal', precision: 10, scale: 7, nullable: true }) longitude: string | null;
  @Column({ name: 'endereco_email_estabelecimento', type: 'varchar', length: 150, nullable: true }) enderecoEmailEstabelecimento: string | null;
  @Column({ name: 'numero_cnpj', type: 'varchar', length: 14, nullable: true }) numeroCnpj: string | null;
  @Column({ name: 'codigo_identificador_turno_atendimento', type: 'varchar', length: 4, nullable: true }) codigoIdentificadorTurnoAtendimento: string | null;
  @Column({ name: 'descricao_turno_atendimento', type: 'varchar', length: 150, nullable: true }) descricaoTurnoAtendimento: string | null;
  @Column({ name: 'estabelecimento_faz_atendimento_ambulatorial_sus', type: 'varchar', length: 3, nullable: true }) fazAtendimentoAmbulatorialSus: string | null;
  @Column({ name: 'codigo_estabelecimento_saude', type: 'varchar', length: 20, nullable: true }) codigoEstabelecimentoSaude: string | null;
  @Column({ name: 'codigo_uf', type: 'tinyint', unsigned: true, nullable: true }) codigoUf: number | null;
  /** FK lógica para external_municipalities.codigo_municipio (sem constraint: a ordem de carga pode variar). */
  @Column({ name: 'codigo_municipio', type: 'char', length: 6, nullable: true }) codigoMunicipio: string | null;
  @Column({ name: 'descricao_natureza_juridica_estabelecimento', type: 'varchar', length: 10, nullable: true }) descricaoNaturezaJuridica: string | null;
  @Column({ name: 'codigo_motivo_desabilitacao_estabelecimento', type: 'varchar', length: 10, nullable: true }) codigoMotivoDesabilitacao: string | null;
  @Column({ name: 'estabelecimento_possui_centro_cirurgico', type: 'tinyint', nullable: true }) possuiCentroCirurgico: number | null;
  @Column({ name: 'estabelecimento_possui_centro_obstetrico', type: 'tinyint', nullable: true }) possuiCentroObstetrico: number | null;
  @Column({ name: 'estabelecimento_possui_centro_neonatal', type: 'tinyint', nullable: true }) possuiCentroNeonatal: number | null;
  @Column({ name: 'estabelecimento_possui_atendimento_hospitalar', type: 'tinyint', nullable: true }) possuiAtendimentoHospitalar: number | null;
  @Column({ name: 'estabelecimento_possui_servico_apoio', type: 'tinyint', nullable: true }) possuiServicoApoio: number | null;
  @Column({ name: 'estabelecimento_possui_atendimento_ambulatorial', type: 'tinyint', nullable: true }) possuiAtendimentoAmbulatorial: number | null;
  @Column({ name: 'codigo_atividade_ensino_unidade', type: 'varchar', length: 4, nullable: true }) codigoAtividadeEnsinoUnidade: string | null;
  @Column({ name: 'codigo_natureza_organizacao_unidade', type: 'varchar', length: 10, nullable: true }) codigoNaturezaOrganizacaoUnidade: string | null;
  @Column({ name: 'codigo_nivel_hierarquia_unidade', type: 'varchar', length: 10, nullable: true }) codigoNivelHierarquiaUnidade: string | null;
  @Column({ name: 'codigo_esfera_administrativa_unidade', type: 'varchar', length: 4, nullable: true }) codigoEsferaAdministrativaUnidade: string | null;
  @Column({ name: 'data_atualizacao', type: 'date', nullable: true }) dataAtualizacao: string | null;
}

/** GET /assistencia-a-saude/cnes-profissionais → { cnes_profissionais: [...] } (dados públicos por competência). */
@Entity('external_cnes_professionals')
@Index(['coCnes', 'nuComp'])
@Index(['coIbge', 'nuComp'])
@Index(['noProfissional'])
export class ExternalCnesProfessional extends SyncedRecord {
  @PrimaryGeneratedColumn('increment', { type: 'bigint', unsigned: true }) id: string;
  /** Hash da chave natural (competência + CNES + profissional + CBO + vínculo + equipe): evita duplicidade. */
  @Index({ unique: true }) @Column({ name: 'record_key', type: 'char', length: 64 }) recordKey: string;
  @Column({ name: 'nu_comp', type: 'int', unsigned: true }) nuComp: number;
  @Column({ name: 'co_ibge', type: 'char', length: 6 }) coIbge: string;
  @Column({ name: 'co_cnes', type: 'char', length: 7 }) coCnes: string;
  @Column({ name: 'no_fantasia', type: 'varchar', length: 255, nullable: true }) noFantasia: string | null;
  @Column({ name: 'no_razao_social', type: 'varchar', length: 255, nullable: true }) noRazaoSocial: string | null;
  @Column({ name: 'nu_cnpj', type: 'varchar', length: 14, nullable: true }) nuCnpj: string | null;
  @Column({ name: 'nu_cnpj_mantenedora', type: 'varchar', length: 14, nullable: true }) nuCnpjMantenedora: string | null;
  @Column({ name: 'tp_gestao', type: 'varchar', length: 20, nullable: true }) tpGestao: string | null;
  @Column({ name: 'no_profissional', length: 200 }) noProfissional: string;
  @Column({ name: 'nu_carga_horaria_outro', type: 'smallint', nullable: true }) nuCargaHorariaOutro: number | null;
  @Column({ name: 'nu_carga_horaria_ambul', type: 'smallint', nullable: true }) nuCargaHorariaAmbul: number | null;
  @Column({ name: 'nu_carga_hor_hosp_sus', type: 'smallint', nullable: true }) nuCargaHorHospSus: number | null;
  @Column({ name: 'nu_carga_horaria_total', type: 'smallint', nullable: true }) nuCargaHorariaTotal: number | null;
  @Column({ name: 'ds_cbo', type: 'varchar', length: 160, nullable: true }) dsCbo: string | null;
  @Column({ name: 'st_atende_sus', type: 'varchar', length: 5, nullable: true }) stAtendeSus: string | null;
  @Column({ name: 'co_ind_vinculo', type: 'varchar', length: 10, nullable: true }) coIndVinculo: string | null;
  @Column({ name: 'ds_vinculo', type: 'varchar', length: 200, nullable: true }) dsVinculo: string | null;
  @Column({ name: 'dt_entrada_equipe', type: 'varchar', length: 30, nullable: true }) dtEntradaEquipe: string | null;
  @Column({ name: 'dt_deslig_equipe', type: 'varchar', length: 30, nullable: true }) dtDesligEquipe: string | null;
  @Column({ name: 'co_ine', type: 'varchar', length: 20, nullable: true }) coIne: string | null;
  @Column({ name: 'co_area_equipe', type: 'varchar', length: 20, nullable: true }) coAreaEquipe: string | null;
  @Column({ name: 'no_area_equipe', type: 'varchar', length: 120, nullable: true }) noAreaEquipe: string | null;
  @Column({ name: 'tp_equipe', type: 'varchar', length: 120, nullable: true }) tpEquipe: string | null;
  @Column({ name: 'ds_subtipo_equipe', type: 'varchar', length: 200, nullable: true }) dsSubtipoEquipe: string | null;
  @Column({ name: 'dt_ativacao_equipe', type: 'varchar', length: 30, nullable: true }) dtAtivacaoEquipe: string | null;
  @Column({ name: 'dt_desat_equipe', type: 'varchar', length: 30, nullable: true }) dtDesatEquipe: string | null;
}

/** GET /assistencia-a-saude/hospitais-e-leitos → { hospitais_leitos: [...] } (não traz código CNES). */
@Entity('external_hospital_beds')
@Index(['uf', 'municipio'])
@Index(['codigoIbgeMunicipio'])
export class ExternalHospitalBeds extends SyncedRecord {
  @PrimaryGeneratedColumn('increment', { type: 'bigint', unsigned: true }) id: string;
  /** Hash de UF + município + nome + razão social + CEP (a API não fornece identificador). */
  @Index({ unique: true }) @Column({ name: 'record_key', type: 'char', length: 64 }) recordKey: string;
  @Column({ name: 'regiao', type: 'varchar', length: 30, nullable: true }) regiao: string | null;
  @Column({ name: 'uf', type: 'char', length: 2 }) uf: string;
  @Column({ name: 'municipio', length: 120 }) municipio: string;
  @Column({ name: 'motivo_desabilitacao', type: 'varchar', length: 255, nullable: true }) motivoDesabilitacao: string | null;
  @Column({ name: 'nome_hospital', length: 255 }) nomeHospital: string;
  @Column({ name: 'razao_social', type: 'varchar', length: 255, nullable: true }) razaoSocial: string | null;
  @Column({ name: 'tipo_gestao', type: 'varchar', length: 2, nullable: true }) tipoGestao: string | null;
  @Column({ name: 'codigo_tipo_unidade', type: 'varchar', length: 4, nullable: true }) codigoTipoUnidade: string | null;
  @Column({ name: 'descricao_tipo_unidade', type: 'varchar', length: 150, nullable: true }) descricaoTipoUnidade: string | null;
  @Column({ name: 'natureza_juridica', type: 'varchar', length: 10, nullable: true }) naturezaJuridica: string | null;
  @Column({ name: 'descricao_natureza_juridica', type: 'varchar', length: 120, nullable: true }) descricaoNaturezaJuridica: string | null;
  @Column({ name: 'endereco', type: 'varchar', length: 255, nullable: true }) endereco: string | null;
  @Column({ name: 'numero', type: 'varchar', length: 20, nullable: true }) numero: string | null;
  @Column({ name: 'complemento', type: 'varchar', length: 150, nullable: true }) complemento: string | null;
  @Column({ name: 'bairro', type: 'varchar', length: 120, nullable: true }) bairro: string | null;
  @Column({ name: 'cep', type: 'varchar', length: 8, nullable: true }) cep: string | null;
  @Column({ name: 'leitos_total', type: 'int', unsigned: true, default: 0 }) leitosTotal: number;
  @Column({ name: 'leitos_sus', type: 'int', unsigned: true, default: 0 }) leitosSus: number;
  @Column({ name: 'uti_total', type: 'int', unsigned: true, default: 0 }) utiTotal: number;
  @Column({ name: 'uti_sus', type: 'int', unsigned: true, default: 0 }) utiSus: number;
  @Column({ name: 'uti_adulto', type: 'int', unsigned: true, default: 0 }) utiAdulto: number;
  @Column({ name: 'uti_adulto_sus', type: 'int', unsigned: true, default: 0 }) utiAdultoSus: number;
  @Column({ name: 'uti_pediatrico', type: 'int', unsigned: true, default: 0 }) utiPediatrico: number;
  @Column({ name: 'uti_pediatrico_sus', type: 'int', unsigned: true, default: 0 }) utiPediatricoSus: number;
  @Column({ name: 'uti_neonatal', type: 'int', unsigned: true, default: 0 }) utiNeonatal: number;
  @Column({ name: 'uti_neonatal_sus', type: 'int', unsigned: true, default: 0 }) utiNeonatalSus: number;
  @Column({ name: 'uti_queimado', type: 'int', unsigned: true, default: 0 }) utiQueimado: number;
  @Column({ name: 'uti_queimado_sus', type: 'int', unsigned: true, default: 0 }) utiQueimadoSus: number;
  @Column({ name: 'uti_coronariana', type: 'int', unsigned: true, default: 0 }) utiCoronariana: number;
  @Column({ name: 'uti_coronariana_sus', type: 'int', unsigned: true, default: 0 }) utiCoronarianaSus: number;
  @Column({ name: 'codigo_ibge_municipio', type: 'varchar', length: 7, nullable: true }) codigoIbgeMunicipio: string | null;
}

/** Catálogo dos conjuntos de dados (endpoints) publicados no swagger oficial (/static/swagger.json). */
@Entity('external_datasets')
@Index(['tag'])
export class ExternalDataset {
  @PrimaryGeneratedColumn('increment', { type: 'int', unsigned: true }) id: number;
  @Index({ unique: true }) @Column({ length: 200 }) path: string;
  @Column({ length: 120 }) tag: string;
  @Column({ type: 'varchar', length: 500, nullable: true }) summary: string | null;
  @Column({ type: 'json' }) parameters: Array<{ name: string; in: string; type?: string; required?: boolean; description?: string }>;
  /** Código do conjunto quando sincronizado localmente pelo Conecta. */
  @Column({ name: 'sync_dataset', type: 'varchar', length: 60, nullable: true }) syncDataset: string | null;
  @Column({ name: 'last_seen_at', type: 'datetime' }) lastSeenAt: Date;
  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 6 }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 6 }) updatedAt: Date;
}
