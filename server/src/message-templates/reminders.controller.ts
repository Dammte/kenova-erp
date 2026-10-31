import { Controller, Get } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { NoticesService } from './notices.service';

/** Design 2.5: the pickup reminders due today, for the Panel. */
@Controller('notices')
export class RemindersController {
  constructor(private readonly notices: NoticesService) {}

  @Get('reminders')
  reminders(@CurrentUser() user: AuthUser) {
    return this.notices.reminders(user);
  }
}
