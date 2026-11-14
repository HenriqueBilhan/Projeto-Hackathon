/** CLI: npm run seed (desenvolvimento) / npm run seed:prod (dist). */
import AppDataSource from '../data-source';
import { config } from '../../config/configuration';
import { runSeed } from './seed';

(async () => {
  await AppDataSource.initialize();
  try {
    await runSeed(AppDataSource, { adminCpf: config.admin.cpf, adminPassword: config.admin.password, adminName: config.admin.name, adminEmail: config.admin.email, bcryptRounds: config.security.bcryptRounds, log: (m) => console.log(`[seed] ${m}`) });
    console.log('[seed] concluído');
  } finally { await AppDataSource.destroy(); }
})().catch((e) => { console.error('[seed] falhou:', e.message); process.exit(1); });
