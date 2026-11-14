import type {
  ExperienceSummary,
  ExperienceTargetStatus,
  PublicationStatus,
} from "@kardo/contracts";
import type { StatusTone } from "../../lib/format.js";
import type { ExperienceView, Route } from "../../lib/router.js";
import { foldText } from "../../lib/text.js";
import { experienceTypeLabels } from "./labels.js";

/**
 * Pure rules behind the Experiences screens (list statuses and filters, the
 * workspace views and the publish dialog), kept free of React so they are
 * unit-tested directly.
 */

// ---------------------------------------------------------------------------
// Workspace views and routes
// ---------------------------------------------------------------------------

/** Diseño lives at the bare URL; the other views add a segment. */
export type WorkspaceView = "diseno" | ExperienceView;

export const workspaceViews: {
  view: WorkspaceView;
  label: string;
}[] = [
  { view: "diseno", label: "Diseño" },
  { view: "destinos", label: "Dónde se ve" },
  { view: "historial", label: "Historial" },
];

export function workspaceViewOf(
  view: ExperienceView | null | undefined,
): WorkspaceView {
  return view ?? "diseno";
}

export function experienceViewRoute(id: string, view: WorkspaceView): Route {
  return view === "diseno"
    ? { name: "experience", id }
    : { name: "experience", id, view };
}

/**
 * Whether navigating to `next` stays inside the same Experience (another of
 * its views): the unsaved draft lives in the page, so no guard is needed.
 */
export function staysInExperience(next: Route, experienceId: string | null) {
  return (
    experienceId !== null &&
    next.name === "experience" &&
    next.id === experienceId
  );
}

/**
 * Whether `next` is the Estudio of this same Experience: opening it is not
 * leaving the page, so the screen saves a pending name on the way in
 * instead of warning that changes would be lost (domain audit A2-33).
 */
export function opensOwnStudio(next: Route, experienceId: string | null) {
  return (
    experienceId !== null &&
    next.name === "experience-studio" &&
    next.id === experienceId
  );
}

// ---------------------------------------------------------------------------
// Saving the draft (domain audit A2-22 and A2-25)
// ---------------------------------------------------------------------------

/**
 * What a save sends and whether a field stops it. Only what changed travels:
 * a rename sends the name alone, so it never rewrites content another screen
 * (the Estudio) saved meanwhile, and every write carries the draft revision
 * this screen loaded, which the server checks (409 `EXPERIENCE_CHANGED`). A
 * content problem only stops the save when the content is written from this
 * screen: a page designed in the Estudio has no content fields here, so it
 * never blocks renaming it.
 */
export function draftSavePlan(input: {
  contentChanged: boolean;
  /** The name is empty. */
  nameInvalid: boolean;
  /** The content has validation errors. */
  contentInvalid: boolean;
  /** The type's content is edited in this view (Redirección), not the Estudio. */
  editsContentHere: boolean;
  draftRevision: number | undefined;
}): {
  blocked: boolean;
  sendsContent: boolean;
  revision: { expectedDraftRevision: number } | Record<string, never>;
} {
  const blocked =
    input.nameInvalid ||
    (input.contentChanged && input.editsContentHere && input.contentInvalid);
  return {
    blocked,
    sendsContent: input.contentChanged,
    revision:
      input.draftRevision !== undefined
        ? { expectedDraftRevision: input.draftRevision }
        : {},
  };
}

// ---------------------------------------------------------------------------
// List statuses and filters
// ---------------------------------------------------------------------------

export type ExperienceListStatus =
  | "draft"
  | "published"
  | "changes"
  | "publishing"
  | "failed"
  | "archived";

export type StatusInput = {
  publicationStatus: PublicationStatus;
  hasUnpublishedChanges?: boolean | undefined;
  archivedAt?: string | null | undefined;
  liveTouchpointCount?: number | undefined;
};

export const listStatusViews: Record<
  ExperienceListStatus,
  { label: string; tone: StatusTone; hint: string }
> = {
  draft: {
    label: "Borrador",
    tone: "neutral",
    hint: "Todavía no se muestra en ningún QR ni etiqueta.",
  },
  published: {
    label: "Publicada",
    tone: "success",
    hint: "Lo publicado coincide con el borrador.",
  },
  changes: {
    label: "Con cambios sin publicar",
    tone: "warning",
    hint: "Hay una versión en vivo y el borrador tiene cambios nuevos.",
  },
  publishing: {
    label: "Publicando",
    tone: "info",
    hint: "Los QR y etiquetas cambiarán en cuanto termine.",
  },
  failed: {
    label: "Falló",
    tone: "danger",
    hint: "La última publicación no se completó; lo anterior sigue en vivo.",
  },
  archived: {
    label: "Archivada",
    tone: "neutral",
    hint: "Oculta del espacio. Puedes restaurarla.",
  },
};

function isPublishingStatus(status: PublicationStatus): boolean {
  return status === "pending" || status === "processing";
}

/**
 * A live line under "Publicando": nothing in the first seconds, then that
 * the version is queued, and past a minute and a half that it is taking
 * longer than usual. A reason the Publisher recorded while retrying wins.
 * `publication` is the latest version's (`versions[0]`).
 */
export function publicationProgressNote(
  publication:
    | {
        status: PublicationStatus;
        createdAt: string;
        failureReason: string | null;
      }
    | null
    | undefined,
  now: number,
): string | null {
  if (!publication || !isPublishingStatus(publication.status)) return null;
  if (publication.failureReason) return publication.failureReason;
  const seconds = (now - Date.parse(publication.createdAt)) / 1000;
  if (!Number.isFinite(seconds) || seconds < 20) return null;
  if (seconds < 90)
    return "En cola: tu página cambia en cuanto el servicio público reciba la versión.";
  return "Está tardando más de lo normal. Seguimos intentando; si falla, aquí verás el motivo.";
}

/**
 * The one place that decides a page's publication state (domain audit
 * A2-23): the list, the header, the Estudio's «Publicada» dot and the IA
 * notice all read it, so one page can no longer say «Publicada» in one
 * screen and «Falló» in another. `status` is what a customer reads; `live`
 * is whether it is shown somewhere right now, also while a newer attempt
 * is mid-flight or failed (an older version stays up meanwhile).
 */
export function pagePublishState(experience: StatusInput): {
  status: ExperienceListStatus;
  live: boolean;
} {
  const status = experience.publicationStatus;
  const live =
    !experience.archivedAt &&
    (status === "published" || (experience.liveTouchpointCount ?? 0) > 0);
  if (experience.archivedAt) return { status: "archived", live: false };
  if (isPublishingStatus(status)) return { status: "publishing", live };
  if (status === "failed") return { status: "failed", live };
  if (status === "draft" && !live) return { status: "draft", live };
  // A version exists ("published" or replaced everywhere: "superseded").
  if (!live) return { status: "draft", live };
  return {
    status: experience.hasUnpublishedChanges ? "changes" : "published",
    live,
  };
}

/** The one status a customer needs to read in the list and the header. */
export function experienceListStatus(
  experience: StatusInput,
): ExperienceListStatus {
  return pagePublishState(experience).status;
}

/** Online somewhere: what the "Publicadas" filter shows. */
export function isOnline(experience: StatusInput): boolean {
  if (experience.archivedAt) return false;
  if ((experience.liveTouchpointCount ?? 0) > 0) return true;
  const status = experienceListStatus(experience);
  return status === "published" || status === "changes";
}

export type ListFilter = "all" | "published" | "drafts" | "archived";

export const listFilters: { value: ListFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "published", label: "Publicadas" },
  { value: "drafts", label: "Borradores" },
  { value: "archived", label: "Archivadas" },
];

export function matchesListFilter(
  experience: StatusInput,
  filter: ListFilter,
): boolean {
  if (filter === "archived") return Boolean(experience.archivedAt);
  if (experience.archivedAt) return false;
  if (filter === "published") return isOnline(experience);
  if (filter === "drafts") return !isOnline(experience);
  return true;
}

/** Counts for the active filters (archived ones load on demand). */
export function listFilterCounts(
  experiences: readonly StatusInput[],
): Record<Exclude<ListFilter, "archived">, number> {
  const active = experiences.filter((item) => !item.archivedAt);
  const published = active.filter(isOnline).length;
  return {
    all: active.length,
    published,
    drafts: active.length - published,
  };
}

/** Case- and accent-insensitive, so "menu" finds "Menú". */
export function normalizeSearch(value: string): string {
  return foldText(value);
}

export function matchesSearch(
  experience: Pick<ExperienceSummary, "name" | "type">,
  query: string,
): boolean {
  const needle = normalizeSearch(query);
  if (!needle) return true;
  return normalizeSearch(
    `${experience.name} ${experienceTypeLabels[experience.type]}`,
  ).includes(needle);
}

/**
 * How many places a page is in, named by what they are (domain audit
 * A2-27): «2 QR y etiquetas», «1 link», «2 QR y etiquetas, 1 link». Without
 * the kinds, everything reads as QR or etiquetas (the old wording).
 */
export type PlaceCounts = { objects: number; links: number };

export function placesLabel(counts: PlaceCounts): string {
  const parts: string[] = [];
  if (counts.objects > 0)
    parts.push(
      counts.objects === 1
        ? "1 QR o etiqueta"
        : `${counts.objects} QR y etiquetas`,
    );
  if (counts.links > 0)
    parts.push(counts.links === 1 ? "1 link" : `${counts.links} links`);
  return parts.join(", ");
}

/** Splits touchpoint ids into physical objects and links. */
export function placeCountsOf(
  touchpointIds: readonly string[],
  kindOf: (touchpointId: string) => string | undefined,
): PlaceCounts {
  let links = 0;
  for (const id of touchpointIds) if (kindOf(id) === "link") links += 1;
  return { objects: touchpointIds.length - links, links };
}

/** Where a page is live now, by kind. The touchpoints list can lag behind
 * the page's own `liveTouchpointCount`: when they disagree, the count wins
 * and everything reads as QR or etiquetas. */
export function livePlacesOf(
  experienceId: string | undefined,
  liveCount: number,
  touchpoints: readonly {
    id: string;
    kind?: string | undefined;
    status?: string | undefined;
    live?: { experienceId?: string | null | undefined } | null | undefined;
  }[],
): PlaceCounts {
  const ids = touchpoints
    .filter(
      (touchpoint) =>
        experienceId !== undefined &&
        touchpoint.live?.experienceId === experienceId &&
        touchpoint.status !== "retired",
    )
    .map((touchpoint) => touchpoint.id);
  const counts = placeCountsOf(
    ids,
    (id) => touchpoints.find((touchpoint) => touchpoint.id === id)?.kind,
  );
  return counts.objects + counts.links === liveCount
    ? counts
    : { objects: liveCount, links: 0 };
}

/** Where it is live, in a few words ("En vivo en 3 QR y etiquetas"). */
export function reachLabel(
  experience: StatusInput & {
    targets?: { touchpointIds: string[]; groupIds: string[] } | undefined;
    touchpointId: string | null;
  },
  /** Where it is live, by kind, when the caller knows it. */
  places?: PlaceCounts,
): { label: string; tone: "live" | "assigned" | "none" } {
  const live = experience.liveTouchpointCount ?? 0;
  if (live > 0 && !experience.archivedAt)
    return {
      label: `En vivo en ${placesLabel(places && places.objects + places.links === live ? places : { objects: live, links: 0 })}`,
      tone: "live",
    };
  const targets = experience.targets ?? {
    touchpointIds: experience.touchpointId ? [experience.touchpointId] : [],
    groupIds: [],
  };
  if (targets.touchpointIds.length || targets.groupIds.length)
    return { label: "Con dónde se ve, sin publicar", tone: "assigned" };
  return { label: "Sin dónde se ve", tone: "none" };
}

// ---------------------------------------------------------------------------
// Per-Touchpoint status (Destinos)
// ---------------------------------------------------------------------------

export type TargetStatusKind =
  | "live"
  | "publishing"
  | "failed"
  | "overridden"
  | "waiting";

export function targetStatusKind(
  target: Pick<ExperienceTargetStatus, "status" | "isLive" | "overridden">,
): TargetStatusKind {
  if (target.overridden) return "overridden";
  if (target.isLive) return "live";
  if (isPublishingStatus(target.status)) return "publishing";
  if (target.status === "failed") return "failed";
  return "waiting";
}

export const targetStatusViews: Record<
  TargetStatusKind,
  { label: string; tone: StatusTone }
> = {
  live: { label: "En vivo", tone: "success" },
  publishing: { label: "Publicando", tone: "info" },
  failed: { label: "Falló", tone: "danger" },
  overridden: { label: "Anulado por asignación directa", tone: "neutral" },
  waiting: { label: "Se activa al publicar", tone: "neutral" },
};

export function summarizeTargetStatuses(
  targets: readonly Pick<
    ExperienceTargetStatus,
    "status" | "isLive" | "overridden"
  >[],
): Record<TargetStatusKind, number> {
  const counts: Record<TargetStatusKind, number> = {
    live: 0,
    publishing: 0,
    failed: 0,
    overridden: 0,
    waiting: 0,
  };
  for (const target of targets) counts[targetStatusKind(target)] += 1;
  return counts;
}

// ---------------------------------------------------------------------------
// Publish dialog
// ---------------------------------------------------------------------------

export type PublishDialogInput = {
  /** Unsaved name or content. */
  isDirty: boolean;
  /** Destinations chosen here or in Destinos that are not saved yet. */
  targetsChanged: boolean;
  /** Validation errors in Diseño. */
  errorCount: number;
  /** The workspace has at least one physical Touchpoint to publish to. */
  hasTouchpoints: boolean;
  /** Touchpoints resolved from the chosen destinations. */
  resolvedCount: number;
  /** Of those, the ones that will actually change (precedence applied). */
  publishableCount: number;
  isInFlight: boolean;
  isBusy: boolean;
};

export type PublishBlocker =
  | "invalid-content"
  | "no-touchpoints"
  | "no-targets"
  | "all-overridden"
  | "in-flight";

export type PublishDialogState = {
  /** Something is saved before publishing ("Guardar y publicar"). */
  needsSave: boolean;
  confirmLabel: string;
  canConfirm: boolean;
  blocker: PublishBlocker | null;
};

export function publishDialogState(
  input: PublishDialogInput,
): PublishDialogState {
  const needsSave = input.isDirty || input.targetsChanged;
  const blocker: PublishBlocker | null = input.isInFlight
    ? "in-flight"
    : input.errorCount > 0
      ? "invalid-content"
      : !input.hasTouchpoints
        ? "no-touchpoints"
        : input.resolvedCount === 0
          ? "no-targets"
          : input.publishableCount === 0
            ? "all-overridden"
            : null;
  return {
    needsSave,
    confirmLabel: needsSave ? "Guardar y publicar" : "Publicar ahora",
    canConfirm: blocker === null && !input.isBusy,
    blocker,
  };
}

type SkippedTarget = {
  touchpointName?: string | undefined;
  reason?: string | undefined;
  liveExperienceName?: string | null | undefined;
};

/** The confirmation line after a publish, including what was left as it
 * was: by precedence (ADR 021) or because replacing it was not confirmed
 * (round 4, B1 — «/productos» siguió mostrando «Productos»). */
export function publishedMessage(
  batch: {
    versionRevision: number;
    publications: readonly unknown[];
    skipped?: readonly unknown[] | undefined;
  },
  /** The kind of a touchpoint, to say «link» where it is one. */
  kindOf?: (touchpointId: string) => string | undefined,
): string {
  const published = placesLabel(
    kindOf
      ? placeCountsOf(
          (batch.publications as { touchpointId?: string }[]).flatMap(
            (publication) =>
              publication?.touchpointId ? [publication.touchpointId] : [],
          ),
          kindOf,
        )
      : { objects: batch.publications.length, links: 0 },
  );
  const skipped = (batch.skipped ?? []) as readonly SkippedTarget[];
  const kept = skipped.filter(
    (entry) => entry?.reason === "REPLACE_NOT_CONFIRMED",
  );
  const byPrecedence = skipped.length - kept.length;
  const first = kept[0];
  const keptLine =
    kept.length === 1 && first?.touchpointName && first.liveExperienceName
      ? ` «${first.touchpointName}» siguió mostrando «${first.liveExperienceName}».`
      : kept.length
        ? ` ${kept.length === 1 ? "1 QR, etiqueta o link siguió" : `${kept.length} QR, etiquetas o links siguieron`} mostrando su página.`
        : "";
  return (
    `Publicando la versión ${batch.versionRevision} en ${published || "tu página"}. Se activará en unos segundos.` +
    (byPrecedence
      ? ` ${byPrecedence === 1 ? "1 QR o etiqueta no cambió" : `${byPrecedence} QR y etiquetas no cambiaron`} porque ya muestran una página asignada directamente a ellos.`
      : "") +
    keptLine
  );
}
