import type {
  ConceptBrief,
  HtmlBlockGeneration,
  HtmlBlockGenerationRequest,
} from "@kardo/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { htmlBlockAiApi } from "../../../api/design-ai.js";
import { isAbortError } from "../../../lib/api.js";
import { type KardoAiState, kardoAiFailure } from "../html/kardo-ai.js";

/**
 * "Pedir a la IA" for one `html` design block (the inspector's `HtmlFields`,
 * ADR 018 addendum 3): sized to a block instead of a whole page, but the
 * same response shape as modo HTML (`html`, `css`, `notes`), so this reuses
 * `KardoAiState` and `kardoAiFailure` from `html/kardo-ai.ts` as-is.
 */
export function useKardoHtmlBlockAi({
  workspaceId,
  experienceId,
  htmlMode,
  onResult,
}: {
  workspaceId: string;
  experienceId: string;
  /** Whether this type of page has a modo HTML (shapes the failure texts). */
  htmlMode: boolean;
  onResult: (result: HtmlBlockGeneration) => void;
}) {
  const [state, setState] = useState<KardoAiState>({ status: "idle" });
  const controller = useRef<AbortController | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => () => controller.current?.abort(), []);

  const generate = useCallback(
    async (
      brief: ConceptBrief,
      instructions: string | undefined,
      current: { html: string; css: string } | null,
    ) => {
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      setState({
        status: "running",
        startedAt: Date.now(),
        stage: "queued",
        turn: 1,
        maxTurns: 1,
      });
      const body: HtmlBlockGenerationRequest = {
        brief,
        ...(instructions ? { instructions } : {}),
        ...(current ? { current } : {}),
      };
      try {
        const result = await htmlBlockAiApi.generateStream(
          workspaceId,
          experienceId,
          body,
          {
            signal: abort.signal,
            onEvent: (event) => {
              if (event.type !== "progress") return;
              setState((prev) =>
                prev.status === "running"
                  ? {
                      ...prev,
                      stage: event.stage,
                      turn: event.turn,
                      maxTurns: event.maxTurns,
                    }
                  : prev,
              );
            },
          },
        );
        if (abort.signal.aborted) return;
        onResultRef.current(result);
        setState({
          status: "done",
          notes: result.notes,
        });
      } catch (error) {
        if (isAbortError(error) || abort.signal.aborted) return;
        setState(kardoAiFailure(error, htmlMode));
      } finally {
        if (controller.current === abort) controller.current = null;
      }
    },
    [workspaceId, experienceId, htmlMode],
  );

  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setState({ status: "idle" });
  }, []);

  return { state, generate, cancel };
}
