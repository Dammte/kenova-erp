import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { Inventory } from '../inventory/entities/inventory.entity';
import { ConsumePartsDto } from './dto/consume-parts.dto';
import { PaymentStatus, ServiceOrder } from './entities/service-order.entity';
import { Service } from '../services/entities/service.entity';
import { CreateServiceOrderDto } from './dto/create-service-order.dto';
import { UpdateServiceOrderDto } from './dto/update-service-order.dto';
import { Client } from '../clients/entities/client.entity';
import { Device } from '../devices/entities/device.entity';
import { Brand } from '../brands/entities/brand.entity';
import { ServiceHistory } from '../service-history/entities/service-history.entity';

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
  ) {}

  /** Payment status is always derived from the amounts, never taken from the request. */
  private static derivePayment(totalPrice: number, amountPaid: number) {
    const paymentStatus =
      totalPrice > 0 && amountPaid >= totalPrice
        ? PaymentStatus.PAID
        : amountPaid > 0
          ? PaymentStatus.PAID_PARTIAL
          : PaymentStatus.PENDING;
    return {
      balance: Number((totalPrice - amountPaid).toFixed(2)),
      paymentStatus,
    };
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

  // ─── CRUD ───────────────────────────────────────────────────────────────────
  async create(
    createServiceOrderDto: CreateServiceOrderDto,
  ): Promise<ServiceOrder> {
    const {
      serviceIds,
      clientId,
      deviceId,
      inventoryIds: _unused,
      ...orderData
    } = createServiceOrderDto;

    const client = await this.clientRepository.findOne({
      where: { id: clientId },
    });
    if (!client) {
      throw new NotFoundException(`Cliente con ID ${clientId} no encontrado`);
    }

    let device: Device | null = null;
    if (deviceId) {
      device = await this.deviceRepository.findOne({ where: { id: deviceId } });
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
      services = await this.serviceRepository.find({
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

    // Calcular total solo con servicios
    const servicesTotal = services.reduce((sum, s) => sum + Number(s.price), 0);
    const calculatedTotal = servicesTotal;
    const totalPrice = orderData.totalPrice ?? calculatedTotal;
    const amountPaid = orderData.amountPaid ?? 0;

    const serviceOrder = this.serviceOrderRepository.create({
      ...orderData,
      client,
      device: device ?? undefined,
      services,
      totalPrice,
      amountPaid,
      ...ServiceOrderService.derivePayment(totalPrice, amountPaid),
    });

    const saved = await this.serviceOrderRepository.save(serviceOrder);
    return this.findOne(saved.id);
  }

  async findByClientId(clientId: string): Promise<ServiceOrder[]> {
    const orders = await this.serviceOrderRepository.find({
      where: { clientId, deletedAt: IsNull() },
      relations: ['device', 'services'],
      order: { createdAt: 'DESC' },
      withDeleted: true,
    });
    await this.resolveBrandNames(orders);
    return orders;
  }

  async findAll(): Promise<ServiceOrder[]> {
    // withDeleted keeps orders of archived (soft-deleted) clients readable;
    // deleted orders themselves are filtered explicitly.
    const orders = await this.serviceOrderRepository.find({
      where: { deletedAt: IsNull() },
      relations: ['client', 'device', 'services', 'serviceHistory'],
      order: { createdAt: 'DESC' },
      withDeleted: true,
    });

    await this.resolveBrandNames(orders);
    return orders;
  }

  async findOne(id: string): Promise<ServiceOrder> {
    const serviceOrder = await this.serviceOrderRepository.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['client', 'device', 'services', 'serviceHistory'],
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
    actorUserId?: string,
  ): Promise<ServiceOrder> {
    const { serviceIds, clientId, deviceId, ...updateData } =
      updateServiceOrderDto;

    const serviceOrder = await this.findOne(id);

    if (clientId) {
      const client = await this.clientRepository.findOne({
        where: { id: clientId },
      });
      if (!client) {
        throw new NotFoundException(`Cliente con ID ${clientId} no encontrado`);
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

    Object.assign(serviceOrder, updateData);

    // Recalcular balance y estado de pago si cambiaron campos financieros o servicios
    if (
      updateData.totalPrice !== undefined ||
      updateData.amountPaid !== undefined ||
      serviceIds !== undefined
    ) {
      const totalPrice = Number(serviceOrder.totalPrice ?? 0);
      const amountPaid = Number(serviceOrder.amountPaid ?? 0);
      Object.assign(
        serviceOrder,
        ServiceOrderService.derivePayment(totalPrice, amountPaid),
      );
    }

    await this.serviceOrderRepository.save(serviceOrder);

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
          performedBy: actorUserId ? ({ id: actorUserId } as any) : undefined,
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
    actorUserId: string,
  ): Promise<{
    parts: {
      inventoryId: string;
      name: string;
      quantity: number;
      stock: number;
    }[];
  }> {
    const merged = new Map<string, number>();
    for (const p of dto.parts) {
      merged.set(p.inventoryId, (merged.get(p.inventoryId) ?? 0) + p.quantity);
    }

    return this.dataSource.transaction(async (manager) => {
      const order = await manager.getRepository(ServiceOrder).findOne({
        where: { id: orderId, deletedAt: IsNull() },
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
