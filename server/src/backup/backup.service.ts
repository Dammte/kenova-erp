import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';

/** Tables left out of the copy: sign-in state, not business data. */
const SKIPPED_TABLES = new Set(['sessions', 'password_reset_tokens']);

/**
 * Columns never copied: the password hash, and the unlock code of each
 * device (encrypted, and useless outside the server that holds the key).
 */
const SKIPPED_COLUMNS: Record<string, string[]> = {
  users: ['passwordHash'],
  devices: ['unlockSecretCiphertext'],
};

/** The business tables first, in the order a partner would look for them. */
const FIRST = [
  'service_orders',
  'client',
  'devices',
  'order_lines',
  'order_payments',
  'quotes',
  'quote_lines',
  'inventory',
  'stock_movements',
  'services',
  'stores',
  'users',
];

export interface BackupTable {
  name: string;
  columns: string[];
  rows: Record<string, unknown>[];
}

export interface BackupExport {
  exportedAt: string;
  tables: BackupTable[];
}

export interface BackupStatus {
  lastExportAt: string | null;
  by: string | null;
}

@Injectable()
export class BackupService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  /** Every table the app maps, so a new one joins the copy on its own. */
  private tables(): { name: string; columns: string[] }[] {
    const seen = new Map<string, string[]>();
    for (const meta of this.dataSource.entityMetadatas) {
      const name = meta.tableName;
      if (SKIPPED_TABLES.has(name) || seen.has(name)) continue;
      const skip = SKIPPED_COLUMNS[name] ?? [];
      seen.set(
        name,
        meta.columns
          .map((c) => c.databaseName)
          .filter((c) => !skip.includes(c)),
      );
    }
    const rank = (n: string) => {
      const i = FIRST.indexOf(n);
      return i === -1 ? FIRST.length : i;
    };
    return [...seen.entries()]
      .map(([name, columns]) => ({ name, columns }))
      .sort(
        (a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name),
      );
  }

  /**
   * All the data, table by table, read in one snapshot so the copy is
   * consistent. Records who exported it and when.
   */
  async export(actorId: string): Promise<BackupExport> {
    const tables = await this.dataSource.transaction(
      'REPEATABLE READ',
      async (m) => {
        const out: BackupTable[] = [];
        for (const t of this.tables()) {
          const cols = t.columns.map((c) => `"${c}"`).join(', ');
          const rows = await m.query<Record<string, unknown>[]>(
            `SELECT ${cols} FROM "${t.name}"`,
          );
          out.push({ name: t.name, columns: t.columns, rows });
        }
        return out;
      },
    );
    const exportedAt = new Date();
    await this.audit.record({
      action: 'BACKUP_EXPORTED',
      actorUserId: actorId,
      entityType: 'backup',
      metadata: {
        rows: Object.fromEntries(tables.map((t) => [t.name, t.rows.length])),
      },
    });
    return { exportedAt: exportedAt.toISOString(), tables };
  }

  /** When the data was last exported, and by whom. */
  async status(): Promise<BackupStatus> {
    const [last] = await this.dataSource.query<
      { createdAt: Date; fullName: string | null }[]
    >(
      `SELECT a."createdAt", u."fullName"
         FROM audit_events a
         LEFT JOIN users u ON u.id = a."actorUserId"
        WHERE a.action = 'BACKUP_EXPORTED'
        ORDER BY a."createdAt" DESC
        LIMIT 1`,
    );
    return {
      lastExportAt: last ? new Date(last.createdAt).toISOString() : null,
      by: last?.fullName ?? null,
    };
  }
}
