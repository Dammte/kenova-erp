import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { Session } from './entities/session.entity';
import { RolesGuard } from './guards/roles.guard';
import { SessionGuard } from './guards/session.guard';
import { PasswordResetController } from './password-reset.controller';
import { PasswordResetService } from './password-reset.service';
import { PasswordService } from './password.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([User, Session, PasswordResetToken])],
  controllers: [AuthController, PasswordResetController],
  providers: [
    AuthService,
    PasswordService,
    PasswordResetService,
    // Order matters: rate limit first, then authenticate, then check roles.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService, PasswordService],
})
export class AuthModule {}
