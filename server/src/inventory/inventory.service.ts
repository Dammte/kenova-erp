import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Inventory } from './entities/inventory.entity';

type InventoryWrite = Partial<
  Omit<Inventory, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>
>;

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
  ) {}

  async create(data: InventoryWrite): Promise<Inventory> {
    const inventory = this.inventoryRepository.create(data);
    return this.inventoryRepository.save(inventory);
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

  async updateOrFail(id: string, data: InventoryWrite): Promise<Inventory> {
    await this.findOneOrFail(id);
    await this.update(id, data);
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
    const qb = this.inventoryRepository
      .createQueryBuilder()
      .update(Inventory)
      .set({
        stock: () => `COALESCE("stock", 0) + ${Math.trunc(Number(quantity))}`,
        updatedBy: updatedBy.slice(0, 50),
        ...(costPrice !== undefined ? { costPrice } : {}),
      })
      .where('id = :id', { id })
      .andWhere('"deletedAt" IS NULL');
    const res = await qb.execute();
    if (!res.affected) throw new NotFoundException('Repuesto no encontrado');
  }

  async remove(id: string): Promise<void> {
    const result = await this.inventoryRepository.softDelete(id);
    if (!result.affected) throw new NotFoundException('Repuesto no encontrado');
  }
}
