import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** How a partner store earns from each device it takes in. */
export enum CommissionType {
  /** A percentage of what the customer paid. */
  PERCENT = 'percent',
  /** A fixed amount per device. */
  FIXED = 'fixed',
}

/** Legal minimum warranty of a repair in Spain (RD 58/1988). */
export const MIN_WARRANTY_DAYS = 90;

/**
 * A shop that takes devices in. The main store is Kenova's workshop (Medina de
 * Pomar), where repairs happen; the others are partner reception points.
 */
@Entity('stores')
// At most one workshop.
@Index('IDX_stores_single_main', ['isMain'], {
  unique: true,
  where: '"isMain"',
})
@Check('CHK_stores_prefix', `"prefix" ~ '^[A-Z]{2,4}$'`)
@Check('CHK_stores_warranty_days', `"warrantyDays" >= 90`)
@Check('CHK_stores_cash_hours', `"cashClosesAt" > "cashOpensAt"`)
@Check('CHK_stores_cash_float', `"cashFloat" >= 0`)
@Check(
  'CHK_stores_commission',
  `("commissionType" IS NULL AND "commissionValue" IS NULL) OR ("commissionType" = 'percent' AND "commissionValue" BETWEEN 0 AND 100) OR ("commissionType" = 'fixed' AND "commissionValue" >= 0)`,
)
export class Store {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 80 })
  name: string;

  @Column({ length: 80 })
  city: string;

  /** Order-number prefix (MP-0142). Fixed once created. */
  @Index('IDX_stores_prefix', { unique: true })
  @Column({ length: 4 })
  prefix: string;

  /** Printed on tickets. */
  @Column({ type: 'varchar', length: 150, nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  /** Legal name and tax id for the printouts; not printed when empty. */
  @Column({ type: 'varchar', length: 150, nullable: true })
  legalName: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  taxId: string | null;

  /** The till day opens and closes by itself at these hours ("HH:MM:SS"). */
  @Column({ type: 'time', default: '09:00:00' })
  cashOpensAt: string;

  @Column({ type: 'time', default: '20:00:00' })
  cashClosesAt: string;

  /** Cash in the till on its first day; later days carry the expected amount over. */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  cashFloat: string;

  /** Warranty of its repairs, counted from delivery; never under the legal 90 days. */
  @Column({ type: 'int', default: MIN_WARRANTY_DAYS })
  warrantyDays: number;

  /**
   * The partner store's commission, copied onto each order when it is
   * delivered; changing it never alters orders already delivered. None for
   * the workshop.
   */
  @Column({ type: 'varchar', length: 10, nullable: true })
  commissionType: CommissionType | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  commissionValue: string | null;

  /** Exactly one store is the workshop: it holds the stock and does repairs. */
  @Column({ default: false })
  isMain: boolean;

  /** Next order number to hand out; taken under a row lock when an order is created. */
  @Column({ type: 'int', default: 1 })
  nextOrderNumber: number;

  /** Next quote number, handed out the same way (MP-P0031). */
  @Column({ type: 'int', default: 1 })
  nextQuoteNumber: number;

  /** An inactive store takes no new orders and its users cannot sign in. */
  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
