import { ORIGIN, PASSWORD, TestContext, createTestApp } from './utils/harness';

interface Line {
  description: string;
  quality: string | null;
  unitPrice: string;
}
interface Quote {
  id: string;
  code: string;
  status: string;
  total: string;
  validUntil: string;
  sentAt: string | null;
  lines: Line[];
  createdBy: { fullName: string } | null;
}

describe('Quotes (presupuestos)', () => {
  let t: TestContext;
  let sa: string;
  let vc: string;
  let battery: string;

  const send = (
    method: 'post' | 'patch' | 'delete',
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
  const get = (cookie: string, url: string) =>
    t.http().get(url).set('Cookie', cookie);
  const AITOR = {
    clientName: 'Aitor Etxeberria',
    clientPhone: '688 450 117',
    brand: 'Apple',
    model: 'MacBook Air M1',
    fault: 'Daño por líquido',
  };
  const create = async (cookie: string, body: object = {}) => {
    const res = await send('post', cookie, '/api/quotes', {
      ...AITOR,
      lines: [
        { description: 'Reparación de placa base', unitPrice: 380 },
        { description: 'Limpieza por líquido', unitPrice: 35.5 },
      ],
      ...body,
    });
    expect(res.status).toBe(201);
    return res.body as Quote;
  };
  const expire = (id: string) =>
    t.db.query(
      `UPDATE quotes SET "validUntil" = current_date - 1 WHERE id = $1`,
      [id],
    );

  beforeAll(async () => {
    t = await createTestApp();
    sa = await t.login(t.superAdmin.email);
    const store = (
      await send('post', sa, '/api/stores', {
        name: 'Villarcayo',
        city: 'Villarcayo',
        prefix: 'VC',
      })
    ).body;
    await send('post', sa, '/api/users', {
      username: 'villarcayo',
      fullName: 'Tienda Villarcayo',
      email: 'vc@kenova.test',
      temporaryPassword: PASSWORD,
      storeId: store.id,
    });
    await t.db.query(
      `UPDATE users SET "mustChangePassword" = false WHERE email = 'vc@kenova.test'`,
    );
    vc = await t.login('vc@kenova.test');
    battery = (
      await send('post', sa, '/api/services', {
        name: 'Batería MacBook Air M1',
        description: '',
        price: 120,
        available: true,
      })
    ).body.id;
  });
  afterAll(() => t.close());

  it('creates a draft with its own number per store, valid for 30 days', async () => {
    const first = await create(sa);
    const second = await create(sa);
    const partner = await create(vc);
    expect([first.code, second.code, partner.code]).toEqual([
      'MP-P0001',
      'MP-P0002',
      'VC-P0001',
    ]);
    expect(first).toMatchObject({
      status: 'draft',
      total: '415.50',
      createdBy: { fullName: 'Usuario SUPER_ADMIN' },
    });
    expect(first.lines.map((l) => [l.description, l.unitPrice])).toEqual([
      ['Reparación de placa base', '380.00'],
      ['Limpieza por líquido', '35.50'],
    ]);
    const days =
      (Date.parse(first.validUntil) -
        Date.parse(new Date().toISOString().slice(0, 10))) /
      86_400_000;
    expect(days).toBeGreaterThanOrEqual(29);
    expect(days).toBeLessThanOrEqual(31);
  });

  it('needs a name, a phone and at least one line', async () => {
    const res = await send('post', sa, '/api/quotes', {
      clientName: ' ',
      clientPhone: 'abc',
      model: 'iPhone 13',
      lines: [],
    });
    expect(res.status).toBe(400);
    const text = JSON.stringify(res.body.message);
    expect(text).toContain('nombre del cliente');
    expect(text).toContain('teléfono válido');
    expect(text).toContain('al menos una línea');
  });

  it('keeps each store to its own quotes', async () => {
    const mine = await create(vc, { clientName: 'Solo Villarcayo' });
    const workshop = await create(sa, { clientName: 'Solo Medina' });
    expect((await get(vc, `/api/quotes/${workshop.id}`)).status).toBe(404);
    expect(
      (await send('delete', vc, `/api/quotes/${workshop.id}`)).status,
    ).toBe(404);
    const seen = (await get(vc, '/api/quotes?q=solo')).body;
    expect(seen.rows.map((r: { code: string }) => r.code)).toEqual([mine.code]);
    const all = (await get(sa, '/api/quotes?q=solo')).body;
    expect(all.rows).toHaveLength(2);
  });

  it('finds quotes by number, name, phone or model', async () => {
    const q = await create(sa, {
      clientName: 'Begoña Ruiz',
      clientPhone: '611 222 333',
      brand: 'Samsung',
      model: 'Galaxy S21',
    });
    for (const term of [
      q.code.toLowerCase(),
      'begona',
      '611222',
      'galaxy s21',
    ]) {
      const { rows } = (
        await get(sa, `/api/quotes?q=${encodeURIComponent(term)}`)
      ).body;
      expect(rows.map((r: { id: string }) => r.id)).toContain(q.id);
    }
    const [row] = (await get(sa, '/api/quotes?q=begona')).body.rows;
    expect(row).toMatchObject({
      device: 'Samsung Galaxy S21',
      total: '415.50',
      status: 'draft',
    });
  });

  it('edits only drafts, and sending marks it as sent', async () => {
    const q = await create(sa);
    const edited = await send('patch', sa, `/api/quotes/${q.id}`, {
      lines: [
        {
          serviceId: battery,
          description: 'Batería MacBook Air M1',
          quality: 'original',
          unitPrice: 120,
        },
      ],
      diagnosticFee: 20,
    });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({
      total: '120.00',
      diagnosticFee: '20.00',
      clientName: AITOR.clientName,
    });
    const sent = await send('post', sa, `/api/quotes/${q.id}/send`);
    expect(sent.body.status).toBe('sent');
    expect(sent.body.sentAt).toBeTruthy();
    const late = await send('patch', sa, `/api/quotes/${q.id}`, {
      clientName: 'Otro',
    });
    expect(late.status).toBe(409);
  });

  it('expires by date, and renewing brings back today’s prices', async () => {
    const q = await create(sa, {
      lines: [
        { serviceId: battery, description: 'Batería', unitPrice: 100 },
        { description: 'Mano de obra', unitPrice: 15 },
      ],
    });
    await send('post', sa, `/api/quotes/${q.id}/send`);
    await expire(q.id);
    expect((await get(sa, `/api/quotes/${q.id}`)).body.status).toBe('expired');
    const { counts } = (await get(sa, '/api/quotes?tab=expired')).body;
    expect(counts.expired).toBeGreaterThanOrEqual(1);
    expect(
      (await send('post', sa, `/api/quotes/${q.id}/send`)).body.message,
    ).toContain('caducado');

    const renewed = await send('post', sa, `/api/quotes/${q.id}/renew`);
    expect(renewed.status).toBe(200);
    expect(renewed.body.changes).toEqual([
      { description: 'Batería', before: '100.00', after: '120.00' },
    ]);
    expect(renewed.body.quote).toMatchObject({
      status: 'draft',
      total: '135.00',
      sentAt: null,
    });
    expect((await send('post', sa, `/api/quotes/${q.id}/renew`)).status).toBe(
      409,
    );
  });

  it('records a rejection, and deletes anything not accepted', async () => {
    const q = await create(sa);
    const rejected = await send('post', sa, `/api/quotes/${q.id}/reject`);
    expect(rejected.body.status).toBe('rejected');
    expect((await send('post', sa, `/api/quotes/${q.id}/reject`)).status).toBe(
      409,
    );
    expect((await send('delete', sa, `/api/quotes/${q.id}`)).status).toBe(204);
    expect((await get(sa, `/api/quotes/${q.id}`)).status).toBe(404);

    const accepted = await create(sa);
    await t.db.query(`UPDATE quotes SET status = 'accepted' WHERE id = $1`, [
      accepted.id,
    ]);
    const res = await send('delete', sa, `/api/quotes/${accepted.id}`);
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('desde la orden');
  });
  it('becomes an order through the intake, once, in the store that gave it', async () => {
    const q = await create(vc, {
      lines: [
        { serviceId: battery, description: 'Batería', unitPrice: 99 },
        { description: 'Limpieza', unitPrice: 20 },
      ],
    });
    await send('post', vc, `/api/quotes/${q.id}/send`);
    const intake = (quoteId: string, cookie = sa) =>
      send('post', cookie, '/api/service-orders/intake', {
        quoteId,
        client: { firstName: 'Aitor', phoneNumber: '688450117' },
        device: { type: 'movil', brand: 'Apple', model: 'MacBook Air M1' },
        order: {
          status: 'en_progreso',
          reportedFaults: ['liquid_damage'],
          serviceIds: [battery],
          totalPrice: 119,
        },
      });
    // A partner, from the workshop, accepts the store's quote.
    const res = await intake(q.id);
    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^VC-/);
    expect(Number(res.body.totalPrice)).toBe(119);

    const accepted = (await get(vc, `/api/quotes/${q.id}`)).body;
    expect(accepted).toMatchObject({
      status: 'accepted',
      order: { id: res.body.id, code: res.body.code },
    });
    const again = await intake(q.id);
    expect(again.status).toBe(409);
    expect(again.body.message).toContain('ya se convirtió');

    const old = await create(sa);
    await expire(old.id);
    expect((await intake(old.id)).body.message).toContain('caducado');
    const other = await create(sa);
    const before = Number(
      (await t.db.query(`SELECT count(*)::int AS n FROM service_orders`))[0].n,
    );
    expect((await intake(other.id, vc)).status).toBe(404);
    const after = Number(
      (await t.db.query(`SELECT count(*)::int AS n FROM service_orders`))[0].n,
    );
    expect(after).toBe(before);
  });
});
