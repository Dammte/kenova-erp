import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { BrandsModule } from './brands/brands.module';
import { ClientsModule } from './clients/clients.module';
import { OriginCheckMiddleware } from './common/security/origin-check.middleware';
import { buildDatabaseOptions } from './config/database.config';
import { DevicesModule } from './devices/devices.module';
import { InventoryModule } from './inventory/inventory.module';
import { ModelsModule } from './models/models.module';
import { ServiceHistoryModule } from './service-history/service-history.module';
import { ServiceOrderModule } from './service-order/service-order.module';
import { ServicesModule } from './services/services.module';
import { StickyNotesModule } from './sticky-notes/sticky-notes.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({ useFactory: () => buildDatabaseOptions() }),
    // Default: 300 requests per minute per IP. Sensitive routes set their own limits.
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: 'default',
          ttl: 60_000,
          limit: Number(process.env.RATE_LIMIT_PER_MINUTE ?? 300),
        },
      ],
      // Only for automated tests that log in many times from one address.
      skipIf: () =>
        process.env.THROTTLE_DISABLED === 'true' &&
        process.env.NODE_ENV !== 'production',
    }),
    AuditModule,
    AuthModule,
    UsersModule,
    ClientsModule,
    DevicesModule,
    ServiceHistoryModule,
    ServiceOrderModule,
    InventoryModule,
    ServicesModule,
    BrandsModule,
    ModelsModule,
    StickyNotesModule,
  ],
  controllers: [AppController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(OriginCheckMiddleware).forRoutes('*');
  }
}
