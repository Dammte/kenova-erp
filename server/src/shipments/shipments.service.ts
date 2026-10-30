import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import type { AuthUser } from '../auth/auth.types';
import { scopedStoreId } from '../common/store-scope';
import {
  LOCATION_LABEL,
  OrderLocation,
  ServiceOrder,
  ServiceStatus,
} from '../service-order/entities/service-order.entity';
import { Store } from '../stores/entities/store.entity';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { ShipmentLine } from './entities/shipment-line.entity';
import { Shipment, ShipmentStatus } from './entities/shipment.entity';

export const SHIPMENTS_PAGE_SIZE = 30;

export interface ScanResult {
  /**
   * received: confirmed now · already: it was confirmed before · late: it
   * arrived from an earlier shipment where it was missing · foreign: it is not
   * in this shipment (nothing changes) · unknown: no order has that code.
   */
  result: 'received' | 'already' | 'late' | 'foreign' | 'unknown';
  message: string;
  orderCode?: string;
  /** Devices of this shipment confirmed so far, out of `total`. */
  received: number;
  total: number;
}

export interface ShipmentLineView {
  orderId: string;
  orderCode: string;
  clientName: string;
  device: string | null;
  accessories: string | null;
  receivedAt: Date | null;
  notArrived: boolean;
}

export interface ShipmentView {
  id: string;
  code: string;
  status: ShipmentStatus;
  fromStore: { id: string; name: string };
  toStore: { id: string; name: string };
  carrier: string | null;
  createdBy: { id: string; fullName: string } | null;
  createdAt: Date;
  receivedAt: Date | null;
  deviceCount: number;
  lines?: ShipmentLineView[];
}

@Injectable()
export class ShipmentsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Ships devices in one batch: a partner store sends what it took in to the
   * workshop, and the workshop sends repaired devices back to their store.
   * Every order must be where the shipment leaves from; otherwise nothing is
   * shipped and the message names the ones that are not.
   */
  async create(dto: CreateShipmentDto, actor: AuthUser): Promise<ShipmentView> {
    const id = await this.dataSource.transaction(async (m) => {
      const main = await m
        .getRepository(Store)
        .findOne({ where: { isMain: true } });
      if (!main) throw new BadRequestException('No hay tienda principal');

      const actorStore = scopedStoreId(actor);
      let fromStoreId: string;
      let toStoreId: string;
      let from: OrderLocation;
      let to: OrderLocation;
      if (actorStore === main.id) {
        throw new BadRequestException(
          'Los envíos desde Medina los crea un socio',
        );
      }
      if (actorStore) {
        if (dto.toStoreId && dto.toStoreId !== main.id) {
          throw new BadRequestException('Una tienda solo envía a Medina');
        }
        [fromStoreId, toStoreId] = [actorStore, main.id];
        [from, to] = [OrderLocation.AT_STORE, OrderLocation.TO_WORKSHOP];
      } else {
        if (!dto.toStoreId) {
          throw new BadRequestException('Elige la tienda a la que vuelve');
        }
        const store = await m
          .getRepository(Store)
          .findOne({ where: { id: dto.toStoreId } });
        if (!store || store.isMain || !store.isActive) {
          throw new BadRequestException(
            'La tienda de destino no existe o está desactivada',
          );
        }
        [fromStoreId, toStoreId] = [main.id, store.id];
        [from, to] = [OrderLocation.AT_WORKSHOP, OrderLocation.TO_STORE];
      }

      const orderIds = [...new Set(dto.orderIds)];
      const orders = await m.getRepository(ServiceOrder).find({
        where: { id: In(orderIds), deletedAt: IsNull() },
        lock: { mode: 'pessimistic_write' },
      });
      // A store does not learn about orders that are not its own.
      const visible = orders.filter(
        (o) => !actorStore || o.storeId === actorStore,
      );
      if (visible.length !== orderIds.length) {
        throw new NotFoundException('Orden de servicio no encontrada');
      }
      const wrong = visible.filter(
        (o) =>
          o.storeId !== (actorStore ? fromStoreId : toStoreId) ||
          o.location !== from ||
          o.status === ServiceStatus.CANCELADO ||
          o.status === ServiceStatus.ENTREGADO,
      );
      if (wrong.length > 0) {
        throw new BadRequestException(
          `No se pueden enviar: ${wrong
            .map((o) => `${o.code} (${ShipmentsService.where(o)})`)
            .join(', ')}`,
        );
      }

      const shipment = await m.getRepository(Shipment).save(
        m.getRepository(Shipment).create({
          fromStoreId,
          toStoreId,
          carrier: dto.carrier ?? null,
          createdById: actor.id,
        }),
      );
      await m
        .getRepository(ShipmentLine)
        .insert(
          orderIds.map((orderId) => ({ shipmentId: shipment.id, orderId })),
        );
      await m
        .getRepository(ServiceOrder)
        .update({ id: In(orderIds) }, { location: to });
      return shipment.id;
    });
    return this.findOne(id, actor);
  }

  /**
   * One reading of the scanner at the destination. Never fails for a wrong
   * code: it answers what happened, so the screen can beep and go on.
   */
  async scan(
    id: string,
    rawCode: string,
    actor: AuthUser,
  ): Promise<ScanResult> {
    return this.dataSource.transaction(async (m) => {
      const shipment = await this.receivable(m, id, actor);
      const code = rawCode.trim().toUpperCase();
      const progress = () => this.progress(m, id);

      const order = await m.getRepository(ServiceOrder).findOne({
        where: { code, deletedAt: IsNull() },
        relations: { store: true },
      });
      if (!order) {
        return {
          result: 'unknown',
          message: `No hay ninguna orden ${code}`,
          ...(await progress()),
        };
      }
      const arrived = shipment.toStore!.isMain
        ? OrderLocation.AT_WORKSHOP
        : OrderLocation.READY_AT_STORE;
      const lines = m.getRepository(ShipmentLine);

      const line = await lines.findOne({
        where: { shipmentId: id, orderId: order.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (line?.receivedAt) {
        return {
          result: 'already',
          message: `${code} ya estaba leído`,
          orderCode: code,
          ...(await progress()),
        };
      }
      if (line) {
        await lines.update(line.id, { receivedAt: new Date() });
        await m
          .getRepository(ServiceOrder)
          .update(order.id, { location: arrived });
        return {
          result: 'received',
          message: `${code} recibido`,
          orderCode: code,
          ...(await progress()),
        };
      }

      // Missing from an earlier shipment to the same place: it turns up now.
      const missing = await lines
        .createQueryBuilder('l')
        .innerJoinAndSelect('l.shipment', 's')
        .where('l.orderId = :orderId AND l.notArrived', { orderId: order.id })
        .andWhere('s.toStoreId = :to', { to: shipment.toStoreId })
        .setLock('pessimistic_write', undefined, ['l'])
        .getOne();
      if (missing) {
        await lines.update(missing.id, {
          receivedAt: new Date(),
          notArrived: false,
        });
        await m
          .getRepository(ServiceOrder)
          .update(order.id, { location: arrived });
        const stillMissing = await lines.exists({
          where: { shipmentId: missing.shipmentId, notArrived: true },
        });
        if (!stillMissing) {
          await m
            .getRepository(Shipment)
            .update(missing.shipmentId, { status: ShipmentStatus.RECEIVED });
        }
        return {
          result: 'late',
          message: `${code} llegó del envío ${ShipmentsService.code(missing.shipment!.number)}`,
          orderCode: code,
          ...(await progress()),
        };
      }

      // Where it is, only to someone who may see the order.
      const storeId = scopedStoreId(actor);
      let message = `${code} no está en este envío.`;
      if (!storeId || order.storeId === storeId) {
        message += order.location
          ? ` Es de ${order.store!.name} y está ${LOCATION_LABEL[order.location]}.`
          : ` Es de ${order.store!.name}.`;
      }
      return {
        result: 'foreign',
        message,
        orderCode: code,
        ...(await progress()),
      };
    });
  }

  /**
   * Ends the reception. Devices not scanned are marked as not arrived: they
   * stay in transit and are confirmed when they turn up in a later reception.
   */
  async close(id: string, actor: AuthUser): Promise<ShipmentView> {
    await this.dataSource.transaction(async (m) => {
      await this.receivable(m, id, actor);
      const { affected } = await m
        .getRepository(ShipmentLine)
        .update({ shipmentId: id, receivedAt: IsNull() }, { notArrived: true });
      await m.getRepository(Shipment).update(id, {
        status: affected
          ? ShipmentStatus.RECEIVED_INCOMPLETE
          : ShipmentStatus.RECEIVED,
        receivedAt: new Date(),
      });
    });
    return this.findOne(id, actor);
  }

  /**
   * The shipment, locked, if it is still open and the actor receives it: the
   * destination store, or the workshop admins.
   */
  private async receivable(
    m: EntityManager,
    id: string,
    actor: AuthUser,
  ): Promise<Shipment> {
    const visible = await this.query(m, actor)
      .andWhere('s.id = :id', { id })
      .getOne();
    if (!visible) throw new NotFoundException('Envío no encontrado');
    const storeId = scopedStoreId(actor);
    if (storeId && storeId !== visible.toStoreId) {
      throw new ForbiddenException(
        `Este envío lo recibe ${visible.toStore!.name}`,
      );
    }
    const current = await m.getRepository(Shipment).findOne({
      where: { id },
      select: { id: true, status: true },
      lock: { mode: 'pessimistic_write' },
    });
    if (current!.status !== ShipmentStatus.SENT) {
      throw new BadRequestException('Este envío ya está recibido');
    }
    return visible;
  }

  private async progress(
    m: EntityManager,
    shipmentId: string,
  ): Promise<{ received: number; total: number }> {
    const rows: { received: number; total: number }[] = await m.query(
      `SELECT count("receivedAt")::int AS received, count(*)::int AS total
         FROM shipment_lines WHERE "shipmentId" = $1`,
      [shipmentId],
    );
    return rows[0];
  }

  /** Newest first, 30 per page; a store sees the ones it sends or receives. */
  async list(
    actor: AuthUser,
    page = 1,
    status?: ShipmentStatus,
  ): Promise<{ items: ShipmentView[]; total: number }> {
    const qb = this.query(this.dataSource.manager, actor);
    if (status) qb.andWhere('s.status = :status', { status });
    const [rows, total] = await qb
      .orderBy('s.createdAt', 'DESC')
      .skip((Math.max(page, 1) - 1) * SHIPMENTS_PAGE_SIZE)
      .take(SHIPMENTS_PAGE_SIZE)
      .getManyAndCount();
    const counts = await this.lineCounts(rows.map((r) => r.id));
    return {
      items: rows.map((r) => this.toView(r, counts.get(r.id) ?? 0)),
      total,
    };
  }

  /** The shipment with its devices, as on the shipping sheet. */
  async findOne(id: string, actor: AuthUser): Promise<ShipmentView> {
    const shipment = await this.query(this.dataSource.manager, actor)
      .andWhere('s.id = :id', { id })
      .getOne();
    if (!shipment) throw new NotFoundException('Envío no encontrado');

    const lines = await this.dataSource
      .getRepository(ShipmentLine)
      .createQueryBuilder('l')
      .innerJoinAndSelect('l.order', 'o')
      .leftJoinAndSelect('o.client', 'c')
      .leftJoinAndSelect('o.device', 'd')
      .where('l.shipmentId = :id', { id })
      .orderBy('o.code', 'ASC')
      .getMany();
    return {
      ...this.toView(shipment, lines.length),
      lines: lines.map((l) => {
        const o = l.order!;
        return {
          orderId: o.id,
          orderCode: o.code,
          clientName: [o.client?.firstName, o.client?.lastName]
            .filter(Boolean)
            .join(' '),
          device: o.device ? `${o.device.brand} ${o.device.model}` : null,
          accessories: o.accessories ?? null,
          receivedAt: l.receivedAt,
          notArrived: l.notArrived,
        };
      }),
    };
  }

  private query(m: EntityManager, actor: AuthUser) {
    const qb = m
      .getRepository(Shipment)
      .createQueryBuilder('s')
      .innerJoinAndSelect('s.fromStore', 'fs')
      .innerJoinAndSelect('s.toStore', 'ts')
      .leftJoinAndSelect('s.createdBy', 'u');
    const storeId = scopedStoreId(actor);
    if (storeId) {
      qb.where('(s.fromStoreId = :storeId OR s.toStoreId = :storeId)', {
        storeId,
      });
    }
    return qb;
  }

  private async lineCounts(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const rows: { shipmentId: string; n: number }[] = await this.dataSource
      .getRepository(ShipmentLine)
      .createQueryBuilder('l')
      .select('l.shipmentId', 'shipmentId')
      .addSelect('count(*)::int', 'n')
      .where('l.shipmentId IN (:...ids)', { ids })
      .groupBy('l.shipmentId')
      .getRawMany();
    return new Map(rows.map((r) => [r.shipmentId, r.n]));
  }

  private toView(s: Shipment, deviceCount: number): ShipmentView {
    return {
      id: s.id,
      code: ShipmentsService.code(s.number),
      status: s.status,
      fromStore: { id: s.fromStore!.id, name: s.fromStore!.name },
      toStore: { id: s.toStore!.id, name: s.toStore!.name },
      carrier: s.carrier,
      createdBy: s.createdBy
        ? { id: s.createdBy.id, fullName: s.createdBy.fullName }
        : null,
      createdAt: s.createdAt,
      receivedAt: s.receivedAt,
      deviceCount,
    };
  }

  private static code(number: number): string {
    return `ENV-${String(number).padStart(4, '0')}`;
  }

  /** Where an order is, in the words of the screens. */
  private static where(o: ServiceOrder): string {
    if (o.status === ServiceStatus.ENTREGADO) return 'ya entregada';
    if (o.status === ServiceStatus.CANCELADO) return 'cancelada';
    if (!o.location) return 'es de Medina';
    return LOCATION_LABEL[o.location];
  }
}
