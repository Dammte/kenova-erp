import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Store } from '../../stores/entities/store.entity';
import { User } from '../../users/entities/user.entity';
import { TEMPLATE_TRIGGERS, type TemplateTrigger } from '../templates';

/**
 * A store's own text for one notice. Missing rows mean the store uses the
 * base text, so restoring a template is deleting its row.
 */
@Entity('message_templates')
@Check(
  'CHK_message_templates_trigger',
  `"trigger" IN (${TEMPLATE_TRIGGERS.map((t) => `'${t}'`).join(', ')})`,
)
@Index('IDX_message_templates_store_trigger', ['storeId', 'trigger'], {
  unique: true,
})
export class MessageTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'storeId',
    foreignKeyConstraintName: 'FK_message_templates_store',
  })
  store?: Store;

  @Column('uuid')
  storeId: string;

  @Column({ type: 'varchar', length: 20 })
  trigger: TemplateTrigger;

  @Column('text')
  body: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({
    name: 'updatedById',
    foreignKeyConstraintName: 'FK_message_templates_user',
  })
  updatedBy?: User | null;

  @Column({ type: 'uuid', nullable: true })
  updatedById: string | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
