import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { Device } from '../../devices/entities/device.entity';
import { Store } from '../../stores/entities/store.entity';
import { User } from '../../users/entities/user.entity';
import { QuoteLine } from './quote-line.entity';

/** What is stored. "expired" is never stored: it is worked out from validUntil. */
export const QUOTE_STATUSES = [
  'draft',
  'sent',
  'accepted',
  'rejected',
] as const;
export type StoredQuoteStatus = (typeof QUOTE_STATUSES)[number];
export type QuoteStatus = StoredQuoteStatus | 'expired';

/** Days a quote stays valid, from the day it is created or renewed. */
export const QUOTE_VALID_DAYS = 30;

/**
 * Design 2.4: a written, closed price for a repair, given before the device is
 * left. Only a name and a phone are needed; the client and the device are
 * created when the quote becomes an order.
 */
@Entity('quotes')
@Check(
  'CHK_quotes_status',
  `"status" IN (${QUOTE_STATUSES.map((s) => `'${s}'`).join(', ')})`,
)
@Check('CHK_quotes_number_positive', `"number" > 0`)
@Check(
  'CHK_quotes_amounts_nonnegative',
  `"total" >= 0 AND coalesce("diagnosticFee", 0) >= 0`,
)
@Index('IDX_quotes_store_number', ['storeId', 'number'], { unique: true })
export class Quote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Store, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'storeId', foreignKeyConstraintName: 'FK_quotes_store' })
  store?: Store;

  @Column('uuid')
  storeId: string;

  /** Continuous per store, separate from the order numbers. */
  @Column('int')
  number: number;

  /** Store prefix + P + number (MP-P0031). */
  @Index('IDX_quotes_code', { unique: true })
  @Column({ length: 12 })
  code: string;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: StoredQuoteStatus;

  /** A known client, when the quote is for one; the name and phone are kept anyway. */
  @ManyToOne(() => Client, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'clientId',
    foreignKeyConstraintName: 'FK_quotes_client',
  })
  client?: Client | null;

  @Column({ type: 'uuid', nullable: true })
  clientId: string | null;

  @Column({ length: 120 })
  clientName: string;

  @Column({ length: 20 })
  clientPhone: string;

  @ManyToOne(() => Device, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'deviceId',
    foreignKeyConstraintName: 'FK_quotes_device',
  })
  device?: Device | null;

  @Column({ type: 'uuid', nullable: true })
  deviceId: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  brand: string | null;

  @Column({ length: 80 })
  model: string;

  /** The fault as the client describes it. */
  @Column({ type: 'varchar', length: 300, nullable: true })
  fault: string | null;

  /** Sum of the lines. */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  total: string;

  /** Charged if the client says no (the device was already checked). */
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  diagnosticFee: string | null;

  /** Last day the price holds (YYYY-MM-DD, Spanish time). */
  @Column({ type: 'date' })
  validUntil: string;

  @Column({ type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  /** When it was accepted or rejected. */
  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'createdById',
    foreignKeyConstraintName: 'FK_quotes_user',
  })
  createdBy?: User | null;

  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  @OneToMany(() => QuoteLine, (l) => l.quote)
  lines?: QuoteLine[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
