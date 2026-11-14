import type { Touchpoint, TouchpointKind } from "@kardo/contracts";
import type { IconName } from "../../components/Icon.js";

/**
 * A Touchpoint is one physical format: an NFC tag, a printed QR code, or
 * another carrier ("Otro"), or a piece Kardo sold (`kardo`, ADR 026: one
 * address that its printed QR and its chip both open). `link` is the
 * separate shareable-link product; it is never one of these and never shown
 * in the Touchpoints section.
 */
export const physicalTouchpointKinds = ["nfc", "qr", "other", "kardo"] as const;
export type PhysicalTouchpointKind = (typeof physicalTouchpointKinds)[number];

/** The formats a QR or tag can switch between. A Kardo piece never changes
 * format, and nothing turns into one (it is only activated with its code). */
export const formatKinds = ["nfc", "qr", "other"] as const;
export type FormatKind = (typeof formatKinds)[number];

export function isKardoPiece(touchpoint: Pick<Touchpoint, "kind">): boolean {
  return touchpoint.kind === "kardo";
}

export const touchpointKindLabels: Record<PhysicalTouchpointKind, string> = {
  nfc: "NFC",
  qr: "QR",
  other: "Otro",
  kardo: "Producto de Kardo",
};

export const touchpointKindDescriptions: Record<
  PhysicalTouchpointKind,
  string
> = {
  nfc: "Etiqueta o tarjeta que se acerca al celular.",
  qr: "Código impreso que se escanea con la cámara.",
  other: "Cualquier otro soporte: solo necesita la URL.",
  kardo: "Una pieza que compraste a Kardo: ya trae su QR y su NFC.",
};

export const touchpointKindIcons: Record<PhysicalTouchpointKind, IconName> = {
  nfc: "nfc",
  qr: "qr",
  other: "globe",
  kardo: "piece",
};

/**
 * The Touchpoint's effective physical format. Touchpoints created before
 * `kind` existed have no value stored and were all printed QR codes, so the
 * default is `qr` — never trust a bare `touchpoint.kind` read.
 */
export function effectiveKind(
  kind: TouchpointKind | undefined,
): PhysicalTouchpointKind {
  return kind === "nfc" || kind === "other" || kind === "kardo" ? kind : "qr";
}

/**
 * Links (`kind: "link"`) are a separate product and must never appear among
 * physical Touchpoints: lists, groups, counts, filters and batch all read
 * this instead of trusting `kind` directly.
 */
export function isPhysicalTouchpoint(
  touchpoint: Pick<Touchpoint, "kind">,
): boolean {
  return (touchpoint.kind ?? "qr") !== "link";
}

/** Removes Links from a Touchpoint list, everywhere the Touchpoints section reads it. */
export function excludeLinks<T extends Pick<Touchpoint, "kind">>(
  items: readonly T[],
): T[] {
  return items.filter(isPhysicalTouchpoint);
}
