import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ServiceOrder } from '../../service-order/entities/service-order.entity';
import { Shipment } from './shipment.entity';

/** One device (its order) in a shipment. */
@Entity('shipment_lines')
@Index('IDX_shipment_lines_shipment_order', ['shipmentId', 'orderId'], {
  unique: true,
})
export class ShipmentLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Shipment, (s) => s.lines, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'shipmentId',
    foreignKeyConstraintName: 'FK_shipment_lines_shipment',
  })
  shipment?: Shipment;

  @Column('uuid')
  shipmentId: string;

  @ManyToOne(() => ServiceOrder, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'orderId',
    foreignKeyConstraintName: 'FK_shipment_lines_order',
  })
  order?: ServiceOrder;

  @Index('IDX_shipment_lines_orderId')
  @Column('uuid')
  orderId: string;

  /** When it was scanned at the destination. */
  @Column({ type: 'timestamptz', nullable: true })
  receivedAt: Date | null;

  /** The reception was closed without it. */
  @Column({ default: false })
  notArrived: boolean;
}
