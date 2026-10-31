import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../auth/auth.types';
import { assertOrderVisible, scopedStoreId } from '../common/store-scope';
import { CreateNoticeDto } from './dto/notice.dto';
import { OrderNotice } from './entities/order-notice.entity';
import { BASE_TEMPLATES, type TemplateTrigger } from './templates';

export interface NoticeView {
  id: string;
  trigger: TemplateTrigger;
  name: string;
  channel: string;
  body: string;
  sentAt: Date;
  sentBy: { fullName: string } | null;
}

/** A finished order still waiting to be collected whose reminder is due. */
export interface PickupReminder {
  id: string;
  code: string;
  storeId: string;
  storeName: string;
  firstName: string;
  clientName: string;
  phone: string | null;
  model: string | null;
  totalPrice: string;
  balance: string;
  days: number;
  trigger: 'reminder_15' | 'reminder_30';
}

/** Days finished without being collected before each reminder is due. */
export const REMINDER_DAYS = { reminder_15: 15, reminder_30: 30 } as const;

/** Design 2.5: every notice sent stays on the order, with what it said. */
@Injectable()
export class NoticesService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private static view(n: OrderNotice): NoticeView {
    return {
      id: n.id,
      trigger: n.trigger,
      name: BASE_TEMPLATES[n.trigger].name,
      channel: n.channel,
      body: n.body,
      sentAt: n.sentAt,
      sentBy: n.sentBy ? { fullName: n.sentBy.fullName } : null,
    };
  }

  async list(orderId: string, actor: AuthUser): Promise<NoticeView[]> {
    await assertOrderVisible(this.dataSource.manager, orderId, actor);
    const rows = await this.dataSource.getRepository(OrderNotice).find({
      where: { serviceOrderId: orderId },
      relations: { sentBy: true },
      order: { sentAt: 'DESC' },
    });
    return rows.map((n) => NoticesService.view(n));
  }

  async record(
    orderId: string,
    dto: CreateNoticeDto,
    actor: AuthUser,
  ): Promise<NoticeView> {
    await assertOrderVisible(this.dataSource.manager, orderId, actor);
    const repo = this.dataSource.getRepository(OrderNotice);
    const { id } = await repo.save(
      repo.create({
        serviceOrderId: orderId,
        trigger: dto.trigger,
        channel: 'whatsapp',
        body: dto.body,
        sentById: actor.id,
      }),
    );
    const saved = await repo.findOneOrFail({
      where: { id },
      relations: { sentBy: true },
    });
    return NoticesService.view(saved);
  }

  /**
   * The Panel's queue (design 2.5): finished orders not collected for 15 or 30
   * days whose reminder has not been sent since they were finished. Past 30
   * days only the 30-day one is due. Oldest first.
   */
  async reminders(actor: AuthUser): Promise<PickupReminder[]> {
    const storeId = scopedStoreId(actor);
    const rows: (Omit<PickupReminder, 'clientName'> & {
      lastName: string | null;
    })[] = await this.dataSource.query(
      `SELECT o.id, o.code, o."storeId", s.name AS "storeName",
              c."firstName", c."lastName", c."phoneNumber" AS phone,
              d.model, coalesce(o."totalPrice", 0)::text AS "totalPrice",
              coalesce(o.balance, 0)::text AS balance,
              floor(extract(epoch FROM now() - o."finishedAt") / 86400)::int AS days,
              CASE WHEN o."finishedAt" <= now() - make_interval(days => $2)
                   THEN 'reminder_30' ELSE 'reminder_15' END AS trigger
         FROM service_orders o
         JOIN client c ON c.id = o."clientId"
         JOIN stores s ON s.id = o."storeId"
         LEFT JOIN devices d ON d.id = o."deviceId"
        WHERE o.status = 'finalizado'
          AND o."deletedAt" IS NULL
          AND o."finishedAt" <= now() - make_interval(days => $1)
          AND ($3::uuid IS NULL OR o."storeId" = $3)
          AND NOT EXISTS (
            SELECT 1 FROM order_notices n
             WHERE n."serviceOrderId" = o.id
               AND n."sentAt" >= o."finishedAt"
               AND n.trigger = CASE WHEN o."finishedAt" <= now() - make_interval(days => $2)
                                    THEN 'reminder_30' ELSE 'reminder_15' END)
        ORDER BY o."finishedAt" ASC
        LIMIT 100`,
      [REMINDER_DAYS.reminder_15, REMINDER_DAYS.reminder_30, storeId],
    );
    return rows.map(({ lastName, ...r }) => ({
      ...r,
      clientName: [r.firstName, lastName].filter(Boolean).join(' '),
    }));
  }
}
