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
import { Supplier } from './supplier.entity';

/**
 * Where an order stands for Kenova (not for the supplier):
 * - PENDIENTE: bought, waiting for the parcel;
 * - RECIBIDO: checked and into stock;
 * - DESCARTADO: will not be received (cancelled, returned…);
 * - ANTERIOR: already in the history the first time it was read, so it was
 *   received before the ERP knew about it.
 */
export const SUPPLIER_ORDER_STATES = [
  'PENDIENTE',
  'RECIBIDO',
  'DESCARTADO',
  'ANTERIOR',
] as const;
export type SupplierOrderState = (typeof SUPPLIER_ORDER_STATES)[number];

/** Numeric money, read back as a plain decimal string ("12.5", not "12.5000"). */
const money = {
  type: 'decimal' as const,
  precision: 12,
  scale: 4,
  nullable: true,
  transformer: {
    to: (v?: string | null) => v,
    from: (v: string | null) => (v === null ? v : String(Number(v))),
  },
};

/** An order read from a supplier's website. Each one is kept once. */
@Entity('supplier_orders')
@Index('UQ_supplier_orders_external', ['supplierId', 'externalId'], {
  unique: true,
})
@Index('IDX_supplier_orders_state', ['state', 'orderDate'])
@Check(
  'CHK_supplier_orders_state',
  `"state" IN ('PENDIENTE', 'RECIBIDO', 'DESCARTADO', 'ANTERIOR')`,
)
export class SupplierOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Supplier, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'supplierId',
    foreignKeyConstraintName: 'FK_supplier_orders_supplier',
  })
  supplier?: Supplier;

  @Column('uuid')
  supplierId: string;

  /** The supplier's id for the order (id_order in PrestaShop). */
  @Column({ type: 'varchar', length: 40 })
  externalId: string;

  /** The order's reference as the supplier shows it. */
  @Column({ type: 'varchar', length: 40 })
  reference: string;

  @Column({ type: 'date', nullable: true })
  orderDate: string | null;

  @Column(money)
  total: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  payment: string | null;

  /** The status on the supplier's website («Enviado», «Entregado»…). */
  @Column({ type: 'varchar', length: 80, nullable: true })
  supplierStatus: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  invoiceUrl: string | null;

  /** The order's page on the supplier's website. */
  @Column({ type: 'varchar', length: 500 })
  detailUrl: string;

  @Column({ type: 'varchar', length: 12 })
  state: SupplierOrderState;

  /** When its lines were read; null = not yet (an ANTERIOR order). */
  @Column({ type: 'timestamptz', nullable: true })
  linesReadAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => SupplierOrderLine, (l) => l.order)
  lines?: SupplierOrderLine[];
}

/** A line of the order, as the supplier's page shows it. */
@Entity('supplier_order_lines')
@Index('IDX_supplier_order_lines_order', ['orderId'])
export class SupplierOrderLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => SupplierOrder, (o) => o.lines, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'orderId',
    foreignKeyConstraintName: 'FK_supplier_order_lines_order',
  })
  order?: SupplierOrder;

  @Column('uuid')
  orderId: string;

  /** Its place on the supplier's page, from 0. */
  @Column('int')
  position: number;

  @Column({ type: 'varchar', length: 150 })
  description: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  ref: string | null;

  /** The product's page, or a search for its reference, on the supplier's website. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  productUrl: string | null;

  @Column('int')
  quantity: number;

  @Column(money)
  unitPrice: string | null;

  @Column(money)
  lineTotal: string | null;
}
