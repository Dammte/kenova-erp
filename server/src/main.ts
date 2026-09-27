import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import { setupApp } from './common/setup-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  setupApp(app);

  // Refuse to serve requests against a schema this code was not written for.
  const pending = await app.get(DataSource).showMigrations();
  if (pending && process.env.ALLOW_PENDING_MIGRATIONS !== 'true') {
    Logger.error(
      'There are pending database migrations. Run `npm run migration:run:prod` first.',
      'Bootstrap',
    );
    await app.close();
    process.exit(1);
  }

  await app.listen(process.env.PORT ?? 4000);
}
bootstrap();
