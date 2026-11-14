import { useCallback, useEffect, useMemo, useState } from "react";
import { browserTimeZone } from "../../api/analytics.js";

/**
 * A9-25: Analítica and Resumen bucket days and hours by a time zone. The
 * server always honors whatever `tz` is sent; the choice of which one lives
 * here, shared by both screens, so switching it in one place behaves the
 * same everywhere.
 */
export type TimeZoneChoice = "browser" | "business";

const storagePrefix = "kardo.analytics.timezone.v1:";

function readChoice(workspaceId: string): TimeZoneChoice {
  try {
    return window.localStorage.getItem(storagePrefix + workspaceId) ===
      "business"
      ? "business"
      : "browser";
  } catch {
    return "browser";
  }
}

function writeChoice(workspaceId: string, choice: TimeZoneChoice) {
  try {
    window.localStorage.setItem(storagePrefix + workspaceId, choice);
  } catch {
    // Storage unavailable: the choice still applies for this visit.
  }
}

/**
 * A human name for an IANA zone — Intl's own «hora de <lugar>» generic name
 * with that prefix dropped («Ciudad de México», «Buenos Aires»), falling
 * back to the zone id itself when Intl has nothing better than a bare GMT
 * offset (an unfamiliar or legacy zone).
 */
/** Spanish names for the zones a Mexican business (and its usual
 * neighbors) runs on; `Intl` only knows them in English («Mexico City»). */
const zoneCities: Record<string, string> = {
  "America/Mexico_City": "Ciudad de México",
  "America/Monterrey": "Monterrey",
  "America/Merida": "Mérida",
  "America/Cancun": "Cancún",
  "America/Tijuana": "Tijuana",
  "America/Hermosillo": "Hermosillo",
  "America/Chihuahua": "Chihuahua",
  "America/Ciudad_Juarez": "Ciudad Juárez",
  "America/Mazatlan": "Mazatlán",
  "America/Matamoros": "Matamoros",
  "America/Ojinaga": "Ojinaga",
  "America/Bahia_Banderas": "Bahía de Banderas",
  "America/Bogota": "Bogotá",
  "America/Lima": "Lima",
  "America/Santiago": "Santiago",
  "America/Guatemala": "Guatemala",
  "America/Argentina/Buenos_Aires": "Buenos Aires",
  "America/New_York": "Nueva York",
  "America/Los_Angeles": "Los Ángeles",
  "America/Chicago": "Chicago",
  "Europe/Madrid": "Madrid",
};

/**
 * «Ciudad de México», «Madrid»: the city a zone is named after, in Spanish
 * when Kardo knows it and otherwise as the zone's own city («Sao Paulo»).
 */
export function zoneDisplayName(zone: string): string {
  const known = zoneCities[zone];
  if (known) return known;
  const city = zone.split("/").pop();
  return city ? city.replace(/_/g, " ") : zone;
}

export type TimeZoneSelection = {
  /** The zone to send as `tz` and to use for every "in this zone" readout. */
  zone: string;
  /** `zoneDisplayName(zone)`, read once per render. */
  label: string;
  choice: TimeZoneChoice;
  /** False when there is no real alternative to offer (no business zone,
   * or it is the same as the browser's): the line shows with no button. */
  canToggle: boolean;
  /** `zoneDisplayName` of the *other* zone — what the toggle switches to. */
  otherLabel: string;
};

/**
 * The pure decision behind the hook below, kept apart so it is trivial to
 * unit test: given the two candidate zones and the stored choice, which one
 * is actually in effect right now, and is there a real second option to
 * offer at all (A9-25: "si las dos zonas son iguales, o el negocio no tiene
 * zona, solo la línea, sin botón").
 */
export function resolveTimeZoneSelection(input: {
  choice: TimeZoneChoice;
  browserZone: string;
  businessZone: string | null | undefined;
}): TimeZoneSelection {
  const effectiveBusinessZone =
    input.businessZone && input.businessZone !== input.browserZone
      ? input.businessZone
      : null;
  const canToggle = effectiveBusinessZone !== null;
  const choice: TimeZoneChoice = canToggle ? input.choice : "browser";
  const zone =
    choice === "business" && effectiveBusinessZone
      ? effectiveBusinessZone
      : input.browserZone;
  return {
    zone,
    label: zoneDisplayName(zone),
    choice,
    canToggle,
    otherLabel: zoneDisplayName(
      choice === "business"
        ? input.browserZone
        : (effectiveBusinessZone ?? input.browserZone),
    ),
  };
}

/**
 * The zone Analítica/Resumen use right now, and how to flip it. Remembers
 * the person's choice per organization (`localStorage`, workspace-scoped);
 * falls back to the browser's zone whenever there is nothing to switch to.
 */
export function useTimeZoneSelection(
  workspaceId: string,
  businessZone: string | null | undefined,
): TimeZoneSelection & { toggle: () => void } {
  const browserZone = useMemo(() => browserTimeZone(), []);

  const [stored, setStored] = useState<TimeZoneChoice>(() =>
    readChoice(workspaceId),
  );
  // Each organization remembers its own choice; re-read on switching one.
  useEffect(() => {
    setStored(readChoice(workspaceId));
  }, [workspaceId]);

  const selection = resolveTimeZoneSelection({
    choice: stored,
    browserZone,
    businessZone,
  });

  const toggle = useCallback(() => {
    if (!selection.canToggle) return;
    const next: TimeZoneChoice =
      selection.choice === "business" ? "browser" : "business";
    setStored(next);
    writeChoice(workspaceId, next);
  }, [selection.canToggle, selection.choice, workspaceId]);

  return { ...selection, toggle };
}
