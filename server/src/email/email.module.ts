import { Global, Module } from '@nestjs/common';
import { EmailSender } from './email-sender';
import { DisabledEmailSender, LogEmailSender } from './log-email.sender';
import { ResendEmailSender } from './resend-email.sender';

export function createEmailSender(env: NodeJS.ProcessEnv): EmailSender {
  switch (env.EMAIL_PROVIDER) {
    case 'resend':
      return new ResendEmailSender(env.RESEND_API_KEY!, env.EMAIL_FROM!);
    case 'log':
      return new LogEmailSender();
    default:
      return new DisabledEmailSender();
  }
}

@Global()
@Module({
  providers: [
    { provide: EmailSender, useFactory: () => createEmailSender(process.env) },
  ],
  exports: [EmailSender],
})
export class EmailModule {}
