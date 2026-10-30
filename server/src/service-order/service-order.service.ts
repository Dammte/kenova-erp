import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { Inventory } from '../inventory/entities/inventory.entity';
import { ConsumePartsDto } from './dto/consume-parts.dto';
import {
  ORDER_FAULTS,
  OrderFault,
  LOCATION_LABEL,
  OrderLocation,
  OrderResult,
  ServiceOrder,
  ServiceStatus,
} from './entities/service-order.entity';
import { Service } from '../services/entities/service.entity';
import { CreateServiceOrderDto } from './dto/create-service-order.dto';
import { UpdateServiceOrderDto } from './dto/update-service-order.dto';
import { ANONYMIZED_CLIENT, Client } from '../clients/entities/client.entity';
import { Device } from '../devices/entities/device.entity';
import { Brand } from '../brands/entities/brand.entity';
import { ServiceHistory } from '../service-history/entities/service-history.entity';
import { Store } from '../stores/entities/store.entity';
import { OrderLine, OrderLineKind } from './entities/order-line.entity';
import type { AuthUser } from '../auth/auth.types';
import { orderScope, scopedStoreId } from '../common/store-scope';
import { CREDIT, OrderPayment } from './entities/order-payment.entity';
import { OrderPaymentsService } from './order-payments.service';
import { derivePayment } from './payment-status';
import { UserRole } from '../users/entities/user.entity';

/** IMEI or serial as typed or scanned: no spaces or dashes, upper case. */
export function normalizeImei(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

/** Whole days since `date`. */
function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

export interface ImeiLookup {
  imei: string;
  openOrders: {
    id: string;
    code: string;
    status: ServiceStatus;
    createdAt: Date;
  }[];
  deliveries: {
    id: string;
    code: string;
    deliveredAt: Date;
    daysAgo: number;
    withinWarranty: boolean;
    /** The order is in the trash: restore it to open a warranty claim. */
    inTrash: boolean;
    /** "Batería · 59,00 €" */
    summary: string;
  }[];
}

@Injectable()
export class ServiceOrderService {
  private readonly UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  constructor(
    @InjectRepository(ServiceOrder)
    private readonly serviceOrderRepository: Repository<ServiceOrder>,

    @InjectRepository(Service)
    private readonly serviceRepository: Repository<Service>,

    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,

    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,

    @InjectRepository(Brand)
    private readonly brandRepository: Repository<Brand>,

    @InjectRepository(ServiceHistory)
    private readonly serviceHistoryRepository: Repository<ServiceHistory>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly payments: OrderPaymentsService,
  ) {}

  /**
   * Keeps the lifecycle dates in step with the status: the first time an order
   * is finished or delivered is recorded, and reopening it clears them so the
   * days in the workshop count again.
   */
  private static applyLifecycle(
    order: ServiceOrder,
    previous: ServiceStatus | null,
    now = new Date(),
  ): void {
    const status = order.status;
    const finished =
      status === ServiceStatus.FINALIZADO || status === ServiceStatus.ENTREGADO;
    if (!finished) order.result = null;
    if (order.result !== OrderResult.NOT_REPAIRED) {
      order.notRepairedReason = null;
    }
    if (status === previous) {
      if (status !== ServiceStatus.CANCELADO) order.cancelReason = null;
      return;
    }
    if (status === ServiceStatus.FINALIZADO) {
      order.finishedAt ??= now;
      order.deliveredAt = null;
    } else if (status === ServiceStatus.ENTREGADO) {
      order.finishedAt ??= now;
      order.deliveredAt ??= now;
    } else if (status !== ServiceStatus.CANCELADO) {
      order.finishedAt = null;
      order.deliveredAt = null;
    }
    if (status !== ServiceStatus.CANCELADO) order.cancelReason = null;
  }

  /** Rejects an outcome that the order's state cannot hold. */
  private static checkOutcome(
    order: ServiceOrder,
    dto: UpdateServiceOrderDto,
  ): void {
    if (dto.result && order.result !== dto.result) {
      throw new BadRequestException(
        'Solo una orden finalizada o entregada tiene resultado',
      );
    }
    if (order.result === OrderResult.NOT_REPAIRED && !order.notRepairedReason) {
      throw new BadRequestException('Indica por qué no se repara');
    }
    if (order.warrantyRejectedReason && !order.warrantyOfId) {
      throw new BadRequestException(
        'Solo una orden de garantía puede marcarse como «garantía no procede»',
      );
    }
  }

  /**
   * Rebuilds the order's lines from its services and total: one line per
   * service (keeping the price it already had on this order) plus an
   * "Ajuste" line for any difference, so the lines always add up to the total.
   */
  private async syncLines(m: EntityManager, order: ServiceOrder) {
    const repo = m.getRepository(OrderLine);
    const previous = await repo.find({ where: { orderId: order.id } });
    const priceOf = new Map(
      previous
        .filter((l) => l.kind === OrderLineKind.SERVICE && l.serviceId)
        .map((l) => [l.serviceId, l.unitPrice]),
    );
    await repo.delete({ orderId: order.id });

    const services = [...(order.services ?? [])].sort((a, b) =>
      a.name.localeCompare(b.name, 'es'),
    );
    const lines = services.map((s, i) =>
      repo.create({
        orderId: order.id,
        position: i + 1,
        kind: OrderLineKind.SERVICE,
        serviceId: s.id,
        description: s.name.slice(0, 150),
        unitPrice: priceOf.get(s.id) ?? Number(s.price).toFixed(2),
        quantity: 1,
      }),
    );
    const cents = (v: unknown) => Math.round(Number(v ?? 0) * 100);
    const diff =
      cents(order.totalPrice) -
      lines.reduce((sum, l) => sum + cents(l.unitPrice) * l.quantity, 0);
    if (diff !== 0) {
      lines.push(
        repo.create({
          orderId: order.id,
          position: lines.length + 1,
          kind: OrderLineKind.ADJUSTMENT,
          serviceId: null,
          description: 'Ajuste',
          unitPrice: (diff / 100).toFixed(2),
          quantity: 1,
        }),
      );
    }
    await repo.save(lines);
  }

  // ─── Brand name resolver ────────────────────────────────────────────────────
  private async resolveBrandNames(orders: ServiceOrder[]): Promise<void> {
    const brandIds = [
      ...new Set(
        orders
          .filter(
            (o) => o.device?.brand && this.UUID_REGEX.test(o.device.brand),
          )
          .map((o) => o.device!.brand),
      ),
    ];

    if (brandIds.length === 0) return;

    const brands = await this.brandRepository.find({
      where: { id: In(brandIds) },
    });
    const brandMap = new Map(brands.map((b) => [b.id, b.name]));

    orders.forEach((order) => {
      if (order.device?.brand && this.UUID_REGEX.test(order.device.brand)) {
        order.device.brand =
          brandMap.get(order.device.brand) ?? order.device.brand;
      }
    });
  }

  /**
   * A warranty claim must point to a delivered order the actor can see, within
   * the warranty period; only the workshop admins may open one after it.
   */
  private async checkWarrantyOf(
    m: EntityManager,
    warrantyOfId: string,
    actor: AuthUser,
    selfId?: string,
  ): Promise<void> {
    const original = await m.getRepository(ServiceOrder).findOne({
      where: { id: warrantyOfId, ...orderScope(actor) },
      relations: { store: true },
      withDeleted: true,
    });
    if (!original || original.id === selfId) {
      throw new NotFoundException('Orden original no encontrada');
    }
    if (original.deletedAt) {
      throw new BadRequestException(
        `La orden ${original.code} está en la Papelera. Restáurala o crea una orden normal.`,
      );
    }
    if (!original.deliveredAt) {
      throw new BadRequestException(
        `La orden ${original.code} aún no se ha entregado`,
      );
    }
    const days = daysSince(original.deliveredAt);
    // The warranty of the store that delivered it.
    const limit = original.store!.warrantyDays;
    if (days > limit && actor.role !== UserRole.SUPER_ADMIN) {
      throw new BadRequestException(
        `Este equipo se entregó hace ${days} días (${original.code}). El plazo de garantía es de ${limit} días.`,
      );
    }
  }

  /**
   * What the shop knows about an IMEI or serial number when a device comes in:
   * orders still open for it (it may already be in the workshop) and its past
   * deliveries, newest first, with whether each is still under warranty.
   * Limited to the orders the actor sees.
   */
  async lookupImei(rawImei: string, actor: AuthUser): Promise<ImeiLookup> {
    const imei = normalizeImei(rawImei);
    if (imei.length < 5) return { imei, openOrders: [], deliveries: [] };

    const qb = this.dataSource
      .getRepository(ServiceOrder)
      .createQueryBuilder('o')
      .withDeleted()
      .innerJoin('o.device', 'd')
      .innerJoinAndSelect('o.store', 's')
      .leftJoinAndSelect('o.lines', 'l')
      .where(`regexp_replace(upper(d.imei), '[\\s-]', '', 'g') = :imei`, {
        imei,
      });
    const storeId = scopedStoreId(actor);
    if (storeId) qb.andWhere('o.storeId = :storeId', { storeId });
    const orders = await qb
      .orderBy('o.createdAt', 'DESC')
      .addOrderBy('l.position', 'ASC')
      .getMany();

    const closed = [ServiceStatus.ENTREGADO, ServiceStatus.CANCELADO];
    return {
      imei,
      openOrders: orders
        .filter((o) => !o.deletedAt && !closed.includes(o.status))
        .map((o) => ({
          id: o.id,
          code: o.code,
          status: o.status,
          createdAt: o.createdAt,
        })),
      deliveries: orders
        .filter((o) => o.status === ServiceStatus.ENTREGADO && o.deliveredAt)
        .sort((a, b) => b.deliveredAt!.getTime() - a.deliveredAt!.getTime())
        .slice(0, 10)
        .map((o) => {
          const daysAgo = daysSince(o.deliveredAt!);
          return {
            id: o.id,
            code: o.code,
            deliveredAt: o.deliveredAt!,
            daysAgo,
            withinWarranty: daysAgo <= o.store!.warrantyDays,
            inTrash: !!o.deletedAt,
            summary: [
              (o.lines ?? []).map((l) => l.description).join(' + '),
              `${Number(o.totalPrice ?? 0)
                .toFixed(2)
                .replace('.', ',')} €`,
            ]
              .filter(Boolean)
              .join(' · '),
          };
        }),
    };
  }

  // ─── CRUD ───────────────────────────────────────────────────────────────────
  /**
   * The store an order is created in: a store account's own store; for the
   * workshop admins, the main store.
   */
  async storeIdFor(
    actor: AuthUser,
    m: EntityManager = this.dataSource.manager,
  ): Promise<string> {
    if (actor.role !== UserRole.SUPER_ADMIN && actor.storeId) {
      return actor.storeId;
    }
    const main = await m
      .getRepository(Store)
      .findOne({ where: { isMain: true }, select: { id: true } });
    if (!main) throw new BadRequestException('No hay tienda principal');
    return main.id;
  }

  /**
   * Takes the store's next number. The UPDATE locks the store row until the
   * transaction ends, so concurrent orders never get the same number, and a
   * rolled-back order gives its number back.
   */
  private async takeNumber(
    m: EntityManager,
    storeId: string,
  ): Promise<{ number: number; code: string; location: OrderLocation | null }> {
    const { raw } = await m
      .createQueryBuilder()
      .update(Store)
      .set({ nextOrderNumber: () => '"nextOrderNumber" + 1' })
      .where('id = :storeId AND "isActive"', { storeId })
      .returning(['nextOrderNumber', 'prefix', 'isMain'])
      .execute();
    const row = (
      raw as { nextOrderNumber: number; prefix: string; isMain: boolean }[]
    )[0];
    if (!row) {
      throw new BadRequestException('La tienda no existe o está desactivada');
    }
    const number = row.nextOrderNumber - 1;
    return {
      number,
      code: `${row.prefix}-${String(number).padStart(4, '0')}`,
      // A partner store sends the device to the workshop to be repaired.
      location: row.isMain ? null : OrderLocation.AT_STORE,
    };
  }

  /**
   * With `manager`, runs inside the caller's transaction (the intake) and
   * returns the saved row without relations; the caller reloads it after commit.
   * Without it, opens its own transaction so the number is only spent if the
   * order is saved.
   */
  async create(
    createServiceOrderDto: CreateServiceOrderDto,
    at: { storeId: string; actor: AuthUser },
    manager?: EntityManager,
  ): Promise<ServiceOrder> {
    if (!manager) {
      const saved = await this.dataSource.transaction((m) =>
        this.create(createServiceOrderDto, at, m),
      );
      return this.findOne(saved.id);
    }
    const m = manager;
    const { storeId } = at;
    const {
      serviceIds,
      clientId,
      deviceId,
      inventoryIds: _unused,
      ...orderData
    } = createServiceOrderDto;

    const client = await m.getRepository(Client).findOne({
      where: { id: clientId },
    });
    if (!client) {
      throw new NotFoundException(`Cliente con ID ${clientId} no encontrado`);
    }
    if (client.anonymizedAt) {
      throw new BadRequestException(ANONYMIZED_CLIENT);
    }

    let device: Device | null = null;
    if (deviceId) {
      device = await m
        .getRepository(Device)
        .findOne({ where: { id: deviceId } });
      if (!device) {
        throw new NotFoundException(
          `Dispositivo con ID ${deviceId} no encontrado`,
        );
      }
      if (device.clientId && device.clientId !== client.id) {
        throw new BadRequestException(
          'El dispositivo no pertenece a este cliente',
        );
      }
    }

    let services: Service[] = [];
    if (serviceIds && serviceIds.length > 0) {
      services = await m.getRepository(Service).find({
        where: { id: In(serviceIds) },
      });
      if (services.length !== serviceIds.length) {
        throw new NotFoundException(
          'Uno o más servicios no fueron encontrados',
        );
      }

      const unavailableServices = services.filter((s) => !s.available);
      if (unavailableServices.length > 0) {
        throw new BadRequestException(
          `Servicios no disponibles: ${unavailableServices.map((s) => s.name).join(', ')}`,
        );
      }
    }

    if (orderData.warrantyOfId) {
      await this.checkWarrantyOf(m, orderData.warrantyOfId, at.actor);
    }

    // Calcular total solo con servicios
    const servicesTotal = services.reduce((sum, s) => sum + Number(s.price), 0);
    const calculatedTotal = servicesTotal;
    const totalPrice = orderData.totalPrice ?? calculatedTotal;
    const amountPaid = orderData.amountPaid ?? 0;

    // The current intake screens still put the fault on the device; carry it
    // over so the order records why the device came in this time.
    const deviceFault = device?.status as OrderFault | undefined;
    const reportedFaults =
      orderData.reportedFaults ??
      (deviceFault && ORDER_FAULTS.includes(deviceFault) ? [deviceFault] : []);

    const serviceOrder = m.getRepository(ServiceOrder).create({
      ...orderData,
      reportedFaults,
      storeId,
      ...(await this.takeNumber(m, storeId)),
      client,
      device: device ?? undefined,
      services,
      totalPrice,
      amountPaid,
      ...derivePayment(totalPrice, amountPaid),
    });
    ServiceOrderService.applyLifecycle(serviceOrder, null);

    const saved = await m.getRepository(ServiceOrder).save(serviceOrder);
    await this.syncLines(m, saved);
    await this.payments.recordEdit(
      m,
      saved,
      0,
      at.actor.id,
      storeId,
      'Pagado al crear la orden',
    );
    return saved;
  }

  async findByClientId(
    clientId: string,
    actor: AuthUser,
  ): Promise<ServiceOrder[]> {
    const orders = await this.serviceOrderRepository.find({
      where: { clientId, deletedAt: IsNull(), ...orderScope(actor) },
      relations: ['device', 'services', 'lines'],
      order: { createdAt: 'DESC', lines: { position: 'ASC' } },
      withDeleted: true,
    });
    await this.resolveBrandNames(orders);
    return orders;
  }

  async findAll(actor: AuthUser): Promise<ServiceOrder[]> {
    // withDeleted keeps orders of archived (soft-deleted) clients readable;
    // deleted orders themselves are filtered explicitly.
    const orders = await this.serviceOrderRepository.find({
      where: { deletedAt: IsNull(), ...orderScope(actor) },
      relations: ['client', 'device', 'services', 'serviceHistory', 'lines'],
      order: { createdAt: 'DESC', lines: { position: 'ASC' } },
      withDeleted: true,
    });

    await this.resolveBrandNames(orders);
    return orders;
  }

  /** Without an actor (internal calls) the order is not limited to a store. */
  async findOne(id: string, actor?: AuthUser): Promise<ServiceOrder> {
    const serviceOrder = await this.serviceOrderRepository.findOne({
      where: { id, deletedAt: IsNull(), ...(actor ? orderScope(actor) : {}) },
      relations: ['client', 'device', 'services', 'serviceHistory', 'lines'],
      order: { lines: { position: 'ASC' } },
      withDeleted: true,
    });

    if (!serviceOrder) {
      throw new NotFoundException(
        `Orden de servicio con ID ${id} no encontrada`,
      );
    }

    await this.resolveBrandNames([serviceOrder]);
    return serviceOrder;
  }

  async update(
    id: string,
    updateServiceOrderDto: UpdateServiceOrderDto,
    actor: AuthUser,
  ): Promise<ServiceOrder> {
    const actorUserId = actor.id;
    const { serviceIds, clientId, deviceId, ...updateData } =
      updateServiceOrderDto;

    const serviceOrder = await this.findOne(id, actor);

    if (clientId) {
      const client = await this.clientRepository.findOne({
        where: { id: clientId },
      });
      if (!client) {
        throw new NotFoundException(`Cliente con ID ${clientId} no encontrado`);
      }
      if (client.anonymizedAt) {
        throw new BadRequestException(ANONYMIZED_CLIENT);
      }
      if (clientId !== serviceOrder.clientId) {
        const usesCredit = await this.dataSource
          .getRepository(OrderPayment)
          .exists({ where: { orderId: id, method: CREDIT } });
        if (usesCredit) {
          throw new BadRequestException(
            'Esta orden movió saldo a favor del cliente: no se puede cambiar de cliente',
          );
        }
      }
      serviceOrder.client = client;
      serviceOrder.clientId = clientId;
    }

    if (deviceId !== undefined) {
      if (deviceId === null) {
        serviceOrder.device = undefined as any;
        serviceOrder.deviceId = undefined as any;
      } else {
        const device = await this.deviceRepository.findOne({
          where: { id: deviceId },
        });
        if (!device) {
          throw new NotFoundException(
            `Dispositivo con ID ${deviceId} no encontrado`,
          );
        }
        if (device.clientId && device.clientId !== serviceOrder.clientId) {
          throw new BadRequestException(
            'El dispositivo no pertenece a este cliente',
          );
        }
        serviceOrder.device = device;
        serviceOrder.deviceId = deviceId;
      }
    }

    if (serviceIds !== undefined) {
      if (serviceIds.length === 0) {
        serviceOrder.services = [];
      } else {
        const services = await this.serviceRepository.find({
          where: { id: In(serviceIds) },
        });
        if (services.length !== serviceIds.length) {
          const foundIds = services.map((s) => s.id);
          const missing = serviceIds.filter((sid) => !foundIds.includes(sid));
          throw new NotFoundException(
            `Servicios no encontrados: ${missing.join(', ')}`,
          );
        }

        const unavailable = services.filter((s) => !s.available);
        if (unavailable.length > 0) {
          throw new BadRequestException(
            `Servicios no disponibles: ${unavailable.map((s) => s.name).join(', ')}`,
          );
        }
        serviceOrder.services = services;
      }
    }

    // Capturar estado anterior antes de aplicar cambios
    const previousStatus = serviceOrder.status;
    const previousPaid = serviceOrder.amountPaid;

    if (
      updateData.warrantyOfId &&
      updateData.warrantyOfId !== serviceOrder.warrantyOfId
    ) {
      await this.checkWarrantyOf(
        this.dataSource.manager,
        updateData.warrantyOfId,
        actor,
        serviceOrder.id,
      );
    }

    Object.assign(serviceOrder, updateData);
    ServiceOrderService.applyLifecycle(serviceOrder, previousStatus);
    ServiceOrderService.checkOutcome(serviceOrder, updateData);
    if (
      serviceOrder.status === ServiceStatus.ENTREGADO &&
      previousStatus !== ServiceStatus.ENTREGADO &&
      serviceOrder.location &&
      serviceOrder.location !== OrderLocation.AT_STORE &&
      serviceOrder.location !== OrderLocation.READY_AT_STORE
    ) {
      throw new BadRequestException(
        `El equipo aún no ha vuelto a la tienda (${LOCATION_LABEL[serviceOrder.location]})`,
      );
    }

    // Recalcular balance y estado de pago si cambiaron campos financieros o servicios
    if (
      updateData.totalPrice !== undefined ||
      updateData.amountPaid !== undefined ||
      serviceIds !== undefined
    ) {
      const totalPrice = Number(serviceOrder.totalPrice ?? 0);
      const amountPaid = Number(serviceOrder.amountPaid ?? 0);
      Object.assign(serviceOrder, derivePayment(totalPrice, amountPaid));
    }

    await this.dataSource.transaction(async (m) => {
      await m.getRepository(ServiceOrder).save(serviceOrder);
      if (updateData.totalPrice !== undefined || serviceIds !== undefined) {
        await this.syncLines(m, serviceOrder);
      }
      if (updateData.amountPaid !== undefined) {
        await this.payments.recordEdit(
          m,
          serviceOrder,
          previousPaid,
          actorUserId,
          await this.storeIdFor(actor, m),
        );
      }
    });

    // Registrar cambio de estado en el historial automáticamente
    if (updateData.status && updateData.status !== previousStatus) {
      const STATUS_LABELS: Record<string, string> = {
        pendiente_cliente: 'Pendiente Cliente',
        en_progreso: 'En Progreso',
        pendiente_piezas: 'Pendiente Piezas',
        finalizado: 'Finalizado',
        entregado: 'Entregado',
        cancelado: 'Cancelado',
      };
      await this.serviceHistoryRepository.save(
        this.serviceHistoryRepository.create({
          serviceOrderId: id,
          performedBy: { id: actorUserId } as any,
          action: 'cambio_estado',
          description: `Estado cambiado de "${STATUS_LABELS[previousStatus] ?? previousStatus}" a "${STATUS_LABELS[updateData.status] ?? updateData.status}"`,
        }),
      );
    }

    return this.findOne(id);
  }

  /** Soft delete: the order and its history stay in the database. */
  async remove(id: string, actorUserId: string): Promise<void> {
    await this.findOne(id);
    await this.serviceOrderRepository.softDelete(id);
    await this.audit.record({
      action: 'SERVICE_ORDER_DELETED',
      actorUserId,
      entityType: 'service_order',
      entityId: id,
    });
  }

  /**
   * Takes parts out of stock for an order, all or nothing.
   * Each decrement is a single conditional UPDATE, so two technicians using the
   * last unit at the same time cannot both succeed and stock never goes negative.
   */
  async consumeParts(
    orderId: string,
    dto: ConsumePartsDto,
    actor: AuthUser,
  ): Promise<{
    parts: {
      inventoryId: string;
      name: string;
      quantity: number;
      stock: number;
    }[];
  }> {
    const actorUserId = actor.id;
    const merged = new Map<string, number>();
    for (const p of dto.parts) {
      merged.set(p.inventoryId, (merged.get(p.inventoryId) ?? 0) + p.quantity);
    }

    return this.dataSource.transaction(async (manager) => {
      const order = await manager.getRepository(ServiceOrder).findOne({
        where: { id: orderId, deletedAt: IsNull(), ...orderScope(actor) },
      });
      if (!order)
        throw new NotFoundException('Orden de servicio no encontrada');

      const result: {
        inventoryId: string;
        name: string;
        quantity: number;
        stock: number;
      }[] = [];
      // Stable order avoids deadlocks between concurrent requests.
      for (const [inventoryId, quantity] of [...merged.entries()].sort()) {
        const rows: { id: string; name: string; stock: number }[] =
          await manager
            .createQueryBuilder()
            .update(Inventory)
            .set({
              stock: () => `"stock" - ${Number(quantity)}`,
              updatedBy: actorUserId.slice(0, 50),
            })
            .where('id = :id', { id: inventoryId })
            .andWhere('"deletedAt" IS NULL')
            .andWhere('"stock" >= :quantity', { quantity })
            .returning(['id', 'name', 'stock'])
            .execute()
            .then((r) => r.raw);
        if (rows.length === 0) {
          const part = await manager
            .getRepository(Inventory)
            .findOne({ where: { id: inventoryId }, withDeleted: true });
          if (!part || part.deletedAt) {
            throw new NotFoundException('Pieza de inventario no encontrada');
          }
          throw new ConflictException(
            `Stock insuficiente de "${part.name}": quedan ${part.stock ?? 0}, se necesitan ${quantity}`,
          );
        }
        result.push({
          inventoryId,
          name: rows[0].name,
          quantity,
          stock: Number(rows[0].stock),
        });
      }

      await manager.getRepository(ServiceHistory).insert({
        serviceOrderId: orderId,
        performedBy: { id: actorUserId } as any,
        action: 'piezas_usadas',
        description: result.map((p) => `${p.name} x${p.quantity}`).join(', '),
        partsReplaced: result.map((p) => `${p.name} x${p.quantity}`).join(', '),
      });
      await this.audit.record(
        {
          action: 'SERVICE_ORDER_PARTS_CONSUMED',
          actorUserId,
          entityType: 'service_order',
          entityId: orderId,
          metadata: {
            parts: result.map(({ inventoryId, quantity }) => ({
              inventoryId,
              quantity,
            })),
          },
        },
        manager,
      );
      return { parts: result };
    });
  }
}
