import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Design 2.3 "Tarifas", decision 3 option A: a price list entry can name the
 * model it is for, the part quality and the inventory part it uses. All three
 * are optional, so existing services keep working unchanged.
 */
export class ServiceRates1763600000000 implements MigrationInterface {
  name = 'ServiceRates1763600000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "services"
        ADD "modelId" uuid,
        ADD "quality" character varying(20),
        ADD "inventoryId" uuid,
        ADD CONSTRAINT "CHK_services_quality" CHECK ("quality" IN ('compatible', 'original')),
        ADD CONSTRAINT "FK_services_model" FOREIGN KEY ("modelId") REFERENCES "model"("id") ON DELETE SET NULL,
        ADD CONSTRAINT "FK_services_inventory" FOREIGN KEY ("inventoryId") REFERENCES "inventory"("id") ON DELETE SET NULL`);
    await q.query(
      `CREATE INDEX "IDX_services_model" ON "services" ("modelId")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "IDX_services_model"`);
    await q.query(`
      ALTER TABLE "services"
        DROP CONSTRAINT "FK_services_inventory",
        DROP CONSTRAINT "FK_services_model",
        DROP CONSTRAINT "CHK_services_quality",
        DROP COLUMN "inventoryId",
        DROP COLUMN "quality",
        DROP COLUMN "modelId"`);
  }
}
