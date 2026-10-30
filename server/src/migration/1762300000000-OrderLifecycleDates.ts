import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * When an order was finished and handed back, and why it was cancelled.
 *
 * Existing finished or delivered orders take the date of the matching status
 * change in their history; orders without one fall back to their last update.
 */
export class OrderLifecycleDates1762300000000 implements MigrationInterface {
  name = 'OrderLifecycleDates1762300000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "service_orders"
         ADD "finishedAt" TIMESTAMP WITH TIME ZONE,
         ADD "deliveredAt" TIMESTAMP WITH TIME ZONE,
         ADD "cancelReason" varchar(300)`,
    );
    const changedTo = (label: string) =>
      `(SELECT max(h."createdAt") FROM "service_history" h
         WHERE h."serviceOrderId" = o."id" AND h."action" = 'cambio_estado'
           AND h."description" LIKE '%a "${label}"')`;
    await q.query(
      `UPDATE "service_orders" o
          SET "finishedAt" = coalesce(${changedTo('Finalizado')}, ${changedTo('Entregado')}, o."updatedAt")
        WHERE o."status" IN ('finalizado', 'entregado')`,
    );
    await q.query(
      `UPDATE "service_orders" o
          SET "deliveredAt" = coalesce(${changedTo('Entregado')}, o."updatedAt")
        WHERE o."status" = 'entregado'`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "service_orders"
         DROP COLUMN "cancelReason",
         DROP COLUMN "deliveredAt",
         DROP COLUMN "finishedAt"`,
    );
  }
}
