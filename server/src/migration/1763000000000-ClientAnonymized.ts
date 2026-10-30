import { MigrationInterface, QueryRunner } from 'typeorm';

/** Marks clients whose personal data was removed on request (RGPD). */
export class ClientAnonymized1763000000000 implements MigrationInterface {
  name = 'ClientAnonymized1763000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "client" ADD "anonymizedAt" TIMESTAMP WITH TIME ZONE DEFAULT NULL`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "client" DROP COLUMN "anonymizedAt"`);
  }
}
