import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthUser } from '../auth/auth.types';
import { UserRole } from '../users/entities/user.entity';
import { BackupService } from './backup.service';

/** Design R2 3.13 «Copia de seguridad»: partners only. */
@Controller('backup')
@Roles(UserRole.SUPER_ADMIN)
export class BackupController {
  constructor(private readonly backup: BackupService) {}

  @Get('status')
  status() {
    return this.backup.status();
  }

  /** POST, not GET: exporting is recorded in the audit log. */
  @Post('export')
  @HttpCode(200)
  export(@CurrentUser() actor: AuthUser) {
    return this.backup.export(actor.id);
  }
}
