import type { StatusComponentId } from "@kardo/contracts";
import type { Signal } from "./probes.js";

/**
 * Providers' public status pages (ADR 022 §4), every 5 minutes. Only the
 * components Kardo uses count: Cloudflare almost always has something
 * degraded somewhere in the world (a city, a product Kardo does not use), so
 * its overall indicator would keep the panel amber forever.
 *
 * A provider alone never says more than `partial_outage`: whether it really
 * took Kardo down is for Kardo's own checks to say.
 */

export type ProviderId =
  | "cloudflare"
  | "supabase"
  | "google-cloud"
  | "anthropic";

export type ProviderIssue = {
  name: string;
  level: Signal;
  components: StatusComponentId[];
};

export type ProviderResult = {
  provider: ProviderId;
  ok: boolean;
  checkedAt: string;
  error: string | null;
  issues: ProviderIssue[];
};

export const providerUrls: Record<ProviderId, string> = {
  cloudflare: "https://www.cloudflarestatus.com/api/v2/summary.json",
  supabase: "https://status.supabase.com/api/v2/summary.json",
  "google-cloud": "https://status.cloud.google.com/incidents.json",
  anthropic: "https://status.claude.com/api/v2/summary.json",
};

export const PROVIDER_INTERVAL_MS = 5 * 60_000;
const PROVIDER_TIMEOUT_MS = 8000;

/**
 * Exact Statuspage component names (verified 2026-10-03) → Kardo areas.
 * Kardo's stack (research/2026-09-28-hosting-produccion.md): Google Cloud
 * only runs the two APIs; everything else is Cloudflare — Workers with
 * Durable Objects, R2 (files and page snapshots), Analytics Engine,
 * Hyperdrive (Publisher and lead intake to Postgres), Turnstile (forms),
 * Pages (panel), DNS and the CDN.
 */
export const cloudflareComponents: Record<string, StatusComponentId[]> = {
  Workers: ["pages", "publishing", "files", "analytics"],
  "Durable Objects": ["pages"],
  R2: ["pages", "files"],
  Hyperdrive: ["publishing", "analytics"],
  Turnstile: ["analytics"],
  "CDN/Cache": ["pages", "panel"],
  "Authoritative DNS": ["pages", "panel"],
  Network: ["pages", "panel"],
  "Workers Assets": ["pages"],
  Pages: ["panel"],
};

export const supabaseComponents: Record<string, StatusComponentId[]> = {
  Database: ["panel", "publishing"],
  Auth: ["panel"],
  "Connection Pooler": ["panel", "publishing"],
  "API Gateway": ["panel"],
  // Región del proyecto (grupo «Compute capacity»).
  "us-east-1": ["panel", "publishing"],
};

/** Anthropic names it "Claude API (api.anthropic.com)". */
export function anthropicComponents(name: string): StatusComponentId[] | null {
  return name.startsWith("Claude API") ? ["ai"] : null;
}

/** Cloud Run region of the APIs. */
export const GOOGLE_CLOUD_REGION = "us-east4";

export function statuspageLevel(status: string): Signal | null {
  switch (status) {
    case "degraded_performance":
    case "under_maintenance":
      return "degraded";
    case "partial_outage":
    case "major_outage":
      return "partial_outage";
    default:
      return null;
  }
}

type StatuspageSummary = {
  components?: { name?: unknown; status?: unknown; group?: unknown }[];
};

export function parseStatuspage(
  body: unknown,
  mapping: (name: string) => StatusComponentId[] | null,
): ProviderIssue[] {
  const components = (body as StatuspageSummary | null)?.components;
  if (!Array.isArray(components)) {
    throw new Error("Formato inesperado");
  }
  const issues: ProviderIssue[] = [];
  for (const component of components) {
    if (typeof component.name !== "string" || component.group === true) {
      continue;
    }
    const areas = mapping(component.name);
    if (!areas) continue;
    const level = statuspageLevel(String(component.status));
    if (!level) continue;
    issues.push({ name: component.name, level, components: [...areas] });
  }
  return issues;
}

type GoogleIncident = {
  external_desc?: unknown;
  end?: unknown;
  severity?: unknown;
  affected_products?: { title?: unknown }[];
  currently_affected_locations?: { id?: unknown }[];
};

/** Open Cloud Run incidents in the APIs' region (or with no region listed). */
export function parseGoogleCloud(body: unknown): ProviderIssue[] {
  if (!Array.isArray(body)) throw new Error("Formato inesperado");
  const issues: ProviderIssue[] = [];
  for (const incident of body as GoogleIncident[]) {
    if (incident.end) continue;
    const products = Array.isArray(incident.affected_products)
      ? incident.affected_products
      : [];
    if (!products.some((product) => product.title === "Cloud Run")) continue;
    const locations = Array.isArray(incident.currently_affected_locations)
      ? incident.currently_affected_locations
      : [];
    const affectsRegion =
      locations.length === 0 ||
      locations.some(
        (location) =>
          location.id === GOOGLE_CLOUD_REGION || location.id === "global",
      );
    if (!affectsRegion) continue;
    issues.push({
      name:
        typeof incident.external_desc === "string"
          ? `Cloud Run: ${incident.external_desc.slice(0, 160)}`
          : "Cloud Run",
      level: incident.severity === "low" ? "degraded" : "partial_outage",
      components: ["panel", "publishing", "ai"],
    });
  }
  return issues;
}

type FetchLike = (request: Request) => Promise<Response>;

async function fetchJson(fetchFn: FetchLike, url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const response = await fetchFn(
      new Request(url, {
        headers: { accept: "application/json" },
        signal: controller.signal,
      }),
    );
    if (!response.ok) throw new Error(`Respondió ${response.status}`);
    return await response.json();
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Sin respuesta");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function one(
  provider: ProviderId,
  fetchFn: FetchLike,
  now: Date,
): Promise<ProviderResult> {
  try {
    const body = await fetchJson(fetchFn, providerUrls[provider]);
    const issues =
      provider === "cloudflare"
        ? parseStatuspage(body, (name) => cloudflareComponents[name] ?? null)
        : provider === "supabase"
          ? parseStatuspage(body, (name) => supabaseComponents[name] ?? null)
          : provider === "anthropic"
            ? parseStatuspage(body, anthropicComponents)
            : parseGoogleCloud(body);
    return {
      provider,
      ok: true,
      checkedAt: now.toISOString(),
      error: null,
      issues,
    };
  } catch (error) {
    // A provider's page that does not answer says nothing about Kardo.
    return {
      provider,
      ok: false,
      checkedAt: now.toISOString(),
      error: error instanceof Error ? error.message.slice(0, 200) : "Error",
      issues: [],
    };
  }
}

export async function runProviders(
  options: { fetchFn?: FetchLike; now?: Date } = {},
): Promise<ProviderResult[]> {
  const fetchFn: FetchLike = options.fetchFn ?? ((request) => fetch(request));
  const now = options.now ?? new Date();
  return Promise.all(
    (Object.keys(providerUrls) as ProviderId[]).map((provider) =>
      one(provider, fetchFn, now),
    ),
  );
}
