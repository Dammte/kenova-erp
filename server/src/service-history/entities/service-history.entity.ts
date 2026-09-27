import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ServiceOrder } from '../../service-order/entities/service-order.entity';
import { Device } from '../../devices/entities/device.entity';
import { User } from '../../users/entities/user.entity';

@Entity('service_history')
export class ServiceHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 50 })
  action: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'text', nullable: true })
  partsReplaced: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  partsCost: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  laborCost: number;

  @ManyToOne(() => User, (user) => user.serviceHistories, { nullable: true })
  @JoinColumn({ name: 'performedBy' })
  performedBy: User;

  @ManyToOne(() => ServiceOrder, (order) => order.serviceHistory, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'serviceOrderId' })
  serviceOrder: ServiceOrder;

  @Index()
  @Column('uuid')
  serviceOrderId: string;

  @ManyToOne(() => Device, (device) => device.serviceHistories, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'deviceId' })
  device: Device;

  @Index()
  @Column('uuid', { nullable: true })
  deviceId: string;

  @CreateDateColumn({ type: 'timestamp' })
  performedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
