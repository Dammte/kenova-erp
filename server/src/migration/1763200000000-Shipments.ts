import { MigrationInterface, QueryRunner } from 'typeorm';
import { uuidFunction } from '../common/db/uuid-function';

/**
 * Shipments between the partner stores and the workshop, and where each
 * partner-store device is. Orders already taken in at a partner store are
 * left at the store, the only place they can be before shipments exist.
 */
export class Shipments1763200000000 implements MigrationInterface {
  name = 'Shipments1763200000000';

  public async up(q: QueryRunner): Promise<void> {
    const uuid = await uuidFunction(q);
    await q.query(`ALTER TABLE "service_orders" ADD "location" varchar(20)`);
    await q.query(
      `ALTER TABLE "service_orders" ADD CONSTRAINT "CHK_service_orders_location" CHECK ("location" IS NULL OR "location" IN ('at_store', 'to_workshop', 'at_workshop', 'to_store', 'ready_at_store'))`,
    );
    await q.query(`
      UPDATE "service_orders" o SET "location" = 'at_store'
        FROM "stores" s
       WHERE s."id" = o."storeId" AND NOT s."isMain"`);

    await q.query(`
      CREATE TABLE "shipments" (
        "id" uuid NOT NULL DEFAULT ${uuid},
        "number" SERIAL NOT NULL,
        "fromStoreId" uuid NOT NULL,
        "toStoreId" uuid NOT NULL,
        "status" varchar(25) NOT NULL DEFAULT 'sent',
        "carrier" varchar(80),
        "createdById" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "receivedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_shipments" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_shipments_status" CHECK ("status" IN ('sent', 'received', 'received_incomplete')),
        CONSTRAINT "CHK_shipments_stores" CHECK ("fromStoreId" <> "toStoreId"),
        CONSTRAINT "FK_shipments_from_store" FOREIGN KEY ("fromStoreId") REFERENCES "stores"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_shipments_to_store" FOREIGN KEY ("toStoreId") REFERENCES "stores"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_shipments_created_by" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL
      )`);
    await q.query(
      `CREATE UNIQUE INDEX "IDX_shipments_number" ON "shipments" ("number")`,
    );
    await q.query(
      `CREATE INDEX "IDX_shipments_from_createdAt" ON "shipments" ("fromStoreId", "createdAt")`,
    );
    await q.query(
      `CREATE INDEX "IDX_shipments_to_createdAt" ON "shipments" ("toStoreId", "createdAt")`,
    );

    await q.query(`
      CREATE TABLE "shipment_lines" (
        "id" uuid NOT NULL DEFAULT ${uuid},
        "shipmentId" uuid NOT NULL,
        "orderId" uuid NOT NULL,
        "receivedAt" TIMESTAMP WITH TIME ZONE,
        "notArrived" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_shipment_lines" PRIMARY KEY ("id"),
        CONSTRAINT "FK_shipment_lines_shipment" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_shipment_lines_order" FOREIGN KEY ("orderId") REFERENCES "service_orders"("id") ON DELETE CASCADE
      )`);
    await q.query(
      `CREATE UNIQUE INDEX "IDX_shipment_lines_shipment_order" ON "shipment_lines" ("shipmentId", "orderId")`,
    );
    await q.query(
      `CREATE INDEX "IDX_shipment_lines_orderId" ON "shipment_lines" ("orderId")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "shipment_lines"`);
    await q.query(`DROP TABLE "shipments"`);
    await q.query(
      `ALTER TABLE "service_orders" DROP CONSTRAINT "CHK_service_orders_location"`,
    );
    await q.query(`ALTER TABLE "service_orders" DROP COLUMN "location"`);
  }
}
