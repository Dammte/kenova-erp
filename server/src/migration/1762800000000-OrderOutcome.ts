import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * How an order ended (work done, checks, repaired or not) and warranty claims
 * linked to the delivered order they come from. Existing orders keep these
 * empty: their outcome was never recorded.
 */
export class OrderOutcome1762800000000 implements MigrationInterface {
  name = 'OrderOutcome1762800000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "service_orders"
        ADD "workDone" varchar(1000),
        ADD "testsDone" text array NOT NULL DEFAULT '{}',
        ADD "result" varchar(20),
        ADD "notRepairedReason" varchar(300),
        ADD "warrantyOfId" uuid,
        ADD "warrantyRejectedReason" varchar(300)`);
    await q.query(`
      ALTER TABLE "service_orders"
        ADD CONSTRAINT "CHK_service_orders_tests_done"
          CHECK ("testsDone" <@ ARRAY['touch', 'cameras', 'charging', 'audio', 'biometrics', 'network']::text[]),
        ADD CONSTRAINT "CHK_service_orders_result"
          CHECK ("result" IS NULL OR "result" IN ('repaired', 'not_repaired')),
        ADD CONSTRAINT "CHK_service_orders_not_repaired_reason"
          CHECK ("notRepairedReason" IS NULL OR "result" = 'not_repaired'),
        ADD CONSTRAINT "CHK_service_orders_warranty_rejected"
          CHECK ("warrantyRejectedReason" IS NULL OR "warrantyOfId" IS NOT NULL),
        ADD CONSTRAINT "FK_service_orders_warranty_of"
          FOREIGN KEY ("warrantyOfId") REFERENCES "service_orders"("id") ON DELETE SET NULL`);
    await q.query(
      `CREATE INDEX "IDX_service_orders_warrantyOfId" ON "service_orders" ("warrantyOfId")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "IDX_service_orders_warrantyOfId"`);
    await q.query(`
      ALTER TABLE "service_orders"
        DROP CONSTRAINT "FK_service_orders_warranty_of",
        DROP CONSTRAINT "CHK_service_orders_warranty_rejected",
        DROP CONSTRAINT "CHK_service_orders_not_repaired_reason",
        DROP CONSTRAINT "CHK_service_orders_result",
        DROP CONSTRAINT "CHK_service_orders_tests_done",
        DROP COLUMN "warrantyRejectedReason",
        DROP COLUMN "warrantyOfId",
        DROP COLUMN "notRepairedReason",
        DROP COLUMN "result",
        DROP COLUMN "testsDone",
        DROP COLUMN "workDone"`);
  }
}
