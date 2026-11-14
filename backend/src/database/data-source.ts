/**
 * DataSource do TypeORM (MySQL 8). Usado pela aplicação e pela CLI de migrations.
 * synchronize é SEMPRE false: o esquema evolui somente por migrations.
 */
import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from '../config/configuration';
import { ENTITIES } from './entities';

export function buildDataSourceOptions(overrides: Partial<DataSourceOptions> = {}): DataSourceOptions {
  return {
    type: 'mysql',
    host: config.db.host,
    port: config.db.port,
    username: config.db.username,
    password: config.db.password,
    database: config.db.database,
    charset: 'utf8mb4_unicode_ci',
    timezone: 'Z',
    entities: ENTITIES,
    migrations: [__dirname + '/migrations/*.{ts,js}'],
    migrationsTableName: 'typeorm_migrations',
    synchronize: false,
    migrationsRun: false,
    logging: config.db.logging ? ['query', 'error'] : ['error'],
    extra: { connectionLimit: config.db.poolSize, decimalNumbers: false },
    ...overrides,
  } as DataSourceOptions;
}

const AppDataSource = new DataSource(buildDataSourceOptions());
export default AppDataSource;
