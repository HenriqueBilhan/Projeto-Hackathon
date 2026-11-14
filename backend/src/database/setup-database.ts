/**
 * Cria o banco de dados e o usuário da aplicação no MySQL (uso único, em desenvolvimento ou na implantação).
 * Usa uma conta administrativa (DB_ROOT_USER / DB_ROOT_PASSWORD) e os valores DB_* do .env.
 *   npm run db:setup
 */
import 'dotenv/config';
import { randomBytes } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { createConnection } from 'mysql2/promise';

/** Gera JWT_ACCESS_SECRET no .env quando estiver vazio ou curto (necessário para as migrations e a API). */
function ensureJwtSecret() {
  if ((process.env.JWT_ACCESS_SECRET || '').length >= 32) return;
  const file = resolve(process.cwd(), '.env');
  if (!existsSync(file)) throw new Error('Arquivo .env não encontrado. Execute: cp .env.example .env');
  const secret = randomBytes(48).toString('base64url');
  const env = readFileSync(file, 'utf8');
  writeFileSync(file, /^JWT_ACCESS_SECRET=.*$/m.test(env) ? env.replace(/^JWT_ACCESS_SECRET=.*$/m, `JWT_ACCESS_SECRET=${secret}`) : `${env.trimEnd()}\nJWT_ACCESS_SECRET=${secret}\n`);
  process.env.JWT_ACCESS_SECRET = secret;
  console.log('[db:setup] JWT_ACCESS_SECRET gerado e salvo no .env');
}

const id = (s: string) => `\`${s.replace(/`/g, '``')}\``;

(async () => {
  ensureJwtSecret();
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = Number(process.env.DB_PORT || 3306);
  const rootUser = process.env.DB_ROOT_USER || 'root';
  const rootPassword = process.env.DB_ROOT_PASSWORD ?? '';
  const user = process.env.DB_USER || 'conecta';
  const password = process.env.DB_PASSWORD || '';
  const databases = [process.env.DB_NAME || 'conecta', process.env.DB_NAME_TEST || 'conecta_test'];
  if (!password) throw new Error('Defina DB_PASSWORD no .env antes de executar o setup.');

  const conn = await createConnection({ host, port, user: rootUser, password: rootPassword }).catch((e) => {
    throw new Error(`Não foi possível conectar como "${rootUser}" em ${host}:${port} (${e.code}). Informe DB_ROOT_USER e DB_ROOT_PASSWORD no .env.`);
  });
  try {
    for (const db of databases) {
      await conn.query(`CREATE DATABASE IF NOT EXISTS ${id(db)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      console.log(`[db:setup] banco ${db} pronto`);
    }
    // 'localhost' e '127.0.0.1' são contas distintas no MySQL: cria/atualiza as duas.
    for (const h of ['localhost', '127.0.0.1', '%']) {
      await conn.query('CREATE USER IF NOT EXISTS ?@? IDENTIFIED BY ?', [user, h, password]);
      await conn.query('ALTER USER ?@? IDENTIFIED BY ?', [user, h, password]);
      for (const db of databases) await conn.query(`GRANT ALL PRIVILEGES ON ${id(db)}.* TO ?@?`, [user, h]);
    }
    await conn.query('FLUSH PRIVILEGES');
    console.log(`[db:setup] usuário "${user}" criado/atualizado com acesso a ${databases.join(', ')}`);
  } finally { await conn.end(); }
})().catch((e) => { console.error(`[db:setup] falhou: ${e.message}`); process.exit(1); });
