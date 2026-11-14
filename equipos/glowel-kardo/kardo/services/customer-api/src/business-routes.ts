import type { Sql } from "postgres";
import type {
  BusinessRoutes,
  BusinessRoutesClient,
} from "./resolver-clients/business-routes.js";

/**
 * Links, phase 3b (relevo 34): after a change to a business's address, its
 * links or its main link, sends the Resolver the whole state of that
 * business (read inside the same transaction, so it already includes the
 * change). It never undoes the change: if the Resolver does not answer,
 * the next change or `scripts/dev/sync-business-links.mjs` sends it again.
 */
export async function syncBusinessRoutes(
  tx: Sql,
  client: BusinessRoutesClient | null | undefined,
  workspaceId: string,
): Promise<void> {
  if (!client) return;
  const [row] = await tx<{ routes: BusinessRoutes | null }[]>`
    select kardo_core.business_link_routes(${workspaceId}::uuid) as routes
  `;
  if (!row?.routes) return;
  try {
    await client.setBusiness(row.routes);
  } catch (error) {
    console.warn(
      JSON.stringify({
        message: "business routes were not sent to the Resolver",
        workspaceId,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
