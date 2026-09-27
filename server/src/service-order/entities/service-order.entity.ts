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

export enum ServiceStatus {
  EN_PROGRESO = 'en_progreso',
  PENDIENTE_CLIENTE = 'pendiente_cliente',
  PENDIENTE_PIEZAS = 'pendiente_piezas',
  FINALIZADO = 'finalizado',
  ENTREGADO = 'entregado',
  CANCELADO = 'cancelado',
}

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

export enum PaymentMethod {
  CASH = 'cash',
  CARD = 'card',
  TRANSFER = 'transfer',
  OTHER = 'other',
}

@Entity('service_orders')
@Check(
  'CHK_service_orders_amounts_nonnegative',
  `coalesce("totalPrice", 0) >= 0 AND coalesce("amountPaid", 0) >= 0`,
)
export class ServiceOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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

  @OneToMany(() => ServiceHistory, (history) => history.serviceOrder, {
    cascade: true,
  })
  serviceHistory: ServiceHistory[];

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
