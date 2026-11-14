import type {
  BillingExtra,
  PlanSelection,
  PlanSelectionCandidate,
} from "@kardo/contracts";
import { PLAN_OVERAGE_WINDOW_DAYS } from "@kardo/contracts";
import { formatDate, formatNumber } from "../../lib/format.js";
import { countLabel } from "../../lib/text.js";

/**
 * Downgrade option B (ADR 023; Términos 10.5), in the panel's words. Pure:
 * the screens and the tests share it.
 */
/** Sent when «Qué sigue activo» is saved, so the banner updates too. */
export const PLAN_SELECTION_SAVED_EVENT = "kardo:plan-selection-saved";

export type Over = {
  organizations: number;
  touchpoints: number;
  links: number;
};

const plural = countLabel;

/** «2 Touchpoints y 1 Link». */
export function overWords(over: Over): string {
  const parts: string[] = [];
  if (over.organizations > 0)
    parts.push(plural(over.organizations, "Organización", "Organizaciones"));
  if (over.touchpoints > 0)
    parts.push(plural(over.touchpoints, "Touchpoint", "Touchpoints"));
  if (over.links > 0) parts.push(plural(over.links, "Link", "Links"));
  return parts.join(" y ");
}

/**
 * What a plan would leave out, from today's usage and its limits. The extras
 * the person already pays for raise each limit (the server counts them too,
 * ADR 024), so they are added here.
 */
export function overForPlan(
  usage: Record<string, number>,
  entitlements: Record<string, unknown>,
  extras: Pick<
    BillingExtra,
    "entitlementKey" | "quantity" | "unitsPerQuantity"
  >[] = [],
): Over {
  const over = (key: string) => {
    const limit = entitlements[key];
    if (typeof limit !== "number") return 0;
    const extra = extras
      .filter((item) => item.entitlementKey === key)
      .reduce((sum, item) => sum + item.quantity * item.unitsPerQuantity, 0);
    return Math.max((usage[key] ?? 0) - (limit + extra), 0);
  };
  return {
    organizations: over("organizations.max"),
    touchpoints: over("touchpoints.max"),
    links: over("links.max"),
  };
}

/** The line shown before confirming a smaller plan; null when all fits. */
export function downgradePreview(over: Over, planName: string): string | null {
  const words = overWords(over);
  if (!words) return null;
  return `Con ${planName} quedarían fuera ${words}. Tendrás ${PLAN_OVERAGE_WINDOW_DAYS} días para elegir cuáles siguen activos; si no eliges, quedan los más visitados. Nada se borra.`;
}

export type SelectionState =
  | { kind: "none" }
  | {
      kind: "choose";
      chooseBy: string;
      over: Over;
      planName: string;
      /** Organizations the plan keeps; null when it has no cap. */
      keepOrganizations: number | null;
    }
  | { kind: "out"; out: Over };

/** What the panel says about the plan's limits right now. */
export function selectionStateOf(
  selection: PlanSelection | null,
): SelectionState {
  if (!selection) return { kind: "none" };
  const out = countOut(selection.candidates);
  const overage = selection.overage;
  if (overage && !overage.resolved && !overage.appliedAt) {
    const over = {
      organizations: Math.max(
        countKind(selection.candidates, "organization") -
          (selection.limits.organizations ?? Number.POSITIVE_INFINITY),
        0,
      ),
      touchpoints: Math.max(
        countKind(selection.candidates, "touchpoint") -
          (selection.limits.touchpoints ?? Number.POSITIVE_INFINITY),
        0,
      ),
      links: Math.max(
        countKind(selection.candidates, "link") -
          (selection.limits.links ?? Number.POSITIVE_INFINITY),
        0,
      ),
    };
    return {
      kind: "choose",
      chooseBy: overage.chooseBy,
      over,
      planName: overage.planName,
      keepOrganizations: selection.limits.organizations,
    };
  }
  if (out.organizations + out.touchpoints + out.links > 0)
    return { kind: "out", out };
  return { kind: "none" };
}

function countKind(
  candidates: PlanSelectionCandidate[],
  kind: PlanSelectionCandidate["kind"],
): number {
  return candidates.filter((candidate) => candidate.kind === kind).length;
}

function countOut(candidates: PlanSelectionCandidate[]): Over {
  return {
    organizations: candidates.filter(
      (candidate) => candidate.excluded && candidate.kind === "organization",
    ).length,
    touchpoints: candidates.filter(
      (candidate) => candidate.excluded && candidate.kind === "touchpoint",
    ).length,
    links: candidates.filter(
      (candidate) => candidate.excluded && candidate.kind === "link",
    ).length,
  };
}

/** «Con Esencial te queda 1 organización. Elige cuál sigue antes del 22 oct 2026.» */
export function organizationsBannerText(
  planName: string,
  keep: number,
  chooseBy: string,
): string {
  const one = keep === 1;
  return `Con ${planName} te ${one ? "queda" : "quedan"} ${keep} ${one ? "organización" : "organizaciones"}. Elige ${one ? "cuál sigue" : "cuáles siguen"} antes del ${formatDate(chooseBy)}.`;
}

export function selectionHeadline(state: SelectionState): string | null {
  if (state.kind === "choose" && state.over.organizations > 0)
    return organizationsBannerText(
      state.planName,
      state.keepOrganizations ?? 0,
      state.chooseBy,
    );
  if (state.kind === "choose")
    return `Con ${state.planName} tienes ${overWords(state.over)} de más. Elige antes del ${formatDate(state.chooseBy)} cuáles siguen activos; si no eliges, quedan los más visitados.`;
  if (state.kind === "out") {
    const total =
      state.out.organizations + state.out.touchpoints + state.out.links;
    return `${overWords(state.out)} ${total === 1 ? "está" : "están"} fuera de tu plan: ${total === 1 ? "muestra" : "muestran"} «Esta página no está disponible por ahora». Nada se borró.`;
  }
  return null;
}

/** The organizations to choose from, most visited first. */
export function organizationCandidates(
  selection: PlanSelection,
): PlanSelectionCandidate[] {
  return sortForChooser(
    selection.candidates.filter(
      (candidate) => candidate.kind === "organization",
    ),
  );
}

/** The one tagged «La más visitada»: only when there is a real winner. */
export function mostVisitedId(
  organizations: PlanSelectionCandidate[],
): string | null {
  if (organizations.length < 2) return null;
  const [first] = sortForChooser(organizations);
  return first && (first.visits ?? 0) > 0 ? first.id : null;
}

/** «412 visitas en 30 días»; «Organización» without analytics. */
export function organizationDetail(candidate: PlanSelectionCandidate): string {
  if (candidate.visits === null) return "Organización";
  return `${formatNumber(candidate.visits)} ${candidate.visits === 1 ? "visita" : "visitas"} en 30 días`;
}

const limitOf = (selection: PlanSelection, kind: "touchpoint" | "link") =>
  kind === "link" ? selection.limits.links : selection.limits.touchpoints;

function hasOrganizationLayer(selection: PlanSelection): boolean {
  return selection.candidates.some(
    (candidate) => candidate.kind === "organization",
  );
}

/** Organizations the chooser keeps (ids of kind organization in `keep`). */
export function keptOrganizationIds(
  selection: PlanSelection,
  keep: Set<string>,
): Set<string> {
  return new Set(
    selection.candidates
      .filter(
        (candidate) =>
          candidate.kind === "organization" && keep.has(candidate.id),
      )
      .map((candidate) => candidate.id),
  );
}

/**
 * QR y etiquetas or links the chooser shows: with organizations, only those
 * of the organizations kept.
 */
export function visibleItems(
  selection: PlanSelection,
  keep: Set<string>,
  kind: "touchpoint" | "link",
): PlanSelectionCandidate[] {
  const layer = hasOrganizationLayer(selection);
  const orgs = keptOrganizationIds(selection, keep);
  return sortForChooser(
    selection.candidates.filter(
      (candidate) =>
        candidate.kind === kind && (!layer || orgs.has(candidate.workspaceId)),
    ),
  );
}

/** How many of one kind are kept (only the visible ones count). */
export function keptCount(
  selection: PlanSelection,
  keep: Set<string>,
  kind: "organization" | "touchpoint" | "link",
): number {
  if (kind === "organization") return keptOrganizationIds(selection, keep).size;
  return visibleItems(selection, keep, kind).filter((item) => keep.has(item.id))
    .length;
}

/**
 * The initial ticks of the chooser: what is active today; in an open window
 * nothing is out yet, so the most visited first, up to each limit. With
 * organizations, the QR y etiquetas and links come only from the ones kept.
 */
export function initialKeep(selection: PlanSelection): Set<string> {
  const anyOut = selection.candidates.some((candidate) => candidate.excluded);
  // The server's own default (the rule it applies at `chooseBy`), so the
  // first ticks never disagree with what Kardo would keep (A2-62). Older
  // servers do not send it: the local ranking below stays as the fallback.
  if (!anyOut && selection.suggestedKeep)
    return new Set(selection.suggestedKeep);
  const layer = hasOrganizationLayer(selection);
  const keep = new Set<string>();
  if (layer) {
    const orgs = organizationCandidates(selection);
    const limit = selection.limits.organizations;
    const chosen = orgs.some((candidate) => candidate.excluded)
      ? orgs.filter((candidate) => !candidate.excluded)
      : limit === null
        ? orgs
        : orgs.slice(0, limit);
    for (const candidate of chosen) keep.add(candidate.id);
  }
  const orgs = keptOrganizationIds(selection, keep);
  const inKept = (candidate: PlanSelectionCandidate) =>
    !layer || orgs.has(candidate.workspaceId);
  if (anyOut) {
    for (const candidate of selection.candidates)
      if (
        candidate.kind !== "organization" &&
        !candidate.excluded &&
        inKept(candidate)
      )
        keep.add(candidate.id);
    return keep;
  }
  for (const kind of ["touchpoint", "link"] as const) {
    const limit = limitOf(selection, kind);
    const ranked = sortForChooser(
      selection.candidates.filter(
        (candidate) => candidate.kind === kind && inKept(candidate),
      ),
    );
    for (const candidate of limit === null ? ranked : ranked.slice(0, limit))
      keep.add(candidate.id);
  }
  return keep;
}

/**
 * Ticking an organization: a new one brings its most visited QR y etiquetas
 * and links while there is room; one dropped takes its own away. With a cap
 * of one it replaces the one kept.
 */
export function toggleOrganization(
  selection: PlanSelection,
  keep: Set<string>,
  id: string,
): Set<string> {
  const next = new Set(keep);
  const drop = (orgId: string) => {
    next.delete(orgId);
    for (const candidate of selection.candidates)
      if (candidate.kind !== "organization" && candidate.workspaceId === orgId)
        next.delete(candidate.id);
  };
  if (next.has(id)) {
    drop(id);
    return next;
  }
  if (selection.limits.organizations === 1)
    for (const orgId of keptOrganizationIds(selection, next)) drop(orgId);
  next.add(id);
  for (const kind of ["touchpoint", "link"] as const) {
    const limit = limitOf(selection, kind);
    let room =
      limit === null
        ? Number.POSITIVE_INFINITY
        : limit - keptCount(selection, next, kind);
    const own = sortForChooser(
      selection.candidates.filter(
        (candidate) => candidate.kind === kind && candidate.workspaceId === id,
      ),
    );
    for (const candidate of own) {
      if (room <= 0) break;
      next.add(candidate.id);
      room -= 1;
    }
  }
  return next;
}

/** What is sent on «Guardar»: kept organizations and their kept codes. */
export function keepIdsToSave(
  selection: PlanSelection,
  keep: Set<string>,
): string[] {
  const layer = hasOrganizationLayer(selection);
  const orgs = keptOrganizationIds(selection, keep);
  return selection.candidates
    .filter(
      (candidate) =>
        keep.has(candidate.id) &&
        (!layer ||
          candidate.kind === "organization" ||
          orgs.has(candidate.workspaceId)),
    )
    .map((candidate) => candidate.id);
}

/** Most visited first; without analytics, the list order. */
export function sortForChooser(
  candidates: PlanSelectionCandidate[],
): PlanSelectionCandidate[] {
  return [...candidates].sort((a, b) => (b.visits ?? 0) - (a.visits ?? 0));
}
