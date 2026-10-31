import { MigrationInterface, QueryRunner } from 'typeorm';
import { uuidFunction } from '../common/db/uuid-function';

/** Design 2.5: each notice sent about an order, with the text that went out. */
export class OrderNotices1764000000000 implements MigrationInterface {
  name = 'OrderNotices1764000000000';

  public async up(q: QueryRunner): Promise<void> {
    const uuid = await uuidFunction(q);
    await q.query(`
      CREATE TABLE "order_notices" (
        "id" uuid NOT NULL DEFAULT ${uuid},
        "serviceOrderId" uuid NOT NULL,
        "trigger" character varying(20) NOT NULL,
        "channel" character varying(10) NOT NULL DEFAULT 'whatsapp',
        "body" text NOT NULL,
        "sentById" uuid,
        "sentAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_order_notices" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_order_notices_trigger" CHECK ("trigger" IN ('received', 'waiting_parts', 'ready', 'reminder_15', 'reminder_30')),
        CONSTRAINT "CHK_order_notices_channel" CHECK ("channel" IN ('whatsapp')),
        CONSTRAINT "FK_order_notices_order" FOREIGN KEY ("serviceOrderId") REFERENCES "service_orders"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_order_notices_user" FOREIGN KEY ("sentById") REFERENCES "users"("id") ON DELETE SET NULL
      )`);
    await q.query(
      `CREATE INDEX "IDX_order_notices_order" ON "order_notices" ("serviceOrderId", "sentAt")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "order_notices"`);
  }
}
