import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { SupplierWebError } from './web-error';

/** The ERP never calls a private or local address, whatever the host resolves to. */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === '::1' || v === '::') return true;
    if (v.startsWith('::ffff:')) return isPrivateAddress(v.slice(7));
    return /^(f[cd]|fe[89ab])/.test(v);
  }
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
export type Resolver = (host: string) => Promise<string[]>;

const resolveHost: Resolver = async (host) =>
  (await lookup(host, { all: true })).map((r) => r.address);

export interface WebSessionOptions {
  fetcher?: Fetcher;
  resolver?: Resolver;
  timeoutMs?: number;
  maxBytes?: number;
}

const MAX_REDIRECTS = 5;

/**
 * A logged-in visit to one supplier's website, like a browser tab: it keeps
 * the cookies, follows redirects and reads pages. It only ever calls the
 * supplier's own host over https, only reads (GET), and the one form it
 * sends is the login.
 */
export class WebSession {
  private readonly origin: string;
  private readonly host: string;
  private readonly cookies = new Map<string, string>();
  private readonly fetcher: Fetcher;
  private readonly resolver: Resolver;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private checkedHost = false;

  constructor(baseUrl: string, options: WebSessionOptions = {}) {
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:') {
      throw new SupplierWebError(
        'La dirección del proveedor tiene que ser https://',
      );
    }
    this.origin = url.origin;
    this.host = url.hostname;
    this.fetcher = options.fetcher ?? ((u, i) => fetch(u, i));
    this.resolver = options.resolver ?? resolveHost;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    // The history of a busy account runs to a few MB (804 orders ≈ 2.4 MB).
    this.maxBytes = options.maxBytes ?? 10 * 1024 * 1024;
  }

  /** An address on the supplier's host; anything else is refused. */
  url(pathOrUrl: string): string {
    const url = new URL(pathOrUrl, this.origin);
    if (url.origin !== this.origin) {
      throw new SupplierWebError(
        `La web del proveedor apunta a otra dirección (${url.host}); el ERP no la sigue.`,
      );
    }
    return url.toString();
  }

  /** Reads a page; returns its final address and its HTML. */
  get(pathOrUrl: string): Promise<{ url: string; html: string }> {
    return this.request(this.url(pathOrUrl), { method: 'GET' });
  }

  /** Sends the login form (the only thing the ERP ever sends). */
  postForm(
    pathOrUrl: string,
    fields: Record<string, string>,
    referer: string,
  ): Promise<{ url: string; html: string }> {
    return this.request(this.url(pathOrUrl), {
      method: 'POST',
      body: new URLSearchParams(fields).toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: referer,
      },
    });
  }

  private async request(
    start: string,
    init: {
      method: 'GET' | 'POST';
      body?: string;
      headers?: Record<string, string>;
    },
  ): Promise<{ url: string; html: string }> {
    await this.checkHost();
    let url = start;
    let current = init;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      let res: Response;
      try {
        res = await this.fetcher(url, {
          method: current.method,
          body: current.body,
          redirect: 'manual',
          signal: AbortSignal.timeout(this.timeoutMs),
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; KenovaERP/1.0)',
            Accept: 'text/html,application/xhtml+xml',
            'Accept-Language': 'es-ES,es;q=0.9',
            ...(this.cookies.size ? { Cookie: this.cookieHeader() } : {}),
            ...current.headers,
          },
        });
      } catch {
        throw new SupplierWebError(
          'La web del proveedor no responde. Inténtalo más tarde.',
        );
      }
      this.keepCookies(res);
      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        url = this.url(new URL(location, url).toString());
        // A redirect after a form is always read with GET, like a browser.
        current = { method: 'GET' };
        continue;
      }
      if (!res.ok) {
        throw new SupplierWebError(
          `La web del proveedor ha contestado con un error (${res.status}) en ${new URL(url).pathname}.`,
        );
      }
      return { url, html: await this.readLimited(res) };
    }
    throw new SupplierWebError(
      'La web del proveedor redirige demasiadas veces.',
    );
  }

  private async checkHost() {
    if (this.checkedHost) return;
    let addresses: string[];
    try {
      addresses = isIP(this.host)
        ? [this.host]
        : await this.resolver(this.host);
    } catch {
      throw new SupplierWebError(`No se encuentra la web ${this.host}.`);
    }
    if (!addresses.length || addresses.some(isPrivateAddress)) {
      throw new SupplierWebError(
        `${this.host} no es una dirección pública; el ERP no la llama.`,
      );
    }
    this.checkedHost = true;
  }

  private keepCookies(res: Response) {
    for (const line of res.headers.getSetCookie()) {
      const pair = line.split(';')[0];
      const eq = pair.indexOf('=');
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (
        /max-age=0|expires=thu, 01 jan 1970/i.test(line) ||
        value === 'deleted'
      ) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, value);
      }
    }
  }

  private cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  private async readLimited(res: Response): Promise<string> {
    if (!res.body) return '';
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > this.maxBytes) {
        await reader.cancel();
        throw new SupplierWebError(
          'La página del proveedor es demasiado grande.',
        );
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  }
}
