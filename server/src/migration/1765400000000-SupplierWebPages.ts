import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The supplier connection now reads web pages (HTML) instead of JSON answers:
 * a connection saved in the old shape is dropped, to be entered again.
 */
export class SupplierWebPages1765400000000 implements MigrationInterface {
  name = 'SupplierWebPages1765400000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `UPDATE "suppliers" SET "connection" = NULL WHERE "connection"->>'kind' IS DISTINCT FROM 'html'`,
    );
  }

  public async down(): Promise<void> {
    // Nothing to restore: the old shape cannot be rebuilt.
  }
}
