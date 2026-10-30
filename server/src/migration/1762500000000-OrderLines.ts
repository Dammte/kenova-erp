import { MigrationInterface, QueryRunner } from 'typeorm';
import { uuidFunction } from '../common/db/uuid-function';

/**
 * Priced order lines, built next to the current services link (which stays
 * until the new screens replace it).
 *
 * Every existing order gets one line per service at the catalog price, plus an
 * "Ajuste" line for any difference, so each order keeps exactly its total.
 */
export class OrderLines1762500000000 implements MigrationInterface {
  name = 'OrderLines1762500000000';

  public async up(q: QueryRunner): Promise<void> {
    const uuid = await uuidFunction(q);
    await q.query(`
      CREATE TABLE "order_lines" (
        "id" uuid NOT NULL DEFAULT ${uuid},
        "orderId" uuid NOT NULL,
        "position" integer NOT NULL,
        "kind" varchar(20) NOT NULL,
        "serviceId" uuid,
        "description" varchar(150) NOT NULL,
        "unitPrice" numeric(10,2) NOT NULL,
        "quantity" integer NOT NULL DEFAULT 1,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_order_lines" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_order_lines_quantity_positive" CHECK ("quantity" > 0),
        CONSTRAINT "CHK_order_lines_price_nonnegative" CHECK ("kind" = 'adjustment' OR "unitPrice" >= 0),
        CONSTRAINT "FK_order_lines_order" FOREIGN KEY ("orderId") REFERENCES "service_orders"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_order_lines_service" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE SET NULL
      )`);
    await q.query(
      `CREATE INDEX "IDX_order_lines_orderId" ON "order_lines" ("orderId")`,
    );

    await q.query(`
      INSERT INTO "order_lines" ("orderId", "position", "kind", "serviceId", "description", "unitPrice", "createdAt")
      SELECT sos."serviceOrderId",
             row_number() OVER (PARTITION BY sos."serviceOrderId" ORDER BY s."name" COLLATE "C", s."id"),
             'service', s."id", left(s."name", 150), s."price", o."createdAt"
        FROM "service_order_services" sos
        JOIN "services" s ON s."id" = sos."serviceId"
        JOIN "service_orders" o ON o."id" = sos."serviceOrderId"`);
    await q.query(`
      INSERT INTO "order_lines" ("orderId", "position", "kind", "description", "unitPrice", "createdAt")
      SELECT o."id",
             coalesce(l."n", 0) + 1,
             'adjustment', 'Ajuste',
             coalesce(o."totalPrice", 0) - coalesce(l."sum", 0),
             o."createdAt"
        FROM "service_orders" o
        LEFT JOIN (SELECT "orderId", count(*) AS "n", sum("unitPrice" * "quantity") AS "sum"
                     FROM "order_lines" GROUP BY "orderId") l ON l."orderId" = o."id"
       WHERE coalesce(o."totalPrice", 0) <> coalesce(l."sum", 0)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "order_lines"`);
  }
}
