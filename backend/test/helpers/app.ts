import { INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { buildImports, GLOBAL_PROVIDERS } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { buildDataSourceOptions } from '../../src/database/data-source';
import { runSeed } from '../../src/database/seeds/seed';

@Module({ imports: buildImports({ serveFrontend: false }), providers: GLOBAL_PROVIDERS })
class TestAppModule {}

export const ADMIN = { cpf: '52998224725', senha: 'Gestor@2026!' };

/** Recria o banco de testes do zero com as migrations reais e o seed. */
export async function resetTestDatabase() {
  const ds = new DataSource(buildDataSourceOptions());
  await ds.initialize();
  await ds.dropDatabase();
  await ds.runMigrations();
  await runSeed(ds, { adminCpf: ADMIN.cpf, adminPassword: ADMIN.senha, bcryptRounds: 4 });
  return ds;
}

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [TestAppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app, { swagger: false });
  await app.init();
  return app;
}

export function cpf(): string {
  for (;;) {
    const d = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
    if (new Set(d).size === 1) continue;
    for (const w of [10, 11]) { const r = (d.reduce((s, n, i) => s + n * (w - i), 0) * 10) % 11; d.push(r === 10 ? 0 : r); }
    return d.join('');
  }
}
export function cns(): string {
  for (;;) {
    const d = [7, ...Array.from({ length: 13 }, () => Math.floor(Math.random() * 10))];
    const last = (11 - (d.reduce((s, n, i) => s + n * (15 - i), 0) % 11)) % 11;
    if (last <= 9) return [...d, last].join('');
  }
}
