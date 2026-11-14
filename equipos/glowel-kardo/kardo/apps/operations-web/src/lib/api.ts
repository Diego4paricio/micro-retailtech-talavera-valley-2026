import { staffApiUrl, supabase } from "../supabase.js";
import {
  ApiRequestError,
  errorMessage,
  isAbortError,
  messageFor,
} from "./api-errors.js";
import { demoRequest, isDemoMode } from "./demo.js";

export { ApiRequestError, errorMessage, isAbortError };

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string> | undefined;
  signal?: AbortSignal | undefined;
  /** File downloads (CFDI PDF or XML). */
  responseType?: "json" | "blob";
  /** Shows the server's own message on errors (a provider's rejection
   * reason, already safe to show to staff). */
  serverMessage?: boolean;
};

async function accessToken(): Promise<string | null> {
  if (!supabase) return null;
  // Read the current session on every request: a silently refreshed token
  // (including the aal2 upgrade right after an MFA challenge) is picked up
  // without re-rendering the whole shell.
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  if (isDemoMode) return demoRequest<T>(path, options);

  const headers = new Headers(options.headers);
  const token = await accessToken();
  if (!token)
    throw new ApiRequestError(
      messageFor(401, null),
      401,
      "STAFF_SESSION_REQUIRED",
    );
  headers.set("Authorization", `Bearer ${token}`);
  if (options.body !== undefined)
    headers.set("Content-Type", "application/json");

  let response: Response;
  try {
    response = await fetch(`${staffApiUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? null : JSON.stringify(options.body),
      signal: options.signal ?? null,
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

  if (!response.ok) {
    const parsed = (await response.json().catch(() => null)) as {
      code?: unknown;
      message?: unknown;
      requestId?: unknown;
    } | null;
    const code = typeof parsed?.code === "string" ? parsed.code : null;
    const requestId =
      typeof parsed?.requestId === "string" ? parsed.requestId : null;
    const serverMessage =
      options.serverMessage && typeof parsed?.message === "string"
        ? parsed.message
        : null;
    throw new ApiRequestError(
      serverMessage ?? messageFor(response.status, code),
      response.status,
      code,
      requestId,
    );
  }
  if (response.status === 204) return undefined as T;
  if (options.responseType === "blob") return (await response.blob()) as T;
  return (await response.json()) as T;
}
