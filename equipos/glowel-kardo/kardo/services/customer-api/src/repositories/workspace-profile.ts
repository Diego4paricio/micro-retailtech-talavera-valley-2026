import {
  applyWorkspaceProfilePatch,
  imageMediaTypes,
  type WorkspaceProfile,
  type WorkspaceProfilePatch,
} from "@kardo/contracts";
import { normalizePublicHttpsUrl } from "@kardo/domain";
import type { Sql } from "postgres";
import { ContentValidationError, NotFoundError } from "../errors.js";
import {
  type CustomerIdentity,
  insertAuditEvent,
  requireMembership,
  requireMembershipWithPermission,
  withCustomerContext,
} from "./context.js";

type JsonValue = Parameters<Sql["json"]>[0];

export type WorkspaceProfileRepository = {
  getProfile(
    identity: CustomerIdentity,
    workspaceId: string,
  ): Promise<WorkspaceProfile>;
  updateProfile(
    identity: CustomerIdentity,
    workspaceId: string,
    profile: WorkspaceProfile,
  ): Promise<WorkspaceProfile>;
  /** Changes only the fields in `patch` (`null` removes one) on top of the
   * stored profile, inside one transaction (domain audit A2-1). */
  patchProfile(
    identity: CustomerIdentity,
    workspaceId: string,
    patch: WorkspaceProfilePatch,
  ): Promise<WorkspaceProfile>;
};

export class WorkspaceProfileRepositoryError extends Error {}

export function unavailableWorkspaceProfileRepository(): WorkspaceProfileRepository {
  const unavailable = () =>
    Promise.reject(
      new WorkspaceProfileRepositoryError("Profile storage is not configured."),
    );
  return {
    getProfile: unavailable,
    updateProfile: unavailable,
    patchProfile: unavailable,
  };
}

/** Pure checks the schema cannot express (URL safety, IANA time zone). */
export function normalizeWorkspaceProfile(
  profile: WorkspaceProfile,
): WorkspaceProfile {
  const next: WorkspaceProfile = { ...profile };
  if (next.about !== undefined) {
    const about = next.about.replace(/\s+/g, " ").trim();
    if (about) next.about = about;
    else delete next.about;
  }
  if (next.hours !== undefined) {
    const hours = next.hours.replace(/\s+/g, " ").trim();
    if (hours) next.hours = hours;
    else delete next.hours;
  }
  if (next.address !== undefined) {
    const address = next.address.replace(/\s+/g, " ").trim();
    if (address) next.address = address;
    else delete next.address;
  }
  if (next.website) {
    const website = normalizePublicHttpsUrl(next.website);
    if (!website) {
      throw new ContentValidationError(
        "INVALID_WORKSPACE_PROFILE",
        "El sitio web debe ser una dirección HTTPS completa.",
      );
    }
    next.website = website;
  }
  if (next.timezone) {
    try {
      new Intl.DateTimeFormat("es-MX", { timeZone: next.timezone });
    } catch {
      throw new ContentValidationError(
        "INVALID_WORKSPACE_PROFILE",
        "La zona horaria no es válida.",
      );
    }
  }
  const background = next.defaultTheme?.background;
  if (background?.kind === "gradient" && !background.colorTo) {
    throw new ContentValidationError(
      "INVALID_WORKSPACE_PROFILE",
      "Un fondo degradado necesita un segundo color.",
    );
  }
  if (background?.kind === "image" && !background.imageAssetId) {
    throw new ContentValidationError(
      "INVALID_WORKSPACE_PROFILE",
      "Un fondo de imagen necesita una imagen de tu biblioteca.",
    );
  }
  return next;
}

async function assertImageAssets(
  tx: Sql,
  workspaceId: string,
  assetIds: readonly string[],
): Promise<void> {
  if (assetIds.length === 0) return;
  const rows = await tx<{ id: string }[]>`
    select id from kardo_core.assets
    where id = any(${[...assetIds]}::uuid[])
      and workspace_id = ${workspaceId}::uuid
      and status = 'validated'
      and media_type = any(${[...imageMediaTypes]}::text[])
  `;
  if (rows.length !== new Set(assetIds).size) {
    throw new ContentValidationError(
      "INVALID_WORKSPACE_PROFILE",
      "El logo, la portada y la imagen de fondo deben ser imágenes validadas de tu biblioteca.",
    );
  }
}

export function createPostgresWorkspaceProfileRepository(
  sql: Sql,
): WorkspaceProfileRepository {
  return {
    async getProfile(identity, workspaceId) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembership(tx, identity, workspaceId);
        const rows = await tx<{ profile: WorkspaceProfile }[]>`
          select profile from kardo_core.workspaces where id = ${workspaceId}::uuid
        `;
        const row = rows[0];
        if (!row) throw new NotFoundError("Workspace was not found.");
        return row.profile;
      });
    },
    async updateProfile(identity, workspaceId, input) {
      const profile = normalizeWorkspaceProfile(input);
      return withCustomerContext(sql, identity, async (tx) => {
        // The business's own data (giro, phone, hours…) is not content and
        // publishes nothing, so it can be kept up to date without a plan:
        // «Crear organización» saves it right after creating an
        // organization that has no plan yet (2026-10-03 study, finding 7).
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "workspace.manage",
          { allowWithoutPlan: true },
        );
        const assetIds = [
          profile.logoAssetId,
          profile.coverAssetId,
          profile.defaultTheme?.background.imageAssetId,
        ].filter((value): value is string => typeof value === "string");
        await assertImageAssets(tx, workspaceId, assetIds);
        const rows = await tx<{ profile: WorkspaceProfile }[]>`
          update kardo_core.workspaces
          set profile = ${tx.json(profile as JsonValue)}, updated_at = now()
          where id = ${workspaceId}::uuid
          returning profile
        `;
        const row = rows[0];
        if (!row) throw new NotFoundError("Workspace was not found.");
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "workspace.profile_updated",
          targetType: "workspace",
          targetId: workspaceId,
          result: "succeeded",
          metadata: { fields: Object.keys(profile) },
        });
        return row.profile;
      });
    },
    async patchProfile(identity, workspaceId, patch) {
      return withCustomerContext(sql, identity, async (tx) => {
        // Same gate as the full update: the business's own data publishes
        // nothing, so it can be kept up to date without a plan.
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "workspace.manage",
          { allowWithoutPlan: true },
        );
        const rows = await tx<{ profile: WorkspaceProfile }[]>`
          select profile from kardo_core.workspaces
          where id = ${workspaceId}::uuid
          for update
        `;
        const stored = rows[0];
        if (!stored) throw new NotFoundError("Workspace was not found.");
        const profile = normalizeWorkspaceProfile(
          applyWorkspaceProfilePatch(stored.profile ?? {}, patch),
        );
        // Only the images this change sets are checked: a logo that was
        // already stored must not block saving the phone (A2-1).
        const assetIds = [
          patch.logoAssetId,
          patch.coverAssetId,
          patch.defaultTheme?.background.imageAssetId,
        ].filter((value): value is string => typeof value === "string");
        await assertImageAssets(tx, workspaceId, assetIds);
        const updated = await tx<{ profile: WorkspaceProfile }[]>`
          update kardo_core.workspaces
          set profile = ${tx.json(profile as JsonValue)}, updated_at = now()
          where id = ${workspaceId}::uuid
          returning profile
        `;
        const row = updated[0];
        if (!row) throw new NotFoundError("Workspace was not found.");
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "workspace.profile_updated",
          targetType: "workspace",
          targetId: workspaceId,
          result: "succeeded",
          metadata: { fields: Object.keys(patch) },
        });
        return row.profile;
      });
    },
  };
}
