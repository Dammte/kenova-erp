import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Readable order numbers per store (MP-0142).
 *
 * Every order belongs to a store; the existing ones go to the main store and
 * are numbered by date of entry. Each store keeps the next free number, so
 * numbers are continuous, never reset and never reused (deleted orders keep
 * theirs).
 */
export class OrderNumber1762000000000 implements MigrationInterface {
  name = 'OrderNumber1762000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "stores" ADD "nextOrderNumber" integer NOT NULL DEFAULT 1`,
    );
    await q.query(`ALTER TABLE "service_orders" ADD "storeId" uuid`);
    await q.query(`ALTER TABLE "service_orders" ADD "number" integer`);
    await q.query(`ALTER TABLE "service_orders" ADD "code" varchar(12)`);

    await q.query(
      `UPDATE "service_orders" o
          SET "storeId" = s."id",
              "number" = n."rn",
              "code" = s."prefix" || '-' || lpad(n."rn"::text, 4, '0')
         FROM (SELECT "id", row_number() OVER (ORDER BY "createdAt", "id") AS "rn"
                 FROM "service_orders") n,
              "stores" s
        WHERE n."id" = o."id" AND s."isMain"`,
    );
    await q.query(
      `UPDATE "stores"
          SET "nextOrderNumber" = (SELECT coalesce(max("number"), 0) + 1 FROM "service_orders")
        WHERE "isMain"`,
    );

    await q.query(
      `ALTER TABLE "service_orders" ALTER COLUMN "storeId" SET NOT NULL`,
    );
    await q.query(
      `ALTER TABLE "service_orders" ALTER COLUMN "number" SET NOT NULL`,
    );
    await q.query(
      `ALTER TABLE "service_orders" ALTER COLUMN "code" SET NOT NULL`,
    );
    await q.query(
      `ALTER TABLE "service_orders" ADD CONSTRAINT "FK_service_orders_store" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT`,
    );
    await q.query(
      `ALTER TABLE "service_orders" ADD CONSTRAINT "CHK_service_orders_number_positive" CHECK ("number" > 0)`,
    );
    await q.query(
      `CREATE UNIQUE INDEX "IDX_service_orders_store_number" ON "service_orders" ("storeId", "number")`,
    );
    await q.query(
      `CREATE UNIQUE INDEX "IDX_service_orders_code" ON "service_orders" ("code")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "IDX_service_orders_code"`);
    await q.query(`DROP INDEX "IDX_service_orders_store_number"`);
    await q.query(
      `ALTER TABLE "service_orders" DROP CONSTRAINT "CHK_service_orders_number_positive"`,
    );
    await q.query(
      `ALTER TABLE "service_orders" DROP CONSTRAINT "FK_service_orders_store"`,
    );
    await q.query(`ALTER TABLE "service_orders" DROP COLUMN "code"`);
    await q.query(`ALTER TABLE "service_orders" DROP COLUMN "number"`);
    await q.query(`ALTER TABLE "service_orders" DROP COLUMN "storeId"`);
    await q.query(`ALTER TABLE "stores" DROP COLUMN "nextOrderNumber"`);
  }
}
