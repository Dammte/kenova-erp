import { ORIGIN, TestContext, createTestApp } from './utils/harness';

describe('Companies as clients', () => {
  let t: TestContext;
  let sa: string;

  const send = (method: 'post' | 'put', url: string, body: object) =>
    t.http()[method](url).set('Cookie', sa).set('Origin', ORIGIN).send(body);

  beforeAll(async () => {
    t = await createTestApp();
    sa = await t.login(t.superAdmin.email);
  });
  afterAll(() => t.close());

  it('registers a company with its CIF, legal name as typed and contact person', async () => {
    const res = await send('post', '/api/clients', {
      dniType: 'CIF',
      dni: 'b09123456',
      firstName: '  Talleres García del Valle de Mena SL  ',
      lastName: 'rubén castro',
      phoneNumber: '603551278',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      dniType: 'CIF',
      dni: 'B09123456',
      firstName: 'Talleres García del Valle de Mena SL',
      lastName: 'Rubén Castro',
    });
  });

  it('rejects a malformed CIF', async () => {
    const res = await send('post', '/api/clients', {
      dniType: 'CIF',
      dni: 'B09123457',
      firstName: 'Otra SL',
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(
      'El CIF no tiene un formato válido (letra + 8 cifras).',
    );
  });

  it('checks the CIF when a person becomes a company', async () => {
    const id = (
      await send('post', '/api/clients', {
        dni: '12345678Z',
        firstName: 'pedro',
      })
    ).body.id;
    expect(
      (await send('put', `/api/clients/${id}`, { dniType: 'CIF' })).status,
    ).toBe(400);
    const ok = await send('put', `/api/clients/${id}`, {
      dniType: 'CIF',
      dni: 'A58818501',
      firstName: 'PEDRO REPARACIONES SA',
    });
    expect(ok.status).toBe(200);
    expect(ok.body.firstName).toBe('PEDRO REPARACIONES SA');
  });

  it('people keep their names title-cased', async () => {
    const res = await send('post', '/api/clients', {
      firstName: 'ana maría',
    });
    expect(res.body.firstName).toBe('Ana María');
  });
});
