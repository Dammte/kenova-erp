import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import type { AuthUser } from '../auth/auth.types';
import { assertOrderVisible, orderScope } from '../common/store-scope';
import { CreatePaymentDto } from './dto/create-payment.dto';
import {
  OrderPayment,
  PaymentKind,
  PaymentOrigin,
} from './entities/order-payment.entity';
import { PaymentMethod, ServiceOrder } from './entities/service-order.entity';
import { derivePayment, toCents } from './payment-status';

const euros = (cents: number) =>
  `${(cents / 100).toFixed(2).replace('.', ',')} €`;

/** Only the fields of the author that the screens need. */
function slimAuthor(p: OrderPayment): OrderPayment {
  if (p.createdBy) {
    const { id, fullName } = p.createdBy;
    p.createdBy = { id, fullName } as OrderPayment['createdBy'];
  }
  return p;
}

@Injectable()
export class OrderPaymentsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async list(orderId: string, actor: AuthUser): Promise<OrderPayment[]> {
    await assertOrderVisible(this.dataSource.manager, orderId, actor);
    const rows = await this.dataSource.getRepository(OrderPayment).find({
      where: { orderId },
      relations: { createdBy: true },
      order: { createdAt: 'ASC' },
    });
    return rows.map(slimAuthor);
  }

  /**
   * Registers a charge or a refund and updates what the order has paid, in one
   * transaction. The order row is locked, so two charges at the same time can
   * never take more than what is pending.
   */
  async record(
    orderId: string,
    dto: CreatePaymentDto,
    actor: AuthUser,
    storeId: string,
  ): Promise<OrderPayment> {
    const id = await this.dataSource.transaction(async (m) => {
      const order = await m.getRepository(ServiceOrder).findOne({
        where: { id: orderId, deletedAt: IsNull(), ...orderScope(actor) },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order)
        throw new NotFoundException('Orden de servicio no encontrada');

      const amount = toCents(dto.amount);
      if (dto.id) {
        const previous = await m
          .getRepository(OrderPayment)
          .findOne({ where: { id: dto.id } });
        if (previous) {
          const same =
            previous.orderId === orderId &&
            previous.kind === dto.kind &&
            toCents(previous.amount) === amount;
          if (!same) {
            throw new ConflictException('Ese cobro ya existe con otros datos');
          }
          return previous.id;
        }
      }

      const paid = toCents(order.amountPaid);
      const total = toCents(order.totalPrice);
      if (dto.kind === PaymentKind.CHARGE) {
        const pending = total - paid;
        if (pending <= 0) {
          throw new BadRequestException('Esta orden ya está pagada');
        }
        if (amount > pending) {
          throw new BadRequestException(
            `Máximo ${euros(pending)}: es lo que queda pendiente`,
          );
        }
      } else {
        if (!dto.note) {
          throw new BadRequestException('Indica el motivo de la devolución');
        }
        if (amount > paid) {
          throw new BadRequestException(
            `Máximo ${euros(paid)}: es lo cobrado en esta orden`,
          );
        }
      }

      const saved = await this.insert(m, order, {
        id: dto.id,
        kind: dto.kind,
        amount,
        method: dto.method,
        note: dto.note ?? null,
        origin: PaymentOrigin.COUNTER,
        createdById: actor.id,
        storeId,
      });
      const newPaid =
        paid + (dto.kind === PaymentKind.CHARGE ? amount : -amount);
      await m.getRepository(ServiceOrder).update(orderId, {
        amountPaid: newPaid / 100,
        ...derivePayment(total / 100, newPaid / 100),
      });
      return saved.id;
    });
    const payment = await this.dataSource
      .getRepository(OrderPayment)
      .findOne({ where: { id }, relations: { createdBy: true } });
    return slimAuthor(payment!);
  }

  /**
   * The current order screens still edit "pagado" directly. Records the
   * difference as a payment, so the payments always add up to amountPaid.
   */
  async recordEdit(
    m: EntityManager,
    order: ServiceOrder,
    previousPaid: number | string | null | undefined,
    actorUserId: string | null,
    storeId: string,
    note = 'Importe cambiado al editar la orden',
  ): Promise<void> {
    const diff = toCents(order.amountPaid) - toCents(previousPaid);
    if (diff === 0) return;
    await this.insert(m, order, {
      kind: diff > 0 ? PaymentKind.CHARGE : PaymentKind.REFUND,
      amount: Math.abs(diff),
      method: order.paymentMethod ?? PaymentMethod.OTHER,
      note,
      origin: PaymentOrigin.ORDER_EDIT,
      createdById: actorUserId,
      storeId,
    });
  }

  private insert(
    m: EntityManager,
    order: ServiceOrder,
    p: {
      id?: string;
      kind: PaymentKind;
      amount: number;
      method: PaymentMethod;
      note: string | null;
      origin: PaymentOrigin;
      createdById: string | null;
      storeId: string;
    },
  ): Promise<OrderPayment> {
    const repo = m.getRepository(OrderPayment);
    return repo.save(
      repo.create({
        ...p,
        orderId: order.id,
        amount: (p.amount / 100).toFixed(2),
      }),
    );
  }
}
