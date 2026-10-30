import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, EntityManager, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth.types';
import {
  assertClientVisible,
  clientVisibleSql,
  isClientVisible,
  scopedStoreId,
} from '../common/store-scope';
import { Client } from './entities/client.entity';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

const VALID_CITIES = ['Medina de Pomar', 'Villarcayo'];

/** Escapes LIKE wildcards so user input is matched literally. */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * What a store gets of a client it does not see yet, found by exact phone or
 * DNI: just enough to recognise them and open an order for them.
 */
function limited(c: Client): Client {
  const { id, firstName, lastName, phoneNumber } = c;
  return { id, firstName, lastName, phoneNumber } as Client;
}

/** Last nine digits of a phone typed in a search, when the term is a phone. */
function phoneKey(term: string): string | null {
  if (!/^[+\d\s().-]+$/.test(term)) return null;
  const digits = term.replace(/\D/g, '');
  return digits.length >= 9 ? digits.slice(-9) : null;
}

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    private readonly audit: AuditService,
  ) {}

  private toTitleCase(str: string): string {
    return str
      .trim()
      .toLowerCase()
      .replace(/(?:^|\s|-|')\S/g, (char) => char.toUpperCase());
  }

  private normalizeNames<
    T extends { firstName?: string; lastName?: string | null },
  >(dto: T): T {
    const result = { ...dto };
    if (typeof result.firstName === 'string') {
      result.firstName = this.toTitleCase(result.firstName);
    }
    if (typeof result.lastName === 'string') {
      result.lastName = this.toTitleCase(result.lastName);
    }
    return result;
  }

  /**
   * Registers the client for the actor's store. `manager` lets the intake
   * create the client inside its own transaction.
   */
  async create(
    dto: CreateClientDto,
    actor: AuthUser,
    manager?: EntityManager,
  ): Promise<Client> {
    const repo = manager?.getRepository(Client) ?? this.clientRepository;
    const client = repo.create({
      ...(this.normalizeNames(dto) as Partial<Client>),
      storeId: scopedStoreId(actor),
    });
    return repo.save(client);
  }

  /** Clients query limited to what the actor sees. */
  private visibleQuery(actor: AuthUser) {
    const storeId = scopedStoreId(actor);
    const qb = this.clientRepository.createQueryBuilder('c');
    if (storeId) qb.where(clientVisibleSql('c'), { scopeStoreId: storeId });
    return qb;
  }

  findAll(actor: AuthUser): Promise<Client[]> {
    return this.visibleQuery(actor).orderBy('c.createdAt', 'DESC').getMany();
  }

  async findOne(id: string, actor: AuthUser): Promise<Client> {
    await assertClientVisible(this.clientRepository.manager, id, actor);
    const client = await this.clientRepository.findOne({ where: { id } });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    return client;
  }

  /** Exact DNI lookup; a client the store does not see comes back limited. */
  async findByDni(dni: string, actor: AuthUser): Promise<Client | null> {
    const client = await this.clientRepository.findOne({
      where: { dni: dni.trim().toUpperCase() },
    });
    if (!client) return null;
    const visible = await isClientVisible(
      this.clientRepository.manager,
      client.id,
      actor,
    );
    return visible ? client : limited(client);
  }

  /**
   * Partial search over the clients the actor sees. A store also finds, by
   * exact phone, a client it does not see yet, limited, to reuse it.
   */
  async searchClients(searchTerm: string, actor: AuthUser): Promise<Client[]> {
    if (!searchTerm || searchTerm.trim().length < 2) {
      return [];
    }
    const trimmed = searchTerm.trim().slice(0, 100);
    const term = `%${escapeLike(trimmed)}%`;
    const found = await this.visibleQuery(actor)
      .andWhere(
        new Brackets((w) =>
          ['firstName', 'lastName', 'email', 'phoneNumber', 'dni'].forEach(
            (f) => w.orWhere(`c."${f}" ILIKE :term`, { term }),
          ),
        ),
      )
      .orderBy('c.firstName', 'ASC')
      .addOrderBy('c.lastName', 'ASC')
      .take(20)
      .getMany();

    const phone = phoneKey(trimmed);
    if (!phone || scopedStoreId(actor) === null) return found;
    const seen = new Set(found.map((c) => c.id));
    const byPhone = await this.clientRepository
      .createQueryBuilder('c')
      .where(
        `right(regexp_replace(c."phoneNumber", '\\D', '', 'g'), 9) = :phone`,
        { phone },
      )
      .take(5)
      .getMany();
    return [...found, ...byPhone.filter((c) => !seen.has(c.id)).map(limited)];
  }

  async update(
    id: string,
    dto: UpdateClientDto,
    actor: AuthUser,
  ): Promise<Client> {
    await this.findOne(id, actor);
    const changes = this.normalizeNames(dto) as Partial<Client>;
    if (Object.keys(changes).length > 0) {
      await this.clientRepository.update(id, changes);
    }
    return this.findOne(id, actor);
  }

  /** Inline edits from the orders table; city is limited to the two shops. */
  async patch(
    id: string,
    dto: UpdateClientDto,
    actor: AuthUser,
  ): Promise<Client> {
    if (dto.city && !VALID_CITIES.includes(dto.city)) {
      throw new BadRequestException(
        `Ciudad inválida. Debe ser una de: ${VALID_CITIES.join(', ')}`,
      );
    }
    return this.update(id, dto, actor);
  }

  /**
   * Soft delete: the client disappears from lists and searches, but its orders,
   * devices and history stay intact.
   */
  async remove(id: string, actor: AuthUser): Promise<void> {
    await this.findOne(id, actor);
    await this.clientRepository.softDelete(id);
    await this.audit.record({
      action: 'CLIENT_DELETED',
      actorUserId: actor.id,
      entityType: 'client',
      entityId: id,
    });
  }
}
