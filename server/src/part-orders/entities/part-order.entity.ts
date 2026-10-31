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
import { Inventory } from '../../inventory/entities/inventory.entity';
import { ServiceOrder } from '../../service-order/entities/service-order.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Design 3.4: a part asked from a supplier for an order waiting on it. While
 * it is not received the order stays in «Pendiente de piezas»; receiving it
 * raises the stock of the linked part.
 */
@Entity('part_orders')
@Check('CHK_part_orders_quantity', `"quantity" > 0`)
@Index('IDX_part_orders_order', ['orderId'])
@Index('IDX_part_orders_pending', ['orderedAt'], {
  where: `"receivedAt" IS NULL`,
})
export class PartOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ServiceOrder, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'orderId',
    foreignKeyConstraintName: 'FK_part_orders_order',
  })
  order?: ServiceOrder;

  @Column('uuid')
  orderId: string;

  /** The stock part it refills, when it is one that is kept in stock. */
  @ManyToOne(() => Inventory, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'inventoryId',
    foreignKeyConstraintName: 'FK_part_orders_inventory',
  })
  inventory?: Inventory | null;

  @Column({ type: 'uuid', nullable: true })
  inventoryId: string | null;

  /** What was ordered, as written then (the part may be renamed later). */
  @Column({ type: 'varchar', length: 150 })
  partName: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  provider: string | null;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'date' })
  orderedAt: string;

  @Column({ type: 'date', nullable: true })
  expectedAt: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  receivedAt: Date | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'receivedById',
    foreignKeyConstraintName: 'FK_part_orders_received_by',
  })
  receivedBy?: User | null;

  @Column({ type: 'uuid', nullable: true })
  receivedById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'createdById',
    foreignKeyConstraintName: 'FK_part_orders_created_by',
  })
  createdBy?: User | null;

  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
