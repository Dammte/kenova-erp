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
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Inventory } from './inventory.entity';

/**
 * Design 3.4: a supplier invoice whose lines went into stock. Kept so the same
 * invoice is not entered twice and so a supplier's references are remembered.
 */
@Entity('purchase_invoices')
@Index('IDX_purchase_invoices_provider_number', ['providerKey', 'numberKey'])
export class PurchaseInvoice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  provider: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  number: string | null;

  /** Lowercased, for the duplicate check. */
  @Column({ type: 'varchar', length: 50 })
  providerKey: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  numberKey: string | null;

  @Column({ type: 'date', nullable: true })
  invoiceDate: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'createdById',
    foreignKeyConstraintName: 'FK_purchase_invoices_user',
  })
  createdBy?: User | null;

  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @OneToMany(() => PurchaseInvoiceLine, (l) => l.invoice)
  lines?: PurchaseInvoiceLine[];
}

@Entity('purchase_invoice_lines')
@Check('CHK_purchase_invoice_lines_quantity', `"quantity" > 0`)
@Index('IDX_purchase_invoice_lines_invoice', ['invoiceId'])
@Index('IDX_purchase_invoice_lines_ref', ['refKey'])
export class PurchaseInvoiceLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => PurchaseInvoice, (i) => i.lines, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'invoiceId',
    foreignKeyConstraintName: 'FK_purchase_invoice_lines_invoice',
  })
  invoice?: PurchaseInvoice;

  @Column('uuid')
  invoiceId: string;

  @ManyToOne(() => Inventory, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'inventoryId',
    foreignKeyConstraintName: 'FK_purchase_invoice_lines_inventory',
  })
  inventory?: Inventory | null;

  @Column({ type: 'uuid', nullable: true })
  inventoryId: string | null;

  /** The supplier's reference, as printed. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  ref: string | null;

  /** Lowercased reference, to link it to the part next time. */
  @Column({ type: 'varchar', length: 40, nullable: true })
  refKey: string | null;

  /** The line as the supplier wrote it. */
  @Column({ type: 'varchar', length: 150 })
  description: string;

  @Column('int')
  quantity: number;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  unitCost: string;

  @Column('int')
  stockBefore: number;
}
