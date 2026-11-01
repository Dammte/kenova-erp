import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { PaymentMethod } from '../../service-order/entities/service-order.entity';
import { User } from '../../users/entities/user.entity';
import { Store } from './store.entity';

/**
 * Design R2 3.14: a partner store's month, settled. The totals are copied as
 * they stood, so later changes to an order do not rewrite a closed month.
 * What was not handed over (due − received) carries to the next settlement.
 */
@Entity('commission_settlements')
@Unique('UQ_commission_settlements_store_month', ['storeId', 'month'])
@Check('CHK_commission_settlements_received', `"received" >= 0`)
export class CommissionSettlement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Store, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'storeId',
    foreignKeyConstraintName: 'FK_commission_settlements_store',
  })
  store?: Store;

  @Column('uuid')
  storeId: string;

  /** AAAA-MM. */
  @Column({ type: 'varchar', length: 7 })
  month: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  collected: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  commission: string;

  /** collected − commission. */
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  toKenova: string;

  /** Left pending by the previous settlement. */
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  carriedIn: string;

  /** toKenova + carriedIn. */
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  due: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  received: string;

  @Column({ type: 'date' })
  receivedOn: string;

  @Column({ type: 'varchar', length: 20 })
  method: PaymentMethod;

  @Column({ type: 'varchar', length: 300, nullable: true })
  note: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'createdById',
    foreignKeyConstraintName: 'FK_commission_settlements_created_by',
  })
  createdBy?: User | null;

  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
