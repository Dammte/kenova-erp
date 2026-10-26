import { MigrationInterface, QueryRunner } from 'typeorm';
import { uuidFunction } from '../common/db/uuid-function';

export class PasswordResetTokens1761400000000 implements MigrationInterface {
  name = 'PasswordResetTokens1761400000000';

  public async up(q: QueryRunner): Promise<void> {
    const uuid = await uuidFunction(q);
    await q.query(`
      CREATE TABLE "password_reset_tokens" (
        "id" uuid NOT NULL DEFAULT ${uuid},
        "tokenHash" char(64) NOT NULL,
        "userId" uuid NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "usedAt" TIMESTAMP WITH TIME ZONE,
        "requestIp" varchar(64),
        CONSTRAINT "PK_password_reset_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "FK_password_reset_tokens_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )`);
    await q.query(
      `CREATE UNIQUE INDEX "IDX_password_reset_tokens_tokenHash" ON "password_reset_tokens" ("tokenHash")`,
    );
    await q.query(
      `CREATE INDEX "IDX_password_reset_tokens_userId" ON "password_reset_tokens" ("userId")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "password_reset_tokens"`);
  }
}
