import { applyAdminReset } from '../src/auth/admin-reset';
import { createTestApp, ORIGIN, PASSWORD, TestContext } from './utils/harness';

describe('SUPER_ADMIN recovery from ADMIN_RESET_* variables', () => {
  let ctx: TestContext;
  const temporary = 'Temporal-recuperacion-1';

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });

  const env = () => ({
    ADMIN_RESET_EMAIL: ctx.superAdmin.email.toUpperCase(),
    ADMIN_RESET_PASSWORD: temporary,
  });

  it('does nothing when the variables are absent', async () => {
    await expect(applyAdminReset(ctx.app, {})).resolves.toBe('not-configured');
  });

  it('rejects an incomplete or weak configuration', async () => {
    await expect(
      applyAdminReset(ctx.app, { ...env(), ADMIN_RESET_PASSWORD: 'corta' }),
    ).rejects.toThrow(/ADMIN_RESET/);
    await expect(
      applyAdminReset(ctx.app, { ADMIN_RESET_EMAIL: ctx.superAdmin.email }),
    ).rejects.toThrow(/ADMIN_RESET/);
  });

  it('never resets a store admin or an unknown email', async () => {
    await expect(
      applyAdminReset(ctx.app, {
        ...env(),
        ADMIN_RESET_EMAIL: ctx.storeAdmin.email,
      }),
    ).resolves.toBe('not-found');
    await expect(
      applyAdminReset(ctx.app, {
        ...env(),
        ADMIN_RESET_EMAIL: 'nadie@kenova.test',
      }),
    ).resolves.toBe('not-found');
    // The store admin keeps their password.
    await expect(ctx.login(ctx.storeAdmin.email)).resolves.toBeTruthy();
  });

  it('resets a locked SUPER_ADMIN, closes their sessions and forces a change', async () => {
    const oldSession = await ctx.login(ctx.superAdmin.email);
    await ctx.db.query(
      `UPDATE users SET "failedLoginCount" = 9, "lockedUntil" = now() + interval '1 hour' WHERE id = $1`,
      [ctx.superAdmin.id],
    );

    await expect(applyAdminReset(ctx.app, env())).resolves.toBe('reset');

    const me = await ctx.http().get('/api/auth/me').set('Cookie', oldSession);
    expect(me.status).toBe(401);

    const login = await ctx
      .http()
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .send({ email: ctx.superAdmin.email, password: PASSWORD });
    expect(login.status).toBe(401);

    const cookie = await ctx.login(ctx.superAdmin.email, temporary);
    const blocked = await ctx.http().get('/api/clients').set('Cookie', cookie);
    expect(blocked.status).toBe(403);

    const changed = await ctx
      .http()
      .post('/api/auth/change-password')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({
        currentPassword: temporary,
        newPassword: 'La-nueva-del-dueno-123',
      });
    expect(changed.status).toBe(204);

    const [audit] = await ctx.db.query(
      `SELECT metadata FROM audit_events WHERE action = 'USER_PASSWORD_RESET' ORDER BY "createdAt" DESC LIMIT 1`,
    );
    expect(JSON.stringify(audit.metadata)).not.toContain(temporary);
  });

  it('applies only once: a restart with the same variables keeps the new password', async () => {
    await expect(applyAdminReset(ctx.app, env())).resolves.toBe(
      'already-applied',
    );
    await expect(
      ctx.login(ctx.superAdmin.email, 'La-nueva-del-dueno-123'),
    ).resolves.toBeTruthy();
  });
});
