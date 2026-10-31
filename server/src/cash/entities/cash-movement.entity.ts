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

export enum CashMovementKind {
  IN = 'in',
  OUT = 'out',
}

/**
 * Cash put into (change brought from the bank) or taken out of (a small
 * purchase, money taken to the bank) a store's till by hand. Always cash;
 * it belongs to the cash day of its createdAt, like a payment.
 */
@Entity('cash_movements')
@Check('CHK_cash_movements_kind', `"kind" IN ('in', 'out')`)
@Check('CHK_cash_movements_amount_positive', `"amount" > 0`)
@Index('IDX_cash_movements_store_createdAt', ['storeId', 'createdAt'])
export class CashMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Store, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'storeId',
    foreignKeyConstraintName: 'FK_cash_movements_store',
  })
  store?: Store;

  @Column('uuid')
  storeId: string;

  @Column({ type: 'varchar', length: 3 })
  kind: CashMovementKind;

  /** Always positive; the kind says whether it adds or subtracts. */
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: string;

  @Column({ type: 'varchar', length: 200 })
  reason: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'createdById',
    foreignKeyConstraintName: 'FK_cash_movements_user',
  })
  createdBy?: User | null;

  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
