import { DataSourceOptions } from 'typeorm';

/**
 * Single source of truth for the database connection, shared by the Nest app
 * (app.module.ts) and the TypeORM CLI (data-source.ts) so both always point at
 * the same database with the same SSL settings.
 *
 * DATABASE_URL takes precedence over DB_* (TypeORM ignores DB_* when `url` is set).
 */
export function buildDatabaseOptions(): DataSourceOptions {
  if (
    process.env.NODE_ENV === 'production' &&
    !process.env.DATABASE_URL &&
    !process.env.DB_HOST
  ) {
    // Without this the driver silently tries localhost:5432 and fails with an
    // unhelpful ECONNREFUSED.
    throw new Error(
      'DATABASE_URL is not set: add it to the environment variables of this service',
    );
  }

  const ssl =
    process.env.DB_SSL === 'false'
      ? false
      : process.env.NODE_ENV === 'production' || process.env.DB_SSL === 'true'
        ? {
            rejectUnauthorized:
              process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true',
            ...(process.env.DB_SSL_CA ? { ca: process.env.DB_SSL_CA } : {}),
          }
        : false;

  return {
    type: 'postgres',
    url: process.env.DATABASE_URL || undefined,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl,
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../migration/*{.ts,.js}'],
    migrationsTableName: 'migrations',
    // Never let TypeORM alter the schema on its own: every change goes through
    // a reviewed migration.
    synchronize: false,
    migrationsRun: false,
    // Query logging would print parameters (DNI, phone numbers...) to the logs.
    logging: false,
  };
}
