import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Companies as clients: CIF as a document type, and room for a legal name in
 * firstName (lastName holds the contact person).
 */
export class ClientCompany1762900000000 implements MigrationInterface {
  name = 'ClientCompany1762900000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE "client_dnitype_enum" ADD VALUE 'CIF'`);
    await q.query(
      `ALTER TABLE "client" ALTER COLUMN "firstName" TYPE varchar(100)`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    const [{ n }] = await q.query(
      `SELECT count(*)::int AS n FROM "client" WHERE "dniType" = 'CIF'`,
    );
    if (n > 0) {
      throw new Error(
        `${n} client(s) use CIF: change their document type before reverting`,
      );
    }
    await q.query(
      `ALTER TABLE "client" ALTER COLUMN "firstName" TYPE varchar(50) USING left("firstName", 50)`,
    );
    // PostgreSQL cannot drop an enum value: rebuild the type without it.
    await q.query(`ALTER TABLE "client" ALTER COLUMN "dniType" DROP DEFAULT`);
    await q.query(
      `ALTER TYPE "client_dnitype_enum" RENAME TO "client_dnitype_enum_old"`,
    );
    await q.query(
      `CREATE TYPE "client_dnitype_enum" AS ENUM ('NIF', 'NIE', 'PASSPORT')`,
    );
    await q.query(
      `ALTER TABLE "client" ALTER COLUMN "dniType" TYPE "client_dnitype_enum" USING "dniType"::text::"client_dnitype_enum"`,
    );
    await q.query(
      `ALTER TABLE "client" ALTER COLUMN "dniType" SET DEFAULT 'NIF'`,
    );
    await q.query(`DROP TYPE "client_dnitype_enum_old"`);
  }
}
