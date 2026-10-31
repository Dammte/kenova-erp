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
});
