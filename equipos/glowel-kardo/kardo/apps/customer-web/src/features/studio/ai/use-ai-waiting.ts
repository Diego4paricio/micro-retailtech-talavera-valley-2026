import { useCallback, useEffect, useState } from "react";
import { designAiSessionApi } from "../../../api/design-ai.js";
import type { AiResult } from "./use-design-ai-flow.js";

/**
 * What the AI has for the owner outside the "IA" rail (relevo 31, finding
 * 2: one owner closed the rail 15 s after asking and the design that came
 * 88 s later was never used; another closed it with the design on screen).
 * The rail reports what it shows; with the rail closed and a generation
 * still running, the Estudio asks the Experience's AI session until it
 * ends, so the owner hears about the ideas or the design without reopening
 * the rail.
 */
export type AiWaiting =
  | { status: "running" }
  | { status: "ideas" }
  | { status: "ready"; result: AiResult }
  | null;

const POLL_MS = 4_000;

export function useAiWaiting({
  workspaceId,
  experienceId,
  railOpen,
  enabled,
}: {
  workspaceId: string;
  experienceId: string;
  /** The "IA" rail is on screen: it shows (and reports) the session itself. */
  railOpen: boolean;
  enabled: boolean;
}) {
  const [waiting, setWaiting] = useState<AiWaiting>(null);
  const report = useCallback((next: AiWaiting) => setWaiting(next), []);
  const running = waiting?.status === "running";

  useEffect(() => {
    if (!enabled || railOpen || !running) return;
    let live = true;
    let timer = 0;
    const tick = () => {
      void designAiSessionApi
        .get(workspaceId, experienceId)
        .then(({ session }) => {
          if (!live) return;
          if (session?.status === "running") {
            timer = window.setTimeout(tick, POLL_MS);
            return;
          }
          if (
            session?.step === "design" &&
            session.status === "ready" &&
            session.generation
          )
            setWaiting({
              status: "ready",
              result: {
                design: session.generation.design,
                notes: session.generation.notes,
                itemPhotos: session.generation.itemPhotos ?? [],
              },
            });
          else if (session?.step === "ideas" && session.status === "ready")
            setWaiting({ status: "ideas" });
          else setWaiting(null);
        })
        .catch(() => {
          if (live) timer = window.setTimeout(tick, POLL_MS * 2);
        });
    };
    timer = window.setTimeout(tick, POLL_MS);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [enabled, railOpen, running, workspaceId, experienceId]);

  return { waiting, report };
}
