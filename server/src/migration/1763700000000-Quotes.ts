import { MigrationInterface, QueryRunner } from 'typeorm';
import { uuidFunction } from '../common/db/uuid-function';

/** Design 2.4: quotes with their own number per store, and their lines. */
export class Quotes1763700000000 implements MigrationInterface {
  name = 'Quotes1763700000000';

  public async up(q: QueryRunner): Promise<void> {
    const uuid = await uuidFunction(q);
    await q.query(
      `ALTER TABLE "stores" ADD "nextQuoteNumber" integer NOT NULL DEFAULT 1`,
    );
    await q.query(`
      CREATE TABLE "quotes" (
        "id" uuid NOT NULL DEFAULT ${uuid},
        "storeId" uuid NOT NULL,
        "number" integer NOT NULL,
        "code" character varying(12) NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'draft',
        "clientId" uuid,
        "clientName" character varying(120) NOT NULL,
        "clientPhone" character varying(20) NOT NULL,
        "deviceId" uuid,
        "brand" character varying(60),
        "model" character varying(80) NOT NULL,
        "fault" character varying(300),
        "total" numeric(10,2) NOT NULL DEFAULT '0',
        "diagnosticFee" numeric(10,2),
        "validUntil" date NOT NULL,
        "sentAt" TIMESTAMP WITH TIME ZONE,
        "decidedAt" TIMESTAMP WITH TIME ZONE,
        "createdById" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_quotes" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_quotes_status" CHECK ("status" IN ('draft', 'sent', 'accepted', 'rejected')),
        CONSTRAINT "CHK_quotes_number_positive" CHECK ("number" > 0),
        CONSTRAINT "CHK_quotes_amounts_nonnegative" CHECK ("total" >= 0 AND coalesce("diagnosticFee", 0) >= 0),
        CONSTRAINT "FK_quotes_store" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_quotes_client" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_quotes_device" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_quotes_user" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL
      )`);
    await q.query(
      `CREATE UNIQUE INDEX "IDX_quotes_store_number" ON "quotes" ("storeId", "number")`,
    );
    await q.query(`CREATE UNIQUE INDEX "IDX_quotes_code" ON "quotes" ("code")`);
    await q.query(`
      CREATE TABLE "quote_lines" (
        "id" uuid NOT NULL DEFAULT ${uuid},
        "quoteId" uuid NOT NULL,
        "position" integer NOT NULL,
        "serviceId" uuid,
        "description" character varying(150) NOT NULL,
        "quality" character varying(20),
        "unitPrice" numeric(10,2) NOT NULL,
        CONSTRAINT "PK_quote_lines" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_quote_lines_price" CHECK ("unitPrice" >= 0),
        CONSTRAINT "CHK_quote_lines_quality" CHECK ("quality" IS NULL OR "quality" IN ('compatible', 'original')),
        CONSTRAINT "FK_quote_lines_quote" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_quote_lines_service" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE SET NULL
      )`);
    await q.query(
      `CREATE INDEX "IDX_quote_lines_quoteId" ON "quote_lines" ("quoteId")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "quote_lines"`);
    await q.query(`DROP TABLE "quotes"`);
    await q.query(`ALTER TABLE "stores" DROP COLUMN "nextQuoteNumber"`);
  }
}
