import type { Sql } from "postgres";
import type { BillingPauseClient } from "./access.js";
import { enqueueNotice, TERMS_VERSION } from "./notices.js";

// ---------------------------------------------------------------------------
// Downgrade option B (ADR 023; Términos 10.5): after moving to a plan with
// fewer Touchpoints or Links than the organization has, the customer has 14
// days to choose what stays active. Without a choice, the hourly task keeps
// the most visited ones of the last 30 days. What stays out shows the
// Resolver's neutral page (the per-Touchpoint billing pause), stops counting
// toward the limit and is never deleted.
//
// Since ADR 024 the plan is the person's: the window belongs to the billing
// account, and it chooses organizations first (an organization out of the
// plan pauses whole), then QR y etiquetas and links of those that stay.
// ---------------------------------------------------------------------------

type Transaction = Sql;

/** Days before the deadline when the reminder goes out. */
export const PLAN_OVERAGE_REMINDER_DAYS = 3;
/** Window of visits the default rule ranks by. */
export const PLAN_OVERAGE_VISITS_DAYS = 30;

export type PlanOverageRefresh = {
  status: "opened" | "updated" | "resolved" | "none";
  reactivated?: number;
  organizationsOver?: number;
  touchpointsOver?: number;
  linksOver?: number;
};

export type PlanSelectionCandidate = {
  id: string;
  publicId: string;
  /** `organization` (ADR 024), `link`, or a physical format (qr, nfc…). */
  kind: string;
  name: string | null;
  excluded: boolean;
  updatedAt: Date;
  /** The organization a QR or link belongs to (itself for one). */
  workspaceId?: string | null;
};

/** Visits per publicId in the last days; a failure ranks by recency only. */
export type VisitsByTouchpoint = (input: {
  workspaceId: string;
  publicIds: string[];
  days: number;
}) => Promise<Map<string, number>>;

async function withSync<T>(
  sql: Sql,
  action: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`select set_config('role', 'kardo_billing_sync', true)`;
    return action(tx as unknown as Transaction);
  }) as Promise<T>;
}

type OverageRow = {
  account_id: string;
  /** The account's reference organization: notices and audit go there. */
  workspace_id: string;
  plan_code: string;
  plan_name: string | null;
  workspace_name: string;
  organizations_limit: number | null;
  touchpoints_limit: number | null;
  links_limit: number | null;
  organizations_over: number;
  touchpoints_over: number;
  links_over: number;
  choose_by: Date;
  detected_at: Date;
};

async function readOverage(
  tx: Transaction,
  accountId: string,
): Promise<OverageRow | null> {
  const [row] = await tx<OverageRow[]>`
    select o.account_id, o.workspace_id, o.plan_code, p.name as plan_name,
      w.name as workspace_name, o.organizations_limit,
      o.touchpoints_limit, o.links_limit, o.organizations_over,
      o.touchpoints_over, o.links_over, o.choose_by, o.detected_at
    from kardo_billing.plan_overages o
    join kardo_core.workspaces w on w.id = o.workspace_id
    left join kardo_core.plans p on p.code = o.plan_code
    where o.account_id = ${accountId}::uuid
  `;
  return row ?? null;
}

function payloadOf(row: OverageRow) {
  return {
    workspaceName: row.workspace_name,
    planName: row.plan_name ?? row.plan_code,
    amount: null,
    currency: "mxn",
    interval: null,
    termsVersion: TERMS_VERSION,
    chooseBy: new Date(row.choose_by).toISOString(),
    organizationsOver: row.organizations_over,
    organizationsLimit: row.organizations_limit,
    touchpointsOver: row.touchpoints_over,
    linksOver: row.links_over,
    touchpointsLimit: row.touchpoints_limit,
    linksLimit: row.links_limit,
  };
}

/** The billing account an organization is in (ADR 024). */
async function accountOfWorkspace(
  tx: Transaction,
  workspaceId: string,
): Promise<string | null> {
  const [row] = await tx<{ billing_account_id: string | null }[]>`
    select billing_account_id from kardo_core.workspaces where id = ${workspaceId}::uuid
  `;
  return row?.billing_account_id ?? null;
}

/**
 * Checks a person's billing account against its plan: reactivates what
 * fits again, opens the 14-day window (and its email) when something is
 * over, closes it when nothing is out. Runs as `kardo_billing_sync`
 * (webhook and tick).
 */
export async function refreshAccountOverageTx(
  tx: Transaction,
  accountId: string,
): Promise<PlanOverageRefresh> {
  // The account's lock (the same key as the sync's, re-entrant): the hourly
  // check and a webhook of the same account take turns.
  await tx`select pg_advisory_xact_lock(hashtextextended(${`kardo-billing:account:${accountId}`}, 0))`;
  const [row] = await tx<{ result: PlanOverageRefresh }[]>`
    select kardo_billing.refresh_account_overage(${accountId}::uuid) as result
  `;
  const result = row?.result ?? { status: "none" };
  if (result.status === "opened") {
    const overage = await readOverage(tx, accountId);
    if (overage)
      await enqueueNotice(tx, {
        workspaceId: overage.workspace_id,
        kind: "plan_overage_opened",
        dedupeKey: `plan_overage_opened:${accountId}:${new Date(overage.detected_at).toISOString()}`,
        subscriptionId: null,
        payload: payloadOf(overage),
      });
  }
  return result;
}

/** Same, by one of the account's organizations (older callers). */
export async function refreshPlanOverageTx(
  tx: Transaction,
  workspaceId: string,
): Promise<PlanOverageRefresh> {
  const accountId = await accountOfWorkspace(tx, workspaceId);
  if (!accountId) return { status: "none" };
  return refreshAccountOverageTx(tx, accountId);
}

/** The candidates in the order the default rule keeps them. */
export function rankForDefault(
  candidates: PlanSelectionCandidate[],
  visits: Map<string, number>,
): PlanSelectionCandidate[] {
  return [...candidates].sort(
    (a, b) =>
      (visits.get(b.publicId) ?? 0) - (visits.get(a.publicId) ?? 0) ||
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime() ||
      a.id.localeCompare(b.id),
  );
}

/**
 * What the default rule keeps: first the most visited organizations (the
 * sum of their codes' visits), up to their limit; then, of those, the top
 * of each kind, up to its limit.
 */
export function defaultKeep(
  candidates: PlanSelectionCandidate[],
  visits: Map<string, number>,
  limits: {
    organizations?: number | null;
    touchpoints: number | null;
    links: number | null;
  },
): string[] {
  const keep: string[] = [];
  const organizations = candidates.filter(
    (candidate) => candidate.kind === "organization",
  );
  let kept: Set<string> | null = null;
  if (organizations.length > 0) {
    const byOrganization = new Map<string, number>();
    for (const candidate of candidates) {
      if (candidate.kind === "organization" || !candidate.workspaceId) continue;
      byOrganization.set(
        candidate.workspaceId,
        (byOrganization.get(candidate.workspaceId) ?? 0) +
          (visits.get(candidate.publicId) ?? 0),
      );
    }
    const ranked = [...organizations].sort(
      (a, b) =>
        (byOrganization.get(b.id) ?? 0) - (byOrganization.get(a.id) ?? 0) ||
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime() ||
        a.id.localeCompare(b.id),
    );
    const limit = limits.organizations ?? null;
    const stay = limit === null ? ranked : ranked.slice(0, limit);
    kept = new Set(stay.map((candidate) => candidate.id));
    keep.push(...stay.map((candidate) => candidate.id));
  }
  const ranked = rankForDefault(
    candidates.filter(
      (candidate) =>
        candidate.kind !== "organization" &&
        (!kept || !candidate.workspaceId || kept.has(candidate.workspaceId)),
    ),
    visits,
  );
  for (const kind of ["touchpoint", "link"] as const) {
    const limit = kind === "link" ? limits.links : limits.touchpoints;
    const ofKind = ranked.filter(
      (candidate) => (candidate.kind === "link") === (kind === "link"),
    );
    keep.push(
      ...(limit === null ? ofKind : ofKind.slice(0, limit)).map(
        (candidate) => candidate.id,
      ),
    );
  }
  return keep;
}

/**
 * Sends the pending per-Touchpoint pauses to the Resolver and marks them
 * done; a failure stays pending for the next run. `role` is the database
 * role of the caller: the hourly task, or the Customer API right after a
 * customer saves a selection (only that organization).
 */
export async function syncTouchpointPauses(input: {
  sql: Sql;
  pause: BillingPauseClient | null;
  role: "kardo_billing_sync" | "kardo_customer_api";
  workspaceId?: string;
  subject?: string;
}): Promise<{ synced: number; failed: number }> {
  if (!input.pause) return { synced: 0, failed: 0 };
  const begin = <T>(action: (tx: Transaction) => Promise<T>) =>
    input.sql.begin(async (tx) => {
      await tx`select set_config('role', ${input.role}, true)`;
      if (input.subject)
        await tx`select set_config('kardo.subject', ${input.subject}, true)`;
      return action(tx as unknown as Transaction);
    }) as Promise<T>;
  const pending = await begin(
    (tx) => tx<{ touchpoint_id: string; public_id: string; paused: boolean }[]>`
      select touchpoint_id, public_id, paused
      from kardo_billing.touchpoint_pause_sync
      where synced_at is null and attempts < 20
        ${input.workspaceId ? tx`and workspace_id = ${input.workspaceId}::uuid` : tx``}
      order by requested_at
      limit 500
    `,
  );
  let synced = 0;
  let failed = 0;
  for (const paused of [true, false]) {
    const batch = pending.filter((row) => row.paused === paused);
    if (batch.length === 0) continue;
    try {
      await input.pause.setPaused({
        publicIds: batch.map((row) => row.public_id),
        paused,
      });
      await begin(
        (tx) => tx`
          update kardo_billing.touchpoint_pause_sync
          set synced_at = now(), last_error = null
          where touchpoint_id = any(${batch.map((row) => row.touchpoint_id)}::uuid[])
            and paused = ${paused} and synced_at is null
        `,
      );
      synced += batch.length;
    } catch (error) {
      await begin(
        (tx) => tx`
          update kardo_billing.touchpoint_pause_sync
          set attempts = attempts + 1,
            last_error = ${(error instanceof Error ? error.message : "pause failed").slice(0, 500)}
          where touchpoint_id = any(${batch.map((row) => row.touchpoint_id)}::uuid[])
            and synced_at is null
        `,
      );
      failed += batch.length;
    }
  }
  return { synced, failed };
}

export type PlanOverageTickResult = {
  checked: number;
  opened: number;
  reminded: number;
  applied: number;
  resolved: number;
  pauses: { synced: number; failed: number };
  failed: number;
};

/**
 * The hourly part of option B: catches plan changes made outside Stripe
 * (Operations, end of a courtesy), reminds 3 days before the deadline,
 * applies the default rule when it passes and retries Resolver pauses.
 */
export async function runPlanOverageTick(input: {
  sql: Sql;
  pause: BillingPauseClient | null;
  visits: VisitsByTouchpoint | null;
  onError?: (accountId: string, error: unknown) => void;
}): Promise<PlanOverageTickResult> {
  const { sql } = input;
  const result: PlanOverageTickResult = {
    checked: 0,
    opened: 0,
    reminded: 0,
    applied: 0,
    resolved: 0,
    pauses: { synced: 0, failed: 0 },
    failed: 0,
  };
  // Billing accounts with something to count (ADR 024): organizations with
  // live codes, any organization out of the plan, or a window still open.
  const accounts = await withSync(
    sql,
    (tx) => tx<{ id: string }[]>`
      select distinct w.billing_account_id as id
      from kardo_core.touchpoints t
      join kardo_core.workspaces w on w.id = t.workspace_id
      where t.status in ('assigned', 'active', 'paused') and w.deleted_at is null
        and w.billing_account_id is not null
      union
      select w.billing_account_id from kardo_core.workspaces w
      where w.billing_account_id is not null and w.deleted_at is null
        and w.kind = 'organization'
      group by w.billing_account_id
      having count(*) > 1 or bool_or(w.plan_excluded_at is not null)
      union
      select o.account_id from kardo_billing.plan_overages o where o.resolved_at is null
      limit 5000
    `,
  );
  for (const { id } of accounts) {
    result.checked += 1;
    try {
      const refreshed = await withSync(sql, (tx) =>
        refreshAccountOverageTx(tx, id),
      );
      if (refreshed.status === "opened") result.opened += 1;
      if (refreshed.status === "resolved") result.resolved += 1;
      const step = await withSync(sql, async (tx) => {
        const [row] = await tx<
          {
            applied_at: Date | null;
            reminded_at: Date | null;
            resolved_at: Date | null;
            choose_by: Date;
          }[]
        >`
          select applied_at, reminded_at, resolved_at, choose_by
          from kardo_billing.plan_overages where account_id = ${id}::uuid
          for update
        `;
        if (!row || row.resolved_at || row.applied_at) return "none" as const;
        const left = new Date(row.choose_by).getTime() - Date.now();
        if (left <= 0) return "due" as const;
        if (
          !row.reminded_at &&
          left <= PLAN_OVERAGE_REMINDER_DAYS * 86_400_000
        ) {
          const overage = await readOverage(tx, id);
          if (overage)
            await enqueueNotice(tx, {
              workspaceId: overage.workspace_id,
              kind: "plan_overage_reminder",
              dedupeKey: `plan_overage_reminder:${id}:${new Date(row.choose_by).toISOString()}`,
              subscriptionId: null,
              payload: payloadOf(overage),
            });
          await tx`
            update kardo_billing.plan_overages set reminded_at = now(), updated_at = now()
            where account_id = ${id}::uuid
          `;
          return "reminded" as const;
        }
        return "none" as const;
      });
      if (step === "reminded") result.reminded += 1;
      if (step === "due" && (await applyDefault(input, id)))
        result.applied += 1;
    } catch (error) {
      result.failed += 1;
      input.onError?.(id, error);
    }
  }
  result.pauses = await syncTouchpointPauses({
    sql,
    pause: input.pause,
    role: "kardo_billing_sync",
  });
  return result;
}

async function applyDefault(
  input: { sql: Sql; visits: VisitsByTouchpoint | null },
  accountId: string,
): Promise<boolean> {
  const overage = await withSync(input.sql, (tx) => readOverage(tx, accountId));
  if (!overage) return false;
  const workspaceId = overage.workspace_id;
  const candidates = await withSync(
    input.sql,
    (tx) => tx<
      {
        id: string;
        public_id: string;
        kind: string;
        name: string | null;
        excluded: boolean;
        updated_at: Date;
        workspace_id: string;
      }[]
    >`
      select id, public_id, kind, name, excluded, updated_at, workspace_id
      from kardo_billing.plan_selection_candidates(${workspaceId}::uuid)
    `,
  );
  const list: PlanSelectionCandidate[] = candidates.map((row) => ({
    id: row.id,
    publicId: row.public_id,
    kind: row.kind,
    name: row.name,
    excluded: row.excluded,
    updatedAt: row.updated_at,
    workspaceId: row.workspace_id,
  }));
  let visits = new Map<string, number>();
  if (input.visits) {
    visits = await input
      .visits({
        workspaceId,
        publicIds: list
          .filter((candidate) => candidate.kind !== "organization")
          .map((candidate) => candidate.publicId),
        days: PLAN_OVERAGE_VISITS_DAYS,
      })
      .catch(() => new Map<string, number>());
  }
  const keep = defaultKeep(list, visits, {
    organizations: overage.organizations_limit,
    touchpoints: overage.touchpoints_limit,
    links: overage.links_limit,
  });
  return withSync(input.sql, async (tx) => {
    const [row] = await tx<{ result: { status?: string } }[]>`
      select kardo_billing.apply_default_plan_selection(${workspaceId}::uuid, ${keep}::uuid[]) as result
    `;
    if (row?.result.status !== "applied") return false;
    await enqueueNotice(tx, {
      workspaceId,
      kind: "plan_overage_applied",
      dedupeKey: `plan_overage_applied:${accountId}:${new Date(overage.choose_by).toISOString()}`,
      subscriptionId: null,
      payload: payloadOf(overage),
    });
    return true;
  });
}
