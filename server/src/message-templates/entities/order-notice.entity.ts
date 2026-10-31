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
import { TEMPLATE_TRIGGERS, type TemplateTrigger } from '../templates';

export const NOTICE_CHANNELS = ['whatsapp'] as const;
export type NoticeChannel = (typeof NOTICE_CHANNELS)[number];

/** A notice sent to the client about an order, with the exact text sent. */
@Entity('order_notices')
@Check(
  'CHK_order_notices_trigger',
  `"trigger" IN (${TEMPLATE_TRIGGERS.map((t) => `'${t}'`).join(', ')})`,
)
@Check(
  'CHK_order_notices_channel',
  `"channel" IN (${NOTICE_CHANNELS.map((c) => `'${c}'`).join(', ')})`,
)
@Index('IDX_order_notices_order', ['serviceOrderId', 'sentAt'])
export class OrderNotice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ServiceOrder, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'serviceOrderId',
    foreignKeyConstraintName: 'FK_order_notices_order',
  })
  serviceOrder?: ServiceOrder;

  @Column('uuid')
  serviceOrderId: string;

  @Column({ type: 'varchar', length: 20 })
  trigger: TemplateTrigger;

  @Column({ type: 'varchar', length: 10, default: 'whatsapp' })
  channel: NoticeChannel;

  @Column('text')
  body: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({
    name: 'sentById',
    foreignKeyConstraintName: 'FK_order_notices_user',
  })
  sentBy?: User | null;

  @Column({ type: 'uuid', nullable: true })
  sentById: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  sentAt: Date;
}
