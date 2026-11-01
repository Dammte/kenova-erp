import { MigrationInterface, QueryRunner } from 'typeorm';
import { uuidFunction } from '../common/db/uuid-function';

/** Design R2 3.14: the monthly settlement of each partner store's commission. */
export class CommissionSettlements1764700000000 implements MigrationInterface {
  name = 'CommissionSettlements1764700000000';

  public async up(q: QueryRunner): Promise<void> {
    const uuid = await uuidFunction(q);
    await q.query(`
      CREATE TABLE "commission_settlements" (
        "id" uuid NOT NULL DEFAULT ${uuid},
        "storeId" uuid NOT NULL,
        "month" character varying(7) NOT NULL,
        "collected" numeric(10,2) NOT NULL,
        "commission" numeric(10,2) NOT NULL,
        "toKenova" numeric(10,2) NOT NULL,
        "carriedIn" numeric(10,2) NOT NULL,
        "due" numeric(10,2) NOT NULL,
        "received" numeric(10,2) NOT NULL,
        "receivedOn" date NOT NULL,
        "method" character varying(20) NOT NULL,
        "note" character varying(300),
        "createdById" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_commission_settlements" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_commission_settlements_store_month" UNIQUE ("storeId", "month"),
        CONSTRAINT "CHK_commission_settlements_received" CHECK ("received" >= 0),
        CONSTRAINT "FK_commission_settlements_store" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_commission_settlements_created_by" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL
      )`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "commission_settlements"`);
  }
}
