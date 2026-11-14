/**
 * Configuração centralizada a partir de variáveis de ambiente (.env).
 * Valores sensíveis (senhas, segredos JWT) NUNCA têm padrão em produção.
 */
import 'dotenv/config';

// Todo o processo opera em UTC; horários clínicos são tratados como "hora local da unidade" (APP_TIMEZONE).
process.env.TZ = 'UTC';

const num = (v: string | undefined, d: number) => (v === undefined || v === '' ? d : Number(v));
const bool = (v: string | undefined, d: boolean) => (v === undefined || v === '' ? d : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase()));
const list = (v: string | undefined) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);

export function loadConfig() {
  const env = process.env.NODE_ENV || 'development';
  const isProd = env === 'production';
  const cfg = {
    env,
    isProd,
    port: num(process.env.PORT, 3000),
    apiPrefix: 'api/v1',
    corsOrigins: list(process.env.CORS_ORIGINS),
    serveFrontend: bool(process.env.SERVE_FRONTEND, true),
    frontendPath: process.env.FRONTEND_PATH || '../frontend',
    logLevel: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
    timezone: process.env.APP_TIMEZONE || 'America/Sao_Paulo',
    db: {
      host: process.env.DB_HOST || '127.0.0.1',
      port: num(process.env.DB_PORT, 3306),
      username: process.env.DB_USER || 'conecta',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'conecta',
      logging: bool(process.env.DB_LOGGING, false),
      poolSize: num(process.env.DB_POOL_SIZE, 10),
    },
    jwt: {
      accessSecret: process.env.JWT_ACCESS_SECRET || '',
      accessTtl: num(process.env.JWT_ACCESS_TTL_SECONDS, 900),
      refreshTtlDays: num(process.env.JWT_REFRESH_TTL_DAYS, 7),
    },
    security: {
      bcryptRounds: num(process.env.BCRYPT_ROUNDS, 12),
      maxLoginAttempts: num(process.env.MAX_LOGIN_ATTEMPTS, 5),
      lockMinutes: num(process.env.LOGIN_LOCK_MINUTES, 15),
      rateLimitTtlSeconds: num(process.env.RATE_LIMIT_TTL_SECONDS, 60),
      rateLimitMax: num(process.env.RATE_LIMIT_MAX, 300),
      cookieSecure: bool(process.env.COOKIE_SECURE, isProd),
      exposeResetToken: bool(process.env.EXPOSE_RESET_TOKEN, !isProd),
    },
    admin: {
      cpf: process.env.ADMIN_CPF || '',
      password: process.env.ADMIN_PASSWORD || '',
      name: process.env.ADMIN_NAME || 'Administrador da rede',
      email: process.env.ADMIN_EMAIL || '',
    },
    ministerio: {
      baseUrl: process.env.MS_API_BASE_URL || 'https://apidadosabertos.saude.gov.br',
      timeoutMs: num(process.env.MS_API_TIMEOUT_MS, 30000),
      maxRetries: num(process.env.MS_API_MAX_RETRIES, 4),
      minIntervalMs: num(process.env.MS_API_MIN_INTERVAL_MS, 300),
      maxPagesPerRequest: num(process.env.MS_API_MAX_PAGES, 2000),
    },
    sync: {
      autoEnabled: bool(process.env.SYNC_AUTO_ENABLED, false),
      cron: process.env.SYNC_CRON || '0 3 * * *',
      ufs: list(process.env.SYNC_UFS).map((s) => s.toUpperCase()),
      municipios: list(process.env.SYNC_MUNICIPIOS),
      competenciaCnes: process.env.SYNC_CNES_COMPETENCIA || '',
      incrementalMaxDays: num(process.env.SYNC_INCREMENTAL_MAX_DAYS, 31),
      batchSize: num(process.env.SYNC_BATCH_SIZE, 500),
      lockTimeoutMinutes: num(process.env.SYNC_LOCK_TIMEOUT_MINUTES, 120),
      /** Máximo de requisições por varredura (endpoints com página efetiva muito pequena, ex.: profissionais = 1). */
      maxRequestsPerScope: num(process.env.SYNC_MAX_REQUESTS_PER_SCOPE, 300),
    },
    audit: {
      retentionDays: num(process.env.AUDIT_RETENTION_DAYS, 1825),
    },
  };
  validateConfig(cfg);
  return cfg;
}

export type AppConfig = ReturnType<typeof loadConfig>;

/** Falha cedo quando a configuração obrigatória está ausente ou insegura. */
function validateConfig(cfg: AppConfig) {
  const errors: string[] = [];
  if (!cfg.jwt.accessSecret || cfg.jwt.accessSecret.length < 32) errors.push('JWT_ACCESS_SECRET deve ter pelo menos 32 caracteres.');
  if (cfg.isProd && !cfg.db.password) errors.push('DB_PASSWORD é obrigatório em produção.');
  if (cfg.isProd && cfg.corsOrigins.includes('*')) errors.push('CORS_ORIGINS="*" não é permitido em produção.');
  if (cfg.sync.municipios.some((m) => !/^\d{6}$/.test(m))) errors.push('SYNC_MUNICIPIOS deve conter códigos IBGE de 6 dígitos.');
  if (cfg.sync.competenciaCnes && !/^\d{6}$/.test(cfg.sync.competenciaCnes)) errors.push('SYNC_CNES_COMPETENCIA deve estar no formato AAAAMM.');
  if (errors.length) throw new Error(`Configuração inválida:\n - ${errors.join('\n - ')}`);
}

export const config = loadConfig();
