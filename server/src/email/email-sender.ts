export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Port for outgoing email. The app depends on this abstraction only; each
 * provider is an adapter chosen by EMAIL_PROVIDER (see email.module.ts), so
 * switching provider means adding one class, not touching features.
 */
export abstract class EmailSender {
  /** False when no provider is configured: features that need email are off. */
  abstract readonly enabled: boolean;
  abstract send(message: EmailMessage): Promise<void>;
}
