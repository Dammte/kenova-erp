import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { SuppliersService } from '../suppliers.service';
import type { SupplierWebConfig } from './web-config';
import {
  isLoginPage,
  loginForm,
  readDetail,
  readHistory,
  type WebOrder,
  type WebOrderLine,
} from './web-reader';
import { SupplierWebError } from './web-error';
import { WebSession, type WebSessionOptions } from './web-session';

/** What «Probar conexión» shows: what the ERP understood, nothing saved. */
export interface WebTestResult {
  /** Orders found in the history (all of them are counted, the first 10 shown). */
  ordersFound: number;
  orders: WebOrder[];
  /** The first order's page, read line by line. */
  sample: { order: WebOrder; lines: WebOrderLine[] } | null;
  /** Things that worked but look wrong. */
  warnings: string[];
}

/** Logged in on a supplier's website, ready to read its pages. */
export class SupplierSite {
  constructor(
    private readonly session: WebSession,
    private readonly config: SupplierWebConfig,
  ) {}

  async history(): Promise<WebOrder[]> {
    const page = await this.session.get(this.config.history.path);
    if (isLoginPage(page.html, this.config.login.passwordField)) {
      throw new SupplierWebError(
        'La sesión en la web del proveedor se ha cerrado. Vuelve a intentarlo.',
      );
    }
    return readHistory(page.html, page.url, this.config.history);
  }

  async lines(externalId: string): Promise<WebOrderLine[]> {
    const page = await this.session.get(
      this.config.detail.path.replace('{id}', encodeURIComponent(externalId)),
    );
    return readDetail(page.html, page.url, this.config.detail);
  }
}

/**
 * Reads a supplier's orders from its website. Only reads: the one thing it
 * sends is the login form.
 */
@Injectable()
export class SupplierWebService {
  /** Tests swap the network for a fake one. */
  sessionOptions: WebSessionOptions = {};

  constructor(
    private readonly suppliers: SuppliersService,
    private readonly audit: AuditService,
  ) {}

  /** Logs in with the stored credentials. */
  async open(supplierId: string): Promise<SupplierSite> {
    const supplier = await this.suppliers.findOne(supplierId);
    const config = supplier.connection;
    if (config?.kind !== 'html') {
      throw new BadRequestException(
        'Rellena y guarda antes la conexión con su web.',
      );
    }
    const credentials = await this.suppliers.credentials(supplierId);
    if (!credentials) {
      throw new BadRequestException('Guarda antes las credenciales de su web.');
    }
    return this.run(async () => {
      const session = new WebSession(config.baseUrl, this.sessionOptions);
      const loginPage = await session.get(config.login.path);
      const form = loginForm(
        loginPage.html,
        loginPage.url,
        config.login,
        credentials,
      );
      const after = await session.postForm(
        form.action,
        form.fields,
        loginPage.url,
      );
      if (isLoginPage(after.html, config.login.passwordField)) {
        throw new SupplierWebError(
          'La web del proveedor no ha aceptado el usuario y la contraseña.',
        );
      }
      return new SupplierSite(session, config);
    });
  }

  /** «Probar conexión»: logs in, reads the history and the first order. Saves nothing. */
  async test(supplierId: string, actorId: string): Promise<WebTestResult> {
    const site = await this.open(supplierId);
    const result = await this.run(async () => {
      const orders = await site.history();
      const warnings: string[] = [];
      if (!orders.length) {
        warnings.push(
          'No se ha encontrado ningún pedido en el historial. Si tienes pedidos, revisa «Filas del historial» y «Enlace al pedido».',
        );
      }
      const first = orders[0];
      const lines = first ? await site.lines(first.externalId) : [];
      if (first && !lines.length) {
        warnings.push(
          `El pedido ${first.reference} no tiene líneas legibles. Revisa «Filas del pedido», «Producto» y «Cantidad».`,
        );
      }
      if (orders.some((o) => !o.date)) {
        warnings.push('Hay pedidos sin fecha legible. Revisa «Fecha».');
      }
      if (orders.some((o) => !o.total)) {
        warnings.push('Hay pedidos sin total legible. Revisa «Total».');
      }
      if (lines.some((l) => !l.unitPrice)) {
        warnings.push(
          'Hay líneas sin precio legible. Revisa «Precio unitario».',
        );
      }
      return {
        ordersFound: orders.length,
        orders: orders.slice(0, 10),
        sample: first ? { order: first, lines } : null,
        warnings,
      };
    });
    await this.audit.record({
      action: 'SUPPLIER_WEB_TESTED',
      actorUserId: actorId,
      entityType: 'supplier',
      entityId: supplierId,
      metadata: { ordersFound: result.ordersFound },
    });
    return result;
  }

  /** Website problems and wrong places reach the administrator as a 400 with the reason. */
  private async run<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (e) {
      if (e instanceof SupplierWebError)
        throw new BadRequestException(e.message);
      throw e;
    }
  }
}
