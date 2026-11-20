import { MigrationInterface, QueryRunner } from 'typeorm';

const OLD = [
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
/** Intake symptoms split out: charging, signal, audio and camera. */
const NEW = [...OLD, 'charging', 'signal', 'audio', 'camera'];
const array = (list: string[]) =>
  `ARRAY[${list.map((f) => `'${f}'`).join(', ')}]::text[]`;

/** «Avería declarada» as symptoms; earlier values stay valid on old orders. */
export class OrderSymptoms1765100000000 implements MigrationInterface {
  name = 'OrderSymptoms1765100000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "service_orders"
         DROP CONSTRAINT "CHK_service_orders_reported_faults",
         ADD CONSTRAINT "CHK_service_orders_reported_faults"
           CHECK ("reportedFaults" <@ ${array(NEW)})`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    // Orders with a new symptom would break the old rule: drop it from them.
    await q.query(
      `UPDATE "service_orders"
          SET "reportedFaults" = ARRAY(
                SELECT f FROM unnest("reportedFaults") AS f WHERE f = ANY(${array(OLD)}))
        WHERE NOT "reportedFaults" <@ ${array(OLD)}`,
    );
    await q.query(
      `ALTER TABLE "service_orders"
         DROP CONSTRAINT "CHK_service_orders_reported_faults",
         ADD CONSTRAINT "CHK_service_orders_reported_faults"
           CHECK ("reportedFaults" <@ ${array(OLD)})`,
    );
  }
}
