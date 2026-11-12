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
import { OrderPayment } from '../../service-order/entities/order-payment.entity';
import { Store } from '../../stores/entities/store.entity';
import { User } from '../../users/entities/user.entity';
import { CashMovement } from './cash-movement.entity';

export enum CashCorrectionField {
  /** The method of a charge or refund; its amount never changes here. */
  METHOD = 'method',
  /** The amount of an entry or exit of cash. */
  AMOUNT = 'amount',
}

/**
 * Design 3.2 «Corregir un día cerrado»: a partner fixed one line of a closed
 * cash day. The line is changed in place and this keeps what it was, who
 * changed it and why. Append-only.
 */
@Entity('cash_corrections')
@Check('CHK_cash_corrections_field', `"field" IN ('method', 'amount')`)
@Check(
  'CHK_cash_corrections_one_line',
  `("paymentId" IS NOT NULL AND "movementId" IS NULL AND "field" = 'method')
   OR ("paymentId" IS NULL AND "movementId" IS NOT NULL AND "field" = 'amount')`,
)
@Index('IDX_cash_corrections_paymentId', ['paymentId'])
@Index('IDX_cash_corrections_movementId', ['movementId'])
export class CashCorrection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Store, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'storeId',
    foreignKeyConstraintName: 'FK_cash_corrections_store',
  })
  store?: Store;

  @Column('uuid')
  storeId: string;

  @ManyToOne(() => OrderPayment, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'paymentId',
    foreignKeyConstraintName: 'FK_cash_corrections_payment',
  })
  payment?: OrderPayment | null;

  @Column({ type: 'uuid', nullable: true })
  paymentId: string | null;

  @ManyToOne(() => CashMovement, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'movementId',
    foreignKeyConstraintName: 'FK_cash_corrections_movement',
  })
  movement?: CashMovement | null;

  @Column({ type: 'uuid', nullable: true })
  movementId: string | null;

  @Column({ type: 'varchar', length: 10 })
  field: CashCorrectionField;

  /** The value before: a method, or an amount as text with two decimals. */
  @Column({ type: 'varchar', length: 20 })
  before: string;

  @Column({ type: 'varchar', length: 20 })
  after: string;

  @Column({ type: 'varchar', length: 200 })
  reason: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'createdById',
    foreignKeyConstraintName: 'FK_cash_corrections_user',
  })
  createdBy?: User | null;

  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
