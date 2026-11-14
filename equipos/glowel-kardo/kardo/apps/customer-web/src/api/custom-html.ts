import {
  CUSTOM_HTML_GENERATION_STREAM,
  type CustomHtmlGeneration,
  type CustomHtmlGenerationEvent,
  type CustomHtmlGenerationRequest,
  type CustomHtmlGenerationStage,
} from "@kardo/contracts";
import {
  ApiRequestError,
  idempotencyHeaders,
  resolveErrorMessage,
} from "../lib/api.js";
import { demoCustomHtmlGenerationStream, isDemoMode } from "../lib/demo.js";
import { customerApiUrl, supabase } from "../supabase.js";

/**
 * Modo HTML del Estudio: "Diseñar con la IA de Kardo" drafts HTML and CSS
 * from the customer's concept (nothing is saved; the result goes into the
 * editor). Owners and admins only.
 *
 * The endpoint streams its real progress as NDJSON (one
 * `CustomHtmlGenerationEvent` per line) when asked with
 * `Accept: application/x-ndjson` (`CUSTOM_HTML_GENERATION_STREAM`): `onEvent`
 * gets every `progress` and `ping` line while the call settles on the
 * stream's one `result` or `error` event. A generation can take minutes (a
 * local test bridge, or several turns fixing what the sanitizer removed), so
 * this never times out on its own; only the caller's `signal` cancels it. A
 * failure before the stream starts (auth, permissions, quotas) or a
 * deployment that ignores the streaming header both answer plain JSON
 * instead, handled the same way `apiRequest` does elsewhere.
 */

type GenerateStreamHandlers = {
  signal?: AbortSignal | undefined;
  onEvent: (event: CustomHtmlGenerationEvent) => void;
};

/** A JSON error body, in the same shape every Customer API error uses (a
 * failure before the stream starts, or the JSON fallback when there is no
 * streaming support at all). */
export function generationErrorFromBody(
  status: number,
  body: unknown,
): ApiRequestError {
  const parsed = body as {
    code?: unknown;
    message?: unknown;
    requestId?: unknown;
  } | null;
  const code = typeof parsed?.code === "string" ? parsed.code : null;
  const rawMessage =
    typeof parsed?.message === "string" ? parsed.message : null;
  const requestId =
    typeof parsed?.requestId === "string" ? parsed.requestId : null;
  return new ApiRequestError(
    resolveErrorMessage(status, code, rawMessage),
    status,
    code,
    requestId,
  );
}

/** Whether a response's `content-type` is the NDJSON generation stream. */
export function isGenerationStream(contentType: string | null): boolean {
  return (contentType ?? "").includes(CUSTOM_HTML_GENERATION_STREAM);
}

/**
 * Splits everything read so far into complete lines and the remainder (a
 * partial line that may continue in the next chunk, or the empty string
 * once nothing is left over). Pure string work so a line split across two
 * network chunks is easy to test without a real stream.
 */
export function splitNdjsonLines(
  buffered: string,
  chunk: string,
): { lines: string[]; rest: string } {
  const parts = (buffered + chunk).split("\n");
  const rest = parts.pop() ?? "";
  return { lines: parts, rest };
}

/** Same shape as `CustomHtmlGenerationEvent`, `DesignGenerationEvent` and
 * `HtmlBlockGenerationEvent` (declared as separate named unions in
 * `@kardo/contracts` so a client always knows which `generation` shape a
 * `result` event carries for a given endpoint — mirrors the server's own
 * `GenerationEvent<TGeneration>` in `routes/custom-html.ts`), generic here so
 * the stream-reading plumbing below is written once for all three. Exported
 * so `api/design-ai.ts` (the AI-in-blocks endpoints) can type its own
 * `onEvent` handlers against it instead of redeclaring the shape. */
export type GenerationEvent<TGeneration> =
  | {
      type: "progress";
      stage: CustomHtmlGenerationStage;
      turn: number;
      maxTurns: number;
    }
  | { type: "ping" }
  | { type: "result"; generation: TGeneration }
  | {
      type: "error";
      error: { code: string; message: string; remainingToday?: number };
    };

/** One NDJSON line as an event, or `null` for a blank or malformed one (a
 * stray byte should not fail the whole stream). Generic over the generation
 * shape (`CustomHtmlGeneration` by default) so the AI-in-blocks generations
 * (`DesignGeneration`, `HtmlBlockGeneration`) reuse this instead of a copy. */
export function parseNdjsonLine<TGeneration = CustomHtmlGeneration>(
  line: string,
): GenerationEvent<TGeneration> | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as GenerationEvent<TGeneration>;
  } catch {
    return null;
  }
}

type GenerationTerminalEvent<TGeneration> = Extract<
  GenerationEvent<TGeneration>,
  { type: "result" | "error" }
>;

/**
 * Reads the NDJSON body to its one terminal event (`result` or `error`),
 * forwarding every other line (`progress`, `ping`) to `onEvent`. Handles a
 * line split across chunks and a final line with no trailing newline.
 * Resolves `null` if the body ends without a terminal event (a dropped
 * connection). Generic for the same reason as `parseNdjsonLine` above.
 */
export async function readGenerationStream<TGeneration = CustomHtmlGeneration>(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: GenerationEvent<TGeneration>) => void,
): Promise<GenerationTerminalEvent<TGeneration> | null> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      const chunk = value ? decoder.decode(value, { stream: !done }) : "";
      const { lines, rest } = splitNdjsonLines(buffer, chunk);
      buffer = rest;
      for (const line of lines) {
        const event = parseNdjsonLine<TGeneration>(line);
        if (!event) continue;
        if (event.type === "result" || event.type === "error") return event;
        onEvent(event);
      }
      if (done) {
        const last = parseNdjsonLine<TGeneration>(buffer);
        if (last) {
          if (last.type === "result" || last.type === "error") return last;
          onEvent(last);
        }
        return null;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** The current session's token, read per request (a refreshed token is
 * picked up without re-rendering the caller). */
async function accessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export const customHtmlApi = {
  generateStream: async (
    workspaceId: string,
    experienceId: string,
    body: CustomHtmlGenerationRequest,
    { signal, onEvent }: GenerateStreamHandlers,
  ): Promise<CustomHtmlGeneration> => {
    const path = `/v1/workspaces/${workspaceId}/experiences/${experienceId}/custom-html/generations`;
    if (isDemoMode)
      return demoCustomHtmlGenerationStream(path, body.brief, {
        signal,
        onEvent,
      });

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
      // No streaming (a failure before it starts, an older deployment, or a
      // proxy that ignored the Accept header): the same JSON the endpoint
      // has always answered with.
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 401 && supabase)
          void supabase.auth.signOut({ scope: "local" });
        throw generationErrorFromBody(response.status, json);
      }
      return json as CustomHtmlGeneration;
    }

    if (!response.body)
      throw new ApiRequestError(
        "Tu navegador no puede leer la respuesta de la IA de Kardo.",
        0,
        "NETWORK",
      );

    const terminal = await readGenerationStream(response.body, onEvent);
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
  },
};
