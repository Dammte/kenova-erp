import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Generated,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Store } from '../../stores/entities/store.entity';
import { User } from '../../users/entities/user.entity';
import { ShipmentLine } from './shipment-line.entity';

export enum ShipmentStatus {
  SENT = 'sent',
  RECEIVED = 'received',
  /** Closed with devices that never arrived. */
  RECEIVED_INCOMPLETE = 'received_incomplete',
}

/**
 * A batch of devices travelling between a partner store and the workshop,
 * either way. Printed as the shipping sheet ENV-0014.
 */
@Entity('shipments')
@Check(
  'CHK_shipments_status',
  `"status" IN ('sent', 'received', 'received_incomplete')`,
)
@Check('CHK_shipments_stores', `"fromStoreId" <> "toStoreId"`)
@Index('IDX_shipments_from_createdAt', ['fromStoreId', 'createdAt'])
@Index('IDX_shipments_to_createdAt', ['toStoreId', 'createdAt'])
export class Shipment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** ENV-0014; one sequence for every store. */
  @Index('IDX_shipments_number', { unique: true })
  @Column()
  @Generated('increment')
  number: number;

  @ManyToOne(() => Store, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'fromStoreId',
    foreignKeyConstraintName: 'FK_shipments_from_store',
  })
  fromStore?: Store;

  @Column('uuid')
  fromStoreId: string;

  @ManyToOne(() => Store, { onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'toStoreId',
    foreignKeyConstraintName: 'FK_shipments_to_store',
  })
  toStore?: Store;

  @Column('uuid')
  toStoreId: string;

  @Column({ type: 'varchar', length: 25, default: ShipmentStatus.SENT })
  status: ShipmentStatus;

  /** Who carries it, as written on the sheet. */
  @Column({ type: 'varchar', length: 80, nullable: true })
  carrier: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'createdById',
    foreignKeyConstraintName: 'FK_shipments_created_by',
  })
  createdBy?: User | null;

  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  /** When the receiving store closed the reception. */
  @Column({ type: 'timestamptz', nullable: true })
  receivedAt: Date | null;

  @OneToMany(() => ShipmentLine, (l) => l.shipment)
  lines?: ShipmentLine[];
}
