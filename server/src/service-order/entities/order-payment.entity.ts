import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Store } from '../../stores/entities/store.entity';
import { User } from '../../users/entities/user.entity';
import { PaymentMethod, ServiceOrder } from './service-order.entity';

export enum PaymentKind {
  CHARGE = 'charge',
  REFUND = 'refund',
}

export enum PaymentOrigin {
  /** Registered with the payments screen. */
  COUNTER = 'counter',
  /** Difference left by editing "pagado" on the current order screens. */
  ORDER_EDIT = 'order_edit',
  /** The amount paid an order already had when payments were introduced. */
  MIGRATED = 'migrated',
}

/**
 * One charge or refund of an order. Append-only: a mistake is corrected with a
 * refund, never by editing or deleting. Charges minus refunds always equal the
 * order's amountPaid.
 */
@Entity('order_payments')
@Check('CHK_order_payments_amount_positive', `"amount" > 0`)
@Check('CHK_order_payments_kind', `"kind" IN ('charge', 'refund')`)
@Check(
  'CHK_order_payments_method',
  `"method" IN ('cash', 'card', 'transfer', 'other')`,
)
@Check(
  'CHK_order_payments_origin',
  `"origin" IN ('counter', 'order_edit', 'migrated')`,
)
@Index('IDX_order_payments_store_createdAt', ['storeId', 'createdAt'])
export class OrderPayment {
  /** May be sent by the screen, so a retried request never charges twice. */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ServiceOrder, (o) => o.payments, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'orderId',
    foreignKeyConstraintName: 'FK_order_payments_order',
  })
  order?: ServiceOrder;

  @Index('IDX_order_payments_orderId')
  @Column('uuid')
  orderId: string;

  /** Where the money came in or went out, for each store's till. */
  @ManyToOne(() => Store, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'storeId',
    foreignKeyConstraintName: 'FK_order_payments_store',
  })
  store?: Store;

  @Column('uuid')
  storeId: string;

  @Column({ type: 'varchar', length: 10 })
  kind: PaymentKind;

  /** Always positive; the kind says whether it adds or subtracts. */
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: string;

  @Column({ type: 'varchar', length: 10 })
  method: PaymentMethod;

  /** Optional for a charge; the reason, required, for a refund. */
  @Column({ type: 'varchar', length: 300, nullable: true })
  note: string | null;

  @Column({ type: 'varchar', length: 20, default: PaymentOrigin.COUNTER })
  origin: PaymentOrigin;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'createdById',
    foreignKeyConstraintName: 'FK_order_payments_user',
  })
  createdBy?: User | null;

  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
