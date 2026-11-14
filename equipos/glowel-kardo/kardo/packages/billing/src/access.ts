import type { Sql } from "postgres";
import {
  CONVERSION_COUPON,
  DELETION_NOTICE_DAYS,
  dayKey,
  enqueueNotice,
  type NoticeKind,
  type NoticePayload,
} from "./notices.js";
import {
  createRetentionDeleter,
  type DeletionCleanupClients,
  type DeletionMode,
  type DeletionOutcome,
  isDeletionDue,
} from "./retention.js";

// ---------------------------------------------------------------------------
// Access state of an organization (ADR 020 §4 and §8): trial, active,
// limited, paused, internal, legacy or deleted. `kardo_billing.workspace_access`
// decides it in the database; this module turns it into API shapes, pauses
// and resumes public pages in the Resolver (a billing flag of its own, which
// can never lift a staff suspension), queues the access notices and, with
// BILLING_DELETE_ENABLED, deletes organizations 90 days after they lapsed
// (ADR 020, addendum of 2026-10-01) through `retention.ts`.
// ---------------------------------------------------------------------------

export type AccessState =
  | "internal"
  | "active"
  | "trial"
  | "limited"
  | "paused"
  | "legacy"
  | "deleted";
export type AccessSource =
  | "internal"
  | "subscription"
  | "manual"
  | "trial"
  | "legacy"
  | "none";

export type AccessRow = {
  state: AccessState;
  source: AccessSource;
  plan_code: string | null;
  plan_name: string | null;
  ends_at: Date | null;
  lapsed_at: Date | null;
  grace_ends_at: Date | null;
  delete_at: Date | null;
  offer_until: Date | null;
};

/** Same shape as `WorkspaceAccess` in @kardo/contracts, minus `canManage`. */
export type MirroredAccess = {
  state: AccessState;
  source: AccessSource;
  planCode: string | null;
  planName: string | null;
  endsAt: string | null;
  daysLeft: number | null;
  lapsedAt: string | null;
  graceEndsAt: string | null;
  deleteAt: string | null;
  deletionSoon: boolean;
  offer: {
    percentOff: number;
    months: number;
    interval: "month";
    validUntil: string;
  } | null;
};

const DAY_MS = 86_400_000;

const iso = (value: Date | null): string | null =>
  value ? new Date(value).toISOString() : null;

/** States in which the panel is read-only (403 PLAN_REQUIRED on writes). */
export const isRestrictedAccess = (state: AccessState): boolean =>
  state === "limited" || state === "paused";

export function toMirroredAccess(
  row: AccessRow,
  options: { deletionEnabled: boolean; now?: number },
): MirroredAccess {
  const now = options.now ?? Date.now();
  const endsAt = row.ends_at ? new Date(row.ends_at) : null;
  const deleteAt = row.delete_at ? new Date(row.delete_at) : null;
  const offerUntil = row.offer_until ? new Date(row.offer_until) : null;
  return {
    state: row.state,
    source: row.source,
    planCode: row.plan_code,
    planName: row.plan_name,
    endsAt: iso(endsAt),
    daysLeft: endsAt
      ? Math.max(0, Math.ceil((endsAt.getTime() - now) / DAY_MS))
      : null,
    lapsedAt: iso(row.lapsed_at),
    graceEndsAt: iso(row.grace_ends_at),
    deleteAt: iso(deleteAt),
    // Only announced while the deletion job is on (BILLING_DELETE_ENABLED):
    // never tell a customer about a deletion that will not happen.
    deletionSoon:
      options.deletionEnabled &&
      isRestrictedAccess(row.state) &&
      deleteAt !== null &&
      deleteAt.getTime() - now <= DELETION_NOTICE_DAYS * DAY_MS,
    offer:
      offerUntil && offerUntil.getTime() > now
        ? {
            percentOff: CONVERSION_COUPON.percentOff,
            months: CONVERSION_COUPON.months,
            interval: "month",
            validUntil: offerUntil.toISOString(),
          }
        : null,
  };
}

/** The organization's access state (members or active staff; RLS-checked
 * inside the function). Null when the workspace does not exist. */
export async function readWorkspaceAccess(
  tx: Sql,
  workspaceId: string,
): Promise<AccessRow | null> {
  const [row] = await tx<AccessRow[]>`
    select state, source, plan_code, plan_name, ends_at, lapsed_at,
      grace_ends_at, delete_at, offer_until
    from kardo_billing.workspace_access(${workspaceId}::uuid)
  `;
  return row ?? null;
}

// --- Resolver: billing pause ---------------------------------------------------

export type BillingPauseClient = {
  /** Pauses or resumes the public pages of these Touchpoints. Idempotent. */
  setPaused(input: { publicIds: string[]; paused: boolean }): Promise<void>;
};

export class BillingPauseError extends Error {}

/** At most this many publicIds per Resolver call. */
const PAUSE_BATCH = 100;

/**
 * `POST {resolver}/internal/billing-pause` with `BILLING_COMMAND_KEY`, a
 * secret of its own (never the publish or the staff suspension key). HTTPS
 * only, except a local `wrangler dev` on localhost.
 */
export function createBillingPauseClient(input: {
  resolverUrl: string;
  commandKey: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}): BillingPauseClient {
  const endpoint = new URL("/internal/billing-pause", input.resolverUrl);
  const local =
    endpoint.hostname === "localhost" || endpoint.hostname === "127.0.0.1";
  if (endpoint.protocol !== "https:" && !local) {
    throw new BillingPauseError("Resolver billing pause must use HTTPS.");
  }
  const fetchFn = input.fetchFn ?? fetch;
  const timeoutMs = input.timeoutMs ?? 5_000;
  return {
    async setPaused({ publicIds, paused }) {
      const unique = [...new Set(publicIds)];
      for (let index = 0; index < unique.length; index += PAUSE_BATCH) {
        const batch = unique.slice(index, index + PAUSE_BATCH);
        let response: Response;
        try {
          response = await fetchFn(endpoint, {
            method: "POST",
            headers: {
              authorization: `Bearer ${input.commandKey}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({ publicIds: batch, paused }),
            signal: AbortSignal.timeout(timeoutMs),
          });
        } catch {
          throw new BillingPauseError(
            "Resolver could not update the billing pause.",
          );
        }
        if (!response.ok) {
          throw new BillingPauseError(
            `Resolver answered ${response.status} to the billing pause.`,
          );
        }
      }
    },
  };
}

// --- Reconciliation and the hourly access tick --------------------------------

export type AccessTransition = {
  state: AccessState | null;
  /** What this call did to the public pages. */
  pages: "paused" | "resumed" | null;
  /** Why the pages could not follow the state (no Resolver configured). */
  pending?: "resolver_not_configured";
};

export type AccessReconciler = {
  /** Pauses or resumes the organization's public pages to match its access
   * state. Idempotent; safe to call after any billing change. */
  reconcileWorkspace(workspaceId: string): Promise<AccessTransition>;
  /** Resumes every organization whose pages are paused but that is no
   * longer `paused` (a live subscription, a courtesy, the internal mark). */
  resumeReactivated(): Promise<number>;
  /** Hourly: access notices, then pause or resume what changed, then the
   * deletions that are due and their cleanup outside the database. */
  runAccessTick(): Promise<AccessTickResult>;
  /** Retries what is left to clean after earlier deletions (R2, Resolver). */
  runDeletionCleanup(): Promise<{ done: number; failed: number }>;
};

export type AccessTickResult = {
  checked: number;
  paused: number;
  resumed: number;
  /** Organizations whose step failed (the Resolver, most likely); they
   * are retried on the next tick. */
  failed: number;
  deletion?: {
    mode: DeletionMode;
    deleted: number;
    /** Dry run: what each due organization would lose. */
    previewed: { workspaceId: string; counts: Record<string, number> }[];
    cleaned: number;
    cleanupFailed: number;
  };
};

type Transaction = Sql;

/** Runs `action` as the billing sync role (also used by `retention.ts`). */
export async function withSync<T>(
  sql: Sql,
  action: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`select set_config('role', 'kardo_billing_sync', true)`;
    return action(tx as unknown as Transaction);
  }) as Promise<T>;
}

async function lockWorkspace(tx: Transaction, workspaceId: string) {
  await tx`select pg_advisory_xact_lock(hashtextextended(${`kardo-billing-access:${workspaceId}`}, 0))`;
}

async function resolveAccess(
  tx: Transaction,
  workspaceId: string,
): Promise<AccessRow | null> {
  const [row] = await tx<AccessRow[]>`
    select state, source, plan_code, plan_name, ends_at, lapsed_at,
      grace_ends_at, delete_at, offer_until
    from kardo_billing.resolve_workspace_access(${workspaceId}::uuid)
  `;
  return row ?? null;
}

async function servingPublicIds(
  tx: Transaction,
  workspaceId: string,
  options: { includePlanExcluded: boolean },
): Promise<string[]> {
  // Out of the plan (ADR 023, downgrade option B): paused on their own, so
  // resuming the organization must not wake them up.
  const rows = options.includePlanExcluded
    ? await tx<{ public_id: string }[]>`
        select public_id from kardo_core.touchpoints
        where workspace_id = ${workspaceId}::uuid and status <> 'retired'
        order by public_id
      `
    : await tx<{ public_id: string }[]>`
        select public_id from kardo_core.touchpoints
        where workspace_id = ${workspaceId}::uuid and status <> 'retired'
          and plan_excluded_at is null
        order by public_id
      `;
  return rows.map((row) => row.public_id);
}

async function auditService(
  tx: Transaction,
  workspaceId: string,
  action: string,
  metadata: Record<string, string | number | boolean | null>,
): Promise<void> {
  await tx`
    insert into kardo_audit.events (
      workspace_id, actor_subject, actor_type, action, target_type, target_id, result, metadata
    ) values (
      ${workspaceId}::uuid, null, 'service', ${action}, 'workspace', ${workspaceId}::uuid,
      'succeeded', ${tx.json(metadata)}
    )
  `;
}

/** `account_id` (ADR 024): the person's account; its notices go once. */
type CandidateRow = { id: string; name: string; account_id?: string | null };

type NoticeInput = {
  kind: NoticeKind;
  dedupeKey: string;
  payload: Partial<NoticePayload>;
};

/**
 * The access notice that applies now, if any (only the latest one, so a
 * late tick never sends two at once; `dedupe_key` keeps each unique):
 * - `courtesy_ending` 7 days and 1 day before a staff courtesy ends;
 * - `plan_ended` in the first 3 days after a subscription or courtesy ends
 *   (a trial has its own `trial_ended`);
 * - `pause_upcoming` 3 and 6 days after the end (days 18 and 21 of a trial);
 * - `deletion_upcoming` 15 days before the deletion, only while deletion is
 *   enabled. `pages_paused` is sent when the pages actually pause.
 */
export function accessNoticeFor(
  /** The dedupe scope: the account (ADR 024), or the organization. */
  workspaceId: string,
  access: AccessRow,
  options: { deletionEnabled: boolean; now?: number },
): NoticeInput | null {
  const now = options.now ?? Date.now();
  const base = { planName: access.plan_name ?? "Kardo" };
  if (
    access.state === "active" &&
    access.source === "manual" &&
    access.ends_at
  ) {
    const endsAt = new Date(access.ends_at);
    const msLeft = endsAt.getTime() - now;
    if (msLeft <= 0 || msLeft > 7 * DAY_MS) return null;
    const mark = msLeft <= DAY_MS ? 1 : 7;
    return {
      kind: "courtesy_ending",
      dedupeKey: `courtesy_ending:${workspaceId}:${dayKey(endsAt)}:${mark}`,
      payload: {
        ...base,
        endsAt: endsAt.toISOString(),
        daysLeft: Math.ceil(msLeft / DAY_MS),
      },
    };
  }
  if (!isRestrictedAccess(access.state) || !access.lapsed_at) return null;
  const lapsed = new Date(access.lapsed_at);
  const since = now - lapsed.getTime();
  const dates = {
    graceEndsAt: iso(access.grace_ends_at),
    deleteAt: iso(access.delete_at),
  };
  const lapsedKey = `${workspaceId}:${dayKey(lapsed)}`;
  if (
    options.deletionEnabled &&
    access.delete_at &&
    new Date(access.delete_at).getTime() - now <= DELETION_NOTICE_DAYS * DAY_MS
  ) {
    return {
      kind: "deletion_upcoming",
      dedupeKey: `deletion_upcoming:${lapsedKey}`,
      payload: { ...base, ...dates },
    };
  }
  if (access.state !== "limited") return null;
  if (since >= 3 * DAY_MS) {
    const mark = since >= 6 * DAY_MS ? 6 : 3;
    return {
      kind: "pause_upcoming",
      dedupeKey: `pause_upcoming:${lapsedKey}:${mark}`,
      payload: { ...base, ...dates },
    };
  }
  if (access.source === "subscription" || access.source === "manual") {
    return {
      kind: "plan_ended",
      dedupeKey: `plan_ended:${lapsedKey}`,
      payload: { ...base, ...dates, endedKind: access.source },
    };
  }
  return null;
}

async function enqueueAccessNotice(
  tx: Transaction,
  workspace: CandidateRow,
  notice: NoticeInput,
): Promise<void> {
  await enqueueNotice(tx, {
    workspaceId: workspace.id,
    kind: notice.kind,
    dedupeKey: notice.dedupeKey,
    subscriptionId: null,
    payload: {
      workspaceName: workspace.name,
      planName: "Kardo",
      amount: null,
      currency: "mxn",
      interval: null,
      ...notice.payload,
    },
  });
}

export function createAccessReconciler(options: {
  sql: Sql;
  /** Null without a Resolver or BILLING_COMMAND_KEY: states and notices
   * still work, public pages are not paused. */
  pause: BillingPauseClient | null;
  /** BILLING_DELETE_ENABLED=true: deletion notices and the deletion itself.
   * Off: neither. */
  deletionEnabled: boolean;
  /** BILLING_DELETE_ENABLED=dry-run: count what would go, delete nothing and
   * announce nothing. */
  deletionDryRun?: boolean;
  /** Cleanup after the commit (R2 and the Resolver); null skips it and the
   * items stay pending. */
  cleanup?: DeletionCleanupClients | null;
  /** Called when one organization's step fails (the tick goes on). */
  onError?: (workspaceId: string, error: unknown) => void;
}): AccessReconciler {
  const { sql, pause, deletionEnabled } = options;
  const deletionDryRun = !deletionEnabled && (options.deletionDryRun ?? false);

  async function reconcileTx(
    tx: Transaction,
    workspace: CandidateRow,
  ): Promise<AccessTransition> {
    await lockWorkspace(tx, workspace.id);
    const access = await resolveAccess(tx, workspace.id);
    if (!access) return { state: null, pages: null };
    // Deleted: its Touchpoints are retired; nothing to pause or resume.
    if (access.state === "deleted") return { state: access.state, pages: null };
    const [current] = await tx<{ pages_paused_at: Date | null }[]>`
      select pages_paused_at from kardo_billing.access_states
      where workspace_id = ${workspace.id}::uuid
    `;
    const paused = current?.pages_paused_at != null;
    const shouldPause = access.state === "paused";
    if (shouldPause === paused) return { state: access.state, pages: null };
    if (!pause) {
      return {
        state: access.state,
        pages: null,
        pending: "resolver_not_configured",
      };
    }
    const publicIds = await servingPublicIds(tx, workspace.id, {
      includePlanExcluded: shouldPause,
    });
    if (publicIds.length > 0) {
      await pause.setPaused({ publicIds, paused: shouldPause });
    }
    if (shouldPause) {
      await tx`
        insert into kardo_billing.access_states (
          workspace_id, pages_paused_at, pages_paused_count, updated_at
        ) values (${workspace.id}::uuid, now(), ${publicIds.length}, now())
        on conflict (workspace_id) do update set
          pages_paused_at = now(),
          pages_paused_count = excluded.pages_paused_count,
          updated_at = now()
      `;
      await auditService(tx, workspace.id, "billing.pages_paused", {
        touchpoints: publicIds.length,
      });
      // Nothing to tell an organization that never published a page.
      if (publicIds.length > 0 && access.lapsed_at) {
        await enqueueAccessNotice(tx, workspace, {
          kind: "pages_paused",
          dedupeKey: `pages_paused:${workspace.account_id ?? workspace.id}:${dayKey(access.lapsed_at)}`,
          payload: {
            planName: access.plan_name ?? "Kardo",
            graceEndsAt: iso(access.grace_ends_at),
            deleteAt: deletionEnabled ? iso(access.delete_at) : null,
          },
        });
      }
      return { state: access.state, pages: "paused" };
    }
    await tx`
      update kardo_billing.access_states set
        pages_paused_at = null, last_resumed_at = now(), updated_at = now()
      where workspace_id = ${workspace.id}::uuid
    `;
    await auditService(tx, workspace.id, "billing.pages_resumed", {
      touchpoints: publicIds.length,
      state: access.state,
    });
    return { state: access.state, pages: "resumed" };
  }

  // Deleting an organization after its retention lives in its own module
  // (`retention.ts`; domain audit A2-67): this tick only decides when.
  const retention = createRetentionDeleter({
    sql,
    cleanup: options.cleanup ?? null,
  });
  const deleteWorkspace = retention.deleteWorkspace;
  const runDeletionCleanup = retention.runDeletionCleanup;

  async function workspaceRow(
    tx: Transaction,
    workspaceId: string,
  ): Promise<CandidateRow | null> {
    const [row] = await tx<CandidateRow[]>`
      select id, name, billing_account_id as account_id
      from kardo_core.workspaces where id = ${workspaceId}::uuid
    `;
    return row ?? null;
  }

  async function reconcileWorkspace(
    workspaceId: string,
  ): Promise<AccessTransition> {
    return withSync(sql, async (tx) => {
      const workspace = await workspaceRow(tx, workspaceId);
      if (!workspace) return { state: null, pages: null };
      return reconcileTx(tx, workspace);
    });
  }

  return {
    reconcileWorkspace,

    async resumeReactivated() {
      const paused = await withSync(
        sql,
        (tx) => tx<{ workspace_id: string }[]>`
          select workspace_id from kardo_billing.access_states
          where pages_paused_at is not null
          order by pages_paused_at
          limit 500
        `,
      );
      let resumed = 0;
      for (const row of paused) {
        const result = await reconcileWorkspace(row.workspace_id);
        if (result.pages === "resumed") resumed += 1;
      }
      return resumed;
    },

    async runAccessTick() {
      // Organizations whose access may change or needs a notice: something
      // ended, a courtesy ends within 7 days, or their pages are paused.
      const candidates = await withSync(
        sql,
        (tx) => tx<CandidateRow[]>`
          select w.id, w.name, w.billing_account_id as account_id
          from kardo_core.workspaces w
          left join kardo_billing.accounts acc on acc.id = w.billing_account_id
          where w.deleted_at is null
            and not exists (
              select 1 from kardo_billing.internal_workspaces i where i.workspace_id = w.id
            )
            and (
              -- ADR 024: the trial, the subscription and the courtesy are
              -- the person's, so every organization of the account counts.
              w.plan_excluded_at is not null
              or exists (
                select 1 from kardo_billing.trials t
                where (t.workspace_id = w.id or t.profile_id = acc.profile_id)
                  and t.converted_at is null and t.ends_at <= now()
              )
              or exists (
                select 1 from kardo_billing.subscriptions s
                where (s.workspace_id = w.id or s.account_id = w.billing_account_id)
                  and s.status in ('canceled', 'unpaid', 'paused')
              )
              or exists (
                select 1 from kardo_billing.account_plans ap
                where ap.account_id = w.billing_account_id and ap.override_until is not null
                  and ap.override_until <= now() + interval '7 days'
              )
            )
          union
          select w.id, w.name, w.billing_account_id from kardo_billing.access_states a
          join kardo_core.workspaces w on w.id = a.workspace_id
          where a.pages_paused_at is not null and w.deleted_at is null
          limit 2000
        `,
      );
      let paused = 0;
      let resumed = 0;
      let failed = 0;
      const due: string[] = [];
      for (const workspace of candidates) {
        const result = await withSync(sql, async (tx) => {
          await lockWorkspace(tx, workspace.id);
          const access = await resolveAccess(tx, workspace.id);
          if (access) {
            // Once per account: its organizations share the plan's state.
            const notice = accessNoticeFor(
              workspace.account_id ?? workspace.id,
              access,
              { deletionEnabled },
            );
            if (notice) await enqueueAccessNotice(tx, workspace, notice);
            if (isDeletionDue(access)) due.push(workspace.id);
          }
          return reconcileTx(tx, workspace);
        }).catch((error: unknown) => {
          options.onError?.(workspace.id, error);
          return null;
        });
        if (result === null) failed += 1;
        else if (result.pages === "paused") paused += 1;
        else if (result.pages === "resumed") resumed += 1;
      }
      const summary = { checked: candidates.length, paused, resumed, failed };
      if (!deletionEnabled && !deletionDryRun) return summary;

      // Deletion: each organization in a transaction of its own, after its
      // pages were paused; the function checks everything again.
      let deleted = 0;
      const previewed: {
        workspaceId: string;
        counts: Record<string, number>;
      }[] = [];
      for (const workspaceId of due) {
        const outcome = await deleteWorkspace(
          workspaceId,
          deletionDryRun,
        ).catch((error: unknown) => {
          options.onError?.(workspaceId, error);
          return null;
        });
        if (outcome === null) failed += 1;
        else if (outcome.status === "deleted") deleted += 1;
        else if (outcome.status === "dry_run")
          previewed.push({ workspaceId, counts: outcome.counts });
      }
      const cleanup = deletionEnabled
        ? await runDeletionCleanup()
        : { done: 0, failed: 0 };
      return {
        ...summary,
        failed,
        deletion: {
          mode: deletionEnabled ? "on" : "dry-run",
          deleted,
          previewed,
          cleaned: cleanup.done,
          cleanupFailed: cleanup.failed,
        },
      };
    },

    runDeletionCleanup,
  };
}
