// ---------------------------------------------------------------------------
// Kardo AI generations that keep running when the browser goes away
// (2026-10-03, owner's decision, relevo 29): a design or the ideas no longer
// stop when the customer reloads or leaves the Estudio; only "Cancelar"
// stops them. This registry is how Cancelar reaches the running job:
// in-process, keyed by Experience.
//
// A cancel that lands on another Customer API instance cannot abort the
// call there; it still clears the session (`clearDesignAiSession`), so the
// job's result is thrown away when it ends (its writes are keyed by job id)
// and its cost is audited as usual.
// ---------------------------------------------------------------------------

type RunningJob = { jobId: string; controller: AbortController };

const running = new Map<string, RunningJob>();

// Keyed by workspace *and* Experience, never by Experience alone: a cancel
// from one organization must not reach another organization's job even if
// both ever shared an Experience UUID (security review 2026-10-12, defense in
// depth behind `clearDesignAiSession`'s ownership check).
const jobKey = (workspaceId: string, experienceId: string): string =>
  `${workspaceId}:${experienceId}`;

/** Registers a running job for this Experience; the returned function
 * unregisters it (only if it is still the one registered). */
export function trackDesignAiJob(
  workspaceId: string,
  experienceId: string,
  jobId: string,
  controller: AbortController,
): () => void {
  const key = jobKey(workspaceId, experienceId);
  running.set(key, { jobId, controller });
  return () => {
    if (running.get(key)?.jobId === jobId) running.delete(key);
  };
}

/** Aborts this Experience's running job in this workspace, if it runs in this
 * instance. Returns whether one was aborted. */
export function cancelDesignAiJob(
  workspaceId: string,
  experienceId: string,
): boolean {
  const key = jobKey(workspaceId, experienceId);
  const job = running.get(key);
  if (!job) return false;
  running.delete(key);
  job.controller.abort();
  return true;
}
