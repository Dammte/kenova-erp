import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../auth/auth.types';
import { scopedStoreId } from '../common/store-scope';
import { ServiceOrderService } from '../service-order/service-order.service';
import { Store } from '../stores/entities/store.entity';
import { MessageTemplate } from './entities/message-template.entity';
import {
  BASE_TEMPLATES,
  TEMPLATE_TRIGGERS,
  type TemplateTrigger,
  templateProblem,
} from './templates';

export interface TemplateView {
  trigger: TemplateTrigger;
  name: string;
  when: string;
  body: string;
  isBase: boolean;
  updatedAt: Date | null;
  updatedBy: { fullName: string } | null;
}

@Injectable()
export class MessageTemplatesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly orders: ServiceOrderService,
  ) {}

  private get repo() {
    return this.dataSource.getRepository(MessageTemplate);
  }

  /**
   * The store whose templates the actor works on. A store account only ever
   * gets its own; another store's id answers 404, as everywhere else.
   */
  private async storeFor(actor: AuthUser, storeId?: string): Promise<string> {
    const own = scopedStoreId(actor);
    if (own) {
      if (storeId && storeId !== own) {
        throw new NotFoundException('Tienda no encontrada');
      }
      return own;
    }
    if (!storeId) return this.orders.storeIdFor(actor);
    const exists = await this.dataSource
      .getRepository(Store)
      .exists({ where: { id: storeId } });
    if (!exists) throw new NotFoundException('Tienda no encontrada');
    return storeId;
  }

  private static trigger(value: string): TemplateTrigger {
    if (!(TEMPLATE_TRIGGERS as readonly string[]).includes(value)) {
      throw new NotFoundException('Plantilla no encontrada');
    }
    return value as TemplateTrigger;
  }

  private static view(
    trigger: TemplateTrigger,
    row?: MessageTemplate,
  ): TemplateView {
    const base = BASE_TEMPLATES[trigger];
    return {
      trigger,
      name: base.name,
      when: base.when,
      body: row?.body ?? base.body,
      isBase: !row,
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy ? { fullName: row.updatedBy.fullName } : null,
    };
  }

  async list(actor: AuthUser, storeId?: string): Promise<TemplateView[]> {
    const store = await this.storeFor(actor, storeId);
    const rows = await this.repo.find({
      where: { storeId: store },
      relations: { updatedBy: true },
    });
    return TEMPLATE_TRIGGERS.map((t) =>
      MessageTemplatesService.view(
        t,
        rows.find((r) => r.trigger === t),
      ),
    );
  }

  async save(
    value: string,
    body: string,
    actor: AuthUser,
    storeId?: string,
  ): Promise<TemplateView> {
    const trigger = MessageTemplatesService.trigger(value);
    const store = await this.storeFor(actor, storeId);
    const problem = templateProblem(body);
    if (problem) throw new BadRequestException(problem);
    await this.upsert([store], trigger, body, actor);
    return this.one(store, trigger);
  }

  /** Back to the base text: the store's own row goes away. */
  async restore(
    value: string,
    actor: AuthUser,
    storeId?: string,
  ): Promise<TemplateView> {
    const trigger = MessageTemplatesService.trigger(value);
    const store = await this.storeFor(actor, storeId);
    await this.repo.delete({ storeId: store, trigger });
    return MessageTemplatesService.view(trigger);
  }

  /** Partners only: the store's current text becomes every active store's. */
  async copyToAll(
    value: string,
    actor: AuthUser,
    storeId?: string,
  ): Promise<{ stores: number }> {
    const trigger = MessageTemplatesService.trigger(value);
    const store = await this.storeFor(actor, storeId);
    const { body } = await this.one(store, trigger);
    const others = await this.dataSource
      .getRepository(Store)
      .find({ where: { isActive: true }, select: { id: true } });
    const ids = others.map((s) => s.id).filter((id) => id !== store);
    await this.upsert(ids, trigger, body, actor);
    return { stores: ids.length };
  }

  private async upsert(
    storeIds: string[],
    trigger: TemplateTrigger,
    body: string,
    actor: AuthUser,
  ): Promise<void> {
    if (storeIds.length === 0) return;
    await this.repo.upsert(
      storeIds.map((storeId) => ({
        storeId,
        trigger,
        body,
        updatedById: actor.id,
      })),
      { conflictPaths: ['storeId', 'trigger'] },
    );
  }

  private async one(
    storeId: string,
    trigger: TemplateTrigger,
  ): Promise<TemplateView> {
    const row = await this.repo.findOne({
      where: { storeId, trigger },
      relations: { updatedBy: true },
    });
    return MessageTemplatesService.view(trigger, row ?? undefined);
  }
}
