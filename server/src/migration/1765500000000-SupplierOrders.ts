import { MigrationInterface, QueryRunner } from 'typeorm';
import { uuidFunction } from '../common/db/uuid-function';

/**
 * The log of orders read from a supplier's website: each order once
 * (supplier + its id there), with its lines.
 */
export class SupplierOrders1765500000000 implements MigrationInterface {
  name = 'SupplierOrders1765500000000';

  public async up(q: QueryRunner): Promise<void> {
    const uuid = await uuidFunction(q);
    await q.query(
      `ALTER TABLE "suppliers" ADD "ordersSyncedAt" TIMESTAMP WITH TIME ZONE`,
    );
    await q.query(`
      CREATE TABLE "supplier_orders" (
        "id" uuid NOT NULL DEFAULT ${uuid},
        "supplierId" uuid NOT NULL,
        "externalId" character varying(40) NOT NULL,
        "reference" character varying(40) NOT NULL,
        "orderDate" date,
        "total" numeric(12,4),
        "payment" character varying(80),
        "supplierStatus" character varying(80),
        "invoiceUrl" character varying(500),
        "detailUrl" character varying(500) NOT NULL,
        "state" character varying(12) NOT NULL,
        "linesReadAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_supplier_orders" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_supplier_orders_state" CHECK ("state" IN ('PENDIENTE', 'RECIBIDO', 'DESCARTADO', 'ANTERIOR')),
        CONSTRAINT "FK_supplier_orders_supplier" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT
      )`);
    await q.query(
      `CREATE UNIQUE INDEX "UQ_supplier_orders_external" ON "supplier_orders" ("supplierId", "externalId")`,
    );
    await q.query(
      `CREATE INDEX "IDX_supplier_orders_state" ON "supplier_orders" ("state", "orderDate")`,
    );
    await q.query(`
      CREATE TABLE "supplier_order_lines" (
        "id" uuid NOT NULL DEFAULT ${uuid},
        "orderId" uuid NOT NULL,
        "position" integer NOT NULL,
        "description" character varying(150) NOT NULL,
        "ref" character varying(40),
        "productUrl" character varying(500),
        "quantity" integer NOT NULL,
        "unitPrice" numeric(12,4),
        "lineTotal" numeric(12,4),
        CONSTRAINT "PK_supplier_order_lines" PRIMARY KEY ("id"),
        CONSTRAINT "FK_supplier_order_lines_order" FOREIGN KEY ("orderId") REFERENCES "supplier_orders"("id") ON DELETE CASCADE
      )`);
    await q.query(
      `CREATE INDEX "IDX_supplier_order_lines_order" ON "supplier_order_lines" ("orderId")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "supplier_order_lines"`);
    await q.query(`DROP TABLE "supplier_orders"`);
    await q.query(`ALTER TABLE "suppliers" DROP COLUMN "ordersSyncedAt"`);
  }
}
