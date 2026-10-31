import { MigrationInterface, QueryRunner } from 'typeorm';
import { uuidFunction } from '../common/db/uuid-function';

/** Design 3.2: cash put into or taken out of a store's till by hand. */
export class CashMovements1764100000000 implements MigrationInterface {
  name = 'CashMovements1764100000000';

  public async up(q: QueryRunner): Promise<void> {
    const uuid = await uuidFunction(q);
    await q.query(`
      CREATE TABLE "cash_movements" (
        "id" uuid NOT NULL DEFAULT ${uuid},
        "storeId" uuid NOT NULL,
        "kind" character varying(3) NOT NULL,
        "amount" numeric(10,2) NOT NULL,
        "reason" character varying(200) NOT NULL,
        "createdById" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cash_movements" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_cash_movements_kind" CHECK ("kind" IN ('in', 'out')),
        CONSTRAINT "CHK_cash_movements_amount_positive" CHECK ("amount" > 0),
        CONSTRAINT "FK_cash_movements_store" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_cash_movements_user" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL
      )`);
    await q.query(
      `CREATE INDEX "IDX_cash_movements_store_createdAt" ON "cash_movements" ("storeId", "createdAt")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "cash_movements"`);
  }
}
