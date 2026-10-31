import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Brackets, DataSource } from 'typeorm';
import type { AuthUser } from '../auth/auth.types';
import { Client } from '../clients/entities/client.entity';
import { clientVisibleSql, scopedStoreId } from '../common/store-scope';
import { ServiceOrder } from '../service-order/entities/service-order.entity';
import { digitsSql, foldSql, likeTerms } from '../common/text-search';

export interface OrderHit {
  id: string;
  code: string;
  status: string;
  clientName: string;
  device: string;
}

export interface ClientHit {
  id: string;
  name: string;
  phoneNumber: string | null;
}

export interface SearchResult {
  orders: OrderHit[];
  clients: ClientHit[];
}

const NAME = `${foldSql('c."firstName"')} || ' ' || ${foldSql('c."lastName"')}`;

/**
 * The quick search behind Ctrl+K: orders by code, IMEI, device or client, and
 * clients by name, phone, email or DNI, limited to what the actor may see.
 */
@Injectable()
export class SearchService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async search(raw: string, actor: AuthUser): Promise<SearchResult> {
    const terms = likeTerms(raw);
    if (!terms) return { orders: [], clients: [] };
    const { term, numeric } = terms;
    const [orders, clients] = await Promise.all([
      this.orders(term, numeric, actor),
      this.clients(term, numeric, actor),
    ]);
    return { orders, clients };
  }

  private async orders(
    term: string,
    numeric: string | null,
    actor: AuthUser,
  ): Promise<OrderHit[]> {
    const qb = this.dataSource
      .getRepository(ServiceOrder)
      .createQueryBuilder('o')
      .withDeleted()
      .innerJoin('o.client', 'c')
      .leftJoin('o.device', 'd')
      .select([
        'o.id',
        'o.code',
        'o.status',
        'o.createdAt',
        'c.firstName',
        'c.lastName',
        'd.brand',
        'd.model',
      ])
      .where('o.deletedAt IS NULL')
      .andWhere(
        new Brackets((w) => {
          w.where(`${foldSql('o.code')} LIKE :term`)
            .orWhere(`${NAME} LIKE :term`)
            .orWhere(
              `${foldSql('d.brand')} || ' ' || ${foldSql('d.model')} LIKE :term`,
            );
          if (numeric) {
            w.orWhere(`${digitsSql('d.imei')} LIKE :numeric`);
          }
        }),
      )
      .setParameters({ term, numeric })
      .orderBy('o.createdAt', 'DESC')
      .take(6);
    const storeId = scopedStoreId(actor);
    if (storeId) qb.andWhere('o.storeId = :storeId', { storeId });
    const found = await qb.getMany();
    return found.map((o) => ({
      id: o.id,
      code: o.code,
      status: o.status,
      clientName: fullName(o.client),
      device: o.device ? `${o.device.brand} ${o.device.model}`.trim() : '',
    }));
  }

  private async clients(
    term: string,
    numeric: string | null,
    actor: AuthUser,
  ): Promise<ClientHit[]> {
    const qb = this.dataSource
      .getRepository(Client)
      .createQueryBuilder('c')
      .select(['c.id', 'c.firstName', 'c.lastName', 'c.phoneNumber'])
      .where('c.anonymizedAt IS NULL')
      .andWhere('c."isActive"')
      .andWhere(
        new Brackets((w) => {
          w.where(`${NAME} LIKE :term`)
            .orWhere(`${foldSql('c.email')} LIKE :term`)
            .orWhere(`${foldSql('c.dni')} LIKE :term`);
          if (numeric) {
            w.orWhere(`${digitsSql('c."phoneNumber"')} LIKE :numeric`);
          }
        }),
      )
      .setParameters({ term, numeric })
      .orderBy('c.firstName', 'ASC')
      .addOrderBy('c.lastName', 'ASC')
      .take(5);
    const storeId = scopedStoreId(actor);
    if (storeId) qb.andWhere(clientVisibleSql('c'), { scopeStoreId: storeId });
    const found = await qb.getMany();
    return found.map((c) => ({
      id: c.id,
      name: fullName(c),
      phoneNumber: c.phoneNumber,
    }));
  }
}

function fullName(c: Pick<Client, 'firstName' | 'lastName'>): string {
  return [c.firstName, c.lastName].filter(Boolean).join(' ');
}
