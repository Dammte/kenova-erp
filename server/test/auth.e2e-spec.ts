import {
  ORIGIN,
  PASSWORD,
  TestContext,
  createTestApp,
  createUser,
} from './utils/harness';

describe('Authentication and sessions', () => {
  let t: TestContext;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('protects every route except login and health (deny by default)', async () => {
    const router =
      t.app.getHttpAdapter().getInstance()._router ??
      t.app.getHttpAdapter().getInstance().router;
    const routes: { method: string; path: string }[] = [];
    for (const layer of router.stack) {
      if (!layer.route) continue;
      for (const method of Object.keys(layer.route.methods)) {
        routes.push({ method, path: layer.route.path });
      }
    }
    expect(routes.length).toBeGreaterThan(50);

    const publicRoutes = new Set(['post /api/auth/login', 'get /api/health']);
    const uuid = '00000000-0000-4000-8000-000000000000';
    for (const r of routes) {
      const key = `${r.method} ${r.path}`;
      const url = r.path.replace(/:[a-zA-Z]+/g, (p) =>
        p === ':id' && r.path.includes('sticky-notes') ? '1' : uuid,
      );
      const res = await (t.http() as any)
        [r.method](url)
        .set('Origin', ORIGIN)
        .send({});
      if (publicRoutes.has(key)) {
        expect([200, 400, 401]).toContain(res.status);
      } else {
        expect({ key, status: res.status }).toEqual({ key, status: 401 });
      }
    }
  });

  it('health is public and reveals nothing', async () => {
    const res = await t.http().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('rejects wrong password and unknown email with the same answer', async () => {
    const a = await t
      .http()
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .send({ email: t.storeAdmin.email, password: 'nope' });
    const b = await t
      .http()
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .send({ email: 'nadie@kenova.test', password: 'nope' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.message).toBe(b.body.message);
    expect(a.headers['set-cookie']).toBeUndefined();
  });

  it('logs in with an HttpOnly SameSite cookie and never returns the hash', async () => {
    const res = await t
      .http()
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .send({ email: 'SA@Kenova.test ', password: PASSWORD });
    expect(res.status).toBe(200);
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0];
    expect(cookie).toMatch(/^sid=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//);
    expect(JSON.stringify(res.body)).not.toMatch(
      /passwordHash|"password"|\$argon2/,
    );
    expect(res.body.user).toMatchObject({
      email: 'sa@kenova.test',
      role: 'SUPER_ADMIN',
    });

    const [session] = await t.db.query(
      `SELECT "tokenHash" FROM sessions WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
      [t.superAdmin.id],
    );
    const token = cookie.split(';')[0].split('=')[1];
    expect(session.tokenHash).not.toBe(token); // only the SHA-256 is stored
    expect(session.tokenHash).toHaveLength(64);
  });

  it('stores passwords as Argon2id', async () => {
    const [u] = await t.db.query(
      `SELECT "passwordHash" FROM users WHERE id = $1`,
      [t.superAdmin.id],
    );
    expect(u.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it('me works with the cookie and logout revokes the session server-side', async () => {
    const cookie = await t.login(t.storeAdmin.email);
    const me = await t.http().get('/api/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(200);
    expect(me.body.user.role).toBe('STORE_ADMIN');

    const out = await t
      .http()
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN);
    expect(out.status).toBe(204);
    const after = await t.http().get('/api/auth/me').set('Cookie', cookie);
    expect(after.status).toBe(401);
  });

  it('rejects forged or garbage cookies', async () => {
    for (const cookie of ['sid=abc', 'sid=' + 'x'.repeat(500), 'sid=']) {
      const res = await t.http().get('/api/clients').set('Cookie', cookie);
      expect(res.status).toBe(401);
    }
  });

  it('expires idle sessions', async () => {
    const cookie = await t.login(t.storeAdmin.email);
    await t.db.query(
      `UPDATE sessions SET "lastSeenAt" = now() - interval '13 hours' WHERE "userId" = $1`,
      [t.storeAdmin.id],
    );
    const res = await t.http().get('/api/clients').set('Cookie', cookie);
    expect(res.status).toBe(401);
  });

  it('expires sessions at the absolute limit', async () => {
    const cookie = await t.login(t.storeAdmin.email);
    await t.db.query(
      `UPDATE sessions SET "expiresAt" = now() - interval '1 second' WHERE "userId" = $1 AND "revokedAt" IS NULL`,
      [t.storeAdmin.id],
    );
    expect(
      (await t.http().get('/api/clients').set('Cookie', cookie)).status,
    ).toBe(401);
  });

  it('locks the account after 5 failures, even with the right password afterwards', async () => {
    const victim = await createUser(t.db, {
      email: 'lock@kenova.test',
      role: 'STORE_ADMIN',
    });
    for (let i = 0; i < 5; i++) {
      await t
        .http()
        .post('/api/auth/login')
        .set('Origin', ORIGIN)
        .send({ email: victim.email, password: 'bad' });
    }
    const res = await t
      .http()
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .send({ email: victim.email, password: PASSWORD });
    expect(res.status).toBe(401);
    const events = await t.db.query(
      `SELECT action FROM audit_events WHERE "entityId" = $1`,
      [victim.id],
    );
    expect(events.map((e: any) => e.action)).toEqual(
      expect.arrayContaining(['AUTH_LOGIN_FAILED', 'AUTH_LOGIN_LOCKED']),
    );
  });

  it('disabled accounts cannot log in and lose their sessions', async () => {
    const u = await createUser(t.db, {
      email: 'off@kenova.test',
      role: 'STORE_ADMIN',
    });
    const cookie = await t.login(u.email);
    await t.db.query(`UPDATE users SET "isActive" = false WHERE id = $1`, [
      u.id,
    ]);
    expect(
      (await t.http().get('/api/clients').set('Cookie', cookie)).status,
    ).toBe(401);
    const res = await t
      .http()
      .post('/api/auth/login')
      .set('Origin', ORIGIN)
      .send({ email: u.email, password: PASSWORD });
    expect(res.status).toBe(401);
  });

  it('forces a temporary password to be changed and signs out other devices', async () => {
    const u = await createUser(t.db, {
      email: 'temp@kenova.test',
      role: 'STORE_ADMIN',
      mustChangePassword: true,
    });
    const phone = await t.login(u.email);
    const laptop = await t.login(u.email);

    expect(
      (await t.http().get('/api/clients').set('Cookie', laptop)).status,
    ).toBe(403);
    expect(
      (await t.http().get('/api/auth/me').set('Cookie', laptop)).body.user
        .mustChangePassword,
    ).toBe(true);

    const short = await t
      .http()
      .post('/api/auth/change-password')
      .set('Cookie', laptop)
      .set('Origin', ORIGIN)
      .send({ currentPassword: PASSWORD, newPassword: 'corta' });
    expect(short.status).toBe(400);

    const wrong = await t
      .http()
      .post('/api/auth/change-password')
      .set('Cookie', laptop)
      .set('Origin', ORIGIN)
      .send({
        currentPassword: 'mal',
        newPassword: 'Una-contraseña-nueva-larga',
      });
    expect(wrong.status).toBe(401);

    const ok = await t
      .http()
      .post('/api/auth/change-password')
      .set('Cookie', laptop)
      .set('Origin', ORIGIN)
      .send({
        currentPassword: PASSWORD,
        newPassword: 'Una-contraseña-nueva-larga',
      });
    expect(ok.status).toBe(204);

    expect(
      (await t.http().get('/api/clients').set('Cookie', laptop)).status,
    ).toBe(200);
    expect(
      (await t.http().get('/api/clients').set('Cookie', phone)).status,
    ).toBe(401);
    await t.login(u.email, 'Una-contraseña-nueva-larga');
  });

  it('blocks state-changing requests from other origins (CSRF defence)', async () => {
    const cookie = await t.login(t.superAdmin.email);
    const evil = await t
      .http()
      .post('/api/clients')
      .set('Cookie', cookie)
      .set('Origin', 'https://evil.example')
      .send({ firstName: 'X', lastName: 'Y' });
    expect(evil.status).toBe(403);
    const nullOrigin = await t
      .http()
      .post('/api/clients')
      .set('Cookie', cookie)
      .set('Origin', 'null')
      .send({ firstName: 'X', lastName: 'Y' });
    expect(nullOrigin.status).toBe(403);
    const ok = await t
      .http()
      .post('/api/clients')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({ firstName: 'X', lastName: 'Y' });
    expect(ok.status).toBe(201);
  });

  it('sends security headers and hides the framework', async () => {
    const res = await t.http().get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
  });

  it('rate-limits login attempts per IP', async () => {
    process.env.THROTTLE_DISABLED = 'false';
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 12; i++) {
        const res = await t
          .http()
          .post('/api/auth/login')
          .set('Origin', ORIGIN)
          .set('X-Forwarded-For', '203.0.113.9')
          .send({ email: 'nadie@kenova.test', password: 'x' });
        statuses.push(res.status);
      }
      expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
      expect(statuses.slice(10)).toEqual([429, 429]);
    } finally {
      process.env.THROTTLE_DISABLED = 'true';
    }
  });
});
