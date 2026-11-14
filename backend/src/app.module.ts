import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { resolve } from 'path';
import { config } from './config/configuration';
import { buildDataSourceOptions } from './database/data-source';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { CoreModule } from './modules/core/core.module';
import { AuthModule } from './modules/auth/auth.module';
import { DomainModules } from './modules/domain.modules';
import { MinisterioSaudeModule } from './integrations/ministerio-saude/ministerio-saude.module';
import { SynchronizationModule } from './modules/synchronization/synchronization.module';

/** Campos que nunca devem aparecer nos logs (credenciais e dados pessoais). */
const REDACT = ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]', 'req.body.senha', 'req.body.novaSenha', 'req.body.cpf', 'req.body.cns'];

export function buildImports(opts: { serveFrontend?: boolean; schedule?: boolean } = {}) {
  const serve = opts.serveFrontend ?? config.serveFrontend;
  return [
    LoggerModule.forRoot({
      pinoHttp: {
        level: config.logLevel,
        redact: { paths: REDACT, censor: '[omitido]' },
        // Registra apenas método/rota/status — nunca corpos de requisição com dados clínicos.
        serializers: { req: (r: any) => ({ id: r.id, method: r.method, url: r.url?.split('?')[0] }), res: (r: any) => ({ statusCode: r.statusCode }) },
        autoLogging: { ignore: (req: any) => !String(req.url || '').startsWith(`/${config.apiPrefix}`) },
        transport: config.isProd ? undefined : { target: 'pino-pretty', options: { singleLine: true, colorize: true } },
      },
    }),
    TypeOrmModule.forRoot(buildDataSourceOptions()),
    ThrottlerModule.forRoot([{ name: 'default', ttl: config.security.rateLimitTtlSeconds * 1000, limit: config.security.rateLimitMax }]),
    JwtModule.register({ global: true, secret: config.jwt.accessSecret, signOptions: { algorithm: 'HS256' }, verifyOptions: { algorithms: ['HS256'] } }),
    ...(opts.schedule === false ? [] : [ScheduleModule.forRoot()]),
    ...(serve ? [ServeStaticModule.forRoot({ rootPath: resolve(process.cwd(), config.frontendPath), exclude: [`/${config.apiPrefix}/(.*)`, '/docs(.*)'] })] : []),
    CoreModule, AuthModule, ...DomainModules, MinisterioSaudeModule, SynchronizationModule,
  ];
}

export const GLOBAL_PROVIDERS = [
  { provide: APP_GUARD, useClass: ThrottlerGuard },
  { provide: APP_GUARD, useClass: JwtAuthGuard },
  { provide: APP_FILTER, useClass: AllExceptionsFilter },
  { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
];

@Module({ imports: buildImports(), providers: GLOBAL_PROVIDERS })
export class AppModule {}
