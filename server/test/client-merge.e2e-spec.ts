import { ORIGIN, PASSWORD, TestContext, createTestApp } from './utils/harness';

describe('Duplicados de clientes: detectar, descartar y fusionar', () => {
  let t: TestContext;
  let sa: string;
  let vc: string;
  let vcStore: string;

  const post = (cookie: string, url: string, body: object = {}) =>
    t.http().post(url).set('Cookie', cookie).set('Origin', ORIGIN).send(body);
  const get = (cookie: string, url: string) =>
    t.http().get(url).set('Cookie', cookie);
  const intake = async (cookie: string, client: object) => {
    const res = await post(cookie, '/api/service-orders/intake', {
      client,
      device: { type: 'movil', brand: 'Apple', model: 'iPhone 13' },
      order: {
        status: 'en_progreso',
        reportedFaults: ['battery'],
        totalPrice: 59,
      },
    });
    expect(res.status).toBe(201);
    return res.body as { id: string; clientId: string; deviceId: string };
  };
  const flagged = async (cookie: string, id: string) =>
    (
      (await get(cookie, '/api/clients/list')).body as {
        rows: { id: string; duplicate: boolean }[];
      }
    ).rows.find((r) => r.id === id)?.duplicate;

  beforeAll(async () => {
    t = await createTestApp();
    sa = await t.login(t.superAdmin.email);
    vcStore = (
      (
        await post(sa, '/api/stores', {
          name: 'Villarcayo',
          city: 'Villarcayo',
          prefix: 'VC',
        })
      ).body as { id: string }
    ).id;
    await post(sa, '/api/users', {
      username: 'villarcayo',
      fullName: 'Tienda Villarcayo',
      email: 'vc@kenova.test',
      temporaryPassword: PASSWORD,
      storeId: vcStore,
    });
    await t.db.query(
      `UPDATE users SET "mustChangePassword" = false WHERE email = 'vc@kenova.test'`,
    );
    vc = await t.login('vc@kenova.test');
  });
  afterAll(() => t.close());

  it('lists who a client looks like, and forgets a pair marked as different people', async () => {
    const a = await intake(sa, {
      firstName: 'Luis',
      lastName: 'Fernández',
      phoneNumber: '611222333',
    });
    const b = await intake(sa, {
      firstName: 'Luisa',
      phoneNumber: '+34 611 222 333',
    });
    const res = await get(sa, `/api/clients/${a.clientId}/duplicates`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      expect.objectContaining({
        id: b.clientId,
        firstName: 'Luisa',
        orders: 1,
        samePhone: true,
      }),
    ]);

    expect(
      (
        await post(sa, `/api/clients/${a.clientId}/not-duplicate`, {
          otherId: b.clientId,
        })
      ).status,
    ).toBe(204);
    // Saying it twice, or from the other side, is fine.
    expect(
      (
        await post(sa, `/api/clients/${b.clientId}/not-duplicate`, {
          otherId: a.clientId,
        })
      ).status,
    ).toBe(204);
    expect(
      (await get(sa, `/api/clients/${a.clientId}/duplicates`)).body,
    ).toEqual([]);
    expect(await flagged(sa, a.clientId)).toBe(false);
    expect(await flagged(sa, b.clientId)).toBe(false);
  });

  it('merges a duplicate field by field: its orders, devices and quotes move, nothing is lost', async () => {
    const keep = await intake(sa, {
      firstName: 'Lucia',
      lastName: 'Fernandez',
      phoneNumber: '612345678',
    });
    const from = await intake(sa, {
      firstName: 'Lucía',
      lastName: 'Fernández Ortega',
      phoneNumber: '612 345 678',
      dniType: 'NIF',
      dni: '12345678Z',
      email: 'lucia@example.com',
    });
    expect(await flagged(sa, keep.clientId)).toBe(true);

    // Only the partners merge.
    expect(
      (
        await post(vc, `/api/clients/${keep.clientId}/merge`, {
          fromId: from.clientId,
        })
      ).status,
    ).toBe(403);

    const res = await post(sa, `/api/clients/${keep.clientId}/merge`, {
      fromId: from.clientId,
      data: {
        firstName: 'Lucía',
        lastName: 'Fernández Ortega',
        dniType: 'NIF',
        dni: '12345678Z',
        email: 'lucia@example.com',
      },
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: keep.clientId,
      firstName: 'Lucía',
      lastName: 'Fernández Ortega',
      dni: '12345678Z',
      email: 'lucia@example.com',
    });

    const [orders] = await t.db.query<{ n: string }[]>(
      `SELECT count(*) AS n FROM service_orders WHERE "clientId" = $1`,
      [keep.clientId],
    );
    expect(Number(orders.n)).toBe(2);
    const [device] = await t.db.query<{ client_id: string }[]>(
      `SELECT client_id FROM devices WHERE id = $1`,
      [from.deviceId],
    );
    expect(device.client_id).toBe(keep.clientId);
    const [gone] = await t.db.query<
      { mergedIntoId: string; deletedAt: Date | null }[]
    >(`SELECT "mergedIntoId", "deletedAt" FROM client WHERE id = $1`, [
      from.clientId,
    ]);
    expect(gone.mergedIntoId).toBe(keep.clientId);
    expect(gone.deletedAt).not.toBeNull();
    expect((await get(sa, `/api/clients/${from.clientId}`)).status).toBe(404);
    expect(await flagged(sa, keep.clientId)).toBe(false);
  });

  it('refuses merging a client with itself or one the actor cannot see', async () => {
    const one = await intake(sa, {
      firstName: 'Pablo',
      phoneNumber: '611004532',
    });
    expect(
      (
        await post(sa, `/api/clients/${one.clientId}/merge`, {
          fromId: one.clientId,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await post(sa, `/api/clients/${one.clientId}/merge`, {
          fromId: '00000000-0000-4000-8000-000000000000',
        })
      ).status,
    ).toBe(404);
    // A store cannot even look at another store's client.
    expect(
      (await get(vc, `/api/clients/${one.clientId}/duplicates`)).status,
    ).toBe(404);
  });
});
