import { KEY_FORMAT_ERROR, SecretCipher } from '../common/crypto/secret-cipher';

/**
 * Lists every production setting that is missing, so a misconfigured deploy
 * fails once with the full list instead of one variable per attempt (or, for
 * CORS_ORIGIN, starting fine and rejecting every login).
 *
 * Applies when NODE_ENV=production or when running on Render (RENDER is set by
 * the platform), which also catches a forgotten NODE_ENV.
 */
export function productionEnvProblems(env: NodeJS.ProcessEnv): string[] {
  const deployed = env.NODE_ENV === 'production' || !!env.RENDER;
  if (!deployed) return [];

  const problems: string[] = [];
  if (env.NODE_ENV !== 'production') {
    problems.push('NODE_ENV must be "production"');
  }
  if (!env.DATABASE_URL && !env.DB_HOST) {
    problems.push('DATABASE_URL is not set');
  }
  if (!env.DEVICE_SECRET_KEY) {
    problems.push(
      'DEVICE_SECRET_KEY is not set (32 random bytes in base64: openssl rand -base64 32)',
    );
  } else if (!SecretCipher.decodeKey(env.DEVICE_SECRET_KEY)) {
    // Never echo the value: only its length helps diagnose the mistake.
    problems.push(
      `${KEY_FORMAT_ERROR} (the current value has ${env.DEVICE_SECRET_KEY.trim().length} characters)`,
    );
  }
  if (!env.CORS_ORIGIN) {
    problems.push(
      'CORS_ORIGIN is not set (exact frontend URL, e.g. https://my-app.vercel.app)',
    );
  }
  problems.push(...emailProblems(env));
  return problems;
}

/** Email is optional; when enabled it must be complete. */
function emailProblems(env: NodeJS.ProcessEnv): string[] {
  const provider = env.EMAIL_PROVIDER;
  if (!provider) return [];
  if (provider === 'log') {
    return [
      'EMAIL_PROVIDER=log only works locally: it prints reset links to the logs',
    ];
  }
  if (provider !== 'resend') {
    return [`EMAIL_PROVIDER "${provider}" is not supported (use "resend")`];
  }
  const problems: string[] = [];
  if (!env.RESEND_API_KEY) problems.push('RESEND_API_KEY is not set');
  if (!env.EMAIL_FROM) {
    problems.push(
      'EMAIL_FROM is not set (e.g. "Kenova <no-reply@your-domain.com>", on a domain verified in Resend)',
    );
  }
  if (!env.APP_URL || !/^https:\/\/[^/\s]+/.test(env.APP_URL)) {
    problems.push(
      'APP_URL must be the https URL of the frontend (used in reset links)',
    );
  }
  return problems;
}

export function assertProductionEnv(env: NodeJS.ProcessEnv = process.env) {
  const problems = productionEnvProblems(env);
  if (problems.length) {
    throw new Error(
      `Missing or invalid environment variables:\n - ${problems.join('\n - ')}`,
    );
  }
}
