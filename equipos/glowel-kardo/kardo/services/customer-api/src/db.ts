import postgres, { type Sql } from "postgres";

/**
 * One shared connection pool for every repository. Each repository used to
 * open its own `postgres(...)` pool; sharing a single pool keeps the
 * Customer API's total connection count predictable as more domains
 * (members, invitations, leads, ...) get their own repository module.
 */
export function createDatabaseClient(databaseUrl: string): Sql {
  return postgres(databaseUrl, { max: 10, prepare: false });
}
