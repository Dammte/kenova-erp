import { ORIGIN, TestContext, createTestApp } from './utils/harness';
import { DeviceSecretService } from '../src/devices/device-secret.service';

describe('Device unlock codes and patterns', () => {
  let t: TestContext;
  let cookie: string;
  let clientId: string;
  let deviceId: string;

  const post = (url: string, body: object) =>
    t.http().post(url).set('Cookie', cookie).set('Origin', ORIGIN).send(body);

  beforeAll(async () => {
    t = await createTestApp();
    cookie = await t.login(t.storeAdmin.email);
    clientId = (
      await post('/api/clients', { firstName: 'ana', lastName: 'prueba' })
    ).body.id;
  });
  afterAll(() => t.close());

  it('stores the PIN encrypted and never returns it in normal responses', async () => {
    // Same shape the "new order" wizard sends.
    const res = await post('/api/devices', {
      imei: null,
      inventoryCode: '482913',
      type: 'smartphone',
      brand: 'Samsung',
      model: 'Galaxy S21',
      observations: '',
      pattern: '',
      status: 'Pantalla rota',
      code: '482913-PIN',
      clientId,
    });
    expect(res.status).toBe(201);
    deviceId = res.body.id;
    expect(res.body).toMatchObject({ unlockSecretType: 'CODE' });
    expect(JSON.stringify(res.body)).not.toContain('482913-PIN');
    expect(res.body.unlockSecretCiphertext).toBeUndefined();
    expect(res.body.code).toBeUndefined();

    const [row] = await t.db.query(
      `SELECT "unlockSecretCiphertext" c FROM devices WHERE id = $1`,
      [deviceId],
    );
    expect(row.c).toMatch(/^v1:/);
    expect(row.c).not.toContain('482913-PIN');

    const order = await post('/api/service-orders', {
      clientId,
      deviceId,
      totalPrice: 50,
    });
    expect(order.status).toBe(201);

    for (const url of [
      '/api/devices',
      `/api/devices/${deviceId}`,
      `/api/devices/client/${clientId}`,
      '/api/service-orders',
      `/api/service-orders/${order.body.id}`,
      `/api/service-orders/client/${clientId}`,
    ]) {
      const r = await t.http().get(url).set('Cookie', cookie);
      expect(r.status).toBe(200);
      const body = JSON.stringify(r.body);
      expect(body).not.toContain('482913-PIN');
      expect(body).not.toContain('unlockSecretCiphertext');
    }
  });

  it('reveals the value to an authenticated user and audits who did it', async () => {
    const res = await post(`/api/devices/${deviceId}/unlock-secret/reveal`, {});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ type: 'CODE', value: '482913-PIN' });

    const events = await t.db.query(
      `SELECT "actorUserId", ip FROM audit_events WHERE action = 'DEVICE_SECRET_REVEALED' AND "entityId" = $1`,
      [deviceId],
    );
    expect(events).toHaveLength(1);
    expect(events[0].actorUserId).toBe(t.storeAdmin.id);
  });

  it('requires a session to reveal', async () => {
    const res = await t
      .http()
      .post(`/api/devices/${deviceId}/unlock-secret/reveal`)
      .set('Origin', ORIGIN);
    expect(res.status).toBe(401);
  });

  it('an update without code keeps the stored secret; a new pattern replaces it', async () => {
    const keep = await t
      .http()
      .put(`/api/devices/${deviceId}`)
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({
        brand: 'Samsung',
        model: 'Galaxy S21',
        type: 'smartphone',
        imei: '',
        code: '',
        pattern: '',
        observations: 'x',
      });
    expect(keep.status).toBe(200);
    expect(
      (await post(`/api/devices/${deviceId}/unlock-secret/reveal`, {})).body
        .value,
    ).toBe('482913-PIN');

    const replace = await t
      .http()
      .put(`/api/devices/${deviceId}`)
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({ pattern: '1-5-9-8' });
    expect(replace.status).toBe(200);
    expect(replace.body.unlockSecretType).toBe('PATTERN');
    expect(
      (await post(`/api/devices/${deviceId}/unlock-secret/reveal`, {})).body,
    ).toEqual({ type: 'PATTERN', value: '1-5-9-8' });
  });

  it('validates patterns and refuses code and pattern together', async () => {
    const bad = await t
      .http()
      .put(`/api/devices/${deviceId}`)
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({ pattern: '0-1-x' });
    expect(bad.status).toBe(400);
    const both = await t
      .http()
      .put(`/api/devices/${deviceId}`)
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({ pattern: '1-2', code: '11' });
    expect(both.status).toBe(400);
  });

  it('a ciphertext copied to another device cannot be decrypted there', async () => {
    const other = await post('/api/devices', {
      type: 'tablet',
      brand: 'Apple',
      model: 'iPad',
      clientId,
      code: '0000',
    });
    await t.db.query(
      `UPDATE devices SET "unlockSecretCiphertext" = (SELECT "unlockSecretCiphertext" FROM devices WHERE id = $1) WHERE id = $2`,
      [deviceId, other.body.id],
    );
    const res = await post(
      `/api/devices/${other.body.id}/unlock-secret/reveal`,
      {},
    );
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain('1-5-9-8');
  });

  it('can be cleared on demand', async () => {
    const other = await post('/api/devices', {
      type: 'tablet',
      brand: 'Apple',
      model: 'iPad',
      clientId,
      code: '7777',
    });
    const del = await t
      .http()
      .delete(`/api/devices/${other.body.id}/unlock-secret`)
      .set('Cookie', cookie)
      .set('Origin', ORIGIN);
    expect(del.status).toBe(204);
    expect(
      (await post(`/api/devices/${other.body.id}/unlock-secret/reveal`, {}))
        .status,
    ).toBe(404);
  });

  it('purges secrets once every order is delivered or cancelled for longer than the retention period', async () => {
    const d = await post('/api/devices', {
      type: 'movil',
      brand: 'Xiaomi',
      model: 'Redmi',
      clientId,
      code: '2468',
    });
    const o = await post('/api/service-orders', {
      clientId,
      deviceId: d.body.id,
    });
    const purge = t.app.get(DeviceSecretService);

    await t.db.query(
      `UPDATE service_orders SET status = 'entregado', "updatedAt" = now() WHERE id = $1`,
      [o.body.id],
    );
    await purge.purgeExpired();
    expect(
      (await post(`/api/devices/${d.body.id}/unlock-secret/reveal`, {})).status,
    ).toBe(200); // still within 7 days

    await t.db.query(
      `UPDATE service_orders SET "updatedAt" = now() - interval '8 days' WHERE id = $1`,
      [o.body.id],
    );
    expect(await purge.purgeExpired()).toBeGreaterThanOrEqual(1);
    expect(
      (await post(`/api/devices/${d.body.id}/unlock-secret/reveal`, {})).status,
    ).toBe(404);

    // The first device still has an open order: it must be kept.
    expect(
      (await post(`/api/devices/${deviceId}/unlock-secret/reveal`, {})).status,
    ).toBe(200);
    const events = await t.db.query(
      `SELECT 1 FROM audit_events WHERE action = 'DEVICE_SECRET_PURGED' AND "entityId" = $1`,
      [d.body.id],
    );
    expect(events).toHaveLength(1);
  });
});
