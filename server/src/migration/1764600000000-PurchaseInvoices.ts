import { MigrationInterface, QueryRunner } from 'typeorm';
import { uuidFunction } from '../common/db/uuid-function';

/** Design 3.4: supplier invoices entered into stock, line by line. */
export class PurchaseInvoices1764600000000 implements MigrationInterface {
  name = 'PurchaseInvoices1764600000000';

  public async up(q: QueryRunner): Promise<void> {
    const uuid = await uuidFunction(q);
    await q.query(`
      CREATE TABLE "purchase_invoices" (
        "id" uuid NOT NULL DEFAULT ${uuid},
        "provider" character varying(50) NOT NULL,
        "number" character varying(40),
        "providerKey" character varying(50) NOT NULL,
        "numberKey" character varying(40),
        "invoiceDate" date,
        "createdById" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_purchase_invoices" PRIMARY KEY ("id"),
        CONSTRAINT "FK_purchase_invoices_user" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL
      )`);
    await q.query(
      `CREATE INDEX "IDX_purchase_invoices_provider_number" ON "purchase_invoices" ("providerKey", "numberKey")`,
    );
    await q.query(`
      CREATE TABLE "purchase_invoice_lines" (
        "id" uuid NOT NULL DEFAULT ${uuid},
        "invoiceId" uuid NOT NULL,
        "inventoryId" uuid,
        "ref" character varying(40),
        "refKey" character varying(40),
        "description" character varying(150) NOT NULL,
        "quantity" integer NOT NULL,
        "unitCost" numeric(12,4) NOT NULL,
        "stockBefore" integer NOT NULL,
        CONSTRAINT "PK_purchase_invoice_lines" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_purchase_invoice_lines_quantity" CHECK ("quantity" > 0),
        CONSTRAINT "FK_purchase_invoice_lines_invoice" FOREIGN KEY ("invoiceId") REFERENCES "purchase_invoices"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_purchase_invoice_lines_inventory" FOREIGN KEY ("inventoryId") REFERENCES "inventory"("id") ON DELETE SET NULL
      )`);
    await q.query(
      `CREATE INDEX "IDX_purchase_invoice_lines_invoice" ON "purchase_invoice_lines" ("invoiceId")`,
    );
    await q.query(
      `CREATE INDEX "IDX_purchase_invoice_lines_ref" ON "purchase_invoice_lines" ("refKey")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "purchase_invoice_lines"`);
    await q.query(`DROP TABLE "purchase_invoices"`);
  }
}
