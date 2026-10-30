import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * inventory.costPrice was free text (audit ECO-001). It becomes numeric so
 * costs can be summed and compared. Amounts like "12,50", " 8 €" or "3.5"
 * are converted; anything else is kept in inventory_cost_price_legacy and
 * left empty, so no typed value is lost.
 */
export class NumericCostPrice1762200000000 implements MigrationInterface {
  name = 'NumericCostPrice1762200000000';

  public async up(q: QueryRunner): Promise<void> {
    const clean = `replace(regexp_replace("costPrice", '[\\s€]', '', 'g'), ',', '.')`;
    const valid = `${clean} ~ '^\\d{1,8}(\\.\\d{1,4})?$'`;

    await q.query(
      `CREATE TABLE "inventory_cost_price_legacy" (
        "inventoryId" uuid NOT NULL,
        "costPrice" varchar(50) NOT NULL,
        CONSTRAINT "PK_inventory_cost_price_legacy" PRIMARY KEY ("inventoryId")
      )`,
    );
    await q.query(
      `INSERT INTO "inventory_cost_price_legacy" ("inventoryId", "costPrice")
       SELECT "id", "costPrice" FROM "inventory"
        WHERE "costPrice" IS NOT NULL AND btrim("costPrice") <> '' AND NOT (${valid})`,
    );
    await q.query(
      `ALTER TABLE "inventory" ALTER COLUMN "costPrice" TYPE numeric(12,4)
         USING CASE WHEN ${valid} THEN (${clean})::numeric END`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "inventory" ALTER COLUMN "costPrice" TYPE varchar(50)
         USING "costPrice"::text`,
    );
    await q.query(
      `UPDATE "inventory" i SET "costPrice" = l."costPrice"
         FROM "inventory_cost_price_legacy" l WHERE l."inventoryId" = i."id"`,
    );
    await q.query(`DROP TABLE "inventory_cost_price_legacy"`);
  }
}
