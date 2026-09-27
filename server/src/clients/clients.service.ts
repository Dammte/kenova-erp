import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { Client } from './entities/client.entity';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

const VALID_CITIES = ['Medina de Pomar', 'Villarcayo'];

/** Escapes LIKE wildcards so user input is matched literally. */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
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

  private normalizeNames<T extends { firstName?: string; lastName?: string }>(
    dto: T,
  ): T {
    const result = { ...dto };
    if (typeof result.firstName === 'string') {
      result.firstName = this.toTitleCase(result.firstName);
    }
    if (typeof result.lastName === 'string') {
      result.lastName = this.toTitleCase(result.lastName);
    }
    return result;
  }

  async create(dto: CreateClientDto): Promise<Client> {
    const client = this.clientRepository.create(
      this.normalizeNames(dto) as Partial<Client>,
    );
    return this.clientRepository.save(client);
  }

  findAll(): Promise<Client[]> {
    return this.clientRepository.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Client> {
    const client = await this.clientRepository.findOne({ where: { id } });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    return client;
  }

  findByDni(dni: string): Promise<Client | null> {
    return this.clientRepository.findOne({
      where: { dni: dni.trim().toUpperCase() },
    });
  }

  async searchClients(searchTerm: string): Promise<Client[]> {
    if (!searchTerm || searchTerm.trim().length < 2) {
      return [];
    }
    const term = `%${escapeLike(searchTerm.trim().slice(0, 100))}%`;
    return this.clientRepository.find({
      where: [
        { firstName: ILike(term) },
        { lastName: ILike(term) },
        { email: ILike(term) },
        { phoneNumber: ILike(term) },
        { dni: ILike(term) },
      ],
      order: { firstName: 'ASC', lastName: 'ASC' },
      take: 20,
    });
  }

  async update(id: string, dto: UpdateClientDto): Promise<Client> {
    await this.findOne(id);
    const changes = this.normalizeNames(dto) as Partial<Client>;
    if (Object.keys(changes).length > 0) {
      await this.clientRepository.update(id, changes);
    }
    return this.findOne(id);
  }

  /** Inline edits from the orders table; city is limited to the two shops. */
  async patch(id: string, dto: UpdateClientDto): Promise<Client> {
    if (dto.city && !VALID_CITIES.includes(dto.city)) {
      throw new BadRequestException(
        `Ciudad inválida. Debe ser una de: ${VALID_CITIES.join(', ')}`,
      );
    }
    return this.update(id, dto);
  }

  /**
   * Soft delete: the client disappears from lists and searches, but its orders,
   * devices and history stay intact.
   */
  async remove(id: string, actorUserId: string): Promise<void> {
    await this.findOne(id);
    await this.clientRepository.softDelete(id);
    await this.audit.record({
      action: 'CLIENT_DELETED',
      actorUserId,
      entityType: 'client',
      entityId: id,
    });
  }
}
