import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, IsNull, Not } from 'typeorm';
import { AuditService, type AuditAction } from '../audit/audit.service';
import { Client } from '../clients/entities/client.entity';
import { Inventory } from '../inventory/entities/inventory.entity';
import { ServiceOrder } from '../service-order/entities/service-order.entity';

export const TRASH_KINDS = ['order', 'client', 'part'] as const;
export type TrashKind = (typeof TRASH_KINDS)[number];

/** GET /api/trash: one deleted thing. */
export interface TrashItem {
  kind: TrashKind;
  id: string;
  /** VC-0022, «Lucía Gómez» or «Batería iPhone 13». */
  title: string;
  /** Client and device, phone, or SKU. */
  detail: string | null;
  deletedAt: Date;
  deletedBy: string | null;
}

export interface TrashPage {
  items: TrashItem[];
  total: number;
}

export const TRASH_PAGE_SIZE = 50;

const KIND = {
  order: {
    entity: ServiceOrder,
    entityType: 'service_order',
    recovered: 'SERVICE_ORDER_RECOVERED',
  },
  client: {
    entity: Client,
    entityType: 'client',
    recovered: 'CLIENT_RECOVERED',
  },
  part: {
    entity: Inventory,
    entityType: 'inventory',
    recovered: 'PART_RECOVERED',
  },
} as const satisfies Record<
  TrashKind,
  { entity: unknown; entityType: string; recovered: AuditAction }
>;

/**
 * Design R2 3.10 «Papelera» (partners only): orders, clients and parts deleted
 * by mistake. Nothing is purged: a deleted row is only hidden, so restoring
 * brings it back as it was, with its number, history and links.
 */
@Injectable()
export class TrashService {
  constructor(
    private readonly db: DataSource,
    private readonly audit: AuditService,
  ) {}

  async list(
    kind: TrashKind | undefined,
    q: string | undefined,
    page: number,
  ): Promise<TrashPage> {
    const like = q?.trim() ? `%${q.trim()}%` : null;
    // Each kind as (kind, id, title, detail, deletedAt, entityType); one query.
    const parts: Record<TrashKind, string> = {
      order: `
        SELECT 'order' AS kind, o.id, o.code AS title,
               NULLIF(CONCAT_WS(' · ',
                 NULLIF(TRIM(CONCAT_WS(' ', c."firstName", c."lastName")), ''),
                 NULLIF(TRIM(CONCAT_WS(' ', d.brand, d.model)), '')), '') AS detail,
               o."deletedAt", 'service_order' AS "entityType"
          FROM service_orders o
          LEFT JOIN client c ON c.id = o."clientId"
          LEFT JOIN devices d ON d.id = o."deviceId"
         WHERE o."deletedAt" IS NOT NULL`,
      client: `
        SELECT 'client' AS kind, c.id,
               TRIM(CONCAT_WS(' ', c."firstName", c."lastName")) AS title,
               c."phoneNumber" AS detail, c."deletedAt", 'client' AS "entityType"
          FROM client c
         WHERE c."deletedAt" IS NOT NULL`,
      part: `
        SELECT 'part' AS kind, i.id, i.name AS title, i.sku AS detail,
               i."deletedAt", 'inventory' AS "entityType"
          FROM inventory i
         WHERE i."deletedAt" IS NOT NULL`,
    };
    const kinds: readonly TrashKind[] = kind ? [kind] : TRASH_KINDS;
    const union = kinds.map((k) => parts[k]).join(' UNION ALL ');
    const where = like ? `WHERE t.title ILIKE $1 OR t.detail ILIKE $1` : '';
    const params = like ? [like] : [];
    const n = params.length;

    const counted: { total: number }[] = await this.db.query(
      `SELECT COUNT(*)::int AS total FROM (${union}) t ${where}`,
      params,
    );
    const rows: TrashItem[] = await this.db.query(
      `SELECT t.kind, t.id, t.title, t.detail, t."deletedAt",
              (SELECT u."fullName" FROM audit_events a
                 JOIN users u ON u.id = a."actorUserId"
                WHERE a."entityType" = t."entityType" AND a."entityId" = t.id::text
                  AND a.action LIKE '%\\_DELETED'
                ORDER BY a."createdAt" DESC LIMIT 1) AS "deletedBy"
         FROM (${union}) t ${where}
        ORDER BY t."deletedAt" DESC, t.id
        LIMIT $${n + 1} OFFSET $${n + 2}`,
      [...params, TRASH_PAGE_SIZE, (page - 1) * TRASH_PAGE_SIZE],
    );
    return { items: rows, total: counted[0].total };
  }

  /** Brings a deleted order, client or part back as it was. */
  async restore(kind: string, id: string, actorId: string): Promise<void> {
    if (!(TRASH_KINDS as readonly string[]).includes(kind)) {
      throw new BadRequestException('Tipo no válido');
    }
    const k = KIND[kind as TrashKind];
    await this.db.transaction(async (m) => {
      const repo = m.getRepository<{ id: string }>(k.entity);
      const deleted = await repo.exists({
        where: { id, deletedAt: Not(IsNull()) } as never,
        withDeleted: true,
      });
      if (!deleted) throw new NotFoundException('No está en la papelera');
      await repo.restore(id);
      await this.audit.record(
        {
          action: k.recovered,
          actorUserId: actorId,
          entityType: k.entityType,
          entityId: id,
        },
        m,
      );
    });
  }
}
