import { MigrationInterface, QueryRunner } from 'typeorm';
import { uuidFunction } from '../common/db/uuid-function';

/**
 * Charges and refunds of each order, built next to amountPaid (which stays and
 * always equals charges minus refunds).
 *
 * Every order that had something paid gets one "migrated" charge for that
 * amount, with its payment method (or "other") and the date of its last change,
 * the best guess of when it was paid.
 */
export class OrderPayments1762700000000 implements MigrationInterface {
  name = 'OrderPayments1762700000000';

  public async up(q: QueryRunner): Promise<void> {
    const uuid = await uuidFunction(q);
    await q.query(`
      CREATE TABLE "order_payments" (
        "id" uuid NOT NULL DEFAULT ${uuid},
        "orderId" uuid NOT NULL,
        "storeId" uuid NOT NULL,
        "kind" varchar(10) NOT NULL,
        "amount" numeric(10,2) NOT NULL,
        "method" varchar(10) NOT NULL,
        "note" varchar(300),
        "origin" varchar(20) NOT NULL DEFAULT 'counter',
        "createdById" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_order_payments" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_order_payments_amount_positive" CHECK ("amount" > 0),
        CONSTRAINT "CHK_order_payments_kind" CHECK ("kind" IN ('charge', 'refund')),
        CONSTRAINT "CHK_order_payments_method" CHECK ("method" IN ('cash', 'card', 'transfer', 'other')),
        CONSTRAINT "CHK_order_payments_origin" CHECK ("origin" IN ('counter', 'order_edit', 'migrated')),
        CONSTRAINT "FK_order_payments_order" FOREIGN KEY ("orderId") REFERENCES "service_orders"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_order_payments_store" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_order_payments_user" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL
      )`);
    await q.query(
      `CREATE INDEX "IDX_order_payments_orderId" ON "order_payments" ("orderId")`,
    );
    await q.query(
      `CREATE INDEX "IDX_order_payments_store_createdAt" ON "order_payments" ("storeId", "createdAt")`,
    );

    await q.query(`
      INSERT INTO "order_payments" ("orderId", "storeId", "kind", "amount", "method", "origin", "createdAt")
      SELECT o."id", o."storeId", 'charge', o."amountPaid",
             coalesce(o."paymentMethod"::text, 'other'), 'migrated', o."updatedAt"
        FROM "service_orders" o
       WHERE o."amountPaid" > 0`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "order_payments"`);
  }
}
