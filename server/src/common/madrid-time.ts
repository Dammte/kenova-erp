/** Kenova works on Spain's mainland time. */
export const MADRID = 'Europe/Madrid';

/**
 * A `timestamp without time zone` column as Madrid local time. Those columns
 * (service_orders, client and other early tables) hold UTC wall-clock time,
 * because the database session runs in UTC. `col AT TIME ZONE 'Europe/Madrid'`
 * alone would read them as if they were already Madrid time, which puts
 * anything done between midnight and 01:00 (02:00 in summer) on the day before.
 * Columns declared `timestamptz` take the plain `AT TIME ZONE` instead.
 */
export const madridOfUtcNaive = (col: string): string =>
  `((${col}) AT TIME ZONE 'UTC' AT TIME ZONE '${MADRID}')`;
