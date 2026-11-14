import {
  CUSTOM_HTML_GENERATION_STREAM,
  type DesignAiSessionEnvelope,
  type DesignAiUsage,
  type DesignConcepts,
  type DesignConceptsRequest,
  type DesignGeneration,
  type DesignGenerationRequest,
  type HtmlBlockGeneration,
  type HtmlBlockGenerationRequest,
} from "@kardo/contracts";
import {
  ApiRequestError,
  apiRequest,
  idempotencyHeaders,
  resolveErrorMessage,
} from "../lib/api.js";
import { isDemoMode } from "../lib/demo.js";
import { customerApiUrl, supabase } from "../supabase.js";
import {
  type GenerationEvent,
  generationErrorFromBody,
  isGenerationStream,
  readGenerationStream,
} from "./custom-html.js";

/**
 * AI in blocks (ADR 018 addendum 3): the two generation endpoints alongside
 * modo HTML's own (`custom-html.ts`'s `customHtmlApi`) — a full block design
 * for the Experience's type, and one `html` block's source. Same NDJSON
 * protocol, so this reuses `custom-html.ts`'s stream primitives (generic
 * over the generation shape) instead of a copy; only the request body, the
 * path and the result type differ.
 */

type StreamHandlers<TGeneration> = {
  signal?: AbortSignal | undefined;
  onEvent: (event: GenerationEvent<TGeneration>) => void;
};

async function accessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Posts a generation request and reads its NDJSON stream to the end, same
 * shape as `customHtmlApi.generateStream`. Not supported in the demo build
 * (`VITE_DEMO_MODE`): it answers the same "no AI configured" error the real
 * endpoint gives, so the Estudio's own empty state (`ai.status ===
 * "unavailable"`) covers it without a canned demo design. */
async function postGenerationStream<TBody, TGeneration>(
  path: string,
  body: TBody,
  { signal, onEvent }: StreamHandlers<TGeneration>,
): Promise<TGeneration> {
  if (isDemoMode)
    throw new ApiRequestError(
      resolveErrorMessage(503, "AI_UNAVAILABLE"),
      503,
      "AI_UNAVAILABLE",
    );

  const token = await accessToken();
  if (!token)
    throw new ApiRequestError(resolveErrorMessage(401, null), 401, null);

  let response: Response;
  try {
    response = await fetch(`${customerApiUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: CUSTOM_HTML_GENERATION_STREAM,
        ...idempotencyHeaders(),
      },
      body: JSON.stringify(body),
      signal: signal ?? null,
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new ApiRequestError(
      "No pudimos conectar con Kardo. Revisa tu conexión.",
      0,
      "NETWORK",
    );
  }

  if (!isGenerationStream(response.headers.get("content-type"))) {
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 401 && supabase)
        void supabase.auth.signOut({ scope: "local" });
      throw generationErrorFromBody(response.status, json);
    }
    return json as TGeneration;
  }

  if (!response.body)
    throw new ApiRequestError(
      "Tu navegador no puede leer la respuesta de la IA de Kardo.",
      0,
      "NETWORK",
    );

  const terminal = await readGenerationStream<TGeneration>(
    response.body,
    onEvent,
  );
  if (!terminal)
    throw new ApiRequestError(
      "La IA de Kardo no terminó de responder. Intenta de nuevo.",
      0,
      "NETWORK",
    );
  if (terminal.type === "error")
    throw new ApiRequestError(
      resolveErrorMessage(
        response.status,
        terminal.error.code,
        terminal.error.message,
      ),
      response.status,
      terminal.error.code,
    );
  return terminal.generation;
}

export const designAiApi = {
  /** Drafts (or, with `body.current`, refines) a full `PageDesign` for the
   * Experience's own type. */
  generateStream: (
    workspaceId: string,
    experienceId: string,
    body: DesignGenerationRequest,
    handlers: StreamHandlers<DesignGeneration>,
  ): Promise<DesignGeneration> =>
    postGenerationStream<DesignGenerationRequest, DesignGeneration>(
      `/v1/workspaces/${workspaceId}/experiences/${experienceId}/design/generations`,
      body,
      handlers,
    ),
  /** Three design ideas before designing (2026-10-03); asking for them
   * does not use one of today's designs. */
  conceptsStream: (
    workspaceId: string,
    experienceId: string,
    body: DesignConceptsRequest,
    handlers: StreamHandlers<DesignConcepts>,
  ): Promise<DesignConcepts> =>
    postGenerationStream<DesignConceptsRequest, DesignConcepts>(
      `/v1/workspaces/${workspaceId}/experiences/${experienceId}/design/concepts`,
      body,
      handlers,
    ),
};

/** The Experience's last AI session and the organization's AI usage
 * (2026-10-03): what a generation left after a reload, and what is left
 * today and this month. */
export const designAiSessionApi = {
  get: (workspaceId: string, experienceId: string, signal?: AbortSignal) =>
    apiRequest<DesignAiSessionEnvelope>(
      `/v1/workspaces/${workspaceId}/experiences/${experienceId}/design/ai-session`,
      { signal },
    ),
  /** Cancelar and "empezar de nuevo": stops the running job and clears the
   * session; `keepIdeas` goes back to the ideas when there are some. */
  clear: (workspaceId: string, experienceId: string, keepIdeas: boolean) =>
    apiRequest<void>(
      `/v1/workspaces/${workspaceId}/experiences/${experienceId}/design/ai-session${keepIdeas ? "?keep=ideas" : ""}`,
      { method: "DELETE" },
    ),
  usage: (workspaceId: string, signal?: AbortSignal) =>
    apiRequest<DesignAiUsage>(`/v1/workspaces/${workspaceId}/design/ai-usage`, {
      signal,
    }),
};

export const htmlBlockAiApi = {
  /** Drafts (or, with `body.current`, improves) one `html` block's source. */
  generateStream: (
    workspaceId: string,
    experienceId: string,
    body: HtmlBlockGenerationRequest,
    handlers: StreamHandlers<HtmlBlockGeneration>,
  ): Promise<HtmlBlockGeneration> =>
    postGenerationStream<HtmlBlockGenerationRequest, HtmlBlockGeneration>(
      `/v1/workspaces/${workspaceId}/experiences/${experienceId}/design/html-blocks/generations`,
      body,
      handlers,
    ),
};
