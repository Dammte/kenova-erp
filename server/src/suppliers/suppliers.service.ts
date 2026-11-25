import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { SecretCipher } from '../common/crypto/secret-cipher';
import {
  SupplierConnectionDto,
  SupplierCredentialsDto,
} from './dto/connection.dto';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';
import { Supplier } from './entities/supplier.entity';

/** Binds the ciphertext to its supplier: copied onto another row it does not open. */
const aad = (supplierId: string) => `supplier:${supplierId}`;

const isUniqueViolation = (e: unknown) =>
  e instanceof QueryFailedError &&
  (e.driverError as { code?: string })?.code === '23505';

@Injectable()
export class SuppliersService {
  private readonly cipher = SecretCipher.fromEnv();

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

  /** «Conexión»: the routes and field names, replaced as a whole. */
  async saveConnection(
    id: string,
    dto: SupplierConnectionDto,
    actorId: string,
  ): Promise<Supplier> {
    const found = await this.findOne(id);
    found.connection = {
      kind: 'html',
      baseUrl: dto.baseUrl,
      login: { ...dto.login },
      history: {
        ...dto.history,
        paymentSelector: dto.history.paymentSelector ?? null,
        statusSelector: dto.history.statusSelector ?? null,
        invoiceLinkSelector: dto.history.invoiceLinkSelector ?? null,
      },
      detail: {
        ...dto.detail,
        refSelector: dto.detail.refSelector ?? null,
        refPattern: dto.detail.refPattern ?? null,
        productLinkSelector: dto.detail.productLinkSelector ?? null,
        productSearchPath: dto.detail.productSearchPath ?? null,
        lineTotalSelector: dto.detail.lineTotalSelector ?? null,
      },
    };
    const saved = await this.repo.save(found);
    await this.audit.record({
      action: 'SUPPLIER_CONNECTION_UPDATED',
      actorUserId: actorId,
      entityType: 'supplier',
      entityId: id,
      metadata: { baseUrl: dto.baseUrl },
    });
    return saved;
  }

  /** Stores the website login encrypted; it is never shown again. */
  async setCredentials(
    id: string,
    dto: SupplierCredentialsDto,
    actorId: string,
  ): Promise<Supplier> {
    await this.findOne(id);
    await this.repo.update(id, {
      credentialsCiphertext: this.cipher.encrypt(
        JSON.stringify({ username: dto.username, password: dto.password }),
        aad(id),
      ),
      credentialsUpdatedAt: new Date(),
    });
    await this.audit.record({
      action: 'SUPPLIER_CREDENTIALS_SET',
      actorUserId: actorId,
      entityType: 'supplier',
      entityId: id,
      metadata: { keyId: this.cipher.activeKeyId },
    });
    return this.findOne(id);
  }

  async clearCredentials(id: string, actorId: string): Promise<Supplier> {
    await this.findOne(id);
    await this.repo.update(id, {
      credentialsCiphertext: null,
      credentialsUpdatedAt: null,
    });
    await this.audit.record({
      action: 'SUPPLIER_CREDENTIALS_CLEARED',
      actorUserId: actorId,
      entityType: 'supplier',
      entityId: id,
    });
    return this.findOne(id);
  }

  /** The login in clear, for the server's own calls to the supplier; null without one. */
  async credentials(
    id: string,
  ): Promise<{ username: string; password: string } | null> {
    const row = await this.repo
      .createQueryBuilder('s')
      .addSelect('s.credentialsCiphertext')
      .where('s.id = :id', { id })
      .getOne();
    if (!row) throw new NotFoundException('Proveedor no encontrado');
    if (!row.credentialsCiphertext) return null;
    return JSON.parse(
      this.cipher.decrypt(row.credentialsCiphertext, aad(id)),
    ) as { username: string; password: string };
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
