import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  ManyToMany,
  JoinTable,
  JoinColumn,
  Index,
  DeleteDateColumn,
  Check,
} from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { Device } from '../../devices/entities/device.entity';
import { Service } from '../../services/entities/service.entity';
import { ServiceHistory } from '../../service-history/entities/service-history.entity';
import { StickyNote } from '../../sticky-notes/entities/sticky-note.entity';
import { Store } from '../../stores/entities/store.entity';
import { OrderLine } from './order-line.entity';
import { OrderPayment } from './order-payment.entity';

export enum ServiceStatus {
  EN_PROGRESO = 'en_progreso',
  PENDIENTE_CLIENTE = 'pendiente_cliente',
  PENDIENTE_PIEZAS = 'pendiente_piezas',
  FINALIZADO = 'finalizado',
  ENTREGADO = 'entregado',
  CANCELADO = 'cancelado',
}

/** Faults the customer reports when handing the device in (the intake chips). */
export const ORDER_FAULTS = [
  'broken_screen',
  'battery',
  'not_turning_on',
  'liquid_damage',
  'connectivity',
  'slow_performance',
  'partial',
  'working',
  'other',
] as const;
export type OrderFault = (typeof ORDER_FAULTS)[number];

export enum Priority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum PaymentStatus {
  PENDING = 'pending',
  PAID_PARTIAL = 'paid_partial',
  PAID = 'paid',
}

/** Checks done after the repair, offered as chips when finishing. */
export const ORDER_TESTS = [
  'touch',
  'cameras',
  'charging',
  'audio',
  'biometrics',
  'network',
] as const;
export type OrderTest = (typeof ORDER_TESTS)[number];

export enum OrderResult {
  REPAIRED = 'repaired',
  /** Finished without repair: the device goes back as it came in. */
  NOT_REPAIRED = 'not_repaired',
}

export enum PaymentMethod {
  CASH = 'cash',
  CARD = 'card',
  TRANSFER = 'transfer',
  OTHER = 'other',
}

/**
 * Where a device received at a partner store is, apart from the order status.
 * Orders taken in at the workshop have none.
 */
export enum OrderLocation {
  AT_STORE = 'at_store',
  TO_WORKSHOP = 'to_workshop',
  AT_WORKSHOP = 'at_workshop',
  TO_STORE = 'to_store',
  READY_AT_STORE = 'ready_at_store',
}

/** How the screens name each location. */
export const LOCATION_LABEL: Record<OrderLocation, string> = {
  [OrderLocation.AT_STORE]: 'En tienda (recepción)',
  [OrderLocation.TO_WORKSHOP]: 'Enviado a Medina',
  [OrderLocation.AT_WORKSHOP]: 'En Medina',
  [OrderLocation.TO_STORE]: 'Enviado a tienda',
  [OrderLocation.READY_AT_STORE]: 'En tienda (listo para entregar)',
};

@Entity('service_orders')
@Check(
  'CHK_service_orders_location',
  `"location" IS NULL OR "location" IN (${Object.values(OrderLocation)
    .map((l) => `'${l}'`)
    .join(', ')})`,
)
@Check(
  'CHK_service_orders_amounts_nonnegative',
  `coalesce("totalPrice", 0) >= 0 AND coalesce("amountPaid", 0) >= 0`,
)
@Check('CHK_service_orders_number_positive', `"number" > 0`)
@Check(
  'CHK_service_orders_reported_faults',
  `"reportedFaults" <@ ARRAY[${ORDER_FAULTS.map((f) => `'${f}'`).join(', ')}]::text[]`,
)
@Check(
  'CHK_service_orders_tests_done',
  `"testsDone" <@ ARRAY[${ORDER_TESTS.map((t) => `'${t}'`).join(', ')}]::text[]`,
)
@Check(
  'CHK_service_orders_result',
  `"result" IS NULL OR "result" IN ('repaired', 'not_repaired')`,
)
@Check(
  'CHK_service_orders_not_repaired_reason',
  `"notRepairedReason" IS NULL OR "result" = 'not_repaired'`,
)
@Check(
  'CHK_service_orders_warranty_rejected',
  `"warrantyRejectedReason" IS NULL OR "warrantyOfId" IS NOT NULL`,
)
@Index('IDX_service_orders_store_number', ['storeId', 'number'], {
  unique: true,
})
export class ServiceOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The store that took the device in. */
  @ManyToOne(() => Store, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'storeId',
    foreignKeyConstraintName: 'FK_service_orders_store',
  })
  store?: Store;

  @Column('uuid')
  storeId: string;

  /** Continuous per store, never reused. */
  @Column('int')
  number: number;

  /** What people read and search: store prefix + number (MP-0142). */
  @Index('IDX_service_orders_code', { unique: true })
  @Column({ length: 12 })
  code: string;

  // RESTRICT: deleting a client must never delete its orders (clients are soft-deleted).
  @ManyToOne(() => Client, (client) => client.serviceOrders, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'clientId' })
  client: Client;

  @Index()
  @Column('uuid')
  clientId: string;

  @ManyToOne(() => Device, (device) => device.serviceOrders, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'deviceId' })
  device: Device;

  @Index()
  @Column('uuid', { nullable: true })
  deviceId: string;

  @ManyToMany(() => Service, (service) => service.serviceOrders, {
    cascade: true,
  })
  @JoinTable({
    name: 'service_order_services',
    joinColumn: {
      name: 'serviceOrderId',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'serviceId',
      referencedColumnName: 'id',
    },
  })
  services: Service[];

  @Column({ type: 'enum', enum: Priority, default: Priority.MEDIUM })
  priority: Priority;

  @Column({ type: 'text', nullable: true })
  assignedTo?: string;

  @Column({
    type: 'enum',
    enum: ServiceStatus,
    default: ServiceStatus.PENDIENTE_CLIENTE,
  })
  status: ServiceStatus;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    nullable: true,
  })
  totalPrice?: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    nullable: true,
  })
  amountPaid?: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    nullable: true,
  })
  balance?: number;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
    nullable: true,
  })
  paymentStatus?: PaymentStatus;

  @Column({ type: 'enum', enum: PaymentMethod, nullable: true })
  paymentMethod?: PaymentMethod;

  @Column({ type: 'text', nullable: true })
  observations: string;

  // ─── How the device came in (belongs to this visit, not to the device) ───
  @Column('text', { array: true, default: () => "'{}'" })
  reportedFaults: OrderFault[];

  /** Free detail of the fault ("Otro" or extra context). */
  @Column({ type: 'varchar', length: 500, nullable: true })
  faultNotes?: string | null;

  /** Scratches, cracks, missing screws… as found at intake. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  physicalCondition?: string | null;

  /** What the customer left with the device (case, charger, SIM…). */
  @Column({ type: 'varchar', length: 300, nullable: true })
  accessories?: string | null;

  /** The customer waived a written quote (RD 58/1988); prints skip "presupuesto válido". */
  @Column({ default: false })
  waivesQuote: boolean;

  /** Only for partner-store orders; moved by the shipments, never by hand. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  location?: OrderLocation | null;

  /** Set by the server when the order reaches "finalizado"; cleared if it is reopened. */
  @Column({ type: 'timestamptz', nullable: true })
  finishedAt?: Date | null;

  /** Set by the server when the order is handed back ("entregado"). */
  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt?: Date | null;

  /** Why the order was cancelled; only kept while it is cancelled. */
  @Column({ type: 'varchar', length: 300, nullable: true })
  cancelReason?: string | null;

  /** What was done, printed on the delivery receipt. */
  @Column({ type: 'varchar', length: 1000, nullable: true })
  workDone?: string | null;

  @Column('text', { array: true, default: () => "'{}'" })
  testsDone: OrderTest[];

  /** Only while finished or delivered; reopening the order clears it. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  result?: OrderResult | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  notRepairedReason?: string | null;

  /** The delivered order this one is a warranty claim of. */
  @ManyToOne(() => ServiceOrder, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'warrantyOfId',
    foreignKeyConstraintName: 'FK_service_orders_warranty_of',
  })
  warrantyOf?: ServiceOrder | null;

  @Index('IDX_service_orders_warrantyOfId')
  @Column({ type: 'uuid', nullable: true })
  warrantyOfId?: string | null;

  /** Why the claim is not covered (the order is then charged normally). */
  @Column({ type: 'varchar', length: 300, nullable: true })
  warrantyRejectedReason?: string | null;

  @OneToMany(() => ServiceHistory, (history) => history.serviceOrder, {
    cascade: true,
  })
  serviceHistory: ServiceHistory[];

  /** Priced lines; they add up to totalPrice. Kept in step with `services`. */
  @OneToMany(() => OrderLine, (line) => line.order)
  lines?: OrderLine[];

  /** Charges and refunds; charges minus refunds equal amountPaid. */
  @OneToMany(() => OrderPayment, (payment) => payment.order)
  payments?: OrderPayment[];

  @OneToMany(() => StickyNote, (note) => note.orderService)
  stickyNotes: StickyNote[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /** Soft delete: orders are never physically removed. */
  @DeleteDateColumn()
  deletedAt?: Date | null;
}
