import {
  createTestApp,
  MemoryEmailSender,
  ORIGIN,
  PASSWORD,
  TestContext,
} from './utils/harness';

const NEW_PASSWORD = 'Una-contraseña-recuperada-1';

describe('Password reset by email', () => {
  let ctx: TestContext;
  const mailbox = new MemoryEmailSender();

  beforeAll(async () => {
    process.env.APP_URL = 'https://app.kenova.test';
    ctx = await createTestApp(undefined, { emailSender: mailbox });
  });
  afterAll(async () => {
    await ctx.close();
    delete process.env.APP_URL;
  });
  beforeEach(async () => {
    mailbox.sent.length = 0;
    await ctx.db.query(`DELETE FROM password_reset_tokens`);
  });

  const requestReset = (email: string) =>
    ctx
      .http()
      .post('/api/auth/password-reset/request')
      .set('Origin', ORIGIN)
      .send({ email });
  const confirm = (token: string, newPassword = NEW_PASSWORD) =>
    ctx
      .http()
      .post('/api/auth/password-reset/confirm')
      .set('Origin', ORIGIN)
      .send({ token, newPassword });
  const tokenFrom = (text: string) =>
    /#token=([A-Za-z0-9_-]{43})/.exec(text)![1];

  it('reports that the feature is available', async () => {
    const res = await ctx.http().get('/api/auth/password-reset/available');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ available: true });
  });

  it('answers the same for existing and unknown accounts', async () => {
    const known = await requestReset(ctx.storeAdmin.email.toUpperCase());
    const unknown = await requestReset('nadie@kenova.test');
    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(known.body).toEqual(unknown.body);
    const sent = await mailbox.waitFor(1);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(ctx.storeAdmin.email);
  });

  it('builds the link from APP_URL with the token in the fragment, and stores only its hash', async () => {
    await requestReset(ctx.storeAdmin.email).set('Host', 'evil.example');
    const [mail] = await mailbox.waitFor(1);
    expect(mail.text).toContain(
      'https://app.kenova.test/restablecer-contrasena#token=',
    );
    expect(mail.text).not.toContain('evil.example');
    const token = tokenFrom(mail.text);
    const rows = await ctx.db.query(
      `SELECT "tokenHash" FROM password_reset_tokens`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).not.toContain(token);
  });

  it('resets the password once, closes sessions and does not log in', async () => {
    const oldSession = await ctx.login(ctx.storeAdmin.email);
    await requestReset(ctx.storeAdmin.email);
    const token = tokenFrom((await mailbox.waitFor(1))[0].text);

    const res = await confirm(token);
    expect(res.status).toBe(204);
    expect(res.headers['set-cookie']).toBeUndefined();

    expect(
      (await ctx.http().get('/api/auth/me').set('Cookie', oldSession)).status,
    ).toBe(401);
    await expect(ctx.login(ctx.storeAdmin.email)).rejects.toThrow(/401/);
    const cookie = await ctx.login(ctx.storeAdmin.email, NEW_PASSWORD);
    expect(
      (await ctx.http().get('/api/clients').set('Cookie', cookie)).status,
    ).toBe(200);

    const reused = await confirm(token, 'Otra-contraseña-distinta-2');
    expect(reused.status).toBe(400);

    const sent = await mailbox.waitFor(2);
    expect(sent[1].subject).toMatch(/se ha cambiado/);
    expect(sent[1].text).not.toContain(NEW_PASSWORD);

    // Back to the shared password for the other tests.
    await ctx.db.query(
      `UPDATE users SET "passwordHash" = (SELECT "passwordHash" FROM users WHERE id = $1) WHERE id = $2`,
      [ctx.superAdmin.id, ctx.storeAdmin.id],
    );
  });

  it('unlocks an account locked by failed logins', async () => {
    await ctx.db.query(
      `UPDATE users SET "failedLoginCount" = 9, "lockedUntil" = now() + interval '1 hour' WHERE id = $1`,
      [ctx.storeAdmin.id],
    );
    await requestReset(ctx.storeAdmin.email);
    const token = tokenFrom((await mailbox.waitFor(1))[0].text);
    expect((await confirm(token)).status).toBe(204);
    await expect(
      ctx.login(ctx.storeAdmin.email, NEW_PASSWORD),
    ).resolves.toBeTruthy();
    await ctx.db.query(
      `UPDATE users SET "passwordHash" = (SELECT "passwordHash" FROM users WHERE id = $1) WHERE id = $2`,
      [ctx.superAdmin.id, ctx.storeAdmin.id],
    );
  });

  it('rejects expired links, superseded links and unknown tokens', async () => {
    await requestReset(ctx.storeAdmin.email);
    const first = tokenFrom((await mailbox.waitFor(1))[0].text);
    await requestReset(ctx.storeAdmin.email);
    const second = tokenFrom((await mailbox.waitFor(2))[1].text);

    expect((await confirm(first)).status).toBe(400);
    await ctx.db.query(
      `UPDATE password_reset_tokens SET "expiresAt" = now() - interval '1 minute'`,
    );
    expect((await confirm(second)).status).toBe(400);
    expect((await confirm('x'.repeat(43))).status).toBe(400);
    expect((await confirm('corto')).status).toBe(400);
    await expect(ctx.login(ctx.storeAdmin.email)).resolves.toBeTruthy();
  });

  it('enforces the password policy', async () => {
    await requestReset(ctx.storeAdmin.email);
    const token = tokenFrom((await mailbox.waitFor(1))[0].text);
    expect((await confirm(token, 'corta')).status).toBe(400);
    expect((await confirm(token)).status).toBe(204);
    await ctx.db.query(
      `UPDATE users SET "passwordHash" = (SELECT "passwordHash" FROM users WHERE id = $1) WHERE id = $2`,
      [ctx.superAdmin.id, ctx.storeAdmin.id],
    );
  });

  it('sends nothing to deactivated accounts and caps emails per hour', async () => {
    await ctx.db.query(`UPDATE users SET "isActive" = false WHERE id = $1`, [
      ctx.storeAdmin.id,
    ]);
    expect((await requestReset(ctx.storeAdmin.email)).status).toBe(202);
    await ctx.db.query(`UPDATE users SET "isActive" = true WHERE id = $1`, [
      ctx.storeAdmin.id,
    ]);
    await new Promise((r) => setTimeout(r, 100));
    expect(mailbox.sent).toHaveLength(0);

    for (let i = 0; i < 5; i++) await requestReset(ctx.superAdmin.email);
    await new Promise((r) => setTimeout(r, 200));
    expect(mailbox.sent).toHaveLength(3);
  });

  it('records requests and resets in the audit log without tokens', async () => {
    const rows = await ctx.db.query(
      `SELECT action, metadata FROM audit_events WHERE action LIKE 'AUTH_PASSWORD_RESET_%'`,
    );
    expect(rows.map((r: any) => r.action)).toEqual(
      expect.arrayContaining([
        'AUTH_PASSWORD_RESET_REQUESTED',
        'AUTH_PASSWORD_RESET_COMPLETED',
      ]),
    );
    expect(JSON.stringify(rows)).not.toMatch(/token=/);
  });
});

describe('Password reset without email configured', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('is reported as unavailable and creates no links', async () => {
    const res = await ctx.http().get('/api/auth/password-reset/available');
    expect(res.body).toEqual({ available: false });
    const req = await ctx
      .http()
      .post('/api/auth/password-reset/request')
      .set('Origin', ORIGIN)
      .send({ email: ctx.storeAdmin.email });
    expect(req.status).toBe(202);
    const rows = await ctx.db.query(`SELECT 1 FROM password_reset_tokens`);
    expect(rows).toHaveLength(0);
    await expect(
      ctx.login(ctx.storeAdmin.email, PASSWORD),
    ).resolves.toBeTruthy();
  });
});
