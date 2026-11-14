import { DurableObject } from "cloudflare:workers";
import { businessSlugKey, isReservedBusinessSlug } from "@kardo/contracts";
import { isPublicId, isRecord } from "./snapshot.js";

/**
 * Links, phase 3b (relevo 34): kardo.com.mx/<negocio> opens the business's
 * main link and kardo.com.mx/<negocio>/<link> each link. The Customer API
 * sends the whole state of one business after every change (POST
 * /internal/business); this Worker keeps it in one Durable Object per
 * business address, named by its key («cafe-nube» and «cafenube» are the
 * same business, as in the database).
 */

/** What the API sends: kardo_core.business_link_routes(), as is. */
export type BusinessRoutes = {
  slug: string;
  previousSlugs: string[];
  mainPublicId: string | null;
  links: { slug: string; publicId: string }[];
  linkRedirects: { from: string; to: string }[];
};

/** What one business address holds: its links, or where it moved. */
type StoredBusiness =
  | {
      slug: string;
      mainPublicId: string | null;
      /** Link key → its address and public ID. */
      links: Record<string, { slug: string; publicId: string }>;
      /** Former link key → the link's current address. */
      linkRedirects: Record<string, string>;
    }
  | { movedTo: string };

const slugPattern = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;
const maxLinks = 1_000;

function isSlug(value: unknown): value is string {
  return typeof value === "string" && slugPattern.test(value);
}

export function parseBusinessCommand(value: unknown): BusinessRoutes | null {
  if (!isRecord(value) || !isSlug(value.slug)) return null;
  const { previousSlugs, mainPublicId, links, linkRedirects } = value;
  if (
    !Array.isArray(previousSlugs) ||
    !previousSlugs.every(isSlug) ||
    previousSlugs.length > maxLinks
  )
    return null;
  if (mainPublicId !== null && !isPublicId(mainPublicId)) return null;
  if (
    !Array.isArray(links) ||
    links.length > maxLinks ||
    !links.every(
      (link) =>
        isRecord(link) && isSlug(link.slug) && isPublicId(link.publicId),
    )
  )
    return null;
  if (
    !Array.isArray(linkRedirects) ||
    linkRedirects.length > maxLinks ||
    !linkRedirects.every(
      (item) => isRecord(item) && isSlug(item.from) && isSlug(item.to),
    )
  )
    return null;
  return {
    slug: value.slug,
    previousSlugs: previousSlugs as string[],
    mainPublicId: mainPublicId as string | null,
    links: (links as Record<string, unknown>[]).map((link) => ({
      slug: link.slug as string,
      publicId: link.publicId as string,
    })),
    linkRedirects: (linkRedirects as Record<string, unknown>[]).map((item) => ({
      from: item.from as string,
      to: item.to as string,
    })),
  };
}

/** One instance per business address key (`getByName(businessSlugKey)`). */
export class BusinessState extends DurableObject {
  async get(): Promise<StoredBusiness | null> {
    return (await this.ctx.storage.get<StoredBusiness>("business")) ?? null;
  }

  async replace(routes: BusinessRoutes): Promise<void> {
    const links: Record<string, { slug: string; publicId: string }> = {};
    for (const link of routes.links)
      links[businessSlugKey(link.slug)] = {
        slug: link.slug,
        publicId: link.publicId,
      };
    const linkRedirects: Record<string, string> = {};
    for (const item of routes.linkRedirects)
      linkRedirects[businessSlugKey(item.from)] = item.to;
    await this.ctx.storage.put<StoredBusiness>("business", {
      slug: routes.slug,
      mainPublicId: routes.mainPublicId,
      links,
      linkRedirects,
    });
  }

  /** A former address: it leads to the current one. */
  async moveTo(slug: string): Promise<void> {
    await this.ctx.storage.put<StoredBusiness>("business", { movedTo: slug });
  }
}

/** Applies one business's state: its address gets the links, every former
 * address leads to it. */
export async function applyBusinessRoutes(
  namespace: DurableObjectNamespace<BusinessState>,
  routes: BusinessRoutes,
): Promise<void> {
  const key = businessSlugKey(routes.slug);
  await namespace.getByName(key).replace(routes);
  for (const previous of routes.previousSlugs) {
    const previousKey = businessSlugKey(previous);
    if (previousKey !== key)
      await namespace.getByName(previousKey).moveTo(routes.slug);
  }
}

/** `/<negocio>` or `/<negocio>/<link>` (a trailing slash and capitals are
 * tolerated: the answer redirects to the exact address). */
export function businessPathFromPath(
  pathname: string,
): { business: string; link: string | null } | null {
  const parts = pathname.replace(/\/$/, "").split("/").slice(1);
  if (parts.length < 1 || parts.length > 2) return null;
  const [business, link] = parts.map((part) => part.toLowerCase());
  if (!isSlug(business) || (link !== undefined && !isSlug(link))) return null;
  return { business, link: link ?? null };
}

/** What a business path resolves to. */
export type BusinessAnswer =
  | { kind: "site" }
  | { kind: "unknownBusiness" }
  | { kind: "noMainLink" }
  | { kind: "unknownLink" }
  | { kind: "redirect"; path: string }
  | { kind: "serve"; publicId: string };

export async function answerBusinessPath(
  namespace: DurableObjectNamespace<BusinessState>,
  pathname: string,
  path: { business: string; link: string | null },
): Promise<BusinessAnswer> {
  if (isReservedBusinessSlug(path.business)) return { kind: "site" };
  const stored = await namespace
    .getByName(businessSlugKey(path.business))
    .get();
  if (!stored) return { kind: "unknownBusiness" };
  const at = (business: string, link: string | null) =>
    link ? `/${business}/${link}` : `/${business}`;
  if ("movedTo" in stored)
    return { kind: "redirect", path: at(stored.movedTo, path.link) };

  if (!path.link) {
    if (pathname !== at(stored.slug, null))
      return { kind: "redirect", path: at(stored.slug, null) };
    return stored.mainPublicId
      ? { kind: "serve", publicId: stored.mainPublicId }
      : { kind: "noMainLink" };
  }
  const key = businessSlugKey(path.link);
  const link = stored.links[key];
  if (link) {
    if (pathname !== at(stored.slug, link.slug))
      return { kind: "redirect", path: at(stored.slug, link.slug) };
    return { kind: "serve", publicId: link.publicId };
  }
  const movedLink = stored.linkRedirects[key];
  if (movedLink) return { kind: "redirect", path: at(stored.slug, movedLink) };
  return { kind: "unknownLink" };
}
