import { MigrationInterface, QueryRunner } from 'typeorm';
import { uuidFunction } from '../common/db/uuid-function';

/**
 * Stores and the store of each user.
 *
 * Creates the workshop (Medina de Pomar, prefix MP) as the main store and
 * assigns every existing STORE_ADMIN to it: until now there was only one shop.
 */
export class Stores1761900000000 implements MigrationInterface {
  name = 'Stores1761900000000';

  public async up(q: QueryRunner): Promise<void> {
    const uuid = await uuidFunction(q);
    await q.query(`
      CREATE TABLE "stores" (
        "id" uuid NOT NULL DEFAULT ${uuid},
        "name" varchar(80) NOT NULL,
        "city" varchar(80) NOT NULL,
        "prefix" varchar(4) NOT NULL,
        "address" varchar(150),
        "phone" varchar(20),
        "isMain" boolean NOT NULL DEFAULT false,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stores" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_stores_prefix" CHECK ("prefix" ~ '^[A-Z]{2,4}$')
      )`);
    await q.query(
      `CREATE UNIQUE INDEX "IDX_stores_prefix" ON "stores" ("prefix")`,
    );
    // At most one workshop.
    await q.query(
      `CREATE UNIQUE INDEX "IDX_stores_single_main" ON "stores" ("isMain") WHERE "isMain"`,
    );
    await q.query(
      `INSERT INTO "stores" ("name", "city", "prefix", "isMain")
       VALUES ('Medina de Pomar', 'Medina de Pomar', 'MP', true)`,
    );

    await q.query(`ALTER TABLE "users" ADD "storeId" uuid`);
    await q.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_users_store" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT`,
    );
    await q.query(`CREATE INDEX "IDX_users_storeId" ON "users" ("storeId")`);
    await q.query(
      `UPDATE "users" SET "storeId" = (SELECT "id" FROM "stores" WHERE "isMain")
       WHERE "role" = 'STORE_ADMIN'`,
    );
    await q.query(
      `ALTER TABLE "users" ADD CONSTRAINT "CHK_users_store_admin_store" CHECK ("role" <> 'STORE_ADMIN' OR "storeId" IS NOT NULL)`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "users" DROP CONSTRAINT "CHK_users_store_admin_store"`,
    );
    await q.query(`DROP INDEX "IDX_users_storeId"`);
    await q.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_users_store"`);
    await q.query(`ALTER TABLE "users" DROP COLUMN "storeId"`);
    await q.query(`DROP TABLE "stores"`);
  }
}
