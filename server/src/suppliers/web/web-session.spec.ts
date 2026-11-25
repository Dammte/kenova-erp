import { SupplierWebError } from './web-error';
import { WebSession, isPrivateAddress, type Fetcher } from './web-session';

const BASE = 'https://b2b.proveedor.test';
const publicDns = () => Promise.resolve(['203.0.113.10']);

/** A fake website: each call answers with the next response and is recorded. */
function site(...responses: Response[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher: Fetcher = (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    return next
      ? Promise.resolve(next)
      : Promise.reject(new Error('no more answers'));
  };
  return { calls, fetcher };
}
const html = (body: string, headers: Record<string, string> = {}) =>
  new Response(body, { status: 200, headers });
const redirect = (location: string, cookie?: string) =>
  new Response(null, {
    status: 302,
    headers: { location, ...(cookie ? { 'set-cookie': cookie } : {}) },
  });
const header = (init: RequestInit, name: string) =>
  (init.headers as Record<string, string>)[name];

describe('WebSession', () => {
  it('only speaks https', () => {
    expect(() => new WebSession('http://b2b.proveedor.test')).toThrow(
      'La dirección del proveedor tiene que ser https://',
    );
  });

  it('keeps the cookies and follows redirects on the same host, reading with GET', async () => {
    const { calls, fetcher } = site(
      redirect('/mi-cuenta', 'PrestaShop-1=abc; path=/; HttpOnly'),
      html('<p>ok</p>'),
    );
    const s = new WebSession(BASE, { fetcher, resolver: publicDns });
    const page = await s.postForm('/iniciar-sesion', { email: 'a' }, BASE);
    expect(page).toEqual({ url: `${BASE}/mi-cuenta`, html: '<p>ok</p>' });
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.body).toBe('email=a');
    expect(calls[0].init.redirect).toBe('manual');
    expect(calls[1].init.method).toBe('GET');
    expect(calls[1].init.body).toBeUndefined();
    expect(header(calls[1].init, 'Cookie')).toBe('PrestaShop-1=abc');
  });

  it('never follows the website to another host', async () => {
    const { fetcher } = site(redirect('https://otra.test/robar'));
    const s = new WebSession(BASE, { fetcher, resolver: publicDns });
    await expect(s.get('/historial-compra')).rejects.toThrow(
      'La web del proveedor apunta a otra dirección (otra.test); el ERP no la sigue.',
    );
    expect(() => s.url('//otra.test/x')).toThrow(SupplierWebError);
  });

  it('never calls a private address', async () => {
    expect(isPrivateAddress('10.1.2.3')).toBe(true);
    expect(isPrivateAddress('127.0.0.1')).toBe(true);
    expect(isPrivateAddress('169.254.169.254')).toBe(true);
    expect(isPrivateAddress('172.20.0.1')).toBe(true);
    expect(isPrivateAddress('192.168.1.1')).toBe(true);
    expect(isPrivateAddress('::1')).toBe(true);
    expect(isPrivateAddress('fd00::1')).toBe(true);
    expect(isPrivateAddress('::ffff:10.0.0.1')).toBe(true);
    expect(isPrivateAddress('203.0.113.10')).toBe(false);
    const { calls, fetcher } = site(html('x'));
    const s = new WebSession(BASE, {
      fetcher,
      resolver: () => Promise.resolve(['10.0.0.5']),
    });
    await expect(s.get('/')).rejects.toThrow(
      'b2b.proveedor.test no es una dirección pública; el ERP no la llama.',
    );
    expect(calls).toHaveLength(0);
  });

  it('turns errors, silence and huge pages into a reason', async () => {
    const down = new WebSession(BASE, {
      fetcher: () => Promise.reject(new Error('ECONNRESET')),
      resolver: publicDns,
    });
    await expect(down.get('/')).rejects.toThrow(
      'La web del proveedor no responde. Inténtalo más tarde.',
    );
    const { fetcher } = site(new Response('no', { status: 503 }));
    await expect(
      new WebSession(BASE, { fetcher, resolver: publicDns }).get(
        '/historial-compra',
      ),
    ).rejects.toThrow(
      'La web del proveedor ha contestado con un error (503) en /historial-compra.',
    );
    const big = site(html('x'.repeat(2000)));
    await expect(
      new WebSession(BASE, {
        fetcher: big.fetcher,
        resolver: publicDns,
        maxBytes: 1000,
      }).get('/'),
    ).rejects.toThrow('La página del proveedor es demasiado grande.');
  });
});
