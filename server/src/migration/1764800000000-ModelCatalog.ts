import { MigrationInterface, QueryRunner } from 'typeorm';

/** Design R2 3.8: each model's device type, and withdrawing a model. */
export class ModelCatalog1764800000000 implements MigrationInterface {
  name = 'ModelCatalog1764800000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "model" ADD "deviceType" character varying(20)`);
    await q.query(
      `ALTER TABLE "model" ADD "active" boolean NOT NULL DEFAULT true`,
    );
    await q.query(
      `ALTER TABLE "model" ADD CONSTRAINT "CHK_model_device_type" CHECK ("deviceType" IN ('movil', 'tablet', 'computador', 'otro'))`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "model" DROP CONSTRAINT "CHK_model_device_type"`,
    );
    await q.query(`ALTER TABLE "model" DROP COLUMN "active"`);
    await q.query(`ALTER TABLE "model" DROP COLUMN "deviceType"`);
  }
}
