import { MigrationInterface, QueryRunner } from 'typeorm';

/** How the ERP reads a supplier's orders from its website, and its login, encrypted. */
export class SupplierConnection1765300000000 implements MigrationInterface {
  name = 'SupplierConnection1765300000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "suppliers" ADD "connection" jsonb`);
    await q.query(
      `ALTER TABLE "suppliers" ADD "credentialsCiphertext" character varying(1000)`,
    );
    await q.query(
      `ALTER TABLE "suppliers" ADD "credentialsUpdatedAt" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "suppliers" DROP COLUMN "credentialsUpdatedAt"`);
    await q.query(
      `ALTER TABLE "suppliers" DROP COLUMN "credentialsCiphertext"`,
    );
    await q.query(`ALTER TABLE "suppliers" DROP COLUMN "connection"`);
  }
}
