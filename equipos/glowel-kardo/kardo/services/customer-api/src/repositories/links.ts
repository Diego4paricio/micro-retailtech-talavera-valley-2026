import {
  type CreateLink,
  type LinkSlugAvailability,
  linkSlugCandidates,
  linkSlugFormatError,
  type Touchpoint,
} from "@kardo/contracts";
import type { Sql } from "postgres";
import { assertWithinLimit } from "../billing/entitlements.js";
import { syncBusinessRoutes } from "../business-routes.js";
import { ApiError, ConflictError, NotFoundError } from "../errors.js";
import type { BusinessRoutesClient } from "../resolver-clients/business-routes.js";
import {
  type CustomerIdentity,
  insertAuditEvent,
  requireMembership,
  requireMembershipWithPermission,
  withCustomerContext,
} from "./context.js";
import {
  fetchTouchpointById,
  insertTouchpoint,
  toTouchpoint,
} from "./touchpoints.js";

/**
 * Links with their own address, kardo.com.mx/<negocio>/<link> (Links
 * redesign, owner, 2026-10-04). A Link is born showing an Experience: the
 * owner picks what it shows and its address in one step, with the address
 * checked before creating. The database owns uniqueness inside the
 * business, the 7-day rule and the old addresses
 * (`kardo_core.set_link_slug`).
 */
export type LinkRepository = {
  /** The first free recommendation inside the business, or null. */
  suggestSlug(
    identity: CustomerIdentity,
    workspaceId: string,
    input: { name: string; type?: string | undefined },
  ): Promise<string | null>;
  checkSlug(
    identity: CustomerIdentity,
    workspaceId: string,
    slug: string,
    context: {
      name?: string | undefined;
      type?: string | undefined;
      touchpointId?: string | undefined;
    },
  ): Promise<LinkSlugAvailability>;
  /** Creates the Link with its address and puts it among the Experience's
   * destinations. Publishing is the caller's next step (the Experience's
   * usual publish), so plan and content checks stay in one place. */
  createLink(
    identity: CustomerIdentity,
    workspaceId: string,
    input: CreateLink,
  ): Promise<Touchpoint>;
  setSlug(
    identity: CustomerIdentity,
    workspaceId: string,
    touchpointId: string,
    slug: string,
  ): Promise<Touchpoint>;
  setMainLink(
    identity: CustomerIdentity,
    workspaceId: string,
    touchpointId: string,
  ): Promise<void>;
};

export class LinkRepositoryError extends Error {}

export function unavailableLinkRepository(): LinkRepository {
  const unavailable = () =>
    Promise.reject(new LinkRepositoryError("Link storage is not configured."));
  return {
    suggestSlug: unavailable,
    checkSlug: unavailable,
    createLink: unavailable,
    setSlug: unavailable,
    setMainLink: unavailable,
  };
}

const linkMessages = {
  SLUG_TAKEN: "Ya usas esa dirección en otro de tus links. Prueba otra.",
  SLUG_CHANGE_TOO_SOON:
    "Ya cambiaste la dirección de este link esta semana. Puedes volver a cambiarla 7 días después del último cambio.",
  BUSINESS_SLUG_REQUIRED:
    "Primero elige la dirección de tu negocio, en Links o en Configuración.",
  NOT_A_LINK: "Ese touchpoint no es un link activo.",
} as const;

async function isFree(
  tx: Sql,
  workspaceId: string,
  slug: string,
  touchpointId: string | null,
): Promise<boolean> {
  const [row] = await tx<{ available: boolean }[]>`
    select kardo_core.link_slug_available(
      ${workspaceId}::uuid, ${slug}, ${touchpointId}::uuid
    ) as available
  `;
  return row?.available === true;
}

async function firstFree(
  tx: Sql,
  workspaceId: string,
  input: { name: string; type?: string | undefined },
  skip?: string,
): Promise<string | null> {
  for (const candidate of linkSlugCandidates(input)) {
    if (candidate === skip) continue;
    if (await isFree(tx, workspaceId, candidate, null)) return candidate;
  }
  return null;
}

/** `set_link_slug` raises plain codes; these are the API's answers. */
async function setLinkSlug(
  tx: Sql,
  touchpointId: string,
  slug: string,
): Promise<string> {
  try {
    const [row] = await tx<{ slug: string }[]>`
      select kardo_core.set_link_slug(${touchpointId}::uuid, ${slug}) as slug
    `;
    return row?.slug ?? slug;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "SLUG_TAKEN")
      throw new ConflictError("SLUG_TAKEN", linkMessages.SLUG_TAKEN);
    if (message === "SLUG_CHANGE_TOO_SOON")
      throw new ApiError(
        "SLUG_CHANGE_TOO_SOON",
        429,
        linkMessages.SLUG_CHANGE_TOO_SOON,
      );
    if (message === "SLUG_INVALID")
      throw new ApiError("SLUG_INVALID", 400, linkSlugFormatError(slug) ?? "");
    if (message === "NOT_A_LINK")
      throw new ApiError("NOT_A_LINK", 400, linkMessages.NOT_A_LINK);
    if (message === "NOT_FOUND")
      throw new NotFoundError("Touchpoint was not found.");
    throw error;
  }
}

export function createPostgresLinkRepository(
  sql: Sql,
  options: { resolver?: BusinessRoutesClient | null } = {},
): LinkRepository {
  return {
    async suggestSlug(identity, workspaceId, input) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembership(tx, identity, workspaceId);
        return firstFree(tx, workspaceId, input);
      });
    },
    async checkSlug(identity, workspaceId, slug, context) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembership(tx, identity, workspaceId);
        if (linkSlugFormatError(slug))
          return { available: false, reason: "format" };
        if (await isFree(tx, workspaceId, slug, context.touchpointId ?? null))
          return { available: true };
        return {
          available: false,
          reason: "taken",
          suggestion: context.name
            ? await firstFree(
                tx,
                workspaceId,
                { name: context.name, type: context.type },
                slug,
              )
            : null,
        };
      });
    },
    async createLink(identity, workspaceId, input) {
      if (linkSlugFormatError(input.slug))
        throw new ApiError(
          "SLUG_INVALID",
          400,
          linkSlugFormatError(input.slug) ?? "",
        );
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "touchpoints.manage",
        );
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "experiences.edit",
        );
        const [business] = await tx<{ slug: string | null }[]>`
          select slug from kardo_core.workspaces where id = ${workspaceId}::uuid
        `;
        if (!business?.slug)
          throw new ConflictError(
            "BUSINESS_SLUG_REQUIRED",
            linkMessages.BUSINESS_SLUG_REQUIRED,
          );
        const [experience] = await tx<{ id: string; name: string }[]>`
          select id, name from kardo_core.experiences
          where id = ${input.experienceId}::uuid
            and workspace_id = ${workspaceId}::uuid
            and archived_at is null
          for update
        `;
        if (!experience) throw new NotFoundError("Experience was not found.");
        await assertWithinLimit(tx, workspaceId, "links.max");

        // A link is named by its address (owner, 2026-10-04): `name` is
        // ignored, so the list, Analítica and the Resolver all read «/menu».
        const created = await insertTouchpoint(tx, workspaceId, {
          operationalName: `/${input.slug}`,
          kind: "link",
          groupId: null,
        });
        const slug = await setLinkSlug(tx, created.id, input.slug);
        // One more destination of the Experience; the ones it had stay.
        await tx`
          insert into kardo_core.experience_targets (experience_id, workspace_id, touchpoint_id)
          values (${experience.id}::uuid, ${workspaceId}::uuid, ${created.id}::uuid)
          on conflict do nothing
        `;
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "link.created",
          targetType: "touchpoint",
          targetId: created.id,
          result: "succeeded",
          metadata: { slug, experienceId: experience.id },
        });
        await syncBusinessRoutes(tx, options.resolver, workspaceId);
        const row = await fetchTouchpointById(tx, created.id);
        if (!row) throw new LinkRepositoryError("Link was not created.");
        return toTouchpoint(row);
      });
    },
    async setSlug(identity, workspaceId, touchpointId, slug) {
      if (linkSlugFormatError(slug))
        throw new ApiError(
          "SLUG_INVALID",
          400,
          linkSlugFormatError(slug) ?? "",
        );
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "touchpoints.manage",
        );
        const [owned] = await tx<{ id: string }[]>`
          select id from kardo_core.touchpoints
          where id = ${touchpointId}::uuid and workspace_id = ${workspaceId}::uuid
        `;
        if (!owned) throw new NotFoundError("Touchpoint was not found.");
        const saved = await setLinkSlug(tx, touchpointId, slug);
        // The name follows the address (a link is named by it).
        await tx`
          update kardo_core.touchpoints
          set operational_name = ${`/${saved}`}
          where id = ${touchpointId}::uuid
        `;
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "link.slug_set",
          targetType: "touchpoint",
          targetId: touchpointId,
          result: "succeeded",
          metadata: { slug: saved },
        });
        // The new address serves it; the old one leads there.
        await syncBusinessRoutes(tx, options.resolver, workspaceId);
        const row = await fetchTouchpointById(tx, touchpointId);
        if (!row) throw new NotFoundError("Touchpoint was not found.");
        return toTouchpoint(row);
      });
    },
    async setMainLink(identity, workspaceId, touchpointId) {
      await withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "touchpoints.manage",
        );
        try {
          await tx`select kardo_core.set_main_link(${workspaceId}::uuid, ${touchpointId}::uuid)`;
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (message === "NOT_A_LINK")
            throw new ApiError("NOT_A_LINK", 400, linkMessages.NOT_A_LINK);
          throw error;
        }
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "link.main_set",
          targetType: "touchpoint",
          targetId: touchpointId,
          result: "succeeded",
          metadata: {},
        });
        await syncBusinessRoutes(tx, options.resolver, workspaceId);
      });
    },
  };
}
