import {
  businessSlugKey,
  linkSlugCandidates,
  linkSlugFormatError,
} from "@kardo/contracts";
import { ApiRequestError } from "../api.js";

/**
 * Demo of Links with their own address (Links redesign, phase 2):
 * kardo.com.mx/<negocio>/<link>, unique inside the business, plus the main
 * link. Works on the demo store's Touchpoints and Experiences.
 */
type Row = Record<string, unknown>;

let mainLinkId: string | null = null;

export function setDemoMainLink(id: string | null): void {
  mainLinkId = id;
}

export function demoMainLinkId(): string | null {
  return mainLinkId;
}

function taken(touchpoints: Row[], slug: string, exceptId?: string | null) {
  const key = businessSlugKey(slug);
  return touchpoints.some(
    (item) =>
      item.id !== exceptId &&
      item.status !== "retired" &&
      typeof item.slug === "string" &&
      businessSlugKey(item.slug) === key,
  );
}

export function handleLinksDemo(
  path: string,
  method: string,
  body: Record<string, unknown>,
  context: {
    touchpoints: Row[];
    experiences: Row[];
    businessSlug: () => string | null;
  },
): unknown {
  const match =
    /\/v1\/workspaces\/[^/]+\/(?:links(?:\/(slug-suggestion|slug-availability)|\/([^/?]+)\/slug)?|(main-link))(?:\?(.*))?$/.exec(
      path,
    );
  if (!match) return undefined;
  const [, query, linkId, main, search] = match;
  const params = new URLSearchParams(search ?? "");
  const firstFree = (skip?: string) =>
    linkSlugCandidates({
      name: params.get("name") ?? "",
      type: params.get("type"),
    }).find((slug) => slug !== skip && !taken(context.touchpoints, slug)) ??
    null;

  if (query === "slug-suggestion") return { slug: firstFree() };
  if (query === "slug-availability") {
    const slug = params.get("slug") ?? "";
    if (linkSlugFormatError(slug))
      return { available: false, reason: "format" };
    if (taken(context.touchpoints, slug, params.get("touchpointId")))
      return { available: false, reason: "taken", suggestion: firstFree(slug) };
    return { available: true };
  }
  if (main && method === "PUT") {
    mainLinkId = String(body.touchpointId);
    return null;
  }
  if (linkId && method === "PUT") {
    const link = context.touchpoints.find((item) => item.id === linkId);
    const slug = String(body.slug ?? "");
    if (!link)
      throw new ApiRequestError(
        "No encontramos ese QR o etiqueta.",
        404,
        "NOT_FOUND",
      );
    if (taken(context.touchpoints, slug, linkId))
      throw new ApiRequestError(
        "Ya usas esa dirección en otro de tus links. Prueba otra.",
        409,
        "SLUG_TAKEN",
      );
    const changedAt =
      typeof link.slugChangedAt === "string" ? link.slugChangedAt : null;
    if (
      link.slug &&
      link.slug !== slug &&
      changedAt &&
      Date.now() - new Date(changedAt).getTime() < 7 * 24 * 60 * 60 * 1000
    )
      throw new ApiRequestError(
        "Ya cambiaste la dirección de este link esta semana. Puedes volver a cambiarla 7 días después del último cambio.",
        429,
        "SLUG_CHANGE_TOO_SOON",
      );
    // The first address is free; every later change starts the 7 days.
    if (link.slug && link.slug !== slug)
      link.slugChangedAt = new Date().toISOString();
    link.slug = slug;
    // A link is named by its address (owner, 2026-10-04).
    link.operationalName = `/${slug}`;
    if (!mainLinkId) mainLinkId = String(link.id);
    return link;
  }
  if (!query && !linkId && method === "POST") {
    if (!context.businessSlug())
      throw new ApiRequestError(
        "Primero elige la dirección de tu negocio, en Links o en Configuración.",
        409,
        "BUSINESS_SLUG_REQUIRED",
      );
    const slug = String(body.slug ?? "");
    if (taken(context.touchpoints, slug))
      throw new ApiRequestError(
        "Ya usas esa dirección en otro de tus links. Prueba otra.",
        409,
        "SLUG_TAKEN",
      );
    const experience = context.experiences.find(
      (item) => item.id === body.experienceId,
    );
    if (!experience)
      throw new ApiRequestError("No encontramos esa página.", 404, "NOT_FOUND");
    const link: Row = {
      id: crypto.randomUUID(),
      publicId: crypto.randomUUID().replaceAll("-", ""),
      operationalName: `/${slug}`,
      physicalType: "other",
      kind: "link",
      handle: null,
      slug,
      slugChangedAt: null,
      groupId: null,
      status: "assigned",
      createdAt: new Date().toISOString(),
      live: null,
    };
    context.touchpoints.unshift(link);
    const targets = (experience.targets as
      | { touchpointIds: string[]; groupIds: string[] }
      | undefined) ?? { touchpointIds: [], groupIds: [] };
    experience.targets = {
      touchpointIds: [...targets.touchpointIds, String(link.id)],
      groupIds: targets.groupIds,
    };
    if (!mainLinkId) mainLinkId = String(link.id);
    return link;
  }
  return undefined;
}
