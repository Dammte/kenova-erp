import { MigrationInterface, QueryRunner } from 'typeorm';
import { uuidFunction } from '../common/db/uuid-function';

/** Design 3.4: parts ordered from a supplier for an order waiting on them. */
export class PartOrders1764500000000 implements MigrationInterface {
  name = 'PartOrders1764500000000';

  public async up(q: QueryRunner): Promise<void> {
    const uuid = await uuidFunction(q);
    await q.query(`
      CREATE TABLE "part_orders" (
        "id" uuid NOT NULL DEFAULT ${uuid},
        "orderId" uuid NOT NULL,
        "inventoryId" uuid,
        "partName" character varying(150) NOT NULL,
        "provider" character varying(100),
        "quantity" integer NOT NULL DEFAULT 1,
        "orderedAt" date NOT NULL,
        "expectedAt" date,
        "receivedAt" TIMESTAMP WITH TIME ZONE,
        "receivedById" uuid,
        "createdById" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_part_orders" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_part_orders_quantity" CHECK ("quantity" > 0),
        CONSTRAINT "FK_part_orders_order" FOREIGN KEY ("orderId") REFERENCES "service_orders"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_part_orders_inventory" FOREIGN KEY ("inventoryId") REFERENCES "inventory"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_part_orders_received_by" FOREIGN KEY ("receivedById") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_part_orders_created_by" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL
      )`);
    await q.query(
      `CREATE INDEX "IDX_part_orders_order" ON "part_orders" ("orderId")`,
    );
    await q.query(
      `CREATE INDEX "IDX_part_orders_pending" ON "part_orders" ("orderedAt") WHERE "receivedAt" IS NULL`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "part_orders"`);
  }
}
