import { QueryRunner } from 'typeorm';

/**
 * Returns the schema-qualified `uuid_generate_v4()` to use in column defaults.
 *
 * Managed hosts install extensions outside `public` (Supabase uses the
 * `extensions` schema), so neither `public.uuid_generate_v4()` nor an
 * unqualified call (search_path dependent) is safe. Creates the extension in
 * the default schema only when it is not installed anywhere.
 */
export async function uuidFunction(q: QueryRunner): Promise<string> {
  await q.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
  const [{ schema }] = await q.query(
    `SELECT n.nspname AS "schema" FROM pg_extension e
       JOIN pg_namespace n ON n.oid = e.extnamespace
      WHERE e.extname = 'uuid-ossp'`,
  );
  return `"${schema}".uuid_generate_v4()`;
}
