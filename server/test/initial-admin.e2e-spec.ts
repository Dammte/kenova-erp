import { ensureInitialAdmin } from '../src/auth/initial-admin';
import { createTestApp, ORIGIN, TestContext } from './utils/harness';

describe('First SUPER_ADMIN from INITIAL_ADMIN_* variables', () => {
  let ctx: TestContext;
  const env = {
    INITIAL_ADMIN_EMAIL: 'Dueno@Kenova.test',
    INITIAL_ADMIN_USERNAME: 'dueno',
    INITIAL_ADMIN_NAME: 'Dueño Ficticio',
    INITIAL_ADMIN_PASSWORD: 'Temporal-inicial-123',
  };

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('does nothing when the variables are absent', async () => {
    await expect(ensureInitialAdmin(ctx.app, {})).resolves.toBe(
      'not-configured',
    );
  });

  it('rejects an incomplete or weak configuration', async () => {
    await expect(
      ensureInitialAdmin(ctx.app, { ...env, INITIAL_ADMIN_PASSWORD: 'corta' }),
    ).rejects.toThrow(/INITIAL_ADMIN/);
    await expect(
      ensureInitialAdmin(ctx.app, {
        INITIAL_ADMIN_EMAIL: env.INITIAL_ADMIN_EMAIL,
      }),
    ).rejects.toThrow(/INITIAL_ADMIN/);
  });

  it('never creates a second admin while an active SUPER_ADMIN exists', async () => {
    await expect(ensureInitialAdmin(ctx.app, env)).resolves.toBe('skipped');
    const rows = await ctx.db.query(
      `SELECT 1 FROM users WHERE username = 'dueno'`,
    );
    expect(rows).toHaveLength(0);
  });

  it('creates the first admin with a temporary password that must be changed', async () => {
    await ctx.db.query(
      `UPDATE users SET "isActive" = false WHERE role = 'SUPER_ADMIN'`,
    );
    await expect(ensureInitialAdmin(ctx.app, env)).resolves.toBe('created');

    const [user] = await ctx.db.query(
      `SELECT email, role, "mustChangePassword", "passwordHash" FROM users WHERE username = 'dueno'`,
    );
    expect(user).toMatchObject({
      email: 'dueno@kenova.test',
      role: 'SUPER_ADMIN',
      mustChangePassword: true,
    });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);

    const cookie = await ctx.login(
      'dueno@kenova.test',
      env.INITIAL_ADMIN_PASSWORD,
    );
    const res = await ctx
      .http()
      .get('/api/clients')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN);
    expect(res.status).toBe(403);

    // Second start with the same variables: no change.
    await expect(ensureInitialAdmin(ctx.app, env)).resolves.toBe('skipped');
  });
});
