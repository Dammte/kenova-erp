import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Inventory } from './entities/inventory.entity';
import {
  StockMovement,
  StockMovementKind,
} from './entities/stock-movement.entity';

/** Writes one line of a part's stock history, inside the caller's transaction. */
export async function recordStock(
  m: EntityManager,
  line: {
    inventoryId: string;
    kind: StockMovementKind;
    quantity: number;
    stockAfter: number;
    orderId?: string | null;
    note?: string | null;
    userId?: string | null;
  },
): Promise<void> {
  if (line.quantity === 0) return;
  await m.getRepository(StockMovement).insert({
    inventoryId: line.inventoryId,
    kind: line.kind,
    quantity: line.quantity,
    stockAfter: line.stockAfter,
    orderId: line.orderId ?? null,
    note: line.note?.slice(0, 200) ?? null,
    createdById: line.userId ?? null,
  });
}

/** A line of GET /api/inventory/:id/movements. */
export interface StockLine {
  id: string;
  kind: StockMovementKind;
  quantity: number;
  stockAfter: number;
  note: string | null;
  orderId: string | null;
  orderCode: string | null;
  userName: string | null;
  createdAt: Date;
}

type InventoryWrite = Partial<
  Omit<Inventory, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>
>;

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
  ) {}

  /** Stock it is created with is recorded as its first movement. */
  async create(data: InventoryWrite): Promise<Inventory> {
    return this.inventoryRepository.manager.transaction(async (m) => {
      const saved = await m
        .getRepository(Inventory)
        .save(m.getRepository(Inventory).create(data));
      await recordStock(m, {
        inventoryId: saved.id,
        kind: StockMovementKind.INITIAL,
        quantity: saved.stock ?? 0,
        stockAfter: saved.stock ?? 0,
        userId: data.createdBy ?? null,
      });
      return saved;
    });
  }

  findAll(): Promise<Inventory[]> {
    return this.inventoryRepository.find({ order: { name: 'ASC' } });
  }

  findOne(id: string): Promise<Inventory | null> {
    return this.inventoryRepository.findOne({ where: { id } });
  }

  async findOneOrFail(id: string): Promise<Inventory> {
    const item = await this.findOne(id);
    if (!item) throw new NotFoundException('Repuesto no encontrado');
    return item;
  }

  /** Case-insensitive SKU lookup — prevents duplicates from different-cased references */
  async findOneBySku(sku: string): Promise<Inventory | null> {
    return await this.inventoryRepository
      .createQueryBuilder('inv')
      .where('LOWER(inv.sku) = LOWER(:sku)', { sku })
      .andWhere('inv.deletedAt IS NULL')
      .getOne();
  }

  async update(id: string, data: InventoryWrite): Promise<void> {
    await this.inventoryRepository.update(id, data);
  }

  /** A stock typed by hand is a correction: the difference goes on record. */
  async updateOrFail(id: string, data: InventoryWrite): Promise<Inventory> {
    await this.inventoryRepository.manager.transaction(async (m) => {
      const repo = m.getRepository(Inventory);
      const part = await repo.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!part) throw new NotFoundException('Repuesto no encontrado');
      await repo.update(id, data);
      if (data.stock !== undefined && data.stock !== null) {
        await recordStock(m, {
          inventoryId: id,
          kind: StockMovementKind.ADJUST,
          quantity: data.stock - (part.stock ?? 0),
          stockAfter: data.stock,
          userId: data.updatedBy ?? null,
        });
      }
    });
    return this.findOneOrFail(id);
  }

  /**
   * Adds stock with a single UPDATE (stock = stock + n) so concurrent imports
   * never overwrite each other.
   */
  async addStock(
    id: string,
    quantity: number,
    costPrice: string | undefined,
    updatedBy: string,
  ): Promise<void> {
    const units = Math.trunc(Number(quantity));
    await this.inventoryRepository.manager.transaction(async (m) => {
      const rows: { stock: number }[] = await m
        .createQueryBuilder()
        .update(Inventory)
        .set({
          stock: () => `COALESCE("stock", 0) + ${units}`,
          updatedBy: updatedBy.slice(0, 50),
          ...(costPrice !== undefined ? { costPrice } : {}),
        })
        .where('id = :id', { id })
        .andWhere('"deletedAt" IS NULL')
        .returning(['stock'])
        .execute()
        .then((r) => r.raw as { stock: number }[]);
      if (rows.length === 0)
        throw new NotFoundException('Repuesto no encontrado');
      await recordStock(m, {
        inventoryId: id,
        kind: StockMovementKind.PURCHASE,
        quantity: units,
        stockAfter: Number(rows[0].stock),
        userId: updatedBy,
      });
    });
  }

  /** The last movements of a part, newest first. */
  async movements(id: string): Promise<StockLine[]> {
    await this.findOneOrFail(id);
    return this.inventoryRepository.manager.query<StockLine[]>(
      `SELECT m.id, m.kind, m.quantity, m."stockAfter", m.note, m."orderId",
              o.code AS "orderCode", u."fullName" AS "userName", m."createdAt"
         FROM stock_movements m
         LEFT JOIN service_orders o ON o.id = m."orderId"
         LEFT JOIN users u ON u.id = m."createdById"
        WHERE m."inventoryId" = $1
        ORDER BY m."createdAt" DESC, m.id
        LIMIT 50`,
      [id],
    );
  }

  async remove(id: string): Promise<void> {
    const result = await this.inventoryRepository.softDelete(id);
    if (!result.affected) throw new NotFoundException('Repuesto no encontrado');
  }
}
