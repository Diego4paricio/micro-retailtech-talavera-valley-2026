import {
  type PublicStatusIncident,
  type ServiceStatus,
  type StatusComponentId,
  type StatusLevel,
  statusComponentIds,
  statusLevelRank,
  worstStatusLevel,
} from "@kardo/contracts";
import {
  type ProbeId,
  type ProbeResult,
  probeComponents,
  type Signal,
} from "./probes.js";
import type { ProviderResult } from "./providers.js";

/** Recent signals kept per check. */
export const SIGNAL_MEMORY = 5;

export type ProbeState = {
  id: ProbeId;
  level: Signal;
  /** Newest last. */
  signals: Signal[];
  last: ProbeResult | null;
};

/**
 * Two equal signals in a row move the level; a check that keeps flipping
 * (3 of the last 5 not fine) is at least `degraded`; anything else keeps
 * the level it had.
 */
export function nextProbeLevel(
  previous: Signal,
  signals: readonly Signal[],
): Signal {
  const last = signals.at(-1);
  const beforeLast = signals.at(-2);
  if (last !== undefined && last === beforeLast) return last;
  const recent = signals.slice(-SIGNAL_MEMORY);
  const unwell = recent.filter((signal) => signal !== "operational").length;
  if (unwell >= 3 && statusLevelRank[previous] < statusLevelRank.degraded) {
    return "degraded";
  }
  return previous;
}

export function advanceProbe(
  state: ProbeState | undefined,
  result: ProbeResult,
): ProbeState {
  const previous = state ?? {
    id: result.id,
    level: "operational" as Signal,
    signals: [],
    last: null,
  };
  if (result.signal === null) {
    // Nothing to judge (not configured, or the queue while the API is down).
    return {
      ...previous,
      level: result.configured ? previous.level : "operational",
      signals: result.configured ? previous.signals : [],
      last: result,
    };
  }
  const signals = [...previous.signals, result.signal].slice(-SIGNAL_MEMORY);
  return {
    id: result.id,
    level: nextProbeLevel(previous.level, signals),
    signals,
    last: result,
  };
}

/** Open incidents and maintenance happening now. */
export function liveIncidents(
  incidents: readonly PublicStatusIncident[],
  now: Date,
): PublicStatusIncident[] {
  const at = now.getTime();
  return incidents.filter((incident) => {
    if (incident.resolvedAt !== null) return false;
    if (incident.kind === "incident") return true;
    const starts = new Date(incident.startsAt).getTime();
    const ends = incident.endsAt
      ? new Date(incident.endsAt).getTime()
      : Infinity;
    return starts <= at && at < ends;
  });
}

export function upcomingMaintenance(
  incidents: readonly PublicStatusIncident[],
  now: Date,
): PublicStatusIncident[] {
  const at = now.getTime();
  return incidents
    .filter(
      (incident) =>
        incident.kind === "maintenance" &&
        incident.resolvedAt === null &&
        new Date(incident.startsAt).getTime() > at,
    )
    .sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
}

export type ComputeInput = {
  probes: readonly ProbeState[];
  providers: readonly ProviderResult[];
  incidents: readonly PublicStatusIncident[];
  checkedAt: string | null;
  now: Date;
};

/**
 * Each area takes the worst of: Kardo's checks for it, providers (capped at
 * `partial_outage`), open staff incidents (their impact) and maintenance in
 * progress (`maintenance`). `provider: true` when a provider alone sets it.
 */
export function computeStatus(input: ComputeInput): ServiceStatus {
  const live = liveIncidents(input.incidents, input.now);
  const components = statusComponentIds.map((id) => {
    const probes = input.probes.filter((probe) =>
      probeComponents[probe.id].includes(id),
    );
    const own: StatusLevel[] = probes.map((probe) => probe.level);
    const fromProviders: StatusLevel[] = input.providers.flatMap((provider) =>
      provider.issues
        .filter((issue) => issue.components.includes(id))
        .map((issue) => issue.level),
    );
    const fromStaff: StatusLevel[] = live
      .filter((incident) => incident.components.includes(id))
      .map((incident) => incident.impact);
    const ownLevel = worstStatusLevel([...own, ...fromStaff]);
    const providerLevel = worstStatusLevel(fromProviders);
    const level = worstStatusLevel([ownLevel, providerLevel]);
    // A check that is not configured reports «operational» without having
    // measured anything (domain audit A2-69): the area says so instead.
    const measured =
      probes.some((probe) => probe.last?.configured === true) ||
      fromProviders.length > 0 ||
      fromStaff.length > 0;
    return {
      id,
      level,
      provider:
        level !== "operational" &&
        statusLevelRank[providerLevel] > statusLevelRank[ownLevel],
      measured,
    };
  });
  return {
    overall: worstStatusLevel(components.map((component) => component.level)),
    checkedAt: input.checkedAt,
    components,
    incidents: live,
    upcoming: upcomingMaintenance(input.incidents, input.now),
  };
}

/** Day key (UTC) for the 90-day history. */
export function historyDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export type HistoryRow = {
  day: string;
  component: StatusComponentId;
  level: StatusLevel;
  minutes: number;
};

/** Worst level of each area per day (for the public page's bars). */
export function summarizeHistory(
  rows: readonly HistoryRow[],
): { day: string; components: Record<StatusComponentId, StatusLevel> }[] {
  const days = new Map<string, Record<StatusComponentId, StatusLevel>>();
  for (const row of rows) {
    const entry =
      days.get(row.day) ??
      (Object.fromEntries(
        statusComponentIds.map((id) => [id, "operational"]),
      ) as Record<StatusComponentId, StatusLevel>);
    // A minute of a bad level in a day marks the day (like Statuspage),
    // but a single minute of maintenance does not hide an outage.
    if (statusLevelRank[row.level] > statusLevelRank[entry[row.component]]) {
      entry[row.component] = row.level;
    }
    days.set(row.day, entry);
  }
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, components]) => ({ day, components }));
}
