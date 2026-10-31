import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../auth/auth.types';
import { assertOrderVisible } from '../common/store-scope';
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
}
