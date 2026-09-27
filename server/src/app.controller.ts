import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from './auth/decorators/public.decorator';

@Controller()
export class AppController {
  /** Unauthenticated health check for Render. Reveals nothing about the app. */
  @Public()
  @SkipThrottle()
  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
