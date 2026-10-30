import { MigrationInterface, QueryRunner } from 'typeorm';
import { uuidFunction } from '../common/db/uuid-function';

/**
 * The commission of each partner store, its history, and the copy of it that
 * each order keeps when it is delivered.
 */
export class StoreCommission1763400000000 implements MigrationInterface {
  name = 'StoreCommission1763400000000';

  public async up(q: QueryRunner): Promise<void> {
    const uuid = await uuidFunction(q);
    await q.query(`
      ALTER TABLE "stores"
        ADD "commissionType" varchar(10),
        ADD "commissionValue" numeric(10,2),
        ADD CONSTRAINT "CHK_stores_commission" CHECK (("commissionType" IS NULL AND "commissionValue" IS NULL) OR ("commissionType" = 'percent' AND "commissionValue" BETWEEN 0 AND 100) OR ("commissionType" = 'fixed' AND "commissionValue" >= 0))`);
    await q.query(`
      ALTER TABLE "service_orders"
        ADD "commissionType" varchar(10),
        ADD "commissionValue" numeric(10,2),
        ADD "commissionAmount" numeric(10,2)`);

    await q.query(`
      CREATE TABLE "store_commission_changes" (
        "id" uuid NOT NULL DEFAULT ${uuid},
        "storeId" uuid NOT NULL,
        "type" varchar(10),
        "value" numeric(10,2),
        "changedById" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_store_commission_changes" PRIMARY KEY ("id"),
        CONSTRAINT "FK_store_commission_changes_store" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_store_commission_changes_user" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL
      )`);
    await q.query(
      `CREATE INDEX "IDX_store_commission_changes_store" ON "store_commission_changes" ("storeId", "createdAt")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "store_commission_changes"`);
    await q.query(`
      ALTER TABLE "service_orders"
        DROP COLUMN "commissionAmount",
        DROP COLUMN "commissionValue",
        DROP COLUMN "commissionType"`);
    await q.query(`
      ALTER TABLE "stores"
        DROP CONSTRAINT "CHK_stores_commission",
        DROP COLUMN "commissionValue",
        DROP COLUMN "commissionType"`);
  }
}
