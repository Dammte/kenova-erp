import { ORIGIN, TestContext, createTestApp } from './utils/harness';

interface Note {
  id: number;
  content: string;
  createdById: string | null;
  createdBy: Record<string, unknown> | null;
}

describe('Internal notes of an order', () => {
  let t: TestContext;
  let cookie: string;
  let orderId: string;
  let base: string;

  const send = (url: string, body: object) =>
    t.http().post(url).set('Cookie', cookie).set('Origin', ORIGIN).send(body);

  beforeAll(async () => {
    t = await createTestApp();
    cookie = await t.login(t.storeAdmin.email);
    const clientId = (
      (await send('/api/clients', { firstName: 'Noa' })).body as { id: string }
    ).id;
    orderId = (
      (await send('/api/service-orders', { clientId })).body as { id: string }
    ).id;
    base = `/api/service-orders/${orderId}/sticky-notes`;
  });
  afterAll(() => t.close());

  it('keeps who wrote each note and shows only their name', async () => {
    const res = await send(base, {
      content: 'No restaurar',
      type: 'important',
    });
    expect(res.status).toBe(201);
    const created = res.body as Note;
    expect(created.createdById).toBe(t.storeAdmin.id);
    expect(created.createdBy).toEqual({
      id: t.storeAdmin.id,
      fullName: 'Usuario STORE_ADMIN',
    });

    const list = (
      await t.http().get(base).set('Cookie', cookie).set('Origin', ORIGIN)
    ).body as Note[];
    expect(list.map((n) => n.createdBy)).toEqual([
      { id: t.storeAdmin.id, fullName: 'Usuario STORE_ADMIN' },
    ]);
  });

  it('notes from before authors were kept have none', async () => {
    await t.db.query(
      `INSERT INTO sticky_notes (content, type, "orderServiceId") VALUES ('Antigua', 'normal', $1)`,
      [orderId],
    );
    const list = (
      await t.http().get(base).set('Cookie', cookie).set('Origin', ORIGIN)
    ).body as Note[];
    expect(list.find((n) => n.content === 'Antigua')?.createdBy).toBeNull();
  });
});
