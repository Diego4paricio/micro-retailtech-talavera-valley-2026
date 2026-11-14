import { useEffect, useRef } from "react";
import { designAiSessionApi } from "../../../api/design-ai.js";

/** Ideas this recent count as "the owner was in the middle of it". */
const RECENT_IDEAS_MS = 2 * 60 * 60 * 1000;

/**
 * Opens the "IA" rail when the Estudio opens on an Experience whose AI
 * session is waiting for the owner (relevo 29, 2026-10-03): a generation
 * still running, a design not used yet, or ideas from the last couple of
 * hours. Older ideas stay put until the owner opens the rail.
 */
export function useAiSessionOpener({
  workspaceId,
  experienceId,
  enabled,
  onOpen,
}: {
  workspaceId: string;
  experienceId: string;
  enabled: boolean;
  onOpen: () => void;
}) {
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void designAiSessionApi
      .get(workspaceId, experienceId)
      .then(({ session }) => {
        if (!live || !session) return;
        const waiting =
          session.status === "running" ||
          (session.step === "design" && session.status === "ready") ||
          (session.step === "ideas" &&
            session.status === "ready" &&
            Date.now() - Date.parse(session.updatedAt) < RECENT_IDEAS_MS);
        if (waiting) onOpenRef.current();
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [workspaceId, experienceId, enabled]);
}
