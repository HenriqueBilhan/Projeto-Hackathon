import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { config } from './config/configuration';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app);
  await app.listen(config.port);
  app.get(Logger).log(`Conecta API em http://localhost:${config.port}/${config.apiPrefix} · Swagger em /docs · ambiente ${config.env}`);
}
bootstrap();
