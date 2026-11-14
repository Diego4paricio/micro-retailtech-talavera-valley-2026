import type {
  CustomerWorkspace,
  WorkspaceProfile,
  WorkspaceProfilePatch,
} from "@kardo/contracts";
import {
  applyWorkspaceProfilePatch,
  businessSlugCandidates,
  businessSlugFormatError,
  businessSlugKey,
  isReservedBusinessSlug,
} from "@kardo/contracts";
import { ApiRequestError } from "../api.js";

/**
 * Demo-mode data for the Settings and Organization screens: workspace
 * profiles (Configuración → Organización / Marca) and organization creation.
 * Kept separate from `src/lib/demo.ts`'s single fixed-workspace store so this
 * feature area can evolve on its own; `demo.ts` routes matching paths here
 * before falling back to its own generic handling.
 */

const profiles = new Map<string, WorkspaceProfile>();
const createdOrganizations: CustomerWorkspace[] = [];
/** Business addresses chosen in the demo, by workspace. «cafe-nube» stands
 * for another business that already took it, to show a taken address. */
const slugs = new Map<string, string>();
const takenElsewhere = new Set(["cafenube", "tacosdonbeto"]);

function slugFree(slug: string, workspaceId: string): boolean {
  const key = businessSlugKey(slug);
  if (takenElsewhere.has(key)) return false;
  for (const [id, other] of slugs)
    if (id !== workspaceId && businessSlugKey(other) === key) return false;
  return true;
}

/** When each demo address last changed (absent: never since chosen). */
const slugChanges = new Map<string, string>();

/** The demo workspace's chosen address, or null. */
/** The demo account is on the trial of Profesional: 3 organizations (ADR 024). */
const demoOrganizationCap = 3;

export function demoWorkspaceSlug(workspaceId: string): string | null {
  return slugs.get(workspaceId) ?? null;
}

/** The demo workspace's last address change, or null. */
export function demoWorkspaceSlugChangedAt(workspaceId: string): string | null {
  return slugChanges.get(workspaceId) ?? null;
}

/** The demo business starts with its address chosen (as after Primeros
 * pasos), so Links shows it from the start. */
export function setDemoWorkspaceSlug(workspaceId: string, slug: string): void {
  slugs.set(workspaceId, slug);
}

function emptyProfile(): WorkspaceProfile {
  return {};
}

/**
 * Handles a demo-mode request for this feature area, or returns `undefined`
 * when the path/method isn't one of these routes (the caller then falls
 * back to its own handling).
 */
export function handleSettingsDemo(
  path: string,
  method: string,
  body: Record<string, unknown>,
): unknown | undefined {
  const slugMatch =
    /\/v1\/workspaces\/([^/]+)\/slug(?:\/(suggestion|availability))?(?:\?(.*))?$/.exec(
      path,
    );
  if (slugMatch?.[1]) {
    const workspaceId = slugMatch[1];
    const params = new URLSearchParams(slugMatch[3] ?? "");
    const context = {
      name: params.get("name") ?? "",
      city: params.get("city"),
      industry: params.get("industry"),
    };
    const firstFree = (skip?: string) =>
      businessSlugCandidates(context).find(
        (slug) => slug !== skip && slugFree(slug, workspaceId),
      ) ?? null;
    if (slugMatch[2] === "suggestion") return { slug: firstFree() };
    if (slugMatch[2] === "availability") {
      const slug = params.get("slug") ?? "";
      if (businessSlugFormatError(slug))
        return { available: false, reason: "format" };
      if (isReservedBusinessSlug(slug))
        return {
          available: false,
          reason: "reserved",
          suggestion: firstFree(slug),
        };
      if (!slugFree(slug, workspaceId))
        return {
          available: false,
          reason: "taken",
          suggestion: firstFree(slug),
        };
      return { available: true };
    }
    if (method === "PUT") {
      const slug = String(body.slug ?? "");
      if (
        businessSlugFormatError(slug) ||
        isReservedBusinessSlug(slug) ||
        !slugFree(slug, workspaceId)
      )
        return undefined;
      const current = slugs.get(workspaceId);
      const changedAt = slugChanges.get(workspaceId);
      if (
        current &&
        current !== slug &&
        changedAt &&
        Date.now() - new Date(changedAt).getTime() < 7 * 24 * 60 * 60 * 1000
      )
        throw new ApiRequestError(
          "Ya cambiaste tu dirección esta semana. Puedes volver a cambiarla 7 días después del último cambio.",
          429,
          "SLUG_CHANGE_TOO_SOON",
        );
      // The first choice is free; every later change starts the 7 days.
      if (current && current !== slug)
        slugChanges.set(workspaceId, new Date().toISOString());
      slugs.set(workspaceId, slug);
      return { slug };
    }
  }

  const profileMatch = /\/v1\/workspaces\/([^/]+)\/profile$/.exec(path);
  if (profileMatch?.[1]) {
    const workspaceId = profileMatch[1];
    if (method === "GET")
      return structuredClone(profiles.get(workspaceId) ?? emptyProfile());
    if (method === "PATCH") {
      const profile = applyWorkspaceProfilePatch(
        profiles.get(workspaceId) ?? emptyProfile(),
        structuredClone(body) as WorkspaceProfilePatch,
      );
      profiles.set(workspaceId, profile);
      return structuredClone(profile);
    }
  }

  if (path === "/v1/organizations" && method === "POST") {
    // The fixed demo workspace already counts as one owned organization.
    if (createdOrganizations.length >= demoOrganizationCap - 1)
      return undefined;
    const organization: CustomerWorkspace = {
      id: crypto.randomUUID(),
      publicId: crypto.randomUUID().replaceAll("-", ""),
      name: String(body.name ?? "Nueva organización"),
      kind: "organization",
      role: "owner",
    };
    createdOrganizations.push(organization);
    return structuredClone(organization);
  }

  return undefined;
}

/**
 * Extra demo organizations created during this session. `src/lib/demo.ts`'s
 * `/v1/workspaces` handler should append these after its fixed demo
 * workspace so a created organization shows up in the switcher.
 */
export function listCreatedDemoOrganizations(): readonly CustomerWorkspace[] {
  return createdOrganizations;
}
