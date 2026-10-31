import { MigrationInterface, QueryRunner } from 'typeorm';
import { uuidFunction } from '../common/db/uuid-function';

/** Design 3.2: the optional count of a store's cash day. */
export class CashCounts1764200000000 implements MigrationInterface {
  name = 'CashCounts1764200000000';

  public async up(q: QueryRunner): Promise<void> {
    const uuid = await uuidFunction(q);
    await q.query(`
      CREATE TABLE "cash_counts" (
        "id" uuid NOT NULL DEFAULT ${uuid},
        "storeId" uuid NOT NULL,
        "date" date NOT NULL,
        "cash" numeric(10,2),
        "terminal" numeric(10,2),
        "note" character varying(300),
        "countedById" uuid,
        "countedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cash_counts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_cash_counts_store_date" UNIQUE ("storeId", "date"),
        CONSTRAINT "CHK_cash_counts_something" CHECK ("cash" IS NOT NULL OR "terminal" IS NOT NULL),
        CONSTRAINT "CHK_cash_counts_cash" CHECK ("cash" >= 0),
        CONSTRAINT "CHK_cash_counts_terminal" CHECK ("terminal" >= 0),
        CONSTRAINT "FK_cash_counts_store" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_cash_counts_user" FOREIGN KEY ("countedById") REFERENCES "users"("id") ON DELETE SET NULL
      )`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "cash_counts"`);
  }
}
