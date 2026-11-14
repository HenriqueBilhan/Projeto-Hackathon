import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { config } from './config/configuration';

/** Configuração HTTP compartilhada entre a aplicação e os testes e2e. */
export function configureApp(app: INestApplication, opts: { swagger?: boolean } = {}) {
  const express = app.getHttpAdapter().getInstance();
  express.set('trust proxy', 1);
  express.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://unpkg.com', 'https://cdn.jsdelivr.net'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", ...config.corsOrigins],
        objectSrc: ["'none'"], frameAncestors: ["'none'"],
        // Só força HTTPS nos recursos quando a implantação é HTTPS (COOKIE_SECURE=true).
        upgradeInsecureRequests: config.security.cookieSecure ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
  app.use(cookieParser());
  app.enableCors({ origin: config.corsOrigins.length ? config.corsOrigins : false, credentials: true, methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'], maxAge: 600 });
  app.setGlobalPrefix(config.apiPrefix);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: false } }));
  app.enableShutdownHooks();
  if (opts.swagger !== false) {
    const doc = SwaggerModule.createDocument(app, new DocumentBuilder()
      .setTitle('Conecta API')
      .setDescription('API REST do Conecta — Plataforma Integrada de Saúde Pública. Respostas no envelope { success, data, meta? }. Dados públicos externos: API de Dados Abertos do Ministério da Saúde.')
      .setVersion('1.0.0').addBearerAuth().build());
    SwaggerModule.setup('docs', app, doc, { swaggerOptions: { persistAuthorization: true } });
  }
}
