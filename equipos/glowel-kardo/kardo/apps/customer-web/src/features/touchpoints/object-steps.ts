import type {
  Touchpoint,
  TouchpointObject,
  TouchpointObjectStep,
} from "@kardo/contracts";
import { formatDayMonth, formatDayMonthTime } from "../../lib/format.js";
import { effectiveKind, type PhysicalTouchpointKind } from "./kind.js";

/**
 * «Conecta el objeto» (relevo 36, approved 2026-10-07). The object has its
 * own state apart from its page, and every step keeps the time it was done
 * in the database: a reload, or leaving halfway, comes back to the first
 * step still missing.
 */
export type ObjectStepKey =
  | "write"
  | "test"
  | "backup"
  | "place"
  | "download"
  | "print"
  | "address"
  | "prepare"
  /** A Kardo piece (ADR 026): Kardo already wrote and printed it. */
  | "arrived";

export type ObjectStep = {
  key: ObjectStepKey;
  /** What the API marks; `null` for the QR download (Kardo sees it). */
  api: TouchpointObjectStep | null;
  /** Under the circle: one word. */
  label: string;
  /** Above the open step. */
  title: string;
  doneAt: string | null;
};

export type ObjectFlow = {
  mode: "setup" | "replace";
  kind: PhysicalTouchpointKind;
  steps: ObjectStep[];
  /** The first step still missing (`steps.length` when none is). */
  current: number;
  /** Placed, and not being replaced. */
  complete: boolean;
};

export const emptyTouchpointObject: TouchpointObject = {
  state: "pending",
  preparedAt: null,
  testedAt: null,
  backupAt: null,
  placedAt: null,
  downloadedAt: null,
  replacingAt: null,
  replaceReadyAt: null,
  replacePreparedAt: null,
  replaceTestedAt: null,
};

export function touchpointObject(touchpoint: Touchpoint): TouchpointObject {
  return touchpoint.object ?? emptyTouchpointObject;
}

export function objectFlow(touchpoint: Touchpoint): ObjectFlow {
  const object = touchpointObject(touchpoint);
  const kind = effectiveKind(touchpoint.kind);
  const replacing = kind === "nfc" && object.replacingAt !== null;
  const step = (
    key: ObjectStepKey,
    api: TouchpointObjectStep | null,
    label: string,
    title: string,
    doneAt: string | null,
  ): ObjectStep => ({ key, api, label, title, doneAt });
  const testTitle =
    kind === "qr"
      ? "Pruébalo con la cámara"
      : kind === "kardo"
        ? "Pruébala con tu celular"
        : "Pruébalo con tu celular";
  const steps: ObjectStep[] = replacing
    ? [
        step(
          "prepare",
          "replace_ready",
          "Preparar",
          "Prepara la tarjeta nueva",
          object.replaceReadyAt,
        ),
        step(
          "write",
          "replace_prepared",
          "Grabar",
          "Graba la misma dirección",
          object.replacePreparedAt,
        ),
        step(
          "test",
          "replace_tested",
          "Probar",
          "Pruébala con tu celular",
          object.replaceTestedAt,
        ),
        step("place", "placed", "Colocar", "Colócala", null),
      ]
    : kind === "kardo"
      ? [
          // Activating it marks this one: the piece arrives written and
          // printed, so only testing and placing it are left.
          step(
            "arrived",
            "prepared",
            "Lista",
            "Tu pieza llegó lista",
            object.preparedAt,
          ),
          step("test", "tested", "Probar", testTitle, object.testedAt),
          step("place", "placed", "Colocar", "Colócala", object.placedAt),
        ]
      : kind === "nfc"
        ? [
            step(
              "write",
              "prepared",
              "Grabar",
              "Graba la tarjeta",
              object.preparedAt,
            ),
            step("test", "tested", "Probar", testTitle, object.testedAt),
            step(
              "backup",
              "backup",
              "Respaldo",
              "Imprime el QR de respaldo",
              object.backupAt,
            ),
            step("place", "placed", "Colocar", "Colócalo", object.placedAt),
          ]
        : kind === "qr"
          ? [
              step(
                "download",
                null,
                "Descargar",
                "Descarga tu QR",
                // Printing it means it was downloaded somewhere.
                object.downloadedAt ?? object.preparedAt,
              ),
              step(
                "print",
                "prepared",
                "Imprimir",
                "Imprímelo",
                object.preparedAt,
              ),
              step("test", "tested", "Probar", testTitle, object.testedAt),
              step("place", "placed", "Colocar", "Colócalo", object.placedAt),
            ]
          : [
              step(
                "address",
                "prepared",
                "Dirección",
                "Pon la dirección en tu objeto",
                object.preparedAt,
              ),
              step("test", "tested", "Probar", testTitle, object.testedAt),
              step("place", "placed", "Colocar", "Colócalo", object.placedAt),
            ];
  const missing = steps.findIndex((item) => !item.doneAt);
  return {
    mode: replacing ? "replace" : "setup",
    kind,
    steps,
    current: missing === -1 ? steps.length : missing,
    complete: !replacing && object.placedAt !== null,
  };
}

export type ObjectTone = "pending" | "ready" | "placed";

const stateWords: Record<
  PhysicalTouchpointKind,
  Record<"pending" | "ready", string>
> = {
  nfc: { pending: "Sin grabar", ready: "Grabado" },
  qr: { pending: "Sin imprimir", ready: "Impreso" },
  other: { pending: "Sin colocar", ready: "Sin colocar" },
  kardo: { pending: "Por activar", ready: "Lista" },
};

/** The object's state in words, with a plain dot (owner's design rule). */
export function objectStateView(touchpoint: Touchpoint): {
  label: string;
  tone: ObjectTone;
} {
  const object = touchpointObject(touchpoint);
  const kind = effectiveKind(touchpoint.kind);
  if (object.state === "replacing")
    return { label: "Reemplazando", tone: "ready" };
  if (object.state === "placed") return { label: "Colocado", tone: "placed" };
  if (object.state === "ready")
    return {
      label: stateWords[kind].ready,
      tone: kind === "other" ? "pending" : "ready",
    };
  return { label: stateWords[kind].pending, tone: "pending" };
}

/** «Por colocar»: a live physical object still missing from its place. */
export function needsPlacing(touchpoint: Touchpoint): boolean {
  if (touchpoint.status === "retired") return false;
  return touchpointObject(touchpoint).state !== "placed";
}

/** «Hecho el 7 oct, 12:41». */
export function doneLabel(doneAt: string): string {
  return `Hecho el ${formatDayMonthTime(doneAt)}`;
}

/** «Colocado el 3 oct». */
export function placedLabel(placedAt: string): string {
  return `Colocado el ${formatDayMonth(placedAt)}`;
}
