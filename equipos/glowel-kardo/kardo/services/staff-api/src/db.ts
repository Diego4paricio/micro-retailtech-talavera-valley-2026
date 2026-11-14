import postgres, { type Sql } from "postgres";

/** One shared connection pool for every repository. Kardo Operations is a
 * low-traffic internal panel, so a small pool is plenty. */
export function createDatabaseClient(databaseUrl: string): Sql {
  return postgres(databaseUrl, { max: 4, prepare: false });
}
