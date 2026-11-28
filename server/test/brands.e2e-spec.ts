import { ORIGIN, TestContext, createTestApp } from './utils/harness';

describe('Marcas sin duplicados', () => {
  let t: TestContext;
  let sa: string;

  type Reply = { status: number; body: { id: string; message?: string } };
  const send = async (
    method: 'post' | 'patch',
    url: string,
    body: object,
  ): Promise<Reply> =>
    t.http()[method](url).set('Cookie', sa).set('Origin', ORIGIN).send(body);
  const named = async (name: string) =>
    (
      (await t.http().get('/api/brands').set('Cookie', sa)).body as {
        name: string;
      }[]
    ).filter((b) => b.name.toLowerCase() === name.toLowerCase());

  beforeAll(async () => {
    t = await createTestApp();
    sa = await t.login(t.superAdmin.email);
  });
  afterAll(() => t.close());

  it('creating a brand that already exists, in any case, hands back the one there', async () => {
    const first = (await send('post', '/api/brands', { name: 'Apple' })).body;
    const again = await send('post', '/api/brands', { name: ' apple ' });
    expect(again.status).toBeLessThan(300);
    expect(again.body.id).toBe(first.id);
    expect(await named('apple')).toHaveLength(1);
  });

  it('renaming a brand to another one taken says so', async () => {
    await send('post', '/api/brands', { name: 'Samsung' });
    const xiaomi = (await send('post', '/api/brands', { name: 'Xiaomi' })).body;
    const clash = await send('patch', `/api/brands/${xiaomi.id}`, {
      name: 'SAMSUNG',
    });
    expect(clash.status).toBe(409);
    expect(clash.body.message).toContain('Samsung');
    const own = await send('patch', `/api/brands/${xiaomi.id}`, {
      name: 'XIAOMI',
    });
    expect(own.status).toBeLessThan(300);
  });
});
