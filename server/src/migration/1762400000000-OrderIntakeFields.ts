import { MigrationInterface, QueryRunner } from 'typeorm';

const FAULTS = [
  'broken_screen',
  'battery',
  'not_turning_on',
  'liquid_damage',
  'connectivity',
  'slow_performance',
  'partial',
  'working',
  'other',
];

/**
 * What the customer reported and left with the device, recorded on the order
 * (the same phone can come back another day with another fault).
 *
 * Existing orders take the fault stored on their device, when it is one of the
 * known intake options; the device column is left untouched.
 */
export class OrderIntakeFields1762400000000 implements MigrationInterface {
  name = 'OrderIntakeFields1762400000000';

  public async up(q: QueryRunner): Promise<void> {
    const list = `ARRAY[${FAULTS.map((f) => `'${f}'`).join(', ')}]::text[]`;
    await q.query(
      `ALTER TABLE "service_orders"
         ADD "reportedFaults" text[] NOT NULL DEFAULT '{}',
         ADD "faultNotes" varchar(500),
         ADD "physicalCondition" varchar(500),
         ADD "accessories" varchar(300),
         ADD "waivesQuote" boolean NOT NULL DEFAULT false`,
    );
    await q.query(
      `UPDATE "service_orders" o SET "reportedFaults" = ARRAY[d."status"]
         FROM "devices" d
        WHERE d."id" = o."deviceId" AND d."status" = ANY(${list})`,
    );
    await q.query(
      `ALTER TABLE "service_orders" ADD CONSTRAINT "CHK_service_orders_reported_faults"
         CHECK ("reportedFaults" <@ ${list})`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "service_orders"
         DROP CONSTRAINT "CHK_service_orders_reported_faults",
         DROP COLUMN "waivesQuote",
         DROP COLUMN "accessories",
         DROP COLUMN "physicalCondition",
         DROP COLUMN "faultNotes",
         DROP COLUMN "reportedFaults"`,
    );
  }
}
