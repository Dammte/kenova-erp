import { MigrationInterface, QueryRunner } from 'typeorm';

/** Who wrote each internal note of an order. Older notes have no author. */
export class StickyNoteAuthor1763500000000 implements MigrationInterface {
  name = 'StickyNoteAuthor1763500000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "sticky_notes"
        ADD "createdById" uuid,
        ADD CONSTRAINT "FK_sticky_notes_user" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "sticky_notes"
        DROP CONSTRAINT "FK_sticky_notes_user",
        DROP COLUMN "createdById"`);
  }
}
