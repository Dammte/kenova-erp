import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The store that registered a client, so a partner store keeps seeing a client
 * it has just created even before its first order. NULL for clients registered
 * by the workshop admins or before this change.
 */
export class ClientStore1762600000000 implements MigrationInterface {
  name = 'ClientStore1762600000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "client" ADD "storeId" uuid`);
    await q.query(`CREATE INDEX "IDX_client_storeId" ON "client" ("storeId")`);
    await q.query(
      `ALTER TABLE "client" ADD CONSTRAINT "FK_client_store" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "client" DROP CONSTRAINT "FK_client_store"`);
    await q.query(`DROP INDEX "IDX_client_storeId"`);
    await q.query(`ALTER TABLE "client" DROP COLUMN "storeId"`);
  }
}
