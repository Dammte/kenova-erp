import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';
import { Supplier } from './entities/supplier.entity';

const isUniqueViolation = (e: unknown) =>
  e instanceof QueryFailedError &&
  (e.driverError as { code?: string })?.code === '23505';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(Supplier) private readonly repo: Repository<Supplier>,
    private readonly audit: AuditService,
  ) {}

  /** Active ones first, then by name. */
  list(): Promise<Supplier[]> {
    return this.repo
      .createQueryBuilder('s')
      .orderBy('s.active', 'DESC')
      .addOrderBy('lower(s.name)', 'ASC')
      .getMany();
  }

  async findOne(id: string): Promise<Supplier> {
    const found = await this.repo.findOneBy({ id });
    if (!found) throw new NotFoundException('Proveedor no encontrado');
    return found;
  }

  async create(dto: CreateSupplierDto, actorId: string): Promise<Supplier> {
    const saved = await this.save(this.repo.create(dto), dto.name);
    await this.audit.record({
      action: 'SUPPLIER_CREATED',
      actorUserId: actorId,
      entityType: 'supplier',
      entityId: saved.id,
      metadata: { name: saved.name },
    });
    return saved;
  }

  async update(
    id: string,
    dto: UpdateSupplierDto,
    actorId: string,
  ): Promise<Supplier> {
    const found = await this.findOne(id);
    const saved = await this.save(
      this.repo.merge(found, dto),
      dto.name ?? found.name,
    );
    await this.audit.record({
      action: 'SUPPLIER_UPDATED',
      actorUserId: actorId,
      entityType: 'supplier',
      entityId: id,
      metadata: { fields: Object.keys(dto) },
    });
    return saved;
  }

  private async save(supplier: Supplier, name: string): Promise<Supplier> {
    try {
      return await this.repo.save(supplier);
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictException(`Ya existe un proveedor «${name}»`);
      }
      throw e;
    }
  }
}
