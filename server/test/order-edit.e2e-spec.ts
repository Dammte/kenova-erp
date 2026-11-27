import { ORIGIN, TestContext, createTestApp } from './utils/harness';

describe('Order edits: history and conflicts (design R3 B5)', () => {
  let t: TestContext;
  let cookie: string;
  let clientId: string;

  const send = (
    method: 'post' | 'patch' | 'get',
    url: string,
    body?: object,
  ) => {
    const req = t
      .http()
      [method](url)
      .set('Cookie', cookie)
      .set('Origin', ORIGIN);
    return body ? req.send(body) : req;
  };
  const newOrder = async () =>
    (
      await send('post', '/api/service-orders', {
        clientId,
        priority: 'medium',
        reportedFaults: ['battery'],
      })
    ).body as { id: string; updatedAt: string };
  const history = async (id: string) =>
    (
      (await send('get', `/api/service-orders/${id}`)).body.serviceHistory as {
        action: string;
        description: string;
      }[]
    )
      .filter((h) => h.action === 'updated')
      .map((h) => h.description);

  beforeAll(async () => {
    t = await createTestApp();
    cookie = await t.login(t.storeAdmin.email);
    clientId = (await send('post', '/api/clients', { firstName: 'Eva' })).body
      .id;
  });
  afterAll(() => t.close());

  it('leaves each edit in the history, with the old and new value', async () => {
    const o = await newOrder();
    const res = await send('patch', `/api/service-orders/${o.id}`, {
      priority: 'high',
      reportedFaults: ['battery', 'broken_screen'],
      accessories: 'Funda',
      faultNotes: null,
    });
    expect(res.status).toBe(200);
    expect(await history(o.id)).toEqual([
      'Edición · Prioridad: Media → Alta · Avería: Batería → Batería, Pantalla · Accesorios: vacío → Funda',
    ]);
  });

  it('records nothing when nothing changed', async () => {
    const o = await newOrder();
    await send('patch', `/api/service-orders/${o.id}`, {
      priority: 'medium',
      reportedFaults: ['battery'],
    });
    await send('patch', `/api/service-orders/${o.id}`, {
      status: 'en_progreso',
    });
    expect(await history(o.id)).toEqual([]);
  });

  it('refuses an edit made on an outdated copy, so nobody overwrites another change', async () => {
    const o = await newOrder();
    const first = await send('patch', `/api/service-orders/${o.id}`, {
      priority: 'urgent',
      expectedUpdatedAt: o.updatedAt,
    });
    expect(first.status).toBe(200);

    // Someone else, still looking at the order as it was loaded.
    const stale = await send('patch', `/api/service-orders/${o.id}`, {
      priority: 'low',
      expectedUpdatedAt: o.updatedAt,
    });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('ORDER_CHANGED');
    expect(
      (await send('get', `/api/service-orders/${o.id}`)).body.priority,
    ).toBe('urgent');

    // After reloading, with the current version, it goes through.
    const fresh = await send('patch', `/api/service-orders/${o.id}`, {
      priority: 'low',
      expectedUpdatedAt: first.body.updatedAt,
    });
    expect(fresh.status).toBe(200);
  });

  describe('the device, edited on the order page', () => {
    let serial = 0;
    // Each device its own IMEI: an IMEI with an open order is refused.
    const withDevice = async (secret: object = {}) => {
      serial += 1;
      const device = (
        await send('post', '/api/devices', {
          clientId,
          type: 'movil',
          brand: 'Apple',
          model: 'iPhone 13',
          imei: `35678910452133${serial}`,
          ...secret,
        })
      ).body as { id: string };
      const order = (
        await send('post', '/api/service-orders', {
          clientId,
          deviceId: device.id,
        })
      ).body as { id: string };
      return { deviceId: device.id, orderId: order.id };
    };
    const reveal = (deviceId: string) =>
      send('post', `/api/devices/${deviceId}/unlock-secret/reveal`, {});

    it('changes what was sent and leaves it in the order history, never the secret', async () => {
      const { deviceId, orderId } = await withDevice({ code: '1234' });
      const res = await send('patch', `/api/service-orders/${orderId}`, {
        editedDevice: {
          model: 'iPhone 13 Pro',
          imei: ' 3567-8910 4521 399 ',
          pattern: '1-5-9-6',
        },
      });
      expect(res.status).toBe(200);
      expect(res.body.device).toMatchObject({
        brand: 'Apple',
        model: 'iPhone 13 Pro',
        imei: '356789104521399',
        unlockSecretType: 'PATTERN',
      });
      expect((await reveal(deviceId)).body.value).toBe('1-5-9-6');
      const lines = await history(orderId);
      expect(lines).toEqual([
        'Edición · Equipo: Modelo: iPhone 13 → iPhone 13 Pro · IMEI: 356789104521331 → 356789104521399 · Desbloqueo: patrón nuevo',
      ]);
      expect(lines.join()).not.toContain('1234');
    });

    it('removes the unlock secret, and records nothing when nothing changed', async () => {
      const { deviceId, orderId } = await withDevice({ code: '1234' });
      await send('patch', `/api/service-orders/${orderId}`, {
        editedDevice: { brand: 'Apple', clearSecret: true },
      });
      expect((await reveal(deviceId)).status).toBe(404);
      await send('patch', `/api/service-orders/${orderId}`, {
        editedDevice: { model: 'iPhone 13', clearSecret: true },
      });
      expect(await history(orderId)).toEqual([
        'Edición · Equipo: Desbloqueo: quitado',
      ]);
    });

    it('refuses an order without a device, a new and a removed secret at once, an IMEI already taken and a bad pattern', async () => {
      const bare = await newOrder();
      const none = await send('patch', `/api/service-orders/${bare.id}`, {
        editedDevice: { model: 'X' },
      });
      expect(none.body.message).toBe('La orden no tiene equipo');

      const { orderId } = await withDevice();
      const both = await send('patch', `/api/service-orders/${orderId}`, {
        editedDevice: { code: '0000', clearSecret: true },
      });
      expect(both.body.message).toBe(
        'Indica un código nuevo o quita el que hay, no las dos cosas',
      );
      const taken = await send('patch', `/api/service-orders/${orderId}`, {
        editedDevice: { imei: '356789104521399' },
      });
      expect(taken.status).toBe(400);
      expect(taken.body.message).toMatch(/^Ese IMEI ya es de otro equipo/);
      const bad = await send('patch', `/api/service-orders/${orderId}`, {
        editedDevice: { pattern: '0-0' },
      });
      expect(bad.status).toBe(400);
    });
  });
});
