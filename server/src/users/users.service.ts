import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { PasswordService } from '../auth/password.service';
import { User, UserRole } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

/** What the API returns for a user: never the hash or the lockout counters. */
export type PublicUser = Pick<
  User,
  | 'id'
  | 'username'
  | 'fullName'
  | 'email'
  | 'role'
  | 'isActive'
  | 'mustChangePassword'
  | 'lastLoginAt'
  | 'createdAt'
  | 'updatedAt'
>;

export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    mustChangePassword: u.mustChangePassword,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly passwords: PasswordService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateUserDto, actorId: string): Promise<PublicUser> {
    const email = dto.email.trim().toLowerCase();
    const clash = await this.userRepository.findOne({
      where: [{ email }, { username: dto.username }],
    });
    if (clash)
      throw new ConflictException(
        'Ya existe un usuario con ese email o nombre de usuario',
      );

    const user = this.userRepository.create({
      username: dto.username,
      fullName: dto.fullName,
      email,
      role: dto.role ?? UserRole.STORE_ADMIN,
      passwordHash: await this.passwords.hash(dto.temporaryPassword),
      mustChangePassword: true,
      isActive: true,
    });
    const saved = await this.userRepository.save(user);
    await this.audit.record({
      action: 'USER_CREATED',
      actorUserId: actorId,
      entityType: 'user',
      entityId: saved.id,
      metadata: { role: saved.role },
    });
    return toPublicUser(saved);
  }

  async findAll(): Promise<PublicUser[]> {
    const users = await this.userRepository.find({
      order: { createdAt: 'ASC' },
    });
    return users.map(toPublicUser);
  }

  private async getOrThrow(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async findOne(id: string): Promise<PublicUser> {
    return toPublicUser(await this.getOrThrow(id));
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    actorId: string,
  ): Promise<PublicUser> {
    const user = await this.getOrThrow(id);
    if (
      id === actorId &&
      (dto.isActive === false || (dto.role && dto.role !== user.role))
    ) {
      throw new BadRequestException(
        'No puedes desactivarte ni cambiar tu propio rol',
      );
    }
    if (dto.fullName !== undefined) user.fullName = dto.fullName;
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    const saved = await this.userRepository.save(user);
    if (dto.isActive === false || dto.role !== undefined) {
      await this.auth.revokeAllSessions(id);
    }
    await this.audit.record({
      action: dto.isActive === false ? 'USER_DEACTIVATED' : 'USER_UPDATED',
      actorUserId: actorId,
      entityType: 'user',
      entityId: id,
      metadata: { fields: Object.keys(dto) },
    });
    return toPublicUser(saved);
  }

  async resetPassword(
    id: string,
    temporaryPassword: string,
    actorId: string,
  ): Promise<void> {
    await this.getOrThrow(id);
    await this.userRepository.update(id, {
      passwordHash: await this.passwords.hash(temporaryPassword),
      mustChangePassword: true,
      failedLoginCount: 0,
      lockedUntil: null,
      passwordChangedAt: new Date(),
    });
    await this.auth.revokeAllSessions(id);
    await this.audit.record({
      action: 'USER_PASSWORD_RESET',
      actorUserId: actorId,
      entityType: 'user',
      entityId: id,
    });
  }

  /** Users are deactivated, never deleted: history rows keep pointing at them. */
  async deactivate(id: string, actorId: string): Promise<void> {
    await this.update(id, { isActive: false }, actorId);
  }
}
