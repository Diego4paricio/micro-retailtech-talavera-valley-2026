import {
  type BusinessSlugAvailability,
  businessSlugCandidates,
  businessSlugFormatError,
  isReservedBusinessSlug,
} from "@kardo/contracts";
import type { Sql } from "postgres";
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

/**
 * The business's public address, kardo.com.mx/<slug> (Links redesign,
 * owner, 2026-10-04). The database owns uniqueness, the 7-day rule and the
 * history of old addresses (`kardo_core.set_workspace_slug`); this module
 * adds the reserved list and the recommendation, which never uses numbers.
 */
export type BusinessSlugRepository = {
  /** The first free recommendation for this name, city and giro. */
  suggest(
    identity: CustomerIdentity,
    workspaceId: string,
    input: {
      name: string;
      city?: string | undefined;
      industry?: string | undefined;
    },
  ): Promise<string | null>;
  check(
    identity: CustomerIdentity,
    workspaceId: string,
    slug: string,
    context: {
      name: string;
      city?: string | undefined;
      industry?: string | undefined;
    },
  ): Promise<BusinessSlugAvailability>;
  set(
    identity: CustomerIdentity,
    workspaceId: string,
    slug: string,
  ): Promise<string>;
};

export class BusinessSlugRepositoryError extends Error {}

export function unavailableBusinessSlugRepository(): BusinessSlugRepository {
  const unavailable = () =>
    Promise.reject(
      new BusinessSlugRepositoryError(
        "Business address storage is not configured.",
      ),
    );
  return { suggest: unavailable, check: unavailable, set: unavailable };
}

const slugMessages = {
  SLUG_TAKEN: "Esa dirección ya la usa otro negocio. Prueba otra.",
  SLUG_RESERVED: "Esa dirección está reservada. Prueba otra.",
  SLUG_CHANGE_TOO_SOON:
    "Ya cambiaste tu dirección esta semana. Puedes volver a cambiarla 7 días después del último cambio.",
} as const;

async function isFree(
  tx: Sql,
  slug: string,
  workspaceId: string,
): Promise<boolean> {
  const [row] = await tx<{ available: boolean }[]>`
    select kardo_core.workspace_slug_available(${slug}, ${workspaceId}::uuid) as available
  `;
  return row?.available === true;
}

async function firstFree(
  tx: Sql,
  workspaceId: string,
  input: {
    name: string;
    city?: string | undefined;
    industry?: string | undefined;
  },
  skip?: string,
): Promise<string | null> {
  for (const candidate of businessSlugCandidates(input)) {
    if (candidate === skip) continue;
    if (await isFree(tx, candidate, workspaceId)) return candidate;
  }
  return null;
}

export function createPostgresBusinessSlugRepository(
  sql: Sql,
  options: { resolver?: BusinessRoutesClient | null } = {},
): BusinessSlugRepository {
  return {
    async suggest(identity, workspaceId, input) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembership(tx, identity, workspaceId);
        return firstFree(tx, workspaceId, input);
      });
    },
    async check(identity, workspaceId, slug, context) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembership(tx, identity, workspaceId);
        if (businessSlugFormatError(slug))
          return { available: false, reason: "format" };
        const suggestion = () => firstFree(tx, workspaceId, context, slug);
        if (isReservedBusinessSlug(slug))
          return {
            available: false,
            reason: "reserved",
            suggestion: await suggestion(),
          };
        if (!(await isFree(tx, slug, workspaceId)))
          return {
            available: false,
            reason: "taken",
            suggestion: await suggestion(),
          };
        return { available: true };
      });
    },
    async set(identity, workspaceId, slug) {
      if (businessSlugFormatError(slug))
        throw new ApiError(
          "SLUG_INVALID",
          400,
          businessSlugFormatError(slug) ?? "",
        );
      if (isReservedBusinessSlug(slug))
        throw new ApiError("SLUG_RESERVED", 400, slugMessages.SLUG_RESERVED);
      return withCustomerContext(sql, identity, async (tx) => {
        // The business's identity, like its profile: no plan needed.
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "workspace.manage",
          {
            allowWithoutPlan: true,
          },
        );
        let saved: string;
        try {
          const [row] = await tx<{ slug: string }[]>`
            select kardo_core.set_workspace_slug(${workspaceId}::uuid, ${slug}) as slug
          `;
          saved = row?.slug ?? slug;
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (message === "SLUG_TAKEN")
            throw new ConflictError("SLUG_TAKEN", slugMessages.SLUG_TAKEN);
          if (message === "SLUG_CHANGE_TOO_SOON")
            throw new ApiError(
              "SLUG_CHANGE_TOO_SOON",
              429,
              slugMessages.SLUG_CHANGE_TOO_SOON,
            );
          if (message === "SLUG_INVALID")
            throw new ApiError(
              "SLUG_INVALID",
              400,
              businessSlugFormatError(slug) ?? "",
            );
          if (message === "NOT_FOUND")
            throw new NotFoundError("Workspace was not found.");
          throw error;
        }
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "workspace.slug_set",
          targetType: "workspace",
          targetId: workspaceId,
          result: "succeeded",
          metadata: { slug: saved },
        });
        // kardo.com.mx/<new> serves the links; the old one leads there.
        await syncBusinessRoutes(tx, options.resolver, workspaceId);
        return saved;
      });
    },
  };
}
