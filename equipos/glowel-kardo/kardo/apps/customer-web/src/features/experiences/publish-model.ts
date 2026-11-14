import type { ExperienceTargets, Touchpoint } from "@kardo/contracts";

/**
 * Pure rules behind `PublishDialog` (relevo 37, B2 and E3): a page that has
 * never gone live defaults to a new destination instead of silently taking
 * over whatever a QR, an NFC tag or a link already shows (Lucía's «Menú»,
 * Ernesto's tarjeta). Replacing one that is already live is always chosen on
 * purpose, with a clear warning and an explicit confirmation.
 */

export type DestinationConflict = {
  touchpointId: string;
  /** The Touchpoint that already shows something else. */
  name: string;
  /** What it currently shows, that marking it would replace. */
  liveExperienceName: string;
  /** QR, NFC tag or link: the line about what stays names the same kind. */
  kind: "qr" | "nfc" | "link";
};

/** A page with no live Touchpoint anywhere: publishing it can only add a
 * destination, never (yet) take one over by accident. */
export function isUnpublishedPage(
  experience: {
    liveTouchpointCount?: number | undefined;
  } | null,
): boolean {
  return (experience?.liveTouchpointCount ?? 0) === 0;
}

/**
 * Touchpoints (any kind: QR, NFC or link) that already show a different
 * Experience. Checking one of these in the picker is a deliberate
 * replacement, never the default.
 */
export function conflictingTouchpoints(
  touchpoints: readonly Pick<
    Touchpoint,
    "id" | "operationalName" | "status" | "live" | "kind"
  >[],
  experienceId: string | null,
): DestinationConflict[] {
  return touchpoints
    .filter(
      (touchpoint) =>
        touchpoint.status !== "retired" &&
        touchpoint.live &&
        touchpoint.live.experienceId !== experienceId,
    )
    .map((touchpoint) => ({
      touchpointId: touchpoint.id,
      name: touchpoint.operationalName,
      liveExperienceName: touchpoint.live?.experienceName ?? "",
      kind: destinationKind(touchpoint.kind),
    }));
}

function destinationKind(kind: string | undefined): "qr" | "nfc" | "link" {
  return kind === "nfc" || kind === "link" ? kind : "qr";
}

export type PublishPickMode = "new" | "existing";

/**
 * What the picker marks by default: a never-published page with at least
 * one existing destination that would be replaced defaults to creating a
 * new one (prototipo P2). A page already live somewhere, or one with
 * nothing to conflict with, keeps picking from what already exists.
 */
export function defaultPickMode(input: {
  isUnpublished: boolean;
  hasConflict: boolean;
}): PublishPickMode {
  return input.isUnpublished && input.hasConflict ? "new" : "existing";
}

/**
 * Prototipo P2 de la ronda 4 (approved by the owner, 2026-10-12): publishing
 * a page somewhere new starts with where the owner will share it, not with a
 * QR. Karla, Ana and Mateo share on Instagram and ended up with a QR because
 * it came first.
 */
export type ShareWhere = "social" | "printed" | "nfc";

export const shareOptions: readonly {
  value: ShareWhere;
  icon: "link" | "qr" | "nfc";
  title: string;
  description: string;
}[] = [
  {
    value: "social",
    icon: "link",
    title: "En Instagram, Facebook o WhatsApp",
    description: "Te damos un link para pegar en tu bio o en tus mensajes.",
  },
  {
    value: "printed",
    icon: "qr",
    title: "Impreso en tu local",
    description: "Un QR para mesas, mostrador o volantes.",
  },
  {
    value: "nfc",
    icon: "nfc",
    title: "Una etiqueta para acercar el celular",
    description: "Se lee sin abrir la cámara.",
  },
];

/** What Kardo creates for each answer. */
export function shareKind(where: ShareWhere): "link" | "qr" | "nfc" {
  return where === "social" ? "link" : where === "printed" ? "qr" : "nfc";
}

/**
 * The line that says what stays as it is when the page goes somewhere new
 * (P2: «"Productos" sigue en /productos.»). It names a destination of the
 * same kind when there is exactly one; several read as one general line.
 * Nothing to say when nothing else is live.
 */
export function keptDestinationLine(
  where: ShareWhere,
  conflicts: readonly DestinationConflict[],
): string | null {
  if (!conflicts.length) return null;
  const kind = shareKind(where);
  const sameKind = conflicts.filter((conflict) => conflict.kind === kind);
  const pool = sameKind.length ? sameKind : conflicts;
  const only = pool.length === 1 ? pool[0] : null;
  if (!only)
    return "Tus QR, etiquetas y links de hoy siguen mostrando lo mismo.";
  return only.kind === "link"
    ? `«${only.liveExperienceName}» sigue en ${only.name}.`
    : `«${only.name}» sigue mostrando «${only.liveExperienceName}».`;
}

/**
 * Why Kardo's usual name for a new QR or tag is not offered: it is already
 * one of the business's (Ana got a second «Mostrador» that was not even
 * among the options, round 4). Null when the usual name is free.
 */
export function takenNameNote(
  usualName: string,
  touchpoints: readonly Pick<
    Touchpoint,
    "operationalName" | "status" | "live" | "kind"
  >[],
): string | null {
  const wanted = usualName.trim().toLowerCase();
  if (!wanted) return null;
  const existing = touchpoints.find(
    (touchpoint) =>
      touchpoint.status !== "retired" &&
      touchpoint.operationalName.trim().toLowerCase() === wanted,
  );
  if (!existing) return null;
  const noun = destinationKind(existing.kind) === "nfc" ? "etiqueta" : "QR";
  return existing.live?.experienceName
    ? `«${existing.operationalName}» ya es tu ${noun} de «${existing.live.experienceName}»: no lo repetimos.`
    : `«${existing.operationalName}» ya es uno de tus ${noun}: no lo repetimos.`;
}

/**
 * Where the page goes once the new QR, tag or link exists. A page that never
 * went live goes only there, never also to destinations it carries from
 * before (round 4, B1: Sofía's copy took over /productos when she put it on
 * a new link). A live page keeps what it already shows and adds the new one.
 */
export function newDestinationTargets(input: {
  isUnpublished: boolean;
  current: ExperienceTargets;
  touchpointId: string;
}): ExperienceTargets {
  if (input.isUnpublished)
    return { touchpointIds: [input.touchpointId], groupIds: [] };
  return {
    touchpointIds: [
      ...new Set([...input.current.touchpointIds, input.touchpointId]),
    ],
    groupIds: [...input.current.groupIds],
  };
}

/**
 * The warning once one or more replacements are picked (prototipo P2): named
 * clearly, never gray, so it reads as a real consequence.
 */
export function replaceWarningText(
  replaced: readonly {
    touchpoint: { operationalName: string };
    replacing: string | null;
  }[],
): string {
  const named = replaced.filter(
    (entry): entry is typeof entry & { replacing: string } =>
      entry.replacing !== null,
  );
  if (!named.length) return "";
  const parts = named
    .slice(0, 3)
    .map(
      (entry) =>
        `«${entry.replacing}» en «${entry.touchpoint.operationalName}»`,
    );
  const more = named.length > 3 ? ` y ${named.length - 3} más` : "";
  return `Tus clientes ya no verán ${parts.join(", ")}${more}.`;
}

/** True when publishing resolves to exactly one destination of `kind`. */
export function onlyDestinationKind(
  publishable: readonly { touchpoint: { kind?: string | undefined } }[],
  kind: string,
): boolean {
  return (
    publishable.length === 1 &&
    (publishable[0]?.touchpoint.kind ?? "qr") === kind
  );
}
