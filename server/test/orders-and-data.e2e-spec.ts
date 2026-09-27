import { ORIGIN, TestContext, createTestApp } from './utils/harness';

describe('Orders, clients and data integrity', () => {
  let t: TestContext;
  let sa: string;
  let store: string;

  const as = (cookie: string) => ({
    get: (url: string) => t.http().get(url).set('Cookie', cookie),
    post: (url: string, body: object = {}) =>
      t.http().post(url).set('Cookie', cookie).set('Origin', ORIGIN).send(body),
    patch: (url: string, body: object) =>
      t
        .http()
        .patch(url)
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send(body),
    put: (url: string, body: object) =>
      t.http().put(url).set('Cookie', cookie).set('Origin', ORIGIN).send(body),
    del: (url: string) =>
      t.http().delete(url).set('Cookie', cookie).set('Origin', ORIGIN),
  });

  beforeAll(async () => {
    t = await createTestApp();
    sa = await t.login(t.superAdmin.email);
    store = await t.login(t.storeAdmin.email);
  });
  afterAll(() => t.close());

  it('accepts exactly what the "new order" wizard sends (compatibility)', async () => {
    const api = as(store);
    const client = await api.post('/api/clients', {
      dniType: 'NIF',
      dni: null,
      firstName: 'maría',
      lastName: 'de la prueba',
      email: null,
      phoneNumber: '600000000',
      address: '',
      postalCode: '',
      city: '',
      preferredContact: 'PHONE',
      observations: '',
      isActive: true,
    });
    expect(client.status).toBe(201);
    expect(client.body).toMatchObject({
      firstName: 'María',
      lastName: 'De La Prueba',
      dni: null,
    });

    const device = await api.post('/api/devices', {
      imei: null,
      inventoryCode: '123456',
      type: 'smartphone',
      brand: 'Apple',
      model: 'iPhone 12',
      observations: '',
      pattern: '1-2-3',
      status: 'No enciende',
      code: '',
      clientId: client.body.id,
    });
    expect(device.status).toBe(201);

    const order = await api.post('/api/service-orders', {
      clientId: client.body.id,
      deviceId: device.body.id,
      priority: 'medium',
      assignedTo: '',
      status: 'pendiente_cliente',
      totalPrice: 80,
      amountPaid: 20,
      balance: 60,
      serviceIds: [],
      inventoryIds: [],
      paymentStatus: 'pending',
      paymentMethod: 'cash',
      observations: '',
    });
    expect(order.status).toBe(201);
    expect(order.body).toMatchObject({
      paymentStatus: 'paid_partial',
      status: 'pendiente_cliente',
    });
    expect(Number(order.body.balance)).toBe(60);
  });

  it('two clients without DNI no longer collide', async () => {
    const api = as(store);
    expect(
      (
        await api.post('/api/clients', {
          firstName: 'a',
          lastName: 'b',
          dni: '',
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await api.post('/api/clients', {
          firstName: 'c',
          lastName: 'd',
          dni: '',
        })
      ).status,
    ).toBe(201);
    const dup = await api.post('/api/clients', {
      firstName: 'e',
      lastName: 'f',
      dni: '12345678Z',
    });
    expect(dup.status).toBe(201);
    const dup2 = await api.post('/api/clients', {
      firstName: 'g',
      lastName: 'h',
      dni: '12345678z',
    });
    expect(dup2.status).toBe(409);
    expect(JSON.stringify(dup2.body)).not.toMatch(
      /duplicate key|constraint|IDX_/,
    );
  });

  it('ignores fields the client must not control (mass assignment)', async () => {
    const api = as(store);
    const forcedId = '00000000-0000-4000-8000-000000000001';
    const c = await api.post('/api/clients', {
      id: forcedId,
      firstName: 'x',
      lastName: 'y',
      createdAt: '2000-01-01',
      deletedAt: '2000-01-01',
    });
    expect(c.status).toBe(201);
    expect(c.body.id).not.toBe(forcedId);
    expect(new Date(c.body.createdAt).getFullYear()).toBeGreaterThan(2020);
    expect(c.body.deletedAt).toBeNull();

    const o = await api.post('/api/service-orders', {
      clientId: c.body.id,
      totalPrice: 100,
      amountPaid: 0,
      paymentStatus: 'paid',
      balance: 0,
    });
    expect(o.status).toBe(201);
    expect(o.body.paymentStatus).toBe('pending');
    expect(Number(o.body.balance)).toBe(100);

    const p = await api.patch(`/api/service-orders/${o.body.id}`, {
      paymentStatus: 'paid',
      amountPaid: 100,
      balance: 999,
    });
    expect(p.status).toBe(200);
    expect(p.body.paymentStatus).toBe('paid');
    expect(Number(p.body.balance)).toBe(0);
  });

  it('rejects impossible amounts and malformed input with 400', async () => {
    const api = as(store);
    const c = (
      await api.post('/api/clients', { firstName: 'x', lastName: 'y' })
    ).body;
    for (const body of [
      { clientId: c.id, totalPrice: -50 },
      { clientId: c.id, amountPaid: -1 },
      { clientId: c.id, totalPrice: 'diez euros' },
      { clientId: c.id, totalPrice: 10.123 },
      { clientId: c.id, status: 'volando' },
      { clientId: 'no-es-uuid' },
    ]) {
      const res = await api.post('/api/service-orders', body);
      expect({ body, status: res.status }).toEqual({ body, status: 400 });
    }
    expect((await api.get('/api/service-orders/no-es-uuid')).status).toBe(400);
    expect(
      (await api.post('/api/clients', { firstName: '', lastName: 'y' })).status,
    ).toBe(400);
    expect(
      (
        await api.post('/api/clients', {
          firstName: 'x',
          lastName: 'y',
          email: 'no-es-email',
        })
      ).status,
    ).toBe(400);
  });

  it('refuses a device that belongs to another client', async () => {
    const api = as(store);
    const a = (
      await api.post('/api/clients', { firstName: 'a', lastName: 'a' })
    ).body;
    const b = (
      await api.post('/api/clients', { firstName: 'b', lastName: 'b' })
    ).body;
    const d = (
      await api.post('/api/devices', {
        type: 'movil',
        brand: 'X',
        model: 'Y',
        clientId: a.id,
      })
    ).body;
    const res = await api.post('/api/service-orders', {
      clientId: b.id,
      deviceId: d.id,
    });
    expect(res.status).toBe(400);
  });

  it('only SUPER_ADMIN deletes clients, and it never deletes their orders', async () => {
    const c = (
      await as(store).post('/api/clients', {
        firstName: 'borrar',
        lastName: 'me',
      })
    ).body;
    const o = (
      await as(store).post('/api/service-orders', {
        clientId: c.id,
        totalPrice: 30,
      })
    ).body;

    expect((await as(store).del(`/api/clients/${c.id}`)).status).toBe(403);
    expect((await as(sa).del(`/api/clients/${c.id}`)).status).toBe(204);

    expect((await as(store).get(`/api/clients/${c.id}`)).status).toBe(404);
    const order = await as(store).get(`/api/service-orders/${o.id}`);
    expect(order.status).toBe(200);
    expect(order.body.client.id).toBe(c.id); // still readable for the record
    const all = await as(store).get('/api/service-orders');
    expect(all.body.find((x: any) => x.id === o.id)).toBeDefined();
    const [row] = await t.db.query(
      `SELECT "deletedAt" FROM client WHERE id = $1`,
      [c.id],
    );
    expect(row.deletedAt).not.toBeNull();
  });

  it('only SUPER_ADMIN deletes orders, and deletion is a soft delete', async () => {
    const c = (
      await as(store).post('/api/clients', { firstName: 'o', lastName: 'o' })
    ).body;
    const o = (await as(store).post('/api/service-orders', { clientId: c.id }))
      .body;
    expect((await as(store).del(`/api/service-orders/${o.id}`)).status).toBe(
      403,
    );
    expect((await as(sa).del(`/api/service-orders/${o.id}`)).status).toBe(204);
    expect((await as(store).get(`/api/service-orders/${o.id}`)).status).toBe(
      404,
    );
    const [row] = await t.db.query(
      `SELECT "deletedAt" FROM service_orders WHERE id = $1`,
      [o.id],
    );
    expect(row.deletedAt).not.toBeNull();
  });

  it('history records who did it and cannot be edited or deleted', async () => {
    const c = (
      await as(store).post('/api/clients', { firstName: 'h', lastName: 'h' })
    ).body;
    const o = (await as(store).post('/api/service-orders', { clientId: c.id }))
      .body;
    const h = await as(store).post('/api/service-history', {
      serviceOrderId: o.id,
      action: 'Finalización',
      description: 'Pantalla cambiada',
      performedById: t.superAdmin.id,
    });
    expect(h.status).toBe(201);
    expect(h.body.performedBy).toEqual({
      id: t.storeAdmin.id,
      fullName: 'Usuario STORE_ADMIN',
      username: 'tienda',
    });

    expect(
      (
        await as(sa).patch(`/api/service-history/${h.body.id}`, {
          description: 'otra cosa',
        })
      ).status,
    ).toBe(404);
    expect((await as(sa).del(`/api/service-history/${h.body.id}`)).status).toBe(
      404,
    );

    await as(store).patch(`/api/service-orders/${o.id}`, {
      status: 'en_progreso',
    });
    const list = await as(store).get(`/api/service-history/order/${o.id}`);
    const change = list.body.find((e: any) => e.action === 'cambio_estado');
    expect(change.performedBy.id).toBe(t.storeAdmin.id);
    expect(JSON.stringify(list.body)).not.toMatch(/email|role|passwordHash/);
  });

  it('does not leak SQL or stack traces in errors', async () => {
    const res = await as(store).patch(
      '/api/clients/00000000-0000-4000-8000-000000000000',
      { firstName: 'x' },
    );
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toMatch(
      /SELECT|QueryFailed|at .*\.ts/,
    );
  });
});
