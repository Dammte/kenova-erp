import { MigrationInterface, QueryRunner } from 'typeorm';
import { uuidFunction } from '../common/db/uuid-function';

/** The companies Kenova buys parts from. */
export class Suppliers1765200000000 implements MigrationInterface {
  name = 'Suppliers1765200000000';

  public async up(q: QueryRunner): Promise<void> {
    const uuid = await uuidFunction(q);
    await q.query(`
      CREATE TABLE "suppliers" (
        "id" uuid NOT NULL DEFAULT ${uuid},
        "name" character varying(80) NOT NULL,
        "taxId" character varying(20),
        "customerNumber" character varying(40),
        "contactName" character varying(80),
        "email" character varying(150),
        "phone" character varying(20),
        "website" character varying(200),
        "notes" character varying(1000),
        "active" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_suppliers" PRIMARY KEY ("id")
      )`);
    await q.query(
      `CREATE UNIQUE INDEX "UQ_suppliers_name" ON "suppliers" (lower("name"))`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "suppliers"`);
  }
}
