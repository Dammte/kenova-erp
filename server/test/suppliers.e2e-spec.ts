import { ORIGIN, TestContext, createTestApp } from './utils/harness';

describe('Proveedores', () => {
  let t: TestContext;
  let sa: string;
  let store: string;

  const send = (
    method: 'post' | 'patch',
    cookie: string,
    url: string,
    body: object,
  ) =>
    t
      .http()
      [method](url)
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send(body);

  beforeAll(async () => {
    t = await createTestApp();
    sa = await t.login(t.superAdmin.email);
    store = await t.login(t.storeAdmin.email);
  });
  afterAll(() => t.close());

  it('creates a supplier with its company data, tidied', async () => {
    const res = await send('post', sa, '/api/suppliers', {
      name: '  Repuestos   Norte ',
      taxId: 'b-12345678',
      customerNumber: ' C-1042 ',
      contactName: 'Ane',
      email: 'pedidos@norte.test',
      phone: '+34 944 000 000',
      website: 'https://norte.test',
      notes: '',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Repuestos Norte',
      taxId: 'B12345678',
      customerNumber: 'C-1042',
      notes: null,
      active: true,
    });
    const audit = await t.db.query(
      `SELECT action FROM audit_events WHERE "entityId" = $1`,
      [res.body.id],
    );
    expect(audit).toEqual([{ action: 'SUPPLIER_CREATED' }]);
  });

  it('refuses the same name in other capitals', async () => {
    const res = await send('post', sa, '/api/suppliers', {
      name: 'repuestos norte',
    });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Ya existe un proveedor «repuestos norte»');
  });

  it('validates the email, the web and the CIF', async () => {
    const res = await send('post', sa, '/api/suppliers', {
      name: 'Otro',
      email: 'no-es-email',
      website: 'norte.test',
      taxId: '12',
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toEqual(
      expect.arrayContaining([
        'Email no válido',
        'La web debe empezar por https://',
        'CIF no válido',
      ]),
    );
  });

  it('edits and deactivates; inactive ones are listed last', async () => {
    const a = (await send('post', sa, '/api/suppliers', { name: 'Alfa' })).body
      .id;
    const edited = await send('patch', sa, `/api/suppliers/${a}`, {
      phone: '600 111 222',
      active: false,
    });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ phone: '600 111 222', active: false });
    const list = await t.http().get('/api/suppliers').set('Cookie', sa);
    expect(list.body.map((s: { name: string }) => s.name)).toEqual([
      'Repuestos Norte',
      'Alfa',
    ]);
  });

  it('renaming onto another supplier is refused', async () => {
    const b = (await send('post', sa, '/api/suppliers', { name: 'Beta' })).body
      .id;
    const res = await send('patch', sa, `/api/suppliers/${b}`, {
      name: 'ALFA',
    });
    expect(res.status).toBe(409);
  });

  it('is only for the administrator', async () => {
    expect(
      (await t.http().get('/api/suppliers').set('Cookie', store)).status,
    ).toBe(403);
    expect(
      (await send('post', store, '/api/suppliers', { name: 'Tienda' })).status,
    ).toBe(403);
  });
});
