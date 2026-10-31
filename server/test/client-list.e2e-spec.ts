import { ORIGIN, PASSWORD, TestContext, createTestApp } from './utils/harness';

interface Row {
  id: string;
  firstName: string;
  orders: number;
  lastVisit: string | null;
  balance: string;
  duplicate: boolean;
}
interface Page {
  total: number;
  page: number;
  pageSize: number;
  rows: Row[];
}

describe('Lista de clientes (GET /api/clients/list)', () => {
  let t: TestContext;
  let sa: string;
  let vc: string;
  let vcStore: string;

  const post = (cookie: string, url: string, body: object) =>
    t.http().post(url).set('Cookie', cookie).set('Origin', ORIGIN).send(body);
  const list = async (cookie: string, query = '') => {
    const res = await t
      .http()
      .get(`/api/clients/list${query}`)
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    return res.body as Page;
  };
  const intake = async (
    cookie: string,
    client: object,
    order: object = {},
  ): Promise<{ id: string; clientId: string }> => {
    const res = await post(cookie, '/api/service-orders/intake', {
      client,
      device: { type: 'movil', brand: 'Apple', model: 'iPhone 13' },
      order: {
        status: 'en_progreso',
        reportedFaults: ['battery'],
        totalPrice: 100,
        ...order,
      },
    });
    expect(res.status).toBe(201);
    return res.body as { id: string; clientId: string };
  };

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

  it('counts the orders, the last visit and what is owed', async () => {
    const lucia = {
      firstName: 'Lucía',
      lastName: 'Fernández',
      phoneNumber: '612 345 678',
    };
    const first = await intake(sa, lucia, {
      amountPaid: 10,
      paymentMethod: 'cash',
    });
    await post(sa, '/api/service-orders/intake', {
      clientId: first.clientId,
      device: { type: 'movil', brand: 'Apple', model: 'iPad 9' },
      order: {
        status: 'en_progreso',
        reportedFaults: ['battery'],
        totalPrice: 100,
      },
    });
    await t.db.query(
      `UPDATE service_orders SET "createdAt" = '2026-10-29 10:00+01' WHERE "clientId" = $1`,
      [first.clientId],
    );
    const { rows, total, pageSize } = await list(sa);
    expect(pageSize).toBe(50);
    expect(total).toBeGreaterThanOrEqual(1);
    expect(rows.find((r) => r.id === first.clientId)).toMatchObject({
      firstName: 'Lucía',
      orders: 2,
      lastVisit: '2026-10-29',
      balance: '190.00',
      duplicate: false,
    });
  });

  it('flags two clients with the same phone or the same document', async () => {
    const a = await intake(sa, {
      firstName: 'Lucia',
      phoneNumber: '+34 612345678',
    });
    const b = await intake(sa, {
      firstName: 'Iván',
      phoneNumber: '645908221',
      dniType: 'NIF',
      dni: '12345678Z',
    });
    const c = await intake(sa, {
      firstName: 'Ivan',
      phoneNumber: '699000111',
    });
    // Older data may hold the same document written another way.
    await t.db.query(`UPDATE client SET dni = '12345678-z' WHERE id = $1`, [
      c.clientId,
    ]);
    const { rows } = await list(sa);
    const flag = (id: string) => rows.find((r) => r.id === id)?.duplicate;
    expect(flag(a.clientId)).toBe(true);
    expect(flag(b.clientId)).toBe(true);
    expect(flag(c.clientId)).toBe(true);
  });

  it('searches by name, phone digits or document', async () => {
    expect(
      (await list(sa, '?q=lucía fern')).rows.map((r) => r.firstName),
    ).toEqual(['Lucía']);
    expect((await list(sa, '?q=645 908')).rows.map((r) => r.firstName)).toEqual(
      ['Iván'],
    );
    expect(
      (await list(sa, '?q=12345678Z')).rows.map((r) => r.firstName),
    ).toEqual(['Iván']);
  });

  it('keeps a store to its own clients, orders and duplicates', async () => {
    const own = await intake(vc, {
      firstName: 'Marta',
      phoneNumber: '612345678',
    });
    const { rows, total } = await list(vc);
    expect(total).toBe(1);
    // Lucía has the same phone but is not a Villarcayo client.
    expect(rows[0]).toMatchObject({
      id: own.clientId,
      orders: 1,
      duplicate: false,
    });
    expect(
      (await list(sa)).rows.find((r) => r.id === own.clientId)?.duplicate,
    ).toBe(true);
  });

  it('lists archived clients apart and pages by 50', async () => {
    const { clientId } = await intake(sa, {
      firstName: 'Archivada',
      phoneNumber: '600000999',
    });
    await t.db.query(`UPDATE client SET "isActive" = false WHERE id = $1`, [
      clientId,
    ]);
    expect((await list(sa)).rows.some((r) => r.id === clientId)).toBe(false);
    expect((await list(sa, '?archived=true')).rows.map((r) => r.id)).toEqual([
      clientId,
    ]);
    expect((await list(sa, '?page=2')).rows).toEqual([]);
    expect(
      (await t.http().get('/api/clients/list?page=0').set('Cookie', sa)).status,
    ).toBe(400);
  });

  describe('ficha (GET /api/clients/:id/summary)', () => {
    interface Summary {
      stats: Record<string, string | number | null>;
      devices: { model: string; imei: string | null; orders: number }[];
      history: {
        total: number;
        rows: {
          code: string;
          model: string;
          faults: string[];
          status: string;
          totalPrice: string;
        }[];
      };
    }
    const summary = async (cookie: string, id: string) => {
      const res = await t
        .http()
        .get(`/api/clients/${id}/summary`)
        .set('Cookie', cookie);
      expect(res.status).toBe(200);
      return res.body as Summary;
    };

    it('adds up what the client paid and owes, their devices and last orders', async () => {
      const first = await intake(
        sa,
        { firstName: 'Nerea', phoneNumber: '622731004' },
        {
          amountPaid: 40,
          paymentMethod: 'card',
        },
      );
      const second = await post(sa, '/api/service-orders/intake', {
        clientId: first.clientId,
        device: {
          type: 'tablet',
          brand: 'Apple',
          model: 'iPad 9',
          imei: '356789012345678',
        },
        order: {
          status: 'en_progreso',
          reportedFaults: ['broken_screen'],
          totalPrice: 79,
        },
      });
      expect(second.status).toBe(201);
      await t.db.query(
        `UPDATE service_orders SET status = 'entregado' WHERE id = $1`,
        [first.id],
      );

      const s = await summary(sa, first.clientId);
      expect(s.stats).toMatchObject({
        orders: 2,
        spent: '40.00',
        balance: '139.00',
        open: 1,
      });
      // Newest device first when both have one order.
      expect(s.devices.map((d) => [d.model, d.orders])).toEqual([
        ['iPad 9', 1],
        ['iPhone 13', 1],
      ]);
      expect(s.history.total).toBe(2);
      expect(s.history.rows[0]).toMatchObject({
        model: 'iPad 9',
        faults: ['broken_screen'],
        status: 'en_progreso',
        totalPrice: '79.00',
      });
    });

    it("hides another store's client and counts only the store's own orders", async () => {
      const theirs = await intake(sa, {
        firstName: 'Pablo',
        phoneNumber: '611004532',
      });
      expect(
        (
          await t
            .http()
            .get(`/api/clients/${theirs.clientId}/summary`)
            .set('Cookie', vc)
        ).status,
      ).toBe(404);

      const shared = await intake(vc, {
        firstName: 'Jon',
        phoneNumber: '688450117',
      });
      await post(sa, '/api/service-orders/intake', {
        clientId: shared.clientId,
        device: { type: 'movil', brand: 'Apple', model: 'iPhone 11' },
        order: {
          status: 'en_progreso',
          reportedFaults: ['battery'],
          totalPrice: 50,
        },
      });
      expect((await summary(vc, shared.clientId)).stats.orders).toBe(1);
      expect((await summary(sa, shared.clientId)).stats.orders).toBe(2);
    });
  });
});
