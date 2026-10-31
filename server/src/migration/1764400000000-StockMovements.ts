import { MigrationInterface, QueryRunner } from 'typeorm';
import { uuidFunction } from '../common/db/uuid-function';

/** Design 3.4: a record of every change to a part's stock. */
export class StockMovements1764400000000 implements MigrationInterface {
  name = 'StockMovements1764400000000';

  public async up(q: QueryRunner): Promise<void> {
    const uuid = await uuidFunction(q);
    await q.query(`
      CREATE TABLE "stock_movements" (
        "id" uuid NOT NULL DEFAULT ${uuid},
        "inventoryId" uuid NOT NULL,
        "kind" character varying(10) NOT NULL,
        "quantity" integer NOT NULL,
        "stockAfter" integer NOT NULL,
        "orderId" uuid,
        "note" character varying(200),
        "createdById" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stock_movements" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_stock_movements_kind" CHECK ("kind" IN ('initial', 'purchase', 'order', 'adjust')),
        CONSTRAINT "CHK_stock_movements_quantity_nonzero" CHECK ("quantity" <> 0),
        CONSTRAINT "FK_stock_movements_inventory" FOREIGN KEY ("inventoryId") REFERENCES "inventory"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_stock_movements_order" FOREIGN KEY ("orderId") REFERENCES "service_orders"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_stock_movements_user" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL
      )`);
    await q.query(
      `CREATE INDEX "IDX_stock_movements_inventory_createdAt" ON "stock_movements" ("inventoryId", "createdAt")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "stock_movements"`);
  }
}
