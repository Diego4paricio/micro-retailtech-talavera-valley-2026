import type { ServiceStatus } from "@kardo/contracts";
import { demoServiceStatus } from "../lib/demo/notifications.js";
import { isDemoMode } from "../lib/demo.js";

/**
 * The status Worker (ADR 022), outside the Customer API on purpose: it keeps
 * answering when the API or the database do not. Public and without a
 * session. A production build without `VITE_STATUS_URL` shows no status;
 * in local development it falls back to the Worker of
 * `pnpm --filter @kardo/status-worker dev` (port 8797).
 */
const developmentStatusUrl = "http://127.0.0.1:8797";
const statusUrl = (
  import.meta.env.VITE_STATUS_URL ||
  (import.meta.env.DEV ? developmentStatusUrl : "")
).replace(/\/$/, "");

export const isStatusConfigured = isDemoMode || statusUrl.length > 0;

export async function fetchServiceStatus(
  signal?: AbortSignal,
): Promise<ServiceStatus> {
  if (isDemoMode) return demoServiceStatus();
  const response = await fetch(`${statusUrl}/v1/status`, {
    signal: signal ?? null,
    headers: { accept: "application/json" },
    credentials: "omit",
  });
  if (!response.ok) throw new Error(`status ${response.status}`);
  return (await response.json()) as ServiceStatus;
}
