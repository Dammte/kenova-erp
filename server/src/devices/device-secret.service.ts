import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { SecretCipher } from '../common/crypto/secret-cipher';
import { Device, UnlockSecretType } from './entities/device.entity';

export interface SecretInput {
  code?: string | null;
  pattern?: string | null;
}

/** Days a secret is kept after the device's last order is delivered or cancelled. */
export const SECRET_RETENTION_DAYS = Number(
  process.env.DEVICE_SECRET_RETENTION_DAYS ?? 7,
);

@Injectable()
export class DeviceSecretService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DeviceSecretService.name);
  private readonly cipher = SecretCipher.fromEnv();
  private bootTimer?: NodeJS.Timeout;
  private interval?: NodeJS.Timeout;

  constructor(
    @InjectRepository(Device) private readonly devices: Repository<Device>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  /**
   * Turns `{code, pattern}` from a request into what gets stored.
   * Returns undefined when the request does not set a secret (keep current).
   */
  static pick(
    input: SecretInput,
  ): { type: UnlockSecretType; value: string } | undefined {
    const code = typeof input.code === 'string' ? input.code.trim() : '';
    const pattern =
      typeof input.pattern === 'string' ? input.pattern.trim() : '';
    if (code && pattern) {
      throw new BadRequestException('Indica un código o un patrón, no ambos');
    }
    if (code) return { type: UnlockSecretType.CODE, value: code };
    if (pattern) return { type: UnlockSecretType.PATTERN, value: pattern };
    return undefined;
  }

  /** Encrypts and stores a secret for the device (inside the caller's transaction if given). */
  async set(
    deviceId: string,
    secret: { type: UnlockSecretType; value: string },
    actorUserId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(Device) : this.devices;
    await repo.update(deviceId, {
      unlockSecretCiphertext: this.cipher.encrypt(secret.value, deviceId),
      unlockSecretType: secret.type,
      unlockSecretSetAt: new Date(),
    });
    await this.audit.record(
      {
        action: 'DEVICE_SECRET_SET',
        actorUserId,
        entityType: 'device',
        entityId: deviceId,
        metadata: { type: secret.type, keyId: this.cipher.activeKeyId },
      },
      manager,
    );
  }

  async reveal(
    deviceId: string,
    actorUserId: string,
    ip: string | null,
  ): Promise<{ type: UnlockSecretType; value: string }> {
    const device = await this.devices
      .createQueryBuilder('d')
      .addSelect('d.unlockSecretCiphertext')
      .where('d.id = :id', { id: deviceId })
      .getOne();
    if (!device) throw new NotFoundException('Dispositivo no encontrado');
    if (!device.unlockSecretCiphertext || !device.unlockSecretType) {
      throw new NotFoundException(
        'Este dispositivo no tiene código ni patrón guardado',
      );
    }
    let value: string;
    try {
      value = this.cipher.decrypt(device.unlockSecretCiphertext, deviceId);
    } catch (err) {
      this.logger.error(
        `Could not decrypt secret of device ${deviceId}: ${(err as Error).message}`,
      );
      throw new BadRequestException('No se pudo descifrar el código guardado');
    }
    await this.audit.record({
      action: 'DEVICE_SECRET_REVEALED',
      actorUserId,
      entityType: 'device',
      entityId: deviceId,
      ip,
      metadata: { type: device.unlockSecretType },
    });
    return { type: device.unlockSecretType, value };
  }

  async clear(deviceId: string, actorUserId: string): Promise<void> {
    const result = await this.devices.update(deviceId, {
      unlockSecretCiphertext: null,
      unlockSecretType: null,
      unlockSecretSetAt: null,
    });
    if (!result.affected)
      throw new NotFoundException('Dispositivo no encontrado');
    await this.audit.record({
      action: 'DEVICE_SECRET_CLEARED',
      actorUserId,
      entityType: 'device',
      entityId: deviceId,
    });
  }

  /**
   * Deletes secrets that are no longer needed: every order of the device is
   * delivered or cancelled and the last change is older than the retention period.
   * Devices without any order are purged after the same period from when the
   * secret was stored.
   */
  async purgeExpired(now = new Date()): Promise<number> {
    const cutoff = new Date(
      now.getTime() - SECRET_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const rows: { id: string }[] = await this.dataSource
      .query(
        `UPDATE devices d
          SET "unlockSecretCiphertext" = NULL,
              "unlockSecretType" = NULL,
              "unlockSecretSetAt" = NULL
        WHERE d."unlockSecretCiphertext" IS NOT NULL
          AND NOT EXISTS (
                SELECT 1 FROM service_orders o
                 WHERE o."deviceId" = d.id
                   AND o."deletedAt" IS NULL
                   AND (o.status NOT IN ('entregado', 'cancelado') OR o."updatedAt" > $1))
          AND (EXISTS (SELECT 1 FROM service_orders o WHERE o."deviceId" = d.id)
               OR d."unlockSecretSetAt" < $1)
        RETURNING d.id`,
        [cutoff],
      )
      .then((r) => (Array.isArray(r[0]) ? r[0] : r));
    for (const row of rows) {
      await this.audit.record({
        action: 'DEVICE_SECRET_PURGED',
        entityType: 'device',
        entityId: row.id,
        metadata: { retentionDays: SECRET_RETENTION_DAYS },
      });
    }
    if (rows.length)
      this.logger.log(`Purged ${rows.length} expired device secret(s)`);
    return rows.length;
  }

  onModuleInit() {
    if (process.env.DEVICE_SECRET_PURGE_DISABLED === 'true') return;
    const run = () =>
      void this.purgeExpired().catch((err) =>
        this.logger.error(
          `Device secret purge failed: ${(err as Error).message}`,
        ),
      );
    // First run shortly after boot, then every hour.
    this.bootTimer = setTimeout(run, 30_000);
    this.bootTimer.unref();
    this.interval = setInterval(run, 60 * 60 * 1000);
    this.interval.unref();
  }

  onModuleDestroy() {
    if (this.bootTimer) clearTimeout(this.bootTimer);
    if (this.interval) clearInterval(this.interval);
  }
}
