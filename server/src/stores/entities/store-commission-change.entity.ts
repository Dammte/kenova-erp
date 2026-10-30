import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { CommissionType, Store } from './store.entity';

/** Each time a store's commission was set or changed, for its history. */
@Entity('store_commission_changes')
@Index('IDX_store_commission_changes_store', ['storeId', 'createdAt'])
export class StoreCommissionChange {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'storeId',
    foreignKeyConstraintName: 'FK_store_commission_changes_store',
  })
  store?: Store;

  @Column('uuid')
  storeId: string;

  /** The new commission; both null when it was removed. */
  @Column({ type: 'varchar', length: 10, nullable: true })
  type: CommissionType | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  value: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'changedById',
    foreignKeyConstraintName: 'FK_store_commission_changes_user',
  })
  changedBy?: User | null;

  @Column({ type: 'uuid', nullable: true })
  changedById: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
