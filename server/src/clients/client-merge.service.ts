import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.types';
import { isClientVisible, scopedStoreId } from '../common/store-scope';
import { ClientsService } from './clients.service';
import { MergeClientsDto } from './dto/merge-clients.dto';
import { ANONYMIZED_CLIENT, Client } from './entities/client.entity';
import { ClientNotDuplicate } from './entities/client-not-duplicate.entity';

/** Same phone (last nine digits) or same document, ignoring spaces, dashes and case. */
export const samePerson = (a: string, b: string) => `(
  (nullif(right(regexp_replace(coalesce(${a}."phoneNumber", ''), '\\D', '', 'g'), 9), '')
     = nullif(right(regexp_replace(coalesce(${b}."phoneNumber", ''), '\\D', '', 'g'), 9), ''))
  OR (nullif(regexp_replace(upper(coalesce(${a}.dni, '')), '[^A-Z0-9]', '', 'g'), '')
     = nullif(regexp_replace(upper(coalesce(${b}.dni, '')), '[^A-Z0-9]', '', 'g'), '')))`;

/** Whether two clients were marked «No es la misma persona». */
export const dismissed = (a: string, b: string) => `EXISTS (
  SELECT 1 FROM client_not_duplicates nd
   WHERE nd."clientAId" = least(${a}.id, ${b}.id) AND nd."clientBId" = greatest(${a}.id, ${b}.id))`;

export interface DuplicateOf {
  id: string;
  firstName: string;
  lastName: string | null;
  phoneNumber: string | null;
  dniType: string;
  dni: string | null;
  email: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  orders: number;
  firstVisit: string | null;
  samePhone: boolean;
}

/**
 * Design 3.3: duplicate clients. A partner merges two into one, field by
 * field; orders, devices and quotes move, nothing is lost. Anyone who sees
 * both can say they are not the same person, so they are not flagged again.
 */
@Injectable()
export class ClientMergeService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly clients: ClientsService,
    private readonly audit: AuditService,
  ) {}

  /** The clients that look like this one, among those the actor sees. */
  async duplicates(id: string, actor: AuthUser): Promise<DuplicateOf[]> {
    await this.clients.findOne(id, actor);
    const store = scopedStoreId(actor);
    return this.db.query<DuplicateOf[]>(
      `SELECT d.id, d."firstName", d."lastName", d."phoneNumber", d."dniType", d.dni,
              d.email, d.address, d."postalCode", d.city,
              (SELECT count(*)::int FROM service_orders so WHERE so."clientId" = d.id
                 AND so."deletedAt" IS NULL AND ($2::uuid IS NULL OR so."storeId" = $2)) AS orders,
              (SELECT to_char(min(so."createdAt") AT TIME ZONE 'Europe/Madrid', 'YYYY-MM-DD')
                 FROM service_orders so WHERE so."clientId" = d.id AND so."deletedAt" IS NULL
                  AND ($2::uuid IS NULL OR so."storeId" = $2)) AS "firstVisit",
              (right(regexp_replace(coalesce(d."phoneNumber", ''), '\\D', '', 'g'), 9)
                 = right(regexp_replace(coalesce(c."phoneNumber", ''), '\\D', '', 'g'), 9)
               AND coalesce(d."phoneNumber", '') <> '') AS "samePhone"
         FROM client c JOIN client d ON d.id <> c.id
        WHERE c.id = $1 AND d."deletedAt" IS NULL AND d."isActive" AND d."anonymizedAt" IS NULL
          AND ${samePerson('c', 'd')} AND NOT ${dismissed('c', 'd')}
          AND ($2::uuid IS NULL OR d."storeId" = $2 OR EXISTS (
                SELECT 1 FROM service_orders so WHERE so."clientId" = d.id
                   AND so."storeId" = $2 AND so."deletedAt" IS NULL))
        ORDER BY d."createdAt"`,
      [id, store],
    );
  }

  /** «No es la misma persona»: stops flagging the pair. */
  async notDuplicate(
    id: string,
    otherId: string,
    actor: AuthUser,
  ): Promise<void> {
    if (id === otherId) throw new BadRequestException('Es el mismo cliente');
    await this.clients.findOne(id, actor);
    await this.clients.findOne(otherId, actor);
    const [a, b] = id < otherId ? [id, otherId] : [otherId, id];
    await this.db
      .getRepository(ClientNotDuplicate)
      .upsert({ clientAId: a, clientBId: b, createdById: actor.id }, [
        'clientAId',
        'clientBId',
      ]);
  }

  /**
   * Merges `fromId` into `keepId` (partners only, see the controller): its
   * orders, devices and quotes move to the kept client, which takes the
   * values picked in `data`. The duplicate is soft-deleted and remembers
   * where it went.
   */
  async merge(
    keepId: string,
    dto: MergeClientsDto,
    actor: AuthUser,
  ): Promise<Client> {
    if (keepId === dto.fromId)
      throw new BadRequestException('Es el mismo cliente');
    for (const id of [keepId, dto.fromId]) {
      if (!(await isClientVisible(this.db.manager, id, actor))) {
        throw new NotFoundException('Cliente no encontrado');
      }
    }
    await this.db.transaction(async (m) => {
      const repo = m.getRepository(Client);
      const both = await repo.find({
        where: [{ id: keepId }, { id: dto.fromId }],
        lock: { mode: 'pessimistic_write' },
      });
      if (both.length !== 2)
        throw new NotFoundException('Cliente no encontrado');
      if (both.some((c) => c.anonymizedAt))
        throw new BadRequestException(ANONYMIZED_CLIENT);

      await m.query(
        `UPDATE service_orders SET "clientId" = $1 WHERE "clientId" = $2`,
        [keepId, dto.fromId],
      );
      await m.query(`UPDATE devices SET client_id = $1 WHERE client_id = $2`, [
        keepId,
        dto.fromId,
      ]);
      await m.query(`UPDATE quotes SET "clientId" = $1 WHERE "clientId" = $2`, [
        keepId,
        dto.fromId,
      ]);
      // Frees its document and email (unique) in case the kept client takes them.
      await repo.update(dto.fromId, {
        dni: null,
        email: null,
        isActive: false,
        mergedIntoId: keepId,
        mergedAt: new Date(),
      });
      await repo.softDelete(dto.fromId);
      if (dto.data && Object.keys(dto.data).length > 0) {
        await this.clients.update(keepId, dto.data, actor, m);
      }
      await this.audit.record(
        {
          action: 'CLIENT_MERGED',
          actorUserId: actor.id,
          entityType: 'client',
          entityId: keepId,
          metadata: { fromId: dto.fromId },
        },
        m,
      );
    });
    return this.clients.findOne(keepId, actor);
  }
}
