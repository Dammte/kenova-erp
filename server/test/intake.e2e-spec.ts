import { ORIGIN, TestContext, createTestApp } from './utils/harness';

describe('One-screen intake (POST /service-orders/intake)', () => {
  let t: TestContext;
  let cookie: string;

  const post = (url: string, body: object) =>
    t.http().post(url).set('Cookie', cookie).set('Origin', ORIGIN).send(body);
  interface IntakeBody {
    balance: string;
    paymentStatus: string;
    client: { id: string };
    device: { id: string };
  }
  const intake = async (body: object) => {
    const res = await post('/api/service-orders/intake', body);
    return { status: res.status, body: res.body as IntakeBody };
  };
  const count = async (table: string) =>
    Number((await t.db.query(`SELECT count(*)::int AS n FROM ${table}`))[0].n);

  beforeAll(async () => {
    t = await createTestApp();
    cookie = await t.login(t.storeAdmin.email);
  });
  afterAll(() => t.close());

  const newClient = {
    firstName: 'lucía',
    lastName: 'de prueba',
    phoneNumber: '600111222',
  };
  const newDevice = {
    type: 'movil',
    brand: 'Apple',
    model: 'iPhone 13',
    status: 'broken_screen',
    code: '4321',
  };

  it('creates client, device and order in one call', async () => {
    const res = await intake({
      client: newClient,
      device: newDevice,
      order: { totalPrice: 120, amountPaid: 20, paymentMethod: 'card' },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      totalPrice: expect.anything(),
      paymentStatus: 'paid_partial',
      client: { firstName: 'Lucía', lastName: 'De Prueba' },
      device: { model: 'iPhone 13', status: 'broken_screen' },
    });
    expect(Number(res.body.balance)).toBe(100);
    // The PIN is stored encrypted and never returned.
    expect(JSON.stringify(res.body)).not.toContain('4321');
    const reveal = await post(
      `/api/devices/${res.body.device.id}/unlock-secret/reveal`,
      {},
    );
    expect(reveal.body).toMatchObject({ type: 'CODE', value: '4321' });
  });

  it('stores an unlock pattern encrypted, like the PIN', async () => {
    const res = await intake({
      client: { ...newClient, phoneNumber: '600555666' },
      device: { ...newDevice, code: undefined, pattern: '1-5-9-6' },
      order: {},
    });
    expect(res.status).toBe(201);
    expect(JSON.stringify(res.body)).not.toContain('1-5-9-6');
    const reveal = await post(
      `/api/devices/${res.body.device.id}/unlock-secret/reveal`,
      {},
    );
    expect(reveal.body).toMatchObject({ type: 'PATTERN', value: '1-5-9-6' });
  });

  it('reuses an existing client and device', async () => {
    const first = await intake({
      client: { ...newClient, phoneNumber: '600333444' },
      device: newDevice,
      order: {},
    });
    const [clients, devices] = [await count('client'), await count('devices')];

    const res = await intake({
      clientId: first.body.client.id,
      deviceId: first.body.device.id,
      order: { observations: 'Vuelve por la batería' },
    });
    expect(res.status).toBe(201);
    expect(res.body.client.id).toBe(first.body.client.id);
    expect(res.body.device.id).toBe(first.body.device.id);
    expect(await count('client')).toBe(clients);
    expect(await count('devices')).toBe(devices);
  });

  it('rolls everything back when the order fails', async () => {
    const [clients, devices, orders] = [
      await count('client'),
      await count('devices'),
      await count('service_orders'),
    ];
    const res = await intake({
      client: { ...newClient, phoneNumber: '600555666' },
      device: newDevice,
      // Unknown service: the order step fails after client and device exist.
      order: { serviceIds: ['00000000-0000-4000-8000-000000000000'] },
    });
    expect(res.status).toBe(404);
    expect(await count('client')).toBe(clients);
    expect(await count('devices')).toBe(devices);
    expect(await count('service_orders')).toBe(orders);
  });

  it('rejects a device that belongs to another client', async () => {
    const a = await intake({
      client: { ...newClient, phoneNumber: '600777888' },
      device: newDevice,
      order: {},
    });
    const b = await intake({
      client: { ...newClient, phoneNumber: '600999000' },
      device: newDevice,
      order: {},
    });
    const res = await intake({
      clientId: a.body.client.id,
      deviceId: b.body.device.id,
      order: {},
    });
    expect(res.status).toBe(400);
  });

  it('validates the nested data', async () => {
    const missing = await intake({ order: {} });
    expect(missing.status).toBe(400);

    const badDevice = await intake({
      client: newClient,
      device: { ...newDevice, model: '' },
      order: {},
    });
    expect(badDevice.status).toBe(400);

    // paymentStatus is derived by the server, never accepted.
    const forged = await intake({
      client: { ...newClient, phoneNumber: '611000000' },
      device: newDevice,
      order: { totalPrice: 50, paymentStatus: 'paid' },
    });
    expect(forged.status).toBe(201);
    expect(forged.body.paymentStatus).toBe('pending');
  });
});
