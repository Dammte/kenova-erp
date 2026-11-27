import { ORIGIN, TestContext, createTestApp } from './utils/harness';

interface Line {
  kind: string;
  description: string;
  unitPrice: string;
  quantity: number;
  serviceId: string | null;
}

describe('Priced order lines', () => {
  let t: TestContext;
  let cookie: string;
  let clientId: string;
  let screen: string;
  let battery: string;

  const send = (method: 'post' | 'patch', url: string, body: object) =>
    t
      .http()
      [method](url)
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send(body);
  const linesOf = (body: { lines: Line[] }) =>
    body.lines.map((l) => [l.kind, l.description, l.unitPrice]);
  const sum = (lines: Line[]) =>
    lines.reduce((s, l) => s + Number(l.unitPrice) * l.quantity, 0);
  const service = async (name: string, price: number) =>
    (
      await send('post', '/api/services', {
        name,
        description: name,
        price,
        available: true,
      })
    ).body.id as string;

  beforeAll(async () => {
    t = await createTestApp();
    cookie = await t.login(t.superAdmin.email);
    clientId = (await send('post', '/api/clients', { firstName: 'Noa' })).body
      .id;
    screen = await service('Pantalla', 89.9);
    battery = await service('Batería', 45);
  });
  afterAll(() => t.close());

  it('creates one line per service at its price', async () => {
    const res = await send('post', '/api/service-orders', {
      clientId,
      serviceIds: [screen, battery],
    });
    expect(res.status).toBe(201);
    expect(linesOf(res.body)).toEqual([
      ['service', 'Batería', '45.00'],
      ['service', 'Pantalla', '89.90'],
    ]);
    expect(sum(res.body.lines)).toBeCloseTo(Number(res.body.totalPrice));
  });

  it('adds an adjustment line when the agreed total differs', async () => {
    const res = await send('post', '/api/service-orders', {
      clientId,
      serviceIds: [screen],
      totalPrice: 80,
    });
    expect(linesOf(res.body)).toEqual([
      ['service', 'Pantalla', '89.90'],
      ['adjustment', 'Ajuste', '-9.90'],
    ]);

    const none = await send('post', '/api/service-orders', {
      clientId,
      totalPrice: 50,
    });
    expect(linesOf(none.body)).toEqual([['adjustment', 'Ajuste', '50.00']]);

    const empty = await send('post', '/api/service-orders', { clientId });
    expect(empty.body.lines).toEqual([]);
  });

  it('keeps the price an order already had when the catalog changes', async () => {
    const o = (
      await send('post', '/api/service-orders', {
        clientId,
        serviceIds: [battery],
      })
    ).body;
    await send('patch', `/api/services/${battery}`, { price: 60 });

    const res = await send('patch', `/api/service-orders/${o.id}`, {
      totalPrice: 50,
    });
    expect(res.status).toBe(200);
    expect(linesOf(res.body)).toEqual([
      ['service', 'Batería', '45.00'],
      ['adjustment', 'Ajuste', '5.00'],
    ]);
  });

  it('follows the services when they change', async () => {
    const o = (
      await send('post', '/api/service-orders', {
        clientId,
        serviceIds: [screen, battery],
        totalPrice: 100,
      })
    ).body;
    const res = await send('patch', `/api/service-orders/${o.id}`, {
      serviceIds: [screen],
    });
    expect(linesOf(res.body)).toEqual([
      ['service', 'Pantalla', '89.90'],
      ['adjustment', 'Ajuste', '10.10'],
    ]);
    expect(sum(res.body.lines)).toBeCloseTo(100);
  });

  it('keeps the lines written by hand when the total changes', async () => {
    const o = (
      await send('post', '/api/service-orders', {
        clientId,
        lines: [{ description: 'Cambio de batería', unitPrice: 50 }],
      })
    ).body;
    expect(linesOf(o)).toEqual([['service', 'Cambio de batería', '50.00']]);
    const res = await send('patch', `/api/service-orders/${o.id}`, {
      totalPrice: 45,
    });
    expect(linesOf(res.body)).toEqual([
      ['service', 'Cambio de batería', '50.00'],
      ['adjustment', 'Ajuste', '-5.00'],
    ]);
    // Lines are only written at intake; an edit that sends them changes nothing.
    const edit = await send('patch', `/api/service-orders/${o.id}`, {
      lines: [{ description: 'Otra', unitPrice: 1 }],
    });
    expect(linesOf(edit.body)).toEqual(linesOf(res.body));
  });

  it('only an adjustment may be negative', async () => {
    const o = (
      await send('post', '/api/service-orders', {
        clientId,
        serviceIds: [screen],
      })
    ).body;
    await expect(
      t.db.query(
        `UPDATE order_lines SET "unitPrice" = -1 WHERE "orderId" = $1 AND kind = 'service'`,
        [o.id],
      ),
    ).rejects.toThrow(/CHK_order_lines_price_nonnegative/);
  });

  describe('edited on the order page (design R3 3.4)', () => {
    const edit = (id: string, body: object) =>
      send('patch', `/api/service-orders/${id}`, body);
    const updates = async (id: string) =>
      (
        (await t.http().get(`/api/service-orders/${id}`).set('Cookie', cookie))
          .body.serviceHistory as { action: string; description: string }[]
      )
        .filter((h) => h.action === 'updated')
        .map((h) => h.description);

    it('keeps the lines as sent: price, quantity, a line by hand, and the total is their sum', async () => {
      const o = (
        await send('post', '/api/service-orders', {
          clientId,
          serviceIds: [screen],
          totalPrice: 80,
        })
      ).body as { id: string };
      const res = await edit(o.id, {
        editedLines: [
          {
            serviceId: screen,
            description: 'Pantalla',
            unitPrice: 85,
            quantity: 1,
          },
          {
            serviceId: battery,
            description: 'Batería',
            unitPrice: 45,
            quantity: 2,
          },
          { description: 'Funda', unitPrice: 9.5, quantity: 1 },
        ],
      });
      expect(res.status).toBe(200);
      expect(
        (res.body.lines as Line[]).map((l) => [
          l.description,
          l.unitPrice,
          l.quantity,
          l.serviceId,
        ]),
      ).toEqual([
        ['Pantalla', '85.00', 1, screen],
        ['Batería', '45.00', 2, battery],
        ['Funda', '9.50', 1, null],
      ]);
      expect(Number(res.body.totalPrice)).toBe(184.5);
      expect(await updates(o.id)).toEqual([
        'Edición · Servicios: Pantalla 89,90 € → 85,00 € · + Batería × 2 · + Funda · − Ajuste · Total: 80,00 € → 184,50 €',
      ]);

      // A later change elsewhere keeps the quantity.
      const later = await edit(o.id, { totalPrice: 200 });
      const battle = (later.body.lines as Line[]).find(
        (l) => l.description === 'Batería',
      );
      expect(battle?.quantity).toBe(2);
    });

    it('will not go below what was already charged', async () => {
      const o = (
        await send('post', '/api/service-orders', {
          clientId,
          serviceIds: [screen],
          amountPaid: 50,
        })
      ).body as { id: string };
      const res = await edit(o.id, {
        editedLines: [{ description: 'Revisión', unitPrice: 30, quantity: 1 }],
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe(
        'Ya se han cobrado 50,00 €; el total no puede ser menor. Devuelve primero la diferencia.',
      );
    });

    it('refuses the same service twice, a closed order and mixing with totalPrice', async () => {
      const o = (await send('post', '/api/service-orders', { clientId }))
        .body as { id: string };
      const twice = await edit(o.id, {
        editedLines: [
          {
            serviceId: screen,
            description: 'Pantalla',
            unitPrice: 1,
            quantity: 1,
          },
          {
            serviceId: screen,
            description: 'Pantalla',
            unitPrice: 1,
            quantity: 1,
          },
        ],
      });
      expect(twice.body.message).toBe(
        'Un servicio aparece dos veces: usa la cantidad',
      );
      const mixed = await edit(o.id, { editedLines: [], totalPrice: 10 });
      expect(mixed.status).toBe(400);

      await edit(o.id, { status: 'cancelado', cancelReason: 'No viene' });
      const closed = await edit(o.id, {
        editedLines: [{ description: 'Revisión', unitPrice: 10, quantity: 1 }],
      });
      expect(closed.body.message).toBe(
        'La orden está cerrada: sus servicios ya no se cambian',
      );
    });
  });
});
