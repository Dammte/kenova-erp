import { ORIGIN, PASSWORD, TestContext, createTestApp } from './utils/harness';

interface Template {
  trigger: string;
  name: string;
  body: string;
  isBase: boolean;
  updatedBy: { fullName: string } | null;
}

describe('Message templates (avisos)', () => {
  let t: TestContext;
  let sa: string;
  let vc: string;
  let vcStore: string;
  let otherStore: string;

  const send = (
    method: 'put' | 'post' | 'delete',
    cookie: string,
    url: string,
    body: object = {},
  ) =>
    t
      .http()
      [method](url)
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send(body);
  const list = async (cookie: string, query = '') =>
    (await t.http().get(`/api/message-templates${query}`).set('Cookie', cookie))
      .body as Template[];
  const ready = (rows: Template[]) => rows.find((r) => r.trigger === 'ready')!;

  beforeAll(async () => {
    t = await createTestApp();
    sa = await t.login(t.superAdmin.email);
    const store = async (name: string, prefix: string) =>
      (await send('post', sa, '/api/stores', { name, city: name, prefix })).body
        .id as string;
    vcStore = await store('Villarcayo', 'VC');
    otherStore = await store('Espinosa', 'ES');
    await send('post', sa, '/api/users', {
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

  it('gives every store the five base texts until it changes one', async () => {
    const rows = await list(vc);
    expect(rows.map((r) => [r.trigger, r.name, r.isBase])).toEqual([
      ['received', 'Recibido', true],
      ['waiting_parts', 'Pendiente de piezas', true],
      ['ready', 'Listo para recoger', true],
      ['reminder_15', 'Recordatorio 15 días', true],
      ['reminder_30', 'Recordatorio 30 días', true],
    ]);
    expect(ready(rows).body).toContain('[si saldo]');
    const count = await t.db.query(
      `SELECT count(*)::int AS n FROM message_templates`,
    );
    expect(count[0].n).toBe(0);
  });

  it('saves a store’s own text and restores the base one', async () => {
    const saved = await send('put', vc, '/api/message-templates/ready', {
      body: 'Hola {nombre}, ya puedes pasar por tu {modelo}.',
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({
      isBase: false,
      updatedBy: { fullName: 'Tienda Villarcayo' },
    });
    expect(ready(await list(vc)).body).toBe(
      'Hola {nombre}, ya puedes pasar por tu {modelo}.',
    );
    // The workshop keeps its own base text.
    expect(ready(await list(sa)).isBase).toBe(true);

    const restored = await send('delete', vc, '/api/message-templates/ready');
    expect(restored.status).toBe(200);
    expect(restored.body.isBase).toBe(true);
    expect(ready(await list(vc)).isBase).toBe(true);
  });

  it('refuses an unknown variable with a hint', async () => {
    const res = await send('put', vc, '/api/message-templates/ready', {
      body: 'Te quedan {precio}',
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(
      'La variable {precio} no existe. Usa {saldo} para el importe pendiente.',
    );
    expect(
      (await send('put', vc, '/api/message-templates/factura', { body: 'x' }))
        .status,
    ).toBe(404);
  });

  it('keeps a store to its own templates; partners reach any store', async () => {
    expect(
      (
        await t
          .http()
          .get(`/api/message-templates?storeId=${otherStore}`)
          .set('Cookie', vc)
      ).status,
    ).toBe(404);
    expect(
      (
        await send('put', vc, '/api/message-templates/received', {
          body: 'Hola',
          storeId: otherStore,
        })
      ).status,
    ).toBe(404);
    const res = await send('put', sa, '/api/message-templates/received', {
      body: 'Hola {nombre}, recibido.',
      storeId: otherStore,
    });
    expect(res.status).toBe(200);
    expect(
      (await list(sa, `?storeId=${otherStore}`)).find(
        (r) => r.trigger === 'received',
      )?.body,
    ).toBe('Hola {nombre}, recibido.');
    expect((await list(vc)).find((r) => r.trigger === 'received')?.isBase).toBe(
      true,
    );
  });

  it('lets only a partner copy one text to every store', async () => {
    expect(
      (await send('post', vc, '/api/message-templates/reminder_30/copy-to-all'))
        .status,
    ).toBe(403);
    await send('put', sa, '/api/message-templates/reminder_30', {
      body: 'Hola {nombre}, tu {modelo} sigue en {tienda}.',
    });
    const res = await send(
      'post',
      sa,
      '/api/message-templates/reminder_30/copy-to-all',
    );
    expect(res.status).toBe(200);
    expect(res.body.stores).toBe(2);
    for (const cookie of [vc, sa]) {
      expect(
        (await list(cookie)).find((r) => r.trigger === 'reminder_30')?.body,
      ).toBe('Hola {nombre}, tu {modelo} sigue en {tienda}.');
    }
  });

  describe('notices sent on an order', () => {
    const intake = async (cookie: string) => {
      const res = await send('post', cookie, '/api/service-orders/intake', {
        client: { firstName: 'Aitor', phoneNumber: '688450117' },
        device: { type: 'movil', brand: 'Apple', model: 'iPhone 13' },
        order: { status: 'en_progreso', reportedFaults: ['battery'] },
      });
      expect(res.status).toBe(201);
      return res.body.id as string;
    };
    const notices = (cookie: string, orderId: string) =>
      t
        .http()
        .get(`/api/service-orders/${orderId}/notices`)
        .set('Cookie', cookie);

    it('keeps the exact text, who sent it and when, newest first', async () => {
      const order = await intake(vc);
      const first = await send(
        'post',
        vc,
        `/api/service-orders/${order}/notices`,
        {
          trigger: 'received',
          body: 'Hola Aitor, hemos recibido tu iPhone 13.',
        },
      );
      expect(first.status).toBe(201);
      expect(first.body).toMatchObject({
        name: 'Recibido',
        channel: 'whatsapp',
        sentBy: { fullName: 'Tienda Villarcayo' },
      });
      await send('post', sa, `/api/service-orders/${order}/notices`, {
        trigger: 'ready',
        body: 'Hola Aitor, ya está listo.',
      });
      const res = await notices(vc, order);
      expect(
        (res.body as { name: string; body: string }[]).map((n) => [
          n.name,
          n.body,
        ]),
      ).toEqual([
        ['Listo para recoger', 'Hola Aitor, ya está listo.'],
        ['Recibido', 'Hola Aitor, hemos recibido tu iPhone 13.'],
      ]);
    });

    it('refuses an unknown notice and another store’s order', async () => {
      const order = await intake(sa);
      expect(
        (
          await send('post', sa, `/api/service-orders/${order}/notices`, {
            trigger: 'factura',
            body: 'x',
          })
        ).status,
      ).toBe(400);
      expect((await notices(vc, order)).status).toBe(404);
      expect(
        (
          await send('post', vc, `/api/service-orders/${order}/notices`, {
            trigger: 'ready',
            body: 'x',
          })
        ).status,
      ).toBe(404);
    });
  });

  describe('pickup reminders', () => {
    const finished = async (
      cookie: string,
      firstName: string,
      daysAgo: number,
    ) => {
      const res = await send('post', cookie, '/api/service-orders/intake', {
        client: {
          firstName,
          phoneNumber: '611000' + String(daysAgo).padStart(3, '0'),
        },
        device: { type: 'movil', brand: 'Apple', model: 'iPad 9' },
        order: {
          status: 'en_progreso',
          reportedFaults: ['battery'],
          totalPrice: 80,
        },
      });
      const id = res.body.id as string;
      await t.db.query(
        `UPDATE service_orders SET status = 'finalizado', "finishedAt" = now() - make_interval(days => $2) WHERE id = $1`,
        [id, daysAgo],
      );
      return id;
    };
    const due = async (cookie: string) =>
      (await t.http().get('/api/notices/reminders').set('Cookie', cookie))
        .body as {
        id: string;
        clientName: string;
        days: number;
        trigger: string;
        balance: string;
        storeName: string;
      }[];

    it('lists the 15- and 30-day reminders due, oldest first, until sent', async () => {
      const fresh = await finished(vc, 'Reciente', 5);
      const r15 = await finished(vc, 'Rubén', 16);
      const r30 = await finished(vc, 'Alba', 31);
      const mine = (await due(vc)).filter((r) =>
        [fresh, r15, r30].includes(r.id),
      );
      expect(
        mine.map((r) => [
          r.clientName,
          r.days,
          r.trigger,
          r.balance,
          r.storeName,
        ]),
      ).toEqual([
        ['Alba', 31, 'reminder_30', '80.00', 'Villarcayo'],
        ['Rubén', 16, 'reminder_15', '80.00', 'Villarcayo'],
      ]);
      // The workshop sees them too; another store would not.
      expect((await due(sa)).map((r) => r.id)).toEqual(
        expect.arrayContaining([r15, r30]),
      );

      // A 15-day notice sent before the order was finished does not count.
      await t.db.query(
        `INSERT INTO order_notices ("serviceOrderId", trigger, body, "sentAt") VALUES ($1, 'reminder_15', 'viejo', now() - interval '40 days')`,
        [r15],
      );
      expect((await due(vc)).map((r) => r.id)).toContain(r15);
      await send('post', vc, `/api/service-orders/${r15}/notices`, {
        trigger: 'reminder_15',
        body: 'Hola Rubén',
      });
      expect((await due(vc)).map((r) => r.id)).not.toContain(r15);
    });

    it('keeps each store to its own reminders', async () => {
      const workshop = await finished(sa, 'Taller', 20);
      expect((await due(vc)).map((r) => r.id)).not.toContain(workshop);
      expect((await due(sa)).map((r) => r.id)).toContain(workshop);
    });
  });
});
