import { MigrationInterface, QueryRunner } from 'typeorm';

/** Payments can be made with, or refunded to, the client's saldo a favor. */
export class ClientCredit1763100000000 implements MigrationInterface {
  name = 'ClientCredit1763100000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "order_payments" DROP CONSTRAINT "CHK_order_payments_method"`,
    );
    await q.query(
      `ALTER TABLE "order_payments" ADD CONSTRAINT "CHK_order_payments_method" CHECK ("method" IN ('cash', 'card', 'transfer', 'other', 'credit'))`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    const [{ n }] = await q.query(
      `SELECT count(*)::int AS n FROM "order_payments" WHERE "method" = 'credit'`,
    );
    if (n > 0) {
      throw new Error(
        `${n} payment(s) use saldo a favor: they cannot be reverted`,
      );
    }
    await q.query(
      `ALTER TABLE "order_payments" DROP CONSTRAINT "CHK_order_payments_method"`,
    );
    await q.query(
      `ALTER TABLE "order_payments" ADD CONSTRAINT "CHK_order_payments_method" CHECK ("method" IN ('cash', 'card', 'transfer', 'other'))`,
    );
  }
}
