import { MigrationInterface, QueryRunner } from 'typeorm';
import { uuidFunction } from '../common/db/uuid-function';

/** Design 2.5: a store's own WhatsApp texts; base texts live in the code. */
export class MessageTemplates1763900000000 implements MigrationInterface {
  name = 'MessageTemplates1763900000000';

  public async up(q: QueryRunner): Promise<void> {
    const uuid = await uuidFunction(q);
    await q.query(`
      CREATE TABLE "message_templates" (
        "id" uuid NOT NULL DEFAULT ${uuid},
        "storeId" uuid NOT NULL,
        "trigger" character varying(20) NOT NULL,
        "body" text NOT NULL,
        "updatedById" uuid,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_message_templates" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_message_templates_trigger" CHECK ("trigger" IN ('received', 'waiting_parts', 'ready', 'reminder_15', 'reminder_30')),
        CONSTRAINT "FK_message_templates_store" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_message_templates_user" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL
      )`);
    await q.query(
      `CREATE UNIQUE INDEX "IDX_message_templates_store_trigger" ON "message_templates" ("storeId", "trigger")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "message_templates"`);
  }
}
