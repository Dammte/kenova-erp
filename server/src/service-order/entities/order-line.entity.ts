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
import { Service } from '../../services/entities/service.entity';
import { ServiceOrder } from './service-order.entity';

export enum OrderLineKind {
  SERVICE = 'service',
  /** Difference between the services and the agreed total (discounts, extras). */
  ADJUSTMENT = 'adjustment',
}

/**
 * One priced line of an order. The price is copied when the line is created,
 * so later catalog changes never alter an existing order. The lines always add
 * up to the order's totalPrice.
 */
@Entity('order_lines')
@Check('CHK_order_lines_quantity_positive', `"quantity" > 0`)
@Check(
  'CHK_order_lines_price_nonnegative',
  `"kind" = 'adjustment' OR "unitPrice" >= 0`,
)
export class OrderLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ServiceOrder, (o) => o.lines, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'orderId',
    foreignKeyConstraintName: 'FK_order_lines_order',
  })
  order?: ServiceOrder;

  @Index('IDX_order_lines_orderId')
  @Column('uuid')
  orderId: string;

  @Column('int')
  position: number;

  @Column({ type: 'varchar', length: 20 })
  kind: OrderLineKind;

  @ManyToOne(() => Service, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'serviceId',
    foreignKeyConstraintName: 'FK_order_lines_service',
  })
  service?: Service | null;

  @Column({ type: 'uuid', nullable: true })
  serviceId: string | null;

  /** Name at the time of the order; kept if the service is renamed or removed. */
  @Column({ length: 150 })
  description: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  unitPrice: string;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
