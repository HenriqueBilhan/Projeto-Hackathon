/** Ambiente de testes: usa um banco separado (DB_NAME_TEST, padrão conecta_test). Nunca roda no banco de produção. */
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.DB_NAME_TEST || 'conecta_test';
process.env.LOG_LEVEL = 'silent';
process.env.SYNC_AUTO_ENABLED = 'false';
process.env.BCRYPT_ROUNDS = '4';
process.env.RATE_LIMIT_MAX = '10000';
process.env.SYNC_MUNICIPIOS = '431340';
process.env.SYNC_UFS = 'RS';
