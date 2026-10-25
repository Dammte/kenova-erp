import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { EmailMessage, EmailSender } from '../email/email-sender';
import { ClientInfo, hashToken } from './auth.service';
import { PasswordService } from './password.service';

/** Minutes a reset link stays valid. */
export const RESET_TTL_MINUTES = Number(
  process.env.PASSWORD_RESET_TTL_MINUTES ?? 30,
);
/** Emails per account per hour, so nobody can flood an inbox. */
export const MAX_RESETS_PER_HOUR = 3;

const INVALID_LINK = 'El enlace no es válido o ha caducado. Pide uno nuevo.';

/**
 * Self-service password reset by email, following the OWASP Forgot Password
 * Cheat Sheet:
 * - the request answers the same whether or not the account exists, and the
 *   email is sent in the background so timing does not reveal it either;
 * - links carry a 256-bit random token, stored hashed, single use, short-lived;
 * - the link base comes from APP_URL, never from the request's Host header;
 * - completing a reset closes every session and does not log the user in;
 * - nothing about the account changes until a valid token is presented.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
    private readonly email: EmailSender,
  ) {}

  get available(): boolean {
    return this.email.enabled && !!process.env.APP_URL;
  }

  async request(email: string, client: ClientInfo): Promise<void> {
    if (!this.available) return;

    const token = randomBytes(32).toString('base64url');
    const outgoing = await this.db.transaction(async (m) => {
      const [user] = await m.query(
        `SELECT id, email, "fullName" FROM users WHERE lower(email) = $1 AND "isActive"`,
        [email],
      );
      if (!user) return null;
      // Serialises concurrent requests for the same account (rate limit below).
      await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `password-reset:${user.id}`,
      ]);
      const [{ recent }] = await m.query(
        `SELECT count(*)::int AS recent FROM password_reset_tokens
          WHERE "userId" = $1 AND "createdAt" > now() - interval '1 hour'`,
        [user.id],
      );
      if (recent >= MAX_RESETS_PER_HOUR) return null;

      // Only the newest link works.
      await m.query(
        `UPDATE password_reset_tokens SET "usedAt" = now()
          WHERE "userId" = $1 AND "usedAt" IS NULL`,
        [user.id],
      );
      await m.query(
        `INSERT INTO password_reset_tokens ("tokenHash", "userId", "expiresAt", "requestIp")
         VALUES ($1, $2, now() + make_interval(mins => $3), $4)`,
        [
          hashToken(token),
          user.id,
          RESET_TTL_MINUTES,
          client.ip?.slice(0, 64) ?? null,
        ],
      );
      await this.audit.record(
        {
          action: 'AUTH_PASSWORD_RESET_REQUESTED',
          actorUserId: user.id,
          entityType: 'user',
          entityId: user.id,
          ip: client.ip,
        },
        m,
      );
      return user as { email: string; fullName: string };
    });

    if (outgoing) {
      this.sendInBackground(resetEmail(outgoing, resetLink(token)));
    }
  }

  async confirm(
    token: string,
    newPassword: string,
    client: ClientInfo,
  ): Promise<void> {
    const hash = await this.passwords.hash(newPassword);
    const user = await this.db.transaction(async (m) => {
      const [row] = await m.query(
        `SELECT t.id, t."userId", u.email, u."fullName"
           FROM password_reset_tokens t JOIN users u ON u.id = t."userId"
          WHERE t."tokenHash" = $1 AND t."usedAt" IS NULL
            AND t."expiresAt" > now() AND u."isActive"
          FOR UPDATE OF t`,
        [hashToken(token)],
      );
      if (!row) return null;

      await m.query(
        `UPDATE users SET "passwordHash" = $1, "mustChangePassword" = false,
                "failedLoginCount" = 0, "lockedUntil" = NULL,
                "passwordChangedAt" = now(), "updatedAt" = now()
          WHERE id = $2`,
        [hash, row.userId],
      );
      await m.query(
        `UPDATE password_reset_tokens SET "usedAt" = now()
          WHERE "userId" = $1 AND "usedAt" IS NULL`,
        [row.userId],
      );
      await m.query(
        `UPDATE sessions SET "revokedAt" = now()
          WHERE "userId" = $1 AND "revokedAt" IS NULL`,
        [row.userId],
      );
      await this.audit.record(
        {
          action: 'AUTH_PASSWORD_RESET_COMPLETED',
          actorUserId: row.userId,
          entityType: 'user',
          entityId: row.userId,
          ip: client.ip,
        },
        m,
      );
      return row as { email: string; fullName: string };
    });

    if (!user) throw new BadRequestException(INVALID_LINK);
    this.sendInBackground(changedEmail(user));
  }

  private sendInBackground(message: EmailMessage) {
    this.email.send(message).catch((err: Error) => {
      // Never log the message body: it may contain a reset link.
      this.logger.error(`Could not send "${message.subject}": ${err.message}`);
    });
  }
}

function resetLink(token: string): string {
  // The token goes in the fragment (#), which browsers never send to servers,
  // so it cannot end up in Vercel/Render access logs or Referer headers.
  return `${process.env.APP_URL!.replace(/\/$/, '')}/restablecer-contrasena#token=${token}`;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
}

function resetEmail(
  user: { email: string; fullName: string },
  link: string,
): EmailMessage {
  const name = user.fullName.split(' ')[0];
  return {
    to: user.email,
    subject: 'Restablecer tu contraseña',
    text:
      `Hola ${name}:\n\n` +
      `Hemos recibido una solicitud para restablecer la contraseña de tu cuenta.\n` +
      `Abre este enlace para elegir una nueva (caduca en ${RESET_TTL_MINUTES} minutos y solo sirve una vez):\n\n` +
      `${link}\n\n` +
      `Si no lo has pedido tú, ignora este mensaje: tu contraseña no cambiará.`,
    html:
      `<p>Hola ${escapeHtml(name)}:</p>` +
      `<p>Hemos recibido una solicitud para restablecer la contraseña de tu cuenta.</p>` +
      `<p><a href="${escapeHtml(link)}">Elegir una contraseña nueva</a></p>` +
      `<p>El enlace caduca en ${RESET_TTL_MINUTES} minutos y solo sirve una vez.</p>` +
      `<p>Si no lo has pedido tú, ignora este mensaje: tu contraseña no cambiará.</p>`,
  };
}

function changedEmail(user: { email: string; fullName: string }): EmailMessage {
  const name = user.fullName.split(' ')[0];
  return {
    to: user.email,
    subject: 'Tu contraseña se ha cambiado',
    text:
      `Hola ${name}:\n\n` +
      `La contraseña de tu cuenta se acaba de cambiar y se han cerrado todas tus sesiones.\n` +
      `Si no has sido tú, avisa cuanto antes a un administrador.`,
    html:
      `<p>Hola ${escapeHtml(name)}:</p>` +
      `<p>La contraseña de tu cuenta se acaba de cambiar y se han cerrado todas tus sesiones.</p>` +
      `<p>Si no has sido tú, avisa cuanto antes a un administrador.</p>`,
  };
}
