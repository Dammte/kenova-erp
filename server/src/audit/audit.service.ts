import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditEvent } from './entities/audit-event.entity';

export type AuditAction =
  | 'AUTH_LOGIN_SUCCEEDED'
  | 'AUTH_LOGIN_FAILED'
  | 'AUTH_LOGIN_LOCKED'
  | 'AUTH_LOGOUT'
  | 'AUTH_PASSWORD_CHANGED'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_PASSWORD_RESET'
  | 'USER_DEACTIVATED'
  | 'DEVICE_SECRET_SET'
  | 'DEVICE_SECRET_REVEALED'
  | 'DEVICE_SECRET_CLEARED'
  | 'DEVICE_SECRET_PURGED'
  | 'CLIENT_DELETED'
  | 'SERVICE_ORDER_DELETED'
  | 'SERVICE_ORDER_PARTS_CONSUMED';

export interface AuditEntry {
  action: AuditAction;
  actorUserId?: string | null;
  entityType?: string;
  entityId?: string;
  ip?: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditEvent)
    private readonly repo: Repository<AuditEvent>,
  ) {}

  /** Records an event. Pass `manager` to write inside the caller's transaction. */
  async record(entry: AuditEntry, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(AuditEvent) : this.repo;
    const row = repo.create({
      action: entry.action,
      actorUserId: entry.actorUserId ?? null,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      ip: entry.ip ? entry.ip.slice(0, 64) : null,
      metadata: entry.metadata ?? null,
    });
    if (manager) {
      await repo.insert(row);
      return;
    }
    try {
      await repo.insert(row);
    } catch (err) {
      // A failed audit write outside a transaction must not break the request,
      // but it must be visible in the logs.
      this.logger.error(
        `Audit write failed for ${entry.action}: ${(err as Error).message}`,
      );
    }
  }

  findRecent(limit = 200): Promise<AuditEvent[]> {
    return this.repo.find({
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 1000),
    });
  }
}
