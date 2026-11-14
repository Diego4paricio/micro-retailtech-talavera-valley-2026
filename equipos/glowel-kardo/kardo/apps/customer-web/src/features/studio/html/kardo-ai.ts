import type {
  ConceptBrief,
  CustomHtmlGeneration,
  CustomHtmlGenerationRequest,
  CustomHtmlGenerationStage,
} from "@kardo/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { customHtmlApi } from "../../../api/custom-html.js";
import { ApiRequestError, isAbortError } from "../../../lib/api.js";

/**
 * "Diseñar con la IA de Kardo": one request that drafts HTML and CSS from
 * the concept, streaming its real progress (queued, generating, reviewing,
 * fixing) while it runs. A generation can take from under a minute to a few
 * (a local test bridge, or several turns fixing what the sanitizer removed),
 * so there is no client-side timeout: only Cancelar stops it. The result is
 * never saved by itself: it goes into the editor, where it can be undone.
 */
export type KardoAiState =
  | { status: "idle" }
  | {
      status: "running";
      startedAt: number;
      stage: CustomHtmlGenerationStage;
      turn: number;
      maxTurns: number;
    }
  | { status: "done"; notes: string }
  /** No `ANTHROPIC_API_KEY` configured: use your own AI instead. */
  | { status: "unavailable" }
  /** 404: this page no longer exists. */
  | { status: "gone" }
  /** This organization's generations for today are used. */
  | { status: "limit" }
  /** Kardo's own daily AI budget is used (`CUSTOM_HTML_AI_BUDGET`), across
   * every organization: nothing to do but wait for tomorrow. */
  | { status: "budget" }
  /** Too many requests from this person in a short time (429 without the
   * organization's daily-limit code): a short wait, not a whole day. */
  | { status: "rate-limited" }
  | { status: "error"; message: string };

/**
 * The one translator of a failed AI request into a state, for every AI
 * surface (blocks rail, modo HTML, html-block dialog). `htmlMode`: whether
 * this type of page has a modo HTML. «Copiar prompt» and «modo HTML» only
 * exist there, so the other types are never sent to them (domain audit
 * A2-38).
 */
export function kardoAiFailure(
  error: unknown,
  htmlMode: boolean,
): Exclude<KardoAiState, { status: "done" }> {
  if (error instanceof ApiRequestError) {
    // 404 on this page's own AI route: the page is gone (or never was).
    if (error.status === 404) return { status: "gone" };
    if (
      error.code === "AI_UNAVAILABLE" ||
      error.status === 503 ||
      error.status === 501
    )
      return { status: "unavailable" };
    if (error.code === "CUSTOM_HTML_AI_BUDGET") return { status: "budget" };
    if (error.code === "CUSTOM_HTML_LIMIT") return { status: "limit" };
    if (error.status === 429) return { status: "rate-limited" };
    // The organization's plan turns it off or its monthly quota is used.
    if (error.code === "PLAN_LIMIT")
      return {
        status: "error",
        message: `Tu plan no incluye más diseños con la IA de Kardo por ahora.${
          htmlMode
            ? " Usa Copiar prompt con tu propia IA en el modo HTML: no tiene límite."
            : ""
        }`,
      };
    return { status: "error", message: error.message };
  }
  return {
    status: "error",
    message: "No pudimos hablar con la IA de Kardo. Intenta de nuevo.",
  };
}

/** The sentence for a non-running, non-done AI state (null for the ones each
 * surface shows on its own). One wording for every surface. */
export function kardoAiStatusMessage(
  state: Pick<KardoAiState, "status"> & { message?: string | undefined },
  htmlMode: boolean,
): { tone: "info" | "warning"; text: string } | null {
  const ownAi = htmlMode
    ? " Mientras, usa Copiar prompt con tu propia IA en el modo HTML: no tiene límite."
    : "";
  switch (state.status) {
    case "unavailable":
      return {
        tone: "info",
        text: `La IA de Kardo no está disponible todavía. Vuelve más tarde.${ownAi}`,
      };
    case "gone":
      return {
        tone: "warning",
        text: "Esta página ya no existe. Vuelve a Páginas y abre otra.",
      };
    case "limit":
      return {
        tone: "info",
        text: `Ya usaste los diseños de hoy con la IA de Kardo (el límite es diario). Mañana tienes más.${ownAi}`,
      };
    case "budget":
      return {
        tone: "info",
        text: `La IA de Kardo descansa por hoy. Vuelve mañana.${ownAi}`,
      };
    case "rate-limited":
      return {
        tone: "warning",
        text: "Hiciste varias solicitudes seguidas. Espera un momento y vuelve a intentar.",
      };
    case "error":
      return { tone: "warning", text: state.message ?? "" };
    default:
      return null;
  }
}

/** What the AI is doing, from the stream's real stage and turn. */
export function kardoAiStageLabel(
  stage: CustomHtmlGenerationStage,
  turn: number,
  maxTurns: number,
): string {
  switch (stage) {
    case "queued":
      return "En espera…";
    case "generating":
      return "Diseñando tu página…";
    case "reviewing":
      return "Revisando que se pueda publicar…";
    case "fixing":
      return maxTurns > 1
        ? `Corrigiendo lo que se quitó (${turn} de ${maxTurns})…`
        : "Corrigiendo lo que se quitó…";
    default:
      return "Trabajando en tu página…";
  }
}

/** A rough, honest fill for the progress bar: by stage, not by elapsed time
 * (a generation can take from seconds to a few minutes). */
export function kardoAiProgress(
  stage: CustomHtmlGenerationStage,
  turn: number,
  maxTurns: number,
): number {
  if (stage === "queued") return 5;
  if (stage === "generating") return 35;
  if (stage === "reviewing") return 65;
  // fixing: the rest of the bar, split across the remaining turns.
  return Math.min(96, 70 + (maxTurns > 0 ? (turn / maxTurns) * 26 : 0));
}

/** "42 s" under a minute, "1:05 min" from a minute on. */
export function formatElapsedSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")} min`;
}

export function useKardoAi({
  workspaceId,
  experienceId,
  onResult,
}: {
  workspaceId: string;
  experienceId: string;
  onResult: (result: CustomHtmlGeneration) => void;
}) {
  const [state, setState] = useState<KardoAiState>({ status: "idle" });
  const controller = useRef<AbortController | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => () => controller.current?.abort(), []);

  const generate = useCallback(
    async (
      brief: ConceptBrief,
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
      const body: CustomHtmlGenerationRequest = {
        brief,
        ...(current ? { current } : {}),
      };
      try {
        const result = await customHtmlApi.generateStream(
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
        setState(kardoAiFailure(error, true));
      } finally {
        if (controller.current === abort) controller.current = null;
      }
    },
    [workspaceId, experienceId],
  );

  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    setState({ status: "idle" });
  }, []);

  return { state, generate, cancel };
}
