import { MigrationInterface, QueryRunner } from 'typeorm';
import { uuidFunction } from '../common/db/uuid-function';

/** Design 3.2 «Corregir un día cerrado»: what a partner changed, and why. */
export class CashCorrections1765000000000 implements MigrationInterface {
  name = 'CashCorrections1765000000000';

  public async up(q: QueryRunner): Promise<void> {
    const uuid = await uuidFunction(q);
    await q.query(
      `CREATE TABLE "cash_corrections" (
        "id" uuid NOT NULL DEFAULT ${uuid},
        "storeId" uuid NOT NULL,
        "paymentId" uuid,
        "movementId" uuid,
        "field" character varying(10) NOT NULL,
        "before" character varying(20) NOT NULL,
        "after" character varying(20) NOT NULL,
        "reason" character varying(200) NOT NULL,
        "createdById" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_cash_corrections_field" CHECK ("field" IN ('method', 'amount')),
        CONSTRAINT "CHK_cash_corrections_one_line" CHECK (("paymentId" IS NOT NULL AND "movementId" IS NULL AND "field" = 'method')
   OR ("paymentId" IS NULL AND "movementId" IS NOT NULL AND "field" = 'amount')),
        CONSTRAINT "PK_cash_corrections" PRIMARY KEY ("id"))`,
    );
    await q.query(
      `CREATE INDEX "IDX_cash_corrections_paymentId" ON "cash_corrections" ("paymentId")`,
    );
    await q.query(
      `CREATE INDEX "IDX_cash_corrections_movementId" ON "cash_corrections" ("movementId")`,
    );
    await q.query(
      `ALTER TABLE "cash_corrections" ADD CONSTRAINT "FK_cash_corrections_store" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT`,
    );
    await q.query(
      `ALTER TABLE "cash_corrections" ADD CONSTRAINT "FK_cash_corrections_payment" FOREIGN KEY ("paymentId") REFERENCES "order_payments"("id") ON DELETE CASCADE`,
    );
    await q.query(
      `ALTER TABLE "cash_corrections" ADD CONSTRAINT "FK_cash_corrections_movement" FOREIGN KEY ("movementId") REFERENCES "cash_movements"("id") ON DELETE CASCADE`,
    );
    await q.query(
      `ALTER TABLE "cash_corrections" ADD CONSTRAINT "FK_cash_corrections_user" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "cash_corrections"`);
  }
}
