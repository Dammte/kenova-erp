import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import type { AuthUser } from '../../auth/auth.types';
import { PartOrder } from '../../part-orders/entities/part-order.entity';
import { ServiceHistory } from '../../service-history/entities/service-history.entity';
import { User } from '../../users/entities/user.entity';
import { Inventory } from '../entities/inventory.entity';
import {
  PurchaseInvoice,
  PurchaseInvoiceLine,
} from '../entities/purchase-invoice.entity';
import { StockMovementKind } from '../entities/stock-movement.entity';
import { recordStock } from '../inventory.service';
import {
  ConfirmInvoiceDto,
  ConfirmLineDto,
  InvoiceHeadDto,
  PreviewInvoiceDto,
} from './invoice.dto';
import { averageCost, matchLine, type Candidate } from './invoice-match';

/** A part as the review step shows it. */
interface PartRef {
  id: string;
  sku: string;
  name: string;
  stock: number;
  costPrice: string | null;
}

/** An order waiting on a part, which the invoice may cover. */
interface Waiting {
  partOrderId: string;
  orderId: string;
  orderCode: string;
  quantity: number;
}

export interface PreviewLine {
  match:
    | { kind: 'match'; reason: 'ref' | 'sku' | 'name'; part: PartRef }
    | { kind: 'similar'; score: number; part: PartRef }
    | { kind: 'new' };
  /** Part orders still waiting on the matched part, oldest first. */
  waiting: Waiting[];
}

export interface InvoicePreview {
  /** Set when this supplier's invoice number was already entered. */
  duplicateOf: { importedAt: Date; by: string | null } | null;
  lines: PreviewLine[];
}

export interface ConfirmedLine {
  inventoryId: string;
  name: string;
  created: boolean;
  stockBefore: number;
  stockAfter: number;
  costPrice: string;
  /** Orders whose part order this invoice received. */
  received: { orderId: string; orderCode: string }[];
}

const key = (s: string | null | undefined) =>
  s?.trim().toLowerCase().slice(0, 50) || null;

/**
 * Design 3.4 «Importar factura»: the lines are matched against the stock
 * (review), then entered in one transaction (confirm). Nothing changes stock
 * before the confirmation.
 */
@Injectable()
export class PurchaseInvoicesService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async preview(dto: PreviewInvoiceDto): Promise<InvoicePreview> {
    const m = this.dataSource.manager;
    const parts = await m.query<(Candidate & PartRef)[]>(
      `SELECT id, sku, name, model, coalesce(stock, 0) AS stock,
              "costPrice"::numeric(12,2)::text AS "costPrice"
         FROM inventory WHERE "deletedAt" IS NULL`,
    );
    const remembered = await this.rememberedRefs(m, dto.provider);
    const waiting = await this.waitingByPart(m);
    return {
      duplicateOf: await this.duplicateOf(m, dto),
      lines: dto.lines.map((line) => {
        const match = matchLine(line, parts, remembered);
        if (match.kind === 'new') return { match, waiting: [] };
        const part = this.partRef(match.part as PartRef);
        return {
          match: { ...match, part },
          waiting: waiting.get(part.id) ?? [],
        };
      }),
    };
  }

  async confirm(dto: ConfirmInvoiceDto, actor: AuthUser) {
    dto.lines.forEach((l, i) => {
      if (Boolean(l.inventoryId) === Boolean(l.newPart)) {
        throw new BadRequestException(
          `Línea ${i + 1}: elige el repuesto o créalo como nuevo`,
        );
      }
    });
    return this.dataSource.transaction(async (m) => {
      const providerKey = key(dto.provider)!;
      const numberKey = key(dto.number);
      if (numberKey) {
        // Two people confirming the same invoice at once: the second waits here.
        await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
          `invoice:${providerKey}:${numberKey}`,
        ]);
        const before = await this.duplicateOf(m, dto);
        if (before && !dto.allowDuplicate) {
          throw new ConflictException(
            `La factura ${dto.number} ya se importó el ${before.importedAt
              .toISOString()
              .slice(0, 10)
              .split('-')
              .reverse()
              .join('/')}${before.by ? ` (${before.by})` : ''}`,
          );
        }
      }
      const invoice = await m.getRepository(PurchaseInvoice).save({
        provider: dto.provider,
        number: dto.number ?? null,
        providerKey,
        numberKey,
        invoiceDate: dto.invoiceDate ?? null,
        createdById: actor.id,
      });
      const note = `Factura ${dto.number ?? 'sin número'} · ${dto.provider}`;
      const lines: ConfirmedLine[] = [];
      for (const [i, line] of dto.lines.entries()) {
        lines.push(await this.enter(m, line, i, dto, invoice.id, note, actor));
      }
      return {
        invoiceId: invoice.id,
        units: dto.lines.reduce((n, l) => n + l.quantity, 0),
        cost: dto.lines
          .reduce((n, l) => n + l.quantity * Number(l.unitCost), 0)
          .toFixed(2),
        lines,
      };
    });
  }

  /** One line into stock: the part's units and average cost, its history, the orders it covers. */
  private async enter(
    m: EntityManager,
    line: ConfirmLineDto,
    index: number,
    head: InvoiceHeadDto,
    invoiceId: string,
    note: string,
    actor: AuthUser,
  ): Promise<ConfirmedLine> {
    const repo = m.getRepository(Inventory);
    let part: Inventory;
    let stockBefore = 0;
    let created = false;
    if (line.inventoryId) {
      const found = await repo.findOne({
        where: { id: line.inventoryId, deletedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!found) {
        throw new NotFoundException(
          `Línea ${index + 1}: el repuesto ya no existe`,
        );
      }
      stockBefore = found.stock ?? 0;
      const costPrice = averageCost(
        found.stock,
        found.costPrice,
        line.quantity,
        line.unitCost,
      );
      await repo.update(found.id, {
        stock: stockBefore + line.quantity,
        costPrice,
        updatedBy: actor.id,
      });
      part = { ...found, stock: stockBefore + line.quantity, costPrice };
    } else {
      const sku = await this.freeSku(m, line, index);
      part = await repo.save(
        repo.create({
          sku,
          name: line.newPart!.name,
          category: line.newPart!.category ?? undefined,
          provider: head.provider,
          stock: line.quantity,
          minimalStock: 0,
          salesPrice: 0,
          costPrice: Number(line.unitCost).toFixed(4),
          createdBy: actor.id,
          updatedBy: actor.id,
        }),
      );
      created = true;
    }
    await recordStock(m, {
      inventoryId: part.id,
      kind: StockMovementKind.PURCHASE,
      quantity: line.quantity,
      stockAfter: part.stock ?? 0,
      note,
      userId: actor.id,
    });
    await m.getRepository(PurchaseInvoiceLine).insert({
      invoiceId,
      inventoryId: part.id,
      ref: line.ref ?? null,
      refKey: key(line.ref)?.slice(0, 40) ?? null,
      description: line.description,
      quantity: line.quantity,
      unitCost: line.unitCost,
      stockBefore,
    });
    return {
      inventoryId: part.id,
      name: part.name,
      created,
      stockBefore,
      stockAfter: part.stock ?? 0,
      costPrice: Number(part.costPrice).toFixed(2),
      received: created
        ? []
        : await this.receiveOrders(m, part, line.quantity, note, actor),
    };
  }

  /**
   * The units bought cover the oldest part orders of this part: those are
   * received here, without adding stock again.
   */
  private async receiveOrders(
    m: EntityManager,
    part: Inventory,
    quantity: number,
    note: string,
    actor: AuthUser,
  ) {
    const pending = await m.getRepository(PartOrder).find({
      where: { inventoryId: part.id, receivedAt: IsNull() },
      order: { orderedAt: 'ASC', createdAt: 'ASC' },
      relations: { order: true },
      lock: { mode: 'pessimistic_write', tables: ['part_orders'] },
    });
    const received: { orderId: string; orderCode: string }[] = [];
    let left = quantity;
    for (const p of pending) {
      if (p.quantity > left || p.order?.deletedAt) continue;
      left -= p.quantity;
      await m
        .getRepository(PartOrder)
        .update(p.id, { receivedAt: new Date(), receivedById: actor.id });
      await m.getRepository(ServiceHistory).save(
        m.getRepository(ServiceHistory).create({
          serviceOrderId: p.orderId,
          performedBy: { id: actor.id } as User,
          action: 'pieza_recibida',
          description: `Pieza recibida: ${p.partName}${p.quantity > 1 ? ` (${p.quantity})` : ''} · ${note}`,
        }),
      );
      received.push({ orderId: p.orderId, orderCode: p.order?.code ?? '' });
    }
    return received;
  }

  /** The SKU typed, or one made from the supplier's reference or the name. */
  private async freeSku(
    m: EntityManager,
    line: ConfirmLineDto,
    index: number,
  ): Promise<string> {
    const taken = async (sku: string) =>
      (
        await m.query<unknown[]>(
          `SELECT 1 FROM inventory WHERE lower(sku) = lower($1)`,
          [sku],
        )
      ).length > 0;
    const typed = line.newPart?.sku;
    if (typed) {
      if (await taken(typed)) {
        throw new ConflictException(
          `Línea ${index + 1}: ya hay un repuesto con el SKU ${typed}`,
        );
      }
      return typed;
    }
    const base =
      (line.ref ?? line.newPart!.name)
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 16) || 'REP';
    for (let n = 1; n < 100; n++) {
      const sku = n === 1 ? base : `${base}-${n}`;
      if (!(await taken(sku))) return sku;
    }
    throw new ConflictException(`Línea ${index + 1}: indica un SKU`);
  }

  private async duplicateOf(m: EntityManager, head: InvoiceHeadDto) {
    const numberKey = key(head.number);
    if (!numberKey) return null;
    const [row] = await m.query<{ importedAt: Date; by: string | null }[]>(
      `SELECT i."createdAt" AS "importedAt", u."fullName" AS by
         FROM purchase_invoices i
         LEFT JOIN users u ON u.id = i."createdById"
        WHERE i."providerKey" = $1 AND i."numberKey" = $2
        ORDER BY i."createdAt" ASC LIMIT 1`,
      [key(head.provider), numberKey],
    );
    return row ?? null;
  }

  /** This supplier's references already linked to a part, the latest link winning. */
  private async rememberedRefs(m: EntityManager, provider: string) {
    const rows = await m.query<{ refKey: string; inventoryId: string }[]>(
      `SELECT DISTINCT ON (l."refKey") l."refKey", l."inventoryId"
         FROM purchase_invoice_lines l
         JOIN purchase_invoices i ON i.id = l."invoiceId"
        WHERE i."providerKey" = $1 AND l."refKey" IS NOT NULL
          AND l."inventoryId" IS NOT NULL
        ORDER BY l."refKey", i."createdAt" DESC`,
      [key(provider)],
    );
    return new Map(rows.map((r) => [r.refKey, r.inventoryId]));
  }

  private async waitingByPart(m: EntityManager) {
    const rows = await m.query<(Waiting & { inventoryId: string })[]>(
      `SELECT p.id AS "partOrderId", p."inventoryId", p."orderId",
              o.code AS "orderCode", p.quantity
         FROM part_orders p
         JOIN service_orders o ON o.id = p."orderId" AND o."deletedAt" IS NULL
        WHERE p."receivedAt" IS NULL AND p."inventoryId" IS NOT NULL
        ORDER BY p."orderedAt", p."createdAt"`,
    );
    const by = new Map<string, Waiting[]>();
    for (const { inventoryId, ...w } of rows) {
      by.set(inventoryId, [...(by.get(inventoryId) ?? []), w]);
    }
    return by;
  }

  private partRef(p: PartRef): PartRef {
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      stock: Number(p.stock),
      costPrice: p.costPrice,
    };
  }
}
