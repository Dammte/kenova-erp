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
import { ServiceOrder } from '../../service-order/entities/service-order.entity';
import { User } from '../../users/entities/user.entity';
import { Inventory } from './inventory.entity';

export enum StockMovementKind {
  /** Created with stock already in hand. */
  INITIAL = 'initial',
  /** Bought: an imported invoice or a received order. */
  PURCHASE = 'purchase',
  /** Used in a repair. */
  ORDER = 'order',
  /** Corrected by hand (a recount, a broken part). */
  ADJUST = 'adjust',
}

/**
 * Design 3.4: every change to a part's stock, so «¿por qué hay 2?» has an
 * answer. Written in the same transaction as the change it records.
 */
@Entity('stock_movements')
@Check(
  'CHK_stock_movements_kind',
  `"kind" IN ('initial', 'purchase', 'order', 'adjust')`,
)
@Check('CHK_stock_movements_quantity_nonzero', `"quantity" <> 0`)
@Index('IDX_stock_movements_inventory_createdAt', ['inventoryId', 'createdAt'])
export class StockMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Inventory, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'inventoryId',
    foreignKeyConstraintName: 'FK_stock_movements_inventory',
  })
  inventory?: Inventory;

  @Column('uuid')
  inventoryId: string;

  @Column({ type: 'varchar', length: 10 })
  kind: StockMovementKind;

  /** Signed: units in are positive, units out negative. */
  @Column('int')
  quantity: number;

  /** The stock right after this movement. */
  @Column('int')
  stockAfter: number;

  @ManyToOne(() => ServiceOrder, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'orderId',
    foreignKeyConstraintName: 'FK_stock_movements_order',
  })
  order?: ServiceOrder | null;

  @Column({ type: 'uuid', nullable: true })
  orderId: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  note: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'createdById',
    foreignKeyConstraintName: 'FK_stock_movements_user',
  })
  createdBy?: User | null;

  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
