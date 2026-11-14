// Owned by the export/QA agent.
import type { LegibilityReport, Scene } from "./types.js";

/**
 * Runs `verifyScene` in a Web Worker when available (main thread otherwise).
 *
 * The worker is a lazily-created, reusable module Worker
 * (`new Worker(new URL("./verify.worker.ts", import.meta.url), { type: "module" })`)
 * so repeated calls (every Estudio QR edit) don't pay worker start-up cost
 * twice. Requests are correlated by an incrementing id; an aborted call
 * removes its pending entry immediately, so a late worker response for it is
 * silently discarded instead of resolving a promise nobody is waiting on
 * anymore. If there is no `Worker` global (SSR, Node, old browsers), the
 * constructor throws, or the worker script itself fails to load, every
 * in-flight and future call falls back to a dynamic import of `verify.js` run
 * on the main thread.
 */

type WorkerRequest = { id: number; scene: Scene; expected: string };
type WorkerResponse =
  | { id: number; ok: true; report: LegibilityReport }
  | { id: number; ok: false; error: string };

type Pending = {
  resolve: (report: LegibilityReport) => void;
  reject: (error: unknown) => void;
  scene: Scene;
  expected: string;
  signal: AbortSignal | undefined;
  cleanupAbort: (() => void) | undefined;
};

let worker: Worker | null = null;
let workerUnavailable = false;
let nextRequestId = 1;
const pending = new Map<number, Pending>();

function abortError(): DOMException {
  return new DOMException("La verificación se canceló.", "AbortError");
}

async function runOnMainThread(
  scene: Scene,
  expected: string,
  signal: AbortSignal | undefined,
): Promise<LegibilityReport> {
  const { verifyScene } = await import("./verify.js");
  if (signal?.aborted) throw abortError();
  return verifyScene(scene, expected);
}

function settleFromMainThread(entry: Pending): void {
  runOnMainThread(entry.scene, entry.expected, entry.signal)
    .then(entry.resolve)
    .catch(entry.reject);
}

function handleMessage(event: MessageEvent<WorkerResponse>): void {
  const entry = pending.get(event.data.id);
  if (!entry) return; // Aborted or otherwise already settled — discard.
  pending.delete(event.data.id);
  entry.cleanupAbort?.();
  if (event.data.ok) entry.resolve(event.data.report);
  else entry.reject(new Error(event.data.error));
}

function handleWorkerFailure(): void {
  // The worker script itself failed (e.g. it could not be loaded): stop
  // trying it and finish every in-flight call on the main thread instead.
  workerUnavailable = true;
  const failedWorker = worker;
  worker = null;
  failedWorker?.terminate();
  const inFlight = Array.from(pending.values());
  pending.clear();
  for (const entry of inFlight) {
    entry.cleanupAbort?.();
    settleFromMainThread(entry);
  }
}

function getWorker(): Worker | null {
  if (workerUnavailable) return null;
  if (worker) return worker;
  if (typeof Worker === "undefined") {
    workerUnavailable = true;
    return null;
  }
  try {
    const instance = new Worker(
      new URL("./verify.worker.ts", import.meta.url),
      {
        type: "module",
      },
    );
    instance.onmessage = handleMessage;
    instance.onerror = handleWorkerFailure;
    instance.onmessageerror = handleWorkerFailure;
    worker = instance;
    return instance;
  } catch {
    workerUnavailable = true;
    return null;
  }
}

export async function verifyLegibility(
  scene: Scene,
  expected: string,
  options?: { signal?: AbortSignal },
): Promise<LegibilityReport> {
  const signal = options?.signal;
  if (signal?.aborted) throw abortError();

  const instance = getWorker();
  if (!instance) return runOnMainThread(scene, expected, signal);

  const id = nextRequestId;
  nextRequestId += 1;

  return new Promise<LegibilityReport>((resolve, reject) => {
    const entry: Pending = {
      resolve,
      reject,
      scene,
      expected,
      signal,
      cleanupAbort: undefined,
    };
    if (signal) {
      const onAbort = () => {
        pending.delete(id);
        reject(abortError());
      };
      signal.addEventListener("abort", onAbort, { once: true });
      entry.cleanupAbort = () => signal.removeEventListener("abort", onAbort);
    }
    pending.set(id, entry);
    try {
      instance.postMessage({ id, scene, expected } satisfies WorkerRequest);
    } catch (error) {
      pending.delete(id);
      entry.cleanupAbort?.();
      reject(error);
    }
  });
}
