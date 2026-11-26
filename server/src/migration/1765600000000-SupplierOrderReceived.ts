import { MigrationInterface, QueryRunner } from 'typeorm';

/** A supplier order received through «Importar factura»: when, by whom and which entry. */
export class SupplierOrderReceived1765600000000 implements MigrationInterface {
  name = 'SupplierOrderReceived1765600000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "supplier_orders" ADD "purchaseInvoiceId" uuid`);
    await q.query(
      `ALTER TABLE "supplier_orders" ADD "receivedAt" TIMESTAMP WITH TIME ZONE`,
    );
    await q.query(`ALTER TABLE "supplier_orders" ADD "receivedById" uuid`);
    await q.query(
      `ALTER TABLE "supplier_orders" ADD CONSTRAINT "FK_supplier_orders_invoice" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "purchase_invoices"("id") ON DELETE SET NULL`,
    );
    await q.query(
      `ALTER TABLE "supplier_orders" ADD CONSTRAINT "FK_supplier_orders_received_by" FOREIGN KEY ("receivedById") REFERENCES "users"("id") ON DELETE SET NULL`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "supplier_orders" DROP CONSTRAINT "FK_supplier_orders_received_by"`,
    );
    await q.query(
      `ALTER TABLE "supplier_orders" DROP CONSTRAINT "FK_supplier_orders_invoice"`,
    );
    await q.query(`ALTER TABLE "supplier_orders" DROP COLUMN "receivedById"`);
    await q.query(`ALTER TABLE "supplier_orders" DROP COLUMN "receivedAt"`);
    await q.query(
      `ALTER TABLE "supplier_orders" DROP COLUMN "purchaseInvoiceId"`,
    );
  }
}
