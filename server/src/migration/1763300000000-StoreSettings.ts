import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * What each store needs to work on its own: legal data for the printouts,
 * till hours and float, and the warranty of its repairs (90 days minimum).
 */
export class StoreSettings1763300000000 implements MigrationInterface {
  name = 'StoreSettings1763300000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "stores"
        ADD "legalName" varchar(150),
        ADD "taxId" varchar(20),
        ADD "cashOpensAt" time NOT NULL DEFAULT '09:00:00',
        ADD "cashClosesAt" time NOT NULL DEFAULT '20:00:00',
        ADD "cashFloat" numeric(10,2) NOT NULL DEFAULT 0,
        ADD "warrantyDays" integer NOT NULL DEFAULT 90,
        ADD CONSTRAINT "CHK_stores_warranty_days" CHECK ("warrantyDays" >= 90),
        ADD CONSTRAINT "CHK_stores_cash_hours" CHECK ("cashClosesAt" > "cashOpensAt"),
        ADD CONSTRAINT "CHK_stores_cash_float" CHECK ("cashFloat" >= 0)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "stores"
        DROP CONSTRAINT "CHK_stores_cash_float",
        DROP CONSTRAINT "CHK_stores_cash_hours",
        DROP CONSTRAINT "CHK_stores_warranty_days",
        DROP COLUMN "warrantyDays",
        DROP COLUMN "cashFloat",
        DROP COLUMN "cashClosesAt",
        DROP COLUMN "cashOpensAt",
        DROP COLUMN "taxId",
        DROP COLUMN "legalName"`);
  }
}
