import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser = require('cookie-parser');
import helmet from 'helmet';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { allowedOrigins } from './security/origin-check.middleware';

/**
 * Everything that must be identical in production and in the e2e tests.
 */
export function setupApp(app: INestApplication) {
  const express = app as NestExpressApplication;

  // Render (and the Vercel rewrite in front of it) are proxies: trust the
  // configured number of hops so req.ip is the real client for rate limiting.
  express.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));
  express.disable('x-powered-by');

  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: allowedOrigins(),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      // Unknown fields are dropped, so a request can never set id, createdAt,
      // paymentStatus, performedBy... that the DTO does not declare.
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
}
