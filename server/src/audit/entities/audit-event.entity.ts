import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Append-only security log. There is no endpoint to modify or delete rows.
 * `metadata` must never contain secrets or personal data beyond ids.
 */
@Entity('audit_events')
@Index('IDX_audit_events_entity', ['entityType', 'entityId'])
export class AuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_audit_events_createdAt')
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Index('IDX_audit_events_actor')
  @Column({ type: 'uuid', nullable: true })
  actorUserId: string | null;

  @Column({ type: 'varchar', length: 64 })
  action: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  entityType: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  entityId: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;
}
