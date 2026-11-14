/**
 * Sincronização pela linha de comando (útil em cron do sistema/containers):
 *   npm run sync                       → todos os conjuntos
 *   npm run sync -- cnes-estabelecimentos [full|incremental]
 *   npm run sync -- --reprocess <logId>
 */
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { buildDataSourceOptions } from '../../database/data-source';
import { CoreModule } from '../core/core.module';
import { SynchronizationModule } from './synchronization.module';
import { SynchronizationService } from './synchronization.service';
import { DATASETS, DatasetCode } from '../../integrations/ministerio-saude/ministerio-saude.types';

@Module({ imports: [TypeOrmModule.forRoot(buildDataSourceOptions()), ScheduleModule.forRoot(), CoreModule, SynchronizationModule] })
class SyncCliModule {}

(async () => {
  const app = await NestFactory.createApplicationContext(SyncCliModule, { logger: ['log', 'warn', 'error'] });
  const svc = app.get(SynchronizationService);
  const [arg, extra] = process.argv.slice(2);
  try {
    let out: unknown;
    if (arg === '--reprocess' && extra) out = await svc.reprocess(extra, null, false);
    else if (arg && arg !== 'todos') {
      if (!DATASETS.includes(arg as DatasetCode)) throw new Error(`Conjunto inválido. Use: ${DATASETS.join(', ')}`);
      out = await svc.start(arg as DatasetCode, { trigger: 'manual', mode: extra as any });
    } else out = await svc.runAll('manual');
    console.log(JSON.stringify(out, null, 2));
  } catch (e) { console.error('Falha:', e.message); process.exitCode = 1; }
  await app.close();
})();
