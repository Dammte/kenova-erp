import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { ServiceOrder } from '../../service-order/entities/service-order.entity';
import { User } from '../../users/entities/user.entity';

@Entity('sticky_notes')
export class StickyNote {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('text')
  content: string;

  @Column({
    type: 'enum',
    enum: ['normal', 'important', 'urgent'],
    default: 'normal',
  })
  type: 'normal' | 'important' | 'urgent';

  @CreateDateColumn()
  createdAt: Date;

  /** Who wrote it; null for notes from before authors were kept. */
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'createdById',
    foreignKeyConstraintName: 'FK_sticky_notes_user',
  })
  createdBy?: User | null;

  @Column({ type: 'uuid', nullable: true })
  createdById: string | null;

  @ManyToOne(() => ServiceOrder, (order) => order.stickyNotes, {
    onDelete: 'CASCADE',
  })
  orderService: ServiceOrder;
}
