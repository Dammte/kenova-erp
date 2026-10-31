import { MigrationInterface, QueryRunner } from 'typeorm';

/** The order an accepted quote became; one order per quote at most. */
export class QuoteOrder1763800000000 implements MigrationInterface {
  name = 'QuoteOrder1763800000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "quotes"
        ADD "orderId" uuid,
        ADD CONSTRAINT "FK_quotes_order" FOREIGN KEY ("orderId") REFERENCES "service_orders"("id") ON DELETE SET NULL`);
    await q.query(
      `CREATE UNIQUE INDEX "IDX_quotes_order" ON "quotes" ("orderId")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "IDX_quotes_order"`);
    await q.query(`
      ALTER TABLE "quotes"
        DROP CONSTRAINT "FK_quotes_order",
        DROP COLUMN "orderId"`);
  }
}
