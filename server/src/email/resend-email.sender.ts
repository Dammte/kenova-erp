import { EmailMessage, EmailSender } from './email-sender';

/**
 * Resend over its HTTP API. HTTP rather than SMTP on purpose: Render's free
 * plan blocks outbound SMTP ports.
 */
export class ResendEmailSender extends EmailSender {
  readonly enabled = true;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    super();
  }

  async send(message: EmailMessage): Promise<void> {
    const res = await this.fetchFn('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      // The body explains the cause (unverified domain, bad key...) and holds no secrets.
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      throw new Error(`Resend responded ${res.status}: ${detail}`);
    }
  }
}
