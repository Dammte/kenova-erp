import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Store } from '../../stores/entities/store.entity';
import { User } from '../../users/entities/user.entity';

/**
 * The optional count of a cash day: the cash in the drawer and the card
 * terminal's total. Differences are only shown, never block anything. When
 * the cash was counted, the next day starts from it instead of the expected.
 */
@Entity('cash_counts')
@Unique('UQ_cash_counts_store_date', ['storeId', 'date'])
@Check(
  'CHK_cash_counts_something',
  `"cash" IS NOT NULL OR "terminal" IS NOT NULL`,
)
@Check('CHK_cash_counts_cash', `"cash" >= 0`)
@Check('CHK_cash_counts_terminal', `"terminal" >= 0`)
export class CashCount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Store, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'storeId',
    foreignKeyConstraintName: 'FK_cash_counts_store',
  })
  store?: Store;

  @Column('uuid')
  storeId: string;

  /** The cash day counted. */
  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  cash: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  terminal: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  note: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'countedById',
    foreignKeyConstraintName: 'FK_cash_counts_user',
  })
  countedBy?: User | null;

  @Column({ type: 'uuid', nullable: true })
  countedById: string | null;

  /** A count can be saved again while its day is open; this is the last time. */
  @UpdateDateColumn({ type: 'timestamptz' })
  countedAt: Date;
}
