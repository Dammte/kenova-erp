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
