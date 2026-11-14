import type {
  TouchpointObject,
  TouchpointObjectStep,
  UpdateTouchpointObject,
} from "@kardo/contracts";
import { ApiRequestError } from "../api.js";
import { demoQrLastExportAt } from "./qr.js";

/**
 * The object's steps in the demo (relevo 36). Kept in sessionStorage, so a
 * reload in the demo comes back to the same step, as the real API does.
 */
type Steps = Partial<
  Record<TouchpointObjectStep | "replacing", string | undefined>
>;

const KEY = "kardo-demo-touchpoint-object";
const hour = 3_600_000;
const ago = (hours: number) =>
  new Date(Date.now() - hours * hour).toISOString();

// Café Nube: the NFC written and waiting for its test, the terrace QRs
// printed (one placed), the counter label still to print.
const seed: Record<string, Steps> = {
  "5b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0a01": { prepared: ago(26) },
  "5b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0b01": {
    prepared: ago(240),
    tested: ago(239),
    placed: ago(238),
  },
  "5b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0b02": { prepared: ago(30) },
};

function load(): Record<string, Steps> {
  try {
    const stored = sessionStorage.getItem(KEY);
    if (stored) return JSON.parse(stored) as Record<string, Steps>;
  } catch {
    // Private mode or blocked storage: start from the seed.
  }
  return structuredClone(seed);
}

let all: Record<string, Steps> | null = null;
function state(): Record<string, Steps> {
  all ??= load();
  return all;
}
function save() {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state()));
  } catch {
    // Same as above: the demo keeps working in memory.
  }
}

function stepsOf(id: string): Steps {
  const all = state();
  all[id] ??= {};
  return all[id];
}

export function demoTouchpointObject(id: string): TouchpointObject {
  const steps = state()[id] ?? {};
  const replacingAt = steps.replacing ?? null;
  const placedAt = steps.placed ?? null;
  const preparedAt = steps.prepared ?? null;
  return {
    state: replacingAt
      ? "replacing"
      : placedAt
        ? "placed"
        : preparedAt
          ? "ready"
          : "pending",
    preparedAt,
    testedAt: steps.tested ?? null,
    backupAt: steps.backup ?? null,
    placedAt,
    downloadedAt: demoQrLastExportAt(id),
    replacingAt,
    replaceReadyAt: steps.replace_ready ?? null,
    replacePreparedAt: steps.replace_prepared ?? null,
    replaceTestedAt: steps.replace_tested ?? null,
  };
}

/** Same rules as the API's `planObjectUpdate`. */
export function demoUpdateObject(
  id: string,
  kind: string,
  body: UpdateTouchpointObject,
): void {
  const steps = stepsOf(id);
  const now = new Date().toISOString();
  const invalid = (message: string) =>
    new ApiRequestError(message, 400, "INVALID_OBJECT_STEP");
  if (kind === "link") throw invalid("Un Link no es un objeto físico.");
  if (body.action === "start_replace" || body.action === "cancel_replace") {
    if (kind !== "nfc")
      throw invalid("Solo un NFC tiene una tarjeta que reemplazar.");
    delete steps.replace_ready;
    delete steps.replace_prepared;
    delete steps.replace_tested;
    if (body.action === "start_replace") steps.replacing ??= now;
    else delete steps.replacing;
    save();
    return;
  }
  const step = body.step;
  if (!step) throw invalid("Falta el paso que quieres marcar.");
  if (step === "backup" && kind !== "nfc")
    throw invalid("Solo un NFC lleva QR de respaldo.");
  if (step.startsWith("replace_") && !steps.replacing)
    throw new ApiRequestError(
      "Esta tarjeta no se está reemplazando.",
      409,
      "OBJECT_NOT_REPLACING",
    );
  if (body.action === "done" && step === "placed" && steps.replacing) {
    steps.prepared = steps.replace_prepared ?? steps.prepared;
    steps.tested = steps.replace_tested ?? steps.tested;
    steps.placed = now;
    delete steps.replacing;
    delete steps.replace_ready;
    delete steps.replace_prepared;
    delete steps.replace_tested;
  } else if (body.action === "done") steps[step] ??= now;
  else delete steps[step];
  save();
}

/** An NFC's backup QR downloaded: «Respaldo» is marked once (relevo 38),
 * outside a replacement, as the API does. */
export function demoMarkBackup(id: string): void {
  const steps = stepsOf(id);
  if (steps.replacing || steps.backup) return;
  steps.backup = new Date().toISOString();
  save();
}

/** Another format is another object: its steps start over. */
export function demoResetObject(id: string): void {
  delete state()[id];
  save();
}

/**
 * «Pruébalo» in the demo: there is no phone and no Resolver, so no visit
 * ever arrives (owner, 2026-10-07: a simulated visit marked it «solo»).
 * The demo is tested with «Ya lo probé».
 */
export function demoProbeObject(_id: string, _live: boolean): boolean {
  return false;
}
