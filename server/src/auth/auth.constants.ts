/** Session lifetime settings (overridable through the environment). */
export const SESSION_IDLE_MS =
  Number(process.env.SESSION_IDLE_HOURS ?? 12) * 60 * 60 * 1000;
export const SESSION_ABSOLUTE_MS =
  Number(process.env.SESSION_ABSOLUTE_DAYS ?? 7) * 24 * 60 * 60 * 1000;
/** lastSeenAt is only written when older than this, to avoid a write per request. */
export const SESSION_TOUCH_MS = 5 * 60 * 1000;

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;
export const MIN_PASSWORD_LENGTH = 12;

/**
 * `__Host-` cookies are only accepted over HTTPS, with Path=/ and no Domain,
 * which pins the cookie to the exact origin that set it.
 */
export function sessionCookieName(): string {
  return cookieSecure() ? '__Host-sid' : 'sid';
}

export function cookieSecure(): boolean {
  if (process.env.COOKIE_SECURE === 'false') return false;
  if (process.env.COOKIE_SECURE === 'true') return true;
  return process.env.NODE_ENV === 'production';
}
