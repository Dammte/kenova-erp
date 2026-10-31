import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Design 3.3: merging duplicate clients. The merged-away client keeps its row
 * (soft-deleted) pointing at the one it was merged into, and pairs marked
 * «No es la misma persona» are remembered so they are not flagged again.
 */
export class ClientMerge1764300000000 implements MigrationInterface {
  name = 'ClientMerge1764300000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "client"
        ADD "mergedIntoId" uuid,
        ADD "mergedAt" TIMESTAMP WITH TIME ZONE,
        ADD CONSTRAINT "FK_client_merged_into" FOREIGN KEY ("mergedIntoId") REFERENCES "client"("id") ON DELETE SET NULL`);
    await q.query(`
      CREATE TABLE "client_not_duplicates" (
        "clientAId" uuid NOT NULL,
        "clientBId" uuid NOT NULL,
        "createdById" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_client_not_duplicates" PRIMARY KEY ("clientAId", "clientBId"),
        CONSTRAINT "CHK_client_not_duplicates_order" CHECK ("clientAId" < "clientBId"),
        CONSTRAINT "FK_client_not_duplicates_a" FOREIGN KEY ("clientAId") REFERENCES "client"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_client_not_duplicates_b" FOREIGN KEY ("clientBId") REFERENCES "client"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_client_not_duplicates_user" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL
      )`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "client_not_duplicates"`);
    await q.query(`
      ALTER TABLE "client"
        DROP CONSTRAINT "FK_client_merged_into",
        DROP COLUMN "mergedAt",
        DROP COLUMN "mergedIntoId"`);
  }
}
