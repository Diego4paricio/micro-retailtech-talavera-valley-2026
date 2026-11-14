import type { Sql } from "postgres";
import { type AccessRow, withSync } from "./access.js";

// ---------------------------------------------------------------------------
// Deleting an organization 90 days after its plan or trial ended (ADR 020,
// addendum of 2026-10-01): when it is due, the database deletion and the
// cleanup outside the database (R2 files and the Resolver's retirement).
// Its own module since the domain audit of 2026-10-13 (A2-67): it is the
// organization's lifecycle, triggered by billing; the hourly access tick in
// `access.ts` only decides when.
// ---------------------------------------------------------------------------

/**
 * BILLING_DELETE_ENABLED: `"true"` deletes (and announces it 15 days
 * before); `"dry-run"` only counts what would go, for a staged rollout;
 * anything else is off. Production stays off until the lawyer reviews it.
 */
export type DeletionMode = "off" | "dry-run" | "on";

export function deletionModeOf(value: string | undefined | null): DeletionMode {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "true") return "on";
  if (normalized === "dry-run") return "dry-run";
  return "off";
}

/** An uploaded file to remove from R2 (the derivative only when unshared). */
export type AssetCleanupTarget = {
  assetId: string;
  storageKey: string;
  sha256: string | null;
  deleteDerivative: boolean;
};

/** What runs after the database commit, retried every hour until it works. */
export type DeletionCleanupClients = {
  /** Retires the Touchpoint in the Resolver (410, terminal) and purges its
   * published snapshots. Null without a Resolver or the publish key. */
  retireTouchpoint: ((publicId: string) => Promise<void>) | null;
  /** Deletes an upload through the assets Worker. Null without it. */
  deleteAsset: ((target: AssetCleanupTarget) => Promise<void>) | null;
};

export class ResolverRetireError extends Error {}

/**
 * `POST {resolver}/internal/availability` with `status: "retired"` and
 * `purge: true`, authorized with the publish key: the same power the
 * Customer API already uses when a customer retires a Touchpoint, so the
 * billing key stays limited to a reversible pause. HTTPS only, except a local
 * `wrangler dev` on localhost.
 */
export function createResolverRetireClient(input: {
  resolverUrl: string;
  commandKey: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}): (publicId: string) => Promise<void> {
  const endpoint = new URL("/internal/availability", input.resolverUrl);
  const local =
    endpoint.hostname === "localhost" || endpoint.hostname === "127.0.0.1";
  if (endpoint.protocol !== "https:" && !local) {
    throw new ResolverRetireError("Resolver retirement must use HTTPS.");
  }
  const fetchFn = input.fetchFn ?? fetch;
  const timeoutMs = input.timeoutMs ?? 5_000;
  return async (publicId) => {
    let response: Response;
    try {
      response = await fetchFn(endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${input.commandKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ publicId, status: "retired", purge: true }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new ResolverRetireError("Resolver could not retire the page.");
    }
    await response.body?.cancel();
    if (!response.ok) {
      throw new ResolverRetireError(
        `Resolver answered ${response.status} to the retirement.`,
      );
    }
  };
}

/** Result of `kardo_private.delete_workspace_data`. */
export type DeletionOutcome =
  | {
      status: "deleted";
      counts: Record<string, number>;
      cleanupItems: number;
    }
  | { status: "dry_run"; counts: Record<string, number>; deleteAt: string }
  | { status: "already_deleted"; deletedAt: string }
  | { status: "not_due"; why: string }
  | { status: "not_found" };

/** Why the job deletes; kept in the audit and in workspace_deletions. */
export const DELETION_REASON = "billing.retention_expired";

/** The organization is due: paused and past its deletion date. */
export function isDeletionDue(access: AccessRow, now = Date.now()): boolean {
  return (
    access.state === "paused" &&
    access.delete_at !== null &&
    new Date(access.delete_at).getTime() <= now
  );
}

type CleanupRow = {
  id: string;
  workspace_id: string;
  kind: "resolver" | "asset";
  target: Record<string, unknown>;
};

function assetTarget(target: Record<string, unknown>): AssetCleanupTarget {
  return {
    assetId: String(target.assetId),
    storageKey: String(target.storageKey),
    sha256: typeof target.sha256 === "string" ? target.sha256 : null,
    deleteDerivative: target.deleteDerivative === true,
  };
}

export type RetentionDeleter = {
  deleteWorkspace(
    workspaceId: string,
    dryRun: boolean,
  ): Promise<DeletionOutcome>;
  runDeletionCleanup(): Promise<{ done: number; failed: number }>;
};

export function createRetentionDeleter(options: {
  sql: Sql;
  /** Cleanup after the commit (R2 and the Resolver); null skips it and the
   * items stay pending. */
  cleanup: DeletionCleanupClients | null;
}): RetentionDeleter {
  const { sql } = options;

  async function deleteWorkspace(
    workspaceId: string,
    dryRun: boolean,
  ): Promise<DeletionOutcome> {
    const [row] = await withSync(
      sql,
      (tx) => tx<{ outcome: DeletionOutcome }[]>`
        select kardo_private.delete_workspace_data(
          ${workspaceId}::uuid, ${DELETION_REASON}, ${dryRun}
        ) as outcome
      `,
    );
    if (!row) throw new Error("The deletion returned nothing.");
    return row.outcome;
  }

  /**
   * Cleans what each deletion left outside the database, oldest first. A
   * failure keeps the item pending (retried next hour) and the organization
   * is not marked clean until every item is done.
   */
  async function runDeletionCleanup(): Promise<{
    done: number;
    failed: number;
  }> {
    const clients = options.cleanup;
    if (!clients) return { done: 0, failed: 0 };
    const items = await withSync(
      sql,
      (tx) => tx<CleanupRow[]>`
        select id, workspace_id, kind, target from kardo_billing.deletion_cleanup
        where done_at is null
        order by created_at, id
        limit 200
      `,
    );
    let done = 0;
    let failed = 0;
    for (const item of items) {
      let error: string | null = null;
      try {
        if (item.kind === "resolver") {
          if (!clients.retireTouchpoint)
            throw new Error("Resolver not configured.");
          await clients.retireTouchpoint(String(item.target.publicId));
        } else {
          if (!clients.deleteAsset)
            throw new Error("Assets Worker not configured.");
          await clients.deleteAsset(assetTarget(item.target));
        }
      } catch (failure) {
        error = failure instanceof Error ? failure.message : String(failure);
      }
      await withSync(
        sql,
        (tx) => tx`
          update kardo_billing.deletion_cleanup set
            attempts = attempts + 1,
            last_error = ${error === null ? null : error.slice(0, 500)},
            done_at = ${error === null ? new Date() : null}
          where id = ${item.id}::uuid
        `,
      );
      if (error === null) done += 1;
      else failed += 1;
    }
    await withSync(
      sql,
      (tx) => tx`
        update kardo_billing.workspace_deletions d
        set cleanup_completed_at = now()
        where d.cleanup_completed_at is null
          and not exists (
            select 1 from kardo_billing.deletion_cleanup c
            where c.workspace_id = d.workspace_id and c.done_at is null
          )
      `,
    );
    return { done, failed };
  }

  return { deleteWorkspace, runDeletionCleanup };
}
