import { Logger } from '@nestjs/common';
import { EmailMessage, EmailSender } from './email-sender';

/**
 * Local development only: prints the email (including links) to the console
 * instead of sending it. Refused in production by validate-env.
 */
export class LogEmailSender extends EmailSender {
  readonly enabled = true;
  private readonly logger = new Logger('Email');

  async send(message: EmailMessage): Promise<void> {
    this.logger.log(
      `To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}`,
    );
  }
}

/** No provider configured: email-dependent features are hidden. */
export class DisabledEmailSender extends EmailSender {
  readonly enabled = false;

  async send(): Promise<void> {
    throw new Error('Email is not configured (EMAIL_PROVIDER)');
  }
}
