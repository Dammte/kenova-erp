import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from 'typeorm';
import { ServiceOrder } from '../../service-order/entities/service-order.entity';

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

  @ManyToOne(() => ServiceOrder, (order) => order.stickyNotes, {
    onDelete: 'CASCADE',
  })
  orderService: ServiceOrder;
}
