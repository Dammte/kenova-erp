import { ORIGIN, TestContext, createTestApp } from './utils/harness';

describe('Only the first name of a client is required', () => {
  let t: TestContext;
  let cookie: string;

  const post = (url: string, body: object) =>
    t.http().post(url).set('Cookie', cookie).set('Origin', ORIGIN).send(body);

  beforeAll(async () => {
    t = await createTestApp();
    cookie = await t.login(t.storeAdmin.email);
  });
  afterAll(() => t.close());

  it('creates a client with just a first name', async () => {
    const res = await post('/api/clients', { firstName: 'rosa' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ firstName: 'Rosa', lastName: null });
  });

  it('stores a blank last name as empty, not as ""', async () => {
    const res = await post('/api/clients', {
      firstName: 'Luis',
      lastName: '   ',
    });
    expect(res.status).toBe(201);
    expect(res.body.lastName).toBeNull();

    const cleared = await t
      .http()
      .patch(`/api/clients/${res.body.id}`)
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({ lastName: 'Gómez' });
    expect(cleared.body.lastName).toBe('Gómez');
    const again = await t
      .http()
      .patch(`/api/clients/${res.body.id}`)
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({ lastName: '' });
    expect(again.body.lastName).toBeNull();
  });

  it('still requires the first name', async () => {
    expect((await post('/api/clients', { lastName: 'Sola' })).status).toBe(400);
    expect((await post('/api/clients', { firstName: ' ' })).status).toBe(400);
  });

  it('the intake accepts a new client without last name', async () => {
    const res = await post('/api/service-orders/intake', {
      client: { firstName: 'Marta', phoneNumber: '600123123' },
      device: { type: 'movil', brand: 'Samsung', model: 'A52' },
      order: {},
    });
    expect(res.status).toBe(201);
    expect(res.body.client).toMatchObject({
      firstName: 'Marta',
      lastName: null,
    });
  });

  it('finds clients without last name by first name', async () => {
    const res = await t
      .http()
      .get('/api/clients/search?q=rosa')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.map((c: { firstName: string }) => c.firstName)).toContain(
      'Rosa',
    );
  });
});
