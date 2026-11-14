import type {
  ConceptBrief,
  CustomHtmlGenerationStage,
  DesignAiSession,
  DesignConcept,
  DesignItemPhoto,
  DesignPhotoMode,
  PageDesign,
} from "@kardo/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { designAiApi, designAiSessionApi } from "../../../api/design-ai.js";
import { ApiRequestError, isAbortError } from "../../../lib/api.js";
import { type KardoAiState, kardoAiFailure } from "../html/kardo-ai.js";

// ---------------------------------------------------------------------------
// "Diseñar con IA" as one flow (relevo 29, 2026-10-03): describe, three
// ideas, one design. A generation keeps running on the server when the
// page reloads or closes (the owner's decision), so the rail starts from
// the Experience's AI session: the ideas or the design that were showing,
// or "la IA sigue trabajando" while it polls. A generation started from
// this tab streams its real progress; if the stream drops, the rail falls
// back to the session the same way.
// ---------------------------------------------------------------------------

export type AiResult = {
  design: PageDesign;
  notes: string;
  itemPhotos: readonly DesignItemPhoto[];
};

export type AiRunning = {
  kind: "ideas" | "design";
  stage: CustomHtmlGenerationStage;
  turn: number;
  maxTurns: number;
  startedAt: number;
  /** Restored from the server (another tab, a reload): no live stream. */
  detached: boolean;
};

export type AiFailure = Exclude<
  KardoAiState,
  { status: "idle" | "running" | "done" }
>;

export type AiView = "form" | "ideas" | "result";

const POLL_MS = 3_000;

function failureForCode(code: string | undefined): AiFailure {
  if (code === "CUSTOM_HTML_LIMIT") return { status: "limit" };
  if (code === "CUSTOM_HTML_AI_BUDGET") return { status: "budget" };
  if (code === "AI_UNAVAILABLE")
    return {
      status: "error",
      message: "La IA de Kardo no pudo terminar este diseño. Intenta de nuevo.",
    };
  if (code === "AI_INTERRUPTED")
    return {
      status: "error",
      message:
        "La IA de Kardo se interrumpió antes de terminar. Intenta de nuevo.",
    };
  return {
    status: "error",
    message: "La IA de Kardo no pudo terminar. Intenta de nuevo.",
  };
}

/** A stream that broke without an answer: the server may still be working
 * (the generation outlives the connection), so the rail asks the session. */
function streamDropped(error: unknown): boolean {
  return (
    error instanceof ApiRequestError &&
    (error.code === "NETWORK" || error.status === 0)
  );
}

export function useDesignAiFlow({
  workspaceId,
  experienceId,
  htmlMode,
  onSettled,
}: {
  workspaceId: string;
  experienceId: string;
  /** Whether this type of page has a modo HTML (shapes the failure texts). */
  htmlMode: boolean;
  /** After every generation that ended (the counter changes). */
  onSettled?: () => void;
}) {
  const [view, setView] = useState<AiView>("form");
  const [running, setRunning] = useState<AiRunning | null>(null);
  const [concepts, setConcepts] = useState<DesignConcept[] | null>(null);
  const [selected, setSelected] = useState(0);
  const [result, setResult] = useState<AiResult | null>(null);
  const [failure, setFailure] = useState<AiFailure | null>(null);
  const [restoring, setRestoring] = useState(true);
  /** The brief and photo choice of the session found on load, if any. */
  const [restored, setRestored] = useState<{
    brief: ConceptBrief;
    photos: DesignPhotoMode;
  } | null>(null);
  const stream = useRef<AbortController | null>(null);
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  /** Shows what a session holds. Returns whether it is still running. */
  const applySession = useCallback(
    (session: DesignAiSession | null): boolean => {
      if (!session) {
        setRunning(null);
        return false;
      }
      if (session.concepts?.length) setConcepts(session.concepts);
      if (session.concept && session.concepts) {
        const index = session.concepts.findIndex(
          (item) => item.name === session.concept?.name,
        );
        if (index >= 0) setSelected(index);
      }
      if (session.status === "running") {
        setRunning({
          kind: session.step,
          stage: session.progress?.stage ?? "queued",
          turn: session.progress?.turn ?? 1,
          maxTurns: session.progress?.maxTurns ?? 1,
          startedAt: Date.parse(session.startedAt) || Date.now(),
          detached: true,
        });
        setView(
          session.step === "design" && session.concepts ? "ideas" : "form",
        );
        return true;
      }
      setRunning(null);
      if (session.status === "failed") {
        setFailure(failureForCode(session.errorCode));
        setView(
          session.step === "design" && session.concepts ? "ideas" : "form",
        );
        return false;
      }
      if (session.step === "design" && session.generation) {
        setResult({
          design: session.generation.design,
          notes: session.generation.notes,
          itemPhotos: session.generation.itemPhotos ?? [],
        });
        setView("result");
      } else if (session.concepts?.length) {
        setView("ideas");
      }
      return false;
    },
    [],
  );

  // On open: whatever the last session left.
  useEffect(() => {
    let live = true;
    void designAiSessionApi
      .get(workspaceId, experienceId)
      .then(({ session }) => {
        if (!live) return;
        if (session)
          setRestored({ brief: session.brief, photos: session.photos });
        applySession(session);
      })
      .catch(() => undefined)
      .finally(() => {
        if (live) setRestoring(false);
      });
    return () => {
      live = false;
    };
  }, [workspaceId, experienceId, applySession]);

  // While a generation runs elsewhere (a reload, another tab), ask again.
  const detached = running?.detached === true;
  useEffect(() => {
    if (!detached) return;
    let live = true;
    const timer = window.setInterval(() => {
      void designAiSessionApi
        .get(workspaceId, experienceId)
        .then(({ session }) => {
          if (!live) return;
          const still = applySession(session);
          if (!still) onSettledRef.current?.();
        })
        .catch(() => undefined);
    }, POLL_MS);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [detached, workspaceId, experienceId, applySession]);

  // Leaving the Estudio only stops listening: the server keeps working.
  useEffect(() => () => stream.current?.abort(), []);

  const progress = useCallback(
    (event: {
      stage: CustomHtmlGenerationStage;
      turn: number;
      maxTurns: number;
    }) =>
      setRunning((prev) =>
        prev
          ? {
              ...prev,
              stage: event.stage,
              turn: event.turn,
              maxTurns: event.maxTurns,
            }
          : prev,
      ),
    [],
  );

  const start = useCallback((kind: AiRunning["kind"]) => {
    stream.current?.abort();
    const abort = new AbortController();
    stream.current = abort;
    setFailure(null);
    setRunning({
      kind,
      stage: "queued",
      turn: 1,
      maxTurns: 1,
      startedAt: Date.now(),
      detached: false,
    });
    return abort;
  }, []);

  const settleError = useCallback(
    (error: unknown) => {
      if (streamDropped(error)) {
        // Keep the running state and let the session tell the rest.
        setRunning((prev) => (prev ? { ...prev, detached: true } : prev));
        return;
      }
      setRunning(null);
      setFailure(kardoAiFailure(error, htmlMode) as AiFailure);
      onSettledRef.current?.();
    },
    [htmlMode],
  );

  const askIdeas = useCallback(
    async (brief: ConceptBrief, photos: DesignPhotoMode) => {
      const abort = start("ideas");
      setResult(null);
      try {
        const answer = await designAiApi.conceptsStream(
          workspaceId,
          experienceId,
          { brief, photos },
          {
            signal: abort.signal,
            onEvent: (event) => {
              if (event.type === "progress") progress(event);
            },
          },
        );
        if (abort.signal.aborted) return;
        setConcepts(answer.concepts);
        setSelected(0);
        setRunning(null);
        setView("ideas");
        onSettledRef.current?.();
      } catch (error) {
        if (isAbortError(error) || abort.signal.aborted) return;
        settleError(error);
      }
    },
    [workspaceId, experienceId, start, progress, settleError],
  );

  const design = useCallback(
    async (
      brief: ConceptBrief,
      photos: DesignPhotoMode,
      options: { concept?: DesignConcept; current?: PageDesign },
    ) => {
      const abort = start("design");
      try {
        const answer = await designAiApi.generateStream(
          workspaceId,
          experienceId,
          {
            brief,
            photos,
            ...(options.concept ? { concept: options.concept } : {}),
            ...(options.current ? { current: options.current } : {}),
          },
          {
            signal: abort.signal,
            onEvent: (event) => {
              if (event.type === "progress") progress(event);
            },
          },
        );
        if (abort.signal.aborted) return;
        setResult({
          design: answer.design,
          notes: answer.notes,
          itemPhotos: answer.itemPhotos ?? [],
        });
        setRunning(null);
        setView("result");
        onSettledRef.current?.();
      } catch (error) {
        if (isAbortError(error) || abort.signal.aborted) return;
        settleError(error);
      }
    },
    [workspaceId, experienceId, start, progress, settleError],
  );

  /** Cancelar: stops the generation on the server too. A design started
   * from an idea goes back to the ideas. */
  const cancel = useCallback(() => {
    const kind = running?.kind;
    stream.current?.abort();
    stream.current = null;
    setRunning(null);
    void designAiSessionApi
      .clear(workspaceId, experienceId, kind === "design")
      .catch(() => undefined)
      .finally(() => onSettledRef.current?.());
    setView(kind === "design" && concepts ? "ideas" : "form");
  }, [running?.kind, concepts, workspaceId, experienceId]);

  /** Leaves the result (used or not) and goes back to the ideas, if any. */
  const backToIdeas = useCallback(() => {
    setResult(null);
    setFailure(null);
    setView(concepts ? "ideas" : "form");
    void designAiSessionApi
      .clear(workspaceId, experienceId, true)
      .catch(() => undefined);
  }, [concepts, workspaceId, experienceId]);

  /** After «Usar este diseño»: the design is the page's now, so the rail
   * goes on to «¿Qué le cambio?», not back to the ideas (relevo 37, round
   * 3: to tweak an applied design Javier tapped «Diseñar con esta idea»
   * again, twice, and spent a design each time). The ideas stay in the
   * session. */
  const afterUse = useCallback(() => {
    setResult(null);
    setFailure(null);
    setView("form");
    void designAiSessionApi
      .clear(workspaceId, experienceId, true)
      .catch(() => undefined);
  }, [workspaceId, experienceId]);

  /** Back to the description, starting over. */
  const startOver = useCallback(() => {
    stream.current?.abort();
    setRunning(null);
    setConcepts(null);
    setResult(null);
    setFailure(null);
    setView("form");
    void designAiSessionApi
      .clear(workspaceId, experienceId, false)
      .catch(() => undefined);
  }, [workspaceId, experienceId]);

  return {
    view,
    running,
    concepts,
    selected,
    setSelected,
    result,
    failure,
    restoring,
    restored,
    askIdeas,
    design,
    cancel,
    backToIdeas,
    afterUse,
    startOver,
  };
}
