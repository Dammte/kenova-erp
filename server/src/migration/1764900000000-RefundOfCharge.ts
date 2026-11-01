import { MigrationInterface, QueryRunner } from 'typeorm';

/** Design R2 «Devolver cobro»: a refund can say which charge it gives back. */
export class RefundOfCharge1764900000000 implements MigrationInterface {
  name = 'RefundOfCharge1764900000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "order_payments" ADD "refundOfId" uuid`);
    await q.query(
      `ALTER TABLE "order_payments" ADD CONSTRAINT "FK_order_payments_refund_of" FOREIGN KEY ("refundOfId") REFERENCES "order_payments"("id") ON DELETE SET NULL`,
    );
    await q.query(
      `CREATE INDEX "IDX_order_payments_refundOfId" ON "order_payments" ("refundOfId")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "IDX_order_payments_refundOfId"`);
    await q.query(
      `ALTER TABLE "order_payments" DROP CONSTRAINT "FK_order_payments_refund_of"`,
    );
    await q.query(`ALTER TABLE "order_payments" DROP COLUMN "refundOfId"`);
  }
}
