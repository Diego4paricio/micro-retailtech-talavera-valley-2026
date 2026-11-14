import { DurableObject } from "cloudflare:workers";
import {
  type PublicStatusIncident,
  type ServiceStatus,
  type StaffServiceStatus,
  type StatusComponentId,
  type StatusIncidentSet,
  type StatusLevel,
  statusComponentIds,
} from "@kardo/contracts";
import {
  advanceProbe,
  computeStatus,
  type HistoryRow,
  historyDay,
  type ProbeState,
  summarizeHistory,
} from "./compute.js";
import {
  type ProbeId,
  type ProbeResult,
  probeComponents,
  probeIds,
} from "./probes.js";
import { PROVIDER_INTERVAL_MS, type ProviderResult } from "./providers.js";

/** Days of history kept for the future public page. */
export const HISTORY_DAYS = 90;

type MetaKey = "checked_at" | "providers_checked_at" | "incidents";

/**
 * One instance (`idFromName("global")`) holds the whole status: each check's
 * level and recent signals, the providers' last answer, the incidents the
 * Staff API pushed, and minutes per level per area per day. It keeps
 * answering if the Customer API or Supabase are down.
 */
export class StatusState extends DurableObject {
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    ctx.blockConcurrencyWhile(async () => {
      // One statement per call: bindings and multi-statement strings do not mix.
      for (const statement of [
        "create table if not exists probes (id text primary key, state text not null)",
        "create table if not exists providers (provider text primary key, result text not null)",
        "create table if not exists meta (key text primary key, value text not null)",
        `create table if not exists history (
          day text not null,
          component text not null,
          level text not null,
          minutes integer not null,
          primary key (day, component, level)
        )`,
      ]) {
        this.ctx.storage.sql.exec(statement);
      }
    });
  }

  private meta(key: MetaKey): string | null {
    const row = this.ctx.storage.sql
      .exec<{ value: string }>("select value from meta where key = ?", key)
      .toArray()[0];
    return row?.value ?? null;
  }

  private setMeta(key: MetaKey, value: string): void {
    this.ctx.storage.sql.exec(
      "insert into meta (key, value) values (?, ?) on conflict (key) do update set value = excluded.value",
      key,
      value,
    );
  }

  private probeStates(): ProbeState[] {
    const rows = this.ctx.storage.sql
      .exec<{ id: string; state: string }>("select id, state from probes")
      .toArray();
    const known = new Map(
      rows.map((row) => [row.id, JSON.parse(row.state) as ProbeState]),
    );
    return probeIds
      .map((id) => known.get(id))
      .filter((state): state is ProbeState => state !== undefined);
  }

  private providerResults(): ProviderResult[] {
    return this.ctx.storage.sql
      .exec<{ result: string }>(
        "select result from providers order by provider",
      )
      .toArray()
      .map((row) => JSON.parse(row.result) as ProviderResult);
  }

  private incidentSet(): StatusIncidentSet {
    const raw = this.meta("incidents");
    return raw
      ? (JSON.parse(raw) as StatusIncidentSet)
      : { version: 0, incidents: [] };
  }

  /** True when the providers' pages were read more than 5 minutes ago. */
  providersDue(nowMs: number): boolean {
    const last = this.meta("providers_checked_at");
    // A few seconds of slack so a one-minute cron lands on every fifth run.
    return !last || nowMs - Date.parse(last) >= PROVIDER_INTERVAL_MS - 10_000;
  }

  record(input: {
    probes: ProbeResult[];
    providers: ProviderResult[] | null;
    nowMs: number;
    /** The cron counts a minute of history; a manual check does not. */
    countMinute: boolean;
  }): ServiceStatus {
    const now = new Date(input.nowMs);
    const previous = new Map(
      this.probeStates().map((state) => [state.id, state]),
    );
    for (const result of input.probes) {
      const next = advanceProbe(previous.get(result.id), result);
      this.ctx.storage.sql.exec(
        "insert into probes (id, state) values (?, ?) on conflict (id) do update set state = excluded.state",
        result.id,
        JSON.stringify(next),
      );
    }
    if (input.providers) {
      for (const provider of input.providers) {
        this.ctx.storage.sql.exec(
          "insert into providers (provider, result) values (?, ?) on conflict (provider) do update set result = excluded.result",
          provider.provider,
          JSON.stringify(provider),
        );
      }
      this.setMeta("providers_checked_at", now.toISOString());
    }
    this.setMeta("checked_at", now.toISOString());
    const status = this.compute(now);
    if (input.countMinute) {
      const day = historyDay(now);
      for (const component of status.components) {
        this.ctx.storage.sql.exec(
          `insert into history (day, component, level, minutes) values (?, ?, ?, 1)
           on conflict (day, component, level) do update set minutes = minutes + 1`,
          day,
          component.id,
          component.level,
        );
      }
      const oldest = historyDay(
        new Date(input.nowMs - HISTORY_DAYS * 86_400_000),
      );
      this.ctx.storage.sql.exec("delete from history where day < ?", oldest);
    }
    return status;
  }

  private compute(now: Date): ServiceStatus {
    return computeStatus({
      probes: this.probeStates(),
      providers: this.providerResults(),
      incidents: this.incidentSet().incidents,
      checkedAt: this.meta("checked_at"),
      now,
    });
  }

  publicStatus(nowMs: number): ServiceStatus {
    return this.compute(new Date(nowMs));
  }

  detail(nowMs: number): StaffServiceStatus {
    const now = new Date(nowMs);
    const states = new Map(
      this.probeStates().map((state) => [state.id, state]),
    );
    return {
      status: this.compute(now),
      probes: probeIds.map((id: ProbeId) => {
        const state = states.get(id);
        const last = state?.last ?? null;
        const recent = state?.signals ?? [];
        let failures = 0;
        for (const signal of [...recent].reverse()) {
          if (signal === "operational") break;
          failures += 1;
        }
        let successes = 0;
        for (const signal of [...recent].reverse()) {
          if (signal !== "operational") break;
          successes += 1;
        }
        return {
          id,
          component: probeComponents[id][0] as StatusComponentId,
          configured: last?.configured ?? false,
          ok: last?.ok ?? null,
          slow: last?.slow ?? false,
          latencyMs: last?.latencyMs ?? null,
          httpStatus: last?.httpStatus ?? null,
          error: last?.error ?? null,
          detail: last?.detail ?? null,
          consecutiveFailures: failures,
          consecutiveSuccesses: successes,
          checkedAt: last?.checkedAt ?? null,
        };
      }),
      providers: this.providerResults().map((provider) => ({
        provider: provider.provider,
        ok: provider.ok,
        checkedAt: provider.checkedAt,
        error: provider.error,
        issues: provider.issues,
      })),
      incidentsVersion: this.incidentSet().version,
    };
  }

  /** Newer versions replace the whole set; an older one is ignored. */
  setIncidents(set: StatusIncidentSet): { applied: boolean; version: number } {
    const current = this.incidentSet();
    if (set.version <= current.version) {
      return { applied: false, version: current.version };
    }
    this.setMeta("incidents", JSON.stringify(set));
    return { applied: true, version: set.version };
  }

  history(days: number): {
    days: { day: string; components: Record<StatusComponentId, StatusLevel> }[];
  } {
    const since = historyDay(new Date(Date.now() - days * 86_400_000));
    const rows = this.ctx.storage.sql
      .exec<HistoryRow>(
        "select day, component, level, minutes from history where day >= ? order by day",
        since,
      )
      .toArray()
      .filter((row) =>
        (statusComponentIds as readonly string[]).includes(row.component),
      );
    return { days: summarizeHistory(rows) };
  }
}

export type { PublicStatusIncident };
