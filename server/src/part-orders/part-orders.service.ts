import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import type { AuthUser } from '../auth/auth.types';
import { Inventory } from '../inventory/entities/inventory.entity';
import { StockMovementKind } from '../inventory/entities/stock-movement.entity';
import { recordStock } from '../inventory/inventory.service';
import { addDays, todayInSpain } from '../quotes/quote-dates';
import { ServiceHistory } from '../service-history/entities/service-history.entity';
import {
  ServiceOrder,
  ServiceStatus,
} from '../service-order/entities/service-order.entity';
import { ServiceOrderService } from '../service-order/service-order.service';
import { User } from '../users/entities/user.entity';
import { CreatePartOrderDto, ListPartOrdersDto } from './dto/part-order.dto';
import { PartOrder } from './entities/part-order.entity';

/** Without an expected date, a part is late after this many days. */
export const PART_LATE_DAYS = 7;

/** Orders still being repaired, the only ones that can wait on a part. */
const OPEN: ServiceStatus[] = [
  ServiceStatus.PENDIENTE_CLIENTE,
  ServiceStatus.EN_PROGRESO,
  ServiceStatus.PENDIENTE_PIEZAS,
];

/** A row of GET /api/part-orders. */
export interface PartOrderRow {
  id: string;
  orderId: string;
  orderCode: string;
  orderStatus: ServiceStatus;
  /** The technician the order is assigned to, as written on it. */
  assignedTo: string | null;
  inventoryId: string | null;
  partName: string;
  provider: string | null;
  quantity: number;
  orderedAt: string;
  expectedAt: string | null;
  receivedAt: Date | null;
  receivedBy: string | null;
  /** Days since it was ordered. */
  waitingDays: number;
  /** Not received and past its expected date (or a week old without one). */
  late: boolean;
}

@Injectable()
export class PartOrdersService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly orders: ServiceOrderService,
  ) {}

  /** Pending ones first, oldest first; then the received, newest first. */
  async list(query: ListPartOrdersDto): Promise<PartOrderRow[]> {
    const params: unknown[] = [todayInSpain(), PART_LATE_DAYS];
    const where = ['o."deletedAt" IS NULL'];
    if (query.orderId) {
      params.push(query.orderId);
      where.push(`p."orderId" = $${params.length}`);
    }
    if (query.pending) where.push('p."receivedAt" IS NULL');
    return this.dataSource.query<PartOrderRow[]>(
      `SELECT p.id, p."orderId", o.code AS "orderCode", o.status AS "orderStatus",
              o."assignedTo", p."inventoryId", p."partName", p.provider,
              p.quantity, to_char(p."orderedAt", 'YYYY-MM-DD') AS "orderedAt",
              to_char(p."expectedAt", 'YYYY-MM-DD') AS "expectedAt",
              p."receivedAt", u."fullName" AS "receivedBy",
              ($1::date - p."orderedAt") AS "waitingDays",
              (p."receivedAt" IS NULL AND COALESCE(
                 p."expectedAt" < $1::date,
                 $1::date - p."orderedAt" > $2::int
              )) AS late
         FROM part_orders p
         JOIN service_orders o ON o.id = p."orderId"
         LEFT JOIN users u ON u.id = p."receivedById"
        WHERE ${where.join(' AND ')}
        ORDER BY (p."receivedAt" IS NULL) DESC, p."orderedAt" ASC,
                 p."receivedAt" DESC, p."createdAt" ASC
        LIMIT 200`,
      params,
    );
  }

  /**
   * «Crear pedido y cambiar estado»: the order moves to «Pendiente de piezas»
   * (with its history line) if it was not there yet.
   */
  async create(
    dto: CreatePartOrderDto,
    actor: AuthUser,
  ): Promise<PartOrderRow> {
    const order = await this.dataSource
      .getRepository(ServiceOrder)
      .findOne({ where: { id: dto.orderId, deletedAt: IsNull() } });
    if (!order) throw new NotFoundException('Orden no encontrada');
    if (!OPEN.includes(order.status)) {
      throw new BadRequestException(
        'Esta orden ya no está en reparación: no puede esperar una pieza',
      );
    }
    let partName = dto.partName ?? null;
    if (dto.inventoryId) {
      const part = await this.dataSource.getRepository(Inventory).findOne({
        where: { id: dto.inventoryId, deletedAt: IsNull() },
        select: { id: true, name: true, provider: true },
      });
      if (!part) throw new NotFoundException('Repuesto no encontrado');
      partName ??= part.name;
      dto.provider ??= part.provider ?? null;
    }
    const today = todayInSpain();
    if (dto.expectedAt && dto.expectedAt < today) {
      throw new BadRequestException('La llegada prevista ya ha pasado');
    }
    if (dto.expectedAt && dto.expectedAt > addDays(today, 366)) {
      throw new BadRequestException('Fecha de llegada no válida');
    }
    const { id } = await this.dataSource.getRepository(PartOrder).save({
      orderId: order.id,
      inventoryId: dto.inventoryId ?? null,
      partName: (partName ?? '').slice(0, 150),
      provider: dto.provider ?? null,
      quantity: dto.quantity ?? 1,
      orderedAt: today,
      expectedAt: dto.expectedAt ?? null,
      createdById: actor.id,
    });
    if (order.status !== ServiceStatus.PENDIENTE_PIEZAS) {
      await this.orders.update(
        order.id,
        { status: ServiceStatus.PENDIENTE_PIEZAS },
        actor,
      );
    }
    return this.row(id);
  }

  /**
   * «Marcar recibido»: the stock part goes up by the quantity (a purchase on
   * its history) and the order notes the arrival. The order keeps its status:
   * the technician moves it back to «En progreso».
   */
  async receive(id: string, actor: AuthUser): Promise<PartOrderRow> {
    await this.dataSource.transaction(async (m) => {
      const p = await this.lockPending(m, id);
      await m
        .getRepository(PartOrder)
        .update(id, { receivedAt: new Date(), receivedById: actor.id });
      const code = await m
        .getRepository(ServiceOrder)
        .findOne({ where: { id: p.orderId }, select: { id: true, code: true } })
        .then((o) => o?.code ?? '');
      if (p.inventoryId) {
        const rows = await m
          .createQueryBuilder()
          .update(Inventory)
          .set({
            stock: () => `COALESCE("stock", 0) + ${Math.trunc(p.quantity)}`,
            updatedBy: actor.id.slice(0, 50),
          })
          .where('id = :id', { id: p.inventoryId })
          .andWhere('"deletedAt" IS NULL')
          .returning(['stock'])
          .execute()
          .then((r) => r.raw as { stock: number }[]);
        // A part deleted meanwhile is not brought back: only the order notes it.
        if (rows.length > 0) {
          await recordStock(m, {
            inventoryId: p.inventoryId,
            kind: StockMovementKind.PURCHASE,
            quantity: p.quantity,
            stockAfter: Number(rows[0].stock),
            orderId: p.orderId,
            note: `Pedido de ${code}`,
            userId: actor.id,
          });
        }
      }
      await m.getRepository(ServiceHistory).save(
        m.getRepository(ServiceHistory).create({
          serviceOrderId: p.orderId,
          performedBy: { id: actor.id } as User,
          action: 'pieza_recibida',
          description: `Pieza recibida: ${p.partName}${p.quantity > 1 ? ` (${p.quantity})` : ''}`,
        }),
      );
    });
    return this.row(id);
  }

  /** Only a part not received yet; the order keeps its status. */
  async remove(id: string): Promise<void> {
    await this.dataSource.transaction(async (m) => {
      await this.lockPending(m, id);
      await m.getRepository(PartOrder).delete(id);
    });
  }

  private async lockPending(m: EntityManager, id: string): Promise<PartOrder> {
    const p = await m.getRepository(PartOrder).findOne({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!p) throw new NotFoundException('Pedido no encontrado');
    if (p.receivedAt) {
      throw new ConflictException('Este pedido ya se ha recibido');
    }
    return p;
  }

  private async row(id: string): Promise<PartOrderRow> {
    const p = await this.dataSource
      .getRepository(PartOrder)
      .findOneOrFail({ where: { id }, select: { id: true, orderId: true } });
    const rows = await this.list({ orderId: p.orderId });
    return rows.find((r) => r.id === id)!;
  }
}
