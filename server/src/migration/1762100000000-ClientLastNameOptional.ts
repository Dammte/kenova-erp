import { MigrationInterface, QueryRunner } from 'typeorm';

/** Only the first name is required: a client's last name is now optional. */
export class ClientLastNameOptional1762100000000 implements MigrationInterface {
  name = 'ClientLastNameOptional1762100000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "client" ALTER COLUMN "lastName" DROP NOT NULL`);
    // Blank last names typed before this change mean "unknown".
    await q.query(
      `UPDATE "client" SET "lastName" = NULL WHERE btrim("lastName") = ''`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `UPDATE "client" SET "lastName" = '' WHERE "lastName" IS NULL`,
    );
    await q.query(`ALTER TABLE "client" ALTER COLUMN "lastName" SET NOT NULL`);
  }
}
