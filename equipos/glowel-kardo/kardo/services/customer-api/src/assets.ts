import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  ASSET_MAX_BYTES,
  type Asset,
  type AssetUploadRequest,
  type AssetUsage,
  assetMediaTypes,
  imageMediaTypes,
} from "@kardo/contracts";
import type { Sql } from "postgres";
import { assertWithinLimit } from "./billing/entitlements.js";
import { ConflictError, NotFoundError, UnavailableError } from "./errors.js";
import {
  type CustomerIdentity,
  insertAuditEvent,
  requireMembership,
  requireMembershipWithPermission,
  withCustomerContext,
} from "./repositories/context.js";
import { detachQrLogoAsset } from "./repositories/qr-designs.js";

const maxUploadBytes = ASSET_MAX_BYTES;

type ImageMediaType = (typeof imageMediaTypes)[number];

export type AssetRepository = {
  listAssets(
    identity: CustomerIdentity,
    workspaceId: string,
  ): Promise<readonly Asset[]>;
  beginUpload(
    identity: CustomerIdentity,
    workspaceId: string,
    input: AssetUploadRequest,
  ): Promise<{ asset: Asset; storageKey: string }>;
  finalize(
    identity: CustomerIdentity,
    workspaceId: string,
    assetId: string,
    result: AssetValidationResult,
  ): Promise<Asset>;
  lookupQuarantined(
    identity: CustomerIdentity,
    workspaceId: string,
    assetId: string,
  ): Promise<{ storageKey: string; mediaType: string; byteSize: number }>;
  /** A validated library image any member may read (e.g. the brand logo). */
  lookupReadableImage(
    identity: CustomerIdentity,
    workspaceId: string,
    assetId: string,
  ): Promise<{
    derivativeKey: string;
    mediaType: ImageMediaType;
    filename: string;
  }>;
  /** The Experiences that keep this file in use (an active draft or a live
   * version); any member may read it. */
  assetUsage(
    identity: CustomerIdentity,
    workspaceId: string,
    assetId: string,
  ): Promise<AssetUsage>;
  /** Renames a library file (`assets.manage`); Experiences keep using it. */
  renameAsset(
    identity: CustomerIdentity,
    workspaceId: string,
    assetId: string,
    filename: string,
  ): Promise<Asset>;
  /** Soft-deletes an asset no active Experience uses and removes its stored
   * files through the Assets Worker before committing. */
  deleteAsset(
    identity: CustomerIdentity,
    workspaceId: string,
    assetId: string,
    worker: AssetWorkerClient,
  ): Promise<void>;
};

export type AssetValidationResult = {
  status: "validated" | "rejected";
  byteSize?: number;
  sha256?: string;
  derivativeKey?: string;
  reason?: string;
};

export class AssetRepositoryError extends Error {}

export type AssetWorkerClient = {
  uploadUrl(input: {
    assetId: string;
    storageKey: string;
    expiresAt: Date;
  }): string;
  /** Short-lived capability to read one sanitized image derivative. */
  readUrl(input: {
    assetId: string;
    derivativeKey: string;
    expiresAt: Date;
  }): string;
  validate(input: {
    assetId: string;
    storageKey: string;
    expectedMediaType: string;
    expectedByteSize: number;
  }): Promise<AssetValidationResult>;
  deleteObjects(input: {
    assetId: string;
    storageKey: string;
    sha256: string | null;
    deleteDerivative: boolean;
  }): Promise<void>;
};

export function unavailableAssetRepository(): AssetRepository {
  const unavailable = () =>
    Promise.reject(
      new AssetRepositoryError("Asset storage is not configured."),
    );
  return {
    listAssets: unavailable,
    beginUpload: unavailable,
    finalize: unavailable,
    lookupQuarantined: unavailable,
    lookupReadableImage: unavailable,
    assetUsage: unavailable,
    renameAsset: unavailable,
    deleteAsset: unavailable,
  };
}

/**
 * Experiences that keep an asset in use: an active (not archived) draft that
 * mentions it, or a version live on a Touchpoint (pending, processing or
 * published, not superseded). Asset IDs are UUIDs, so a text match on the
 * JSON content is exact enough. Deleting refuses while any remains.
 */
async function experiencesUsingAsset(
  tx: Sql,
  workspaceId: string,
  assetId: string,
  limit: number,
): Promise<{ id: string; name: string; live: boolean }[]> {
  return tx<{ id: string; name: string; live: boolean }[]>`
    select e.id, e.name, exists (
        select 1
        from kardo_core.experience_versions ev
        join kardo_core.publications p on p.experience_version_id = ev.id
        where ev.experience_id = e.id
          and p.status in ('pending', 'processing', 'published')
          and p.superseded_at is null
          and position(${assetId} in ev.content::text) > 0
      ) as live
    from kardo_core.experiences e
    where e.workspace_id = ${workspaceId}::uuid
      and (
        (e.archived_at is null and position(${assetId} in e.draft_content::text) > 0)
        or exists (
          select 1
          from kardo_core.experience_versions ev
          join kardo_core.publications p on p.experience_version_id = ev.id
          where ev.experience_id = e.id
            and p.status in ('pending', 'processing', 'published')
            and p.superseded_at is null
            and position(${assetId} in ev.content::text) > 0
        )
      )
    order by e.name, e.id
    limit ${limit}
  `;
}

type ProfileAssetUse = "logo" | "cover" | "background";

const profileUseLabels: Record<ProfileAssetUse, string> = {
  logo: "el logo",
  cover: "la portada",
  background: "el fondo de tus páginas",
};

/**
 * Where the organization's business profile uses an asset (domain audit
 * 2026-10-13, A2-45): deleting the logo left the profile pointing at a
 * deleted file, and from then on no save of the profile went through.
 */
async function profileUsesOfAsset(
  tx: Sql,
  workspaceId: string,
  assetId: string,
): Promise<ProfileAssetUse[]> {
  const [row] = await tx<
    { logo: boolean; cover: boolean; background: boolean }[]
  >`
    select
      coalesce(profile->>'logoAssetId' = ${assetId}, false) as logo,
      coalesce(profile->>'coverAssetId' = ${assetId}, false) as cover,
      coalesce(
        profile->'defaultTheme'->'background'->>'imageAssetId' = ${assetId},
        false
      ) as background
    from kardo_core.workspaces
    where id = ${workspaceId}::uuid
  `;
  if (!row) return [];
  return (["logo", "cover", "background"] as const).filter((use) => row[use]);
}

/** QR designs (own or from the library) that show the asset as their logo. */
async function qrLogoCountOfAsset(
  tx: Sql,
  workspaceId: string,
  assetId: string,
): Promise<number> {
  const [row] = await tx<{ count: number }[]>`
    select (
      (select count(t.id) from kardo_core.touchpoints t
        where t.workspace_id = ${workspaceId}::uuid
          and t.qr_design->'logo'->>'assetId' = ${assetId})
      + (select count(q.id) from kardo_core.qr_design_templates q
        where q.workspace_id = ${workspaceId}::uuid
          and q.design->'logo'->>'assetId' = ${assetId})
    )::int as count
  `;
  return row?.count ?? 0;
}

/** Strips control characters and path separators from a customer-supplied
 * filename before it is stored. The stored value later shows up verbatim in
 * the panel and in CSV exports, so it must never carry a path fragment or a
 * terminal/log-injection control character. */
export function sanitizeFilename(filename: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally stripping control characters.
  const withoutControlChars = filename.replace(/[\u0000-\u001f\u007f]/g, "");
  const withoutSeparators = withoutControlChars.replaceAll(/[/\\]/g, "_");
  const trimmed = withoutSeparators.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 255) : "upload";
}

/**
 * The logo of a new organization (relevo 36): «Crear organización» uploads
 * it right after creating it, and a new organization starts without a plan
 * (ADR 020 §4 blocks writes then). Only its first image is let through, and
 * nothing more: without a plan it cannot be deleted to upload another.
 */
async function liveAssetCount(sql: Sql, workspaceId: string): Promise<number> {
  const rows = await sql<{ count: number }[]>`
    select count(*)::int as count from kardo_core.assets
    where workspace_id = ${workspaceId}::uuid and status <> 'deleted'
  `;
  return rows[0]?.count ?? 0;
}

async function isOnlyAsset(
  sql: Sql,
  workspaceId: string,
  assetId: string,
): Promise<boolean> {
  const rows = await sql<{ id: string; media_type: string }[]>`
    select id, coalesce(expected_media_type, media_type) as media_type from kardo_core.assets
    where workspace_id = ${workspaceId}::uuid and status <> 'deleted'
    limit 2
  `;
  return (
    rows.length === 1 &&
    rows[0]?.id === assetId &&
    rows[0].media_type.startsWith("image/")
  );
}

export function createPostgresAssetRepository(sql: Sql): AssetRepository {
  return {
    async listAssets(identity, workspaceId) {
      return withCustomerContext(sql, identity, async (tx) => {
        // Reading the asset library is safe for a read-only viewer; only
        // uploading and finalizing require `assets.manage`.
        await requireMembership(tx, identity, workspaceId);
        const rows = await tx<AssetRow[]>`
          select id, original_filename, media_type, byte_size::int as byte_size, sha256, status, created_at, rejected_reason
          from kardo_core.assets
          where workspace_id = ${workspaceId}::uuid and status <> 'deleted'
          order by created_at desc
        `;
        return rows.map(toAsset);
      });
    },
    async beginUpload(identity, workspaceId, input) {
      if (
        input.byteSize > maxUploadBytes ||
        !allowedMediaType(input.mediaType)
      ) {
        throw new AssetRepositoryError("Unsupported asset upload request.");
      }
      const filename = sanitizeFilename(input.filename);
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "assets.manage",
          {
            allowWithoutPlan:
              input.mediaType.startsWith("image/") &&
              (await liveAssetCount(tx, workspaceId)) === 0,
          },
        );
        await assertWithinLimit(
          tx,
          workspaceId,
          "assets.storage_mb",
          Math.ceil(input.byteSize / (1024 * 1024)),
        );
        const id = randomUUID();
        const storageKey = `originals/${workspaceId}/${id}`;
        const rows = await tx<AssetRow[]>`
          insert into kardo_core.assets (
            id, workspace_id, storage_key, original_filename, media_type, byte_size,
            expected_byte_size, expected_media_type, sha256, status, created_by
          ) values (
            ${id}::uuid, ${workspaceId}::uuid, ${storageKey}, ${filename}, ${input.mediaType}, 0,
            ${input.byteSize}, ${input.mediaType}, ${"0".repeat(64)}, 'quarantined', ${identity.subject}::uuid
          )
          returning id, original_filename, media_type, byte_size::int as byte_size, sha256, status, created_at, rejected_reason
        `;
        const asset = rows[0];
        if (!asset)
          throw new AssetRepositoryError("Asset record was not created.");
        return { asset: toAsset(asset), storageKey };
      });
    },
    async finalize(identity, workspaceId, assetId, result) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "assets.manage",
          { allowWithoutPlan: await isOnlyAsset(tx, workspaceId, assetId) },
        );
        // Re-check the storage quota here, not only at `beginUpload`: a
        // quarantined asset counts as 0 bytes toward usage until it is
        // finalized, so many `beginUpload`s each pass on the same stale total
        // and only blow past the limit when they finalize. This assertion
        // (under the same per-account advisory lock) counts the bytes exactly
        // when they start to count, and rejects the finalize that would exceed
        // the plan (security review 2026-10-12). It runs only for a validated
        // result; a rejected asset adds nothing.
        if (
          result.status === "validated" &&
          typeof result.byteSize === "number"
        )
          await assertWithinLimit(
            tx,
            workspaceId,
            "assets.storage_mb",
            Math.ceil(result.byteSize / (1024 * 1024)),
          );
        const rows = await tx<AssetRow[]>`
          update kardo_core.assets
          set status = ${result.status},
              byte_size = coalesce(${result.byteSize ?? null}, byte_size),
              sha256 = coalesce(${result.sha256 ?? null}, sha256),
              derivative_key = ${result.derivativeKey ?? null},
              validated_at = case when ${result.status} = 'validated' then now() else null end,
              rejected_reason = ${result.reason ?? null}
          where id = ${assetId}::uuid and workspace_id = ${workspaceId}::uuid and status = 'quarantined'
          returning id, original_filename, media_type, byte_size::int as byte_size, sha256, status, created_at, rejected_reason
        `;
        const asset = rows[0];
        if (!asset) throw new NotFoundError("Asset was not found.");
        return toAsset(asset);
      });
    },
    async lookupQuarantined(identity, workspaceId, assetId) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "assets.manage",
          { allowWithoutPlan: await isOnlyAsset(tx, workspaceId, assetId) },
        );
        const rows = await tx<
          {
            storage_key: string;
            expected_media_type: string;
            expected_byte_size: number;
          }[]
        >`
          select storage_key, expected_media_type, expected_byte_size::int as expected_byte_size
          from kardo_core.assets
          where id = ${assetId}::uuid and workspace_id = ${workspaceId}::uuid and status = 'quarantined'
          for update
        `;
        const asset = rows[0];
        if (!asset) throw new NotFoundError("Asset was not found.");
        return {
          storageKey: asset.storage_key,
          mediaType: asset.expected_media_type,
          byteSize: asset.expected_byte_size,
        };
      });
    },
    async lookupReadableImage(identity, workspaceId, assetId) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembership(tx, identity, workspaceId);
        const rows = await tx<
          {
            derivative_key: string | null;
            media_type: string;
            original_filename: string;
          }[]
        >`
          select derivative_key, media_type, original_filename
          from kardo_core.assets
          where id = ${assetId}::uuid
            and workspace_id = ${workspaceId}::uuid
            and status = 'validated'
            and media_type = any(${[...imageMediaTypes]}::text[])
        `;
        const asset = rows[0];
        if (!asset?.derivative_key)
          throw new NotFoundError("Asset was not found.");
        return {
          derivativeKey: asset.derivative_key,
          mediaType: asset.media_type as ImageMediaType,
          filename: asset.original_filename,
        };
      });
    },
    async assetUsage(identity, workspaceId, assetId) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembership(tx, identity, workspaceId);
        const [asset] = await tx<{ id: string }[]>`
          select id from kardo_core.assets
          where id = ${assetId}::uuid and workspace_id = ${workspaceId}::uuid
            and status <> 'deleted'
        `;
        if (!asset) throw new NotFoundError("Asset was not found.");
        return {
          experiences: await experiencesUsingAsset(
            tx,
            workspaceId,
            assetId,
            50,
          ),
          profile: await profileUsesOfAsset(tx, workspaceId, assetId),
          qrLogoCount: await qrLogoCountOfAsset(tx, workspaceId, assetId),
        };
      });
    },
    async renameAsset(identity, workspaceId, assetId, filename) {
      const name = sanitizeFilename(filename);
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "assets.manage",
        );
        const rows = await tx<AssetRow[]>`
          update kardo_core.assets
          set original_filename = ${name}
          where id = ${assetId}::uuid and workspace_id = ${workspaceId}::uuid
            and status <> 'deleted'
          returning id, original_filename, media_type, byte_size::int as byte_size, sha256, status, created_at, rejected_reason
        `;
        const asset = rows[0];
        if (!asset) throw new NotFoundError("Asset was not found.");
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "asset.renamed",
          targetType: "asset",
          targetId: assetId,
          result: "succeeded",
          metadata: { filenameLength: name.length },
        });
        return toAsset(asset);
      });
    },
    async deleteAsset(identity, workspaceId, assetId, worker) {
      await withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "assets.manage",
        );
        const rows = await tx<
          {
            storage_key: string;
            sha256: string;
            derivative_key: string | null;
          }[]
        >`
          select storage_key, sha256, derivative_key
          from kardo_core.assets
          where id = ${assetId}::uuid and workspace_id = ${workspaceId}::uuid and status <> 'deleted'
          for update
        `;
        const asset = rows[0];
        if (!asset) throw new NotFoundError("Asset was not found.");

        // Drafts of active Experiences and versions currently live on a
        // Touchpoint must keep resolving the file.
        const users = await experiencesUsingAsset(tx, workspaceId, assetId, 5);
        if (users.length > 0) {
          throw new ConflictError(
            "ASSET_IN_USE",
            `Este archivo se usa en: ${users.map((user) => user.name).join(", ")}. Quítalo de esas páginas antes de borrarlo.`,
          );
        }
        // The business profile too (A2-45): its logo, cover or background.
        const profileUses = await profileUsesOfAsset(tx, workspaceId, assetId);
        if (profileUses.length > 0) {
          const what = profileUses.map((use) => profileUseLabels[use]);
          const list =
            what.length > 1
              ? `${what.slice(0, -1).join(", ")} y ${what.at(-1)}`
              : what[0];
          throw new ConflictError(
            "ASSET_IN_USE",
            `Este archivo es ${list} de tu negocio. Cámbialo en Configuración → Marca antes de borrarlo.`,
          );
        }

        // The public derivative is named by its content and may be shared
        // with an identical file of ANY workspace, which this customer's RLS
        // cannot see: the database answers only yes or no.
        const shared = await tx<{ shared: boolean }[]>`
          select kardo_private.asset_derivative_shared(${assetId}::uuid) as shared
        `;
        const deleteDerivative =
          asset.derivative_key !== null && !shared[0]?.shared;

        await tx`
          update kardo_core.assets
          set status = 'deleted', deleted_at = now(), derivative_key = null
          where id = ${assetId}::uuid
        `;
        // QR designs keep everything else and simply lose this logo.
        await detachQrLogoAsset(tx, workspaceId, assetId);
        // Remove the stored files before committing; if storage fails the
        // asset stays intact and the customer can retry.
        await worker.deleteObjects({
          assetId,
          storageKey: asset.storage_key,
          sha256: asset.derivative_key ? asset.sha256 : null,
          deleteDerivative,
        });
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "asset.deleted",
          targetType: "asset",
          targetId: assetId,
          result: "succeeded",
          metadata: { derivativeDeleted: deleteDerivative },
        });
      });
    },
  };
}

export function createAssetWorkerClient(input: {
  workerUrl: string;
  signingKey: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}): AssetWorkerClient {
  const base = new URL(input.workerUrl);
  const fetchFn = input.fetchFn ?? fetch;
  const timeoutMs = input.timeoutMs ?? 5_000;
  function signature(value: string): string {
    return createHmac("sha256", input.signingKey).update(value).digest("hex");
  }
  return {
    uploadUrl({ assetId, storageKey, expiresAt }) {
      const expires = Math.floor(expiresAt.getTime() / 1000).toString();
      const payload = `upload\n${assetId}\n${storageKey}\n${expires}`;
      const url = new URL(`/upload/${assetId}`, base);
      url.searchParams.set("key", storageKey);
      url.searchParams.set("expires", expires);
      url.searchParams.set("signature", signature(payload));
      return url.toString();
    },
    readUrl({ assetId, derivativeKey, expiresAt }) {
      const expires = Math.floor(expiresAt.getTime() / 1000).toString();
      const payload = `read\n${assetId}\n${derivativeKey}\n${expires}`;
      const url = new URL(`/content/${assetId}`, base);
      url.searchParams.set("key", derivativeKey);
      url.searchParams.set("expires", expires);
      url.searchParams.set("signature", signature(payload));
      return url.toString();
    },
    async validate(input) {
      // The Worker rejects a non-numeric size; Postgres `bigint` values can
      // arrive as strings, so normalize defensively.
      const payload = JSON.stringify({
        ...input,
        expectedByteSize: Number(input.expectedByteSize),
      });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      try {
        response = await fetchFn(new URL("/internal/validate", base), {
          method: "POST",
          headers: {
            authorization: `Bearer ${signature(payload)}`,
            "content-type": "application/json",
          },
          body: payload,
          signal: controller.signal,
        });
      } catch {
        throw new UnavailableError(
          "ASSET_STORAGE_UNAVAILABLE",
          "Asset validation service is unavailable.",
        );
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok)
        throw new UnavailableError(
          "ASSET_STORAGE_UNAVAILABLE",
          "Asset validation service is unavailable.",
        );
      const value: unknown = await response.json();
      if (!isValidationResult(value))
        throw new UnavailableError(
          "ASSET_STORAGE_UNAVAILABLE",
          "Asset validation returned an invalid result.",
        );
      return value;
    },
    async deleteObjects(command) {
      const payload = JSON.stringify(command);
      let response: Response;
      try {
        response = await fetchFn(new URL("/internal/delete", base), {
          method: "POST",
          headers: {
            authorization: `Bearer ${signature(payload)}`,
            "content-type": "application/json",
          },
          body: payload,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new UnavailableError(
          "ASSET_STORAGE_UNAVAILABLE",
          "Asset storage is unavailable.",
        );
      }
      await response.body?.cancel();
      if (!response.ok)
        throw new UnavailableError(
          "ASSET_STORAGE_UNAVAILABLE",
          "Asset storage is unavailable.",
        );
    },
  };
}

// Sizes are `bigint` columns, which postgres.js returns as strings: every
// read casts them to int (5 MiB fits) so the Assets Worker receives numbers.
type AssetRow = {
  id: string;
  original_filename: string;
  media_type: Asset["mediaType"];
  byte_size: number;
  sha256: string;
  status: "quarantined" | "validated" | "rejected";
  created_at: string;
  rejected_reason: string | null;
};

function toAsset(row: AssetRow): Asset {
  return {
    id: row.id,
    filename: row.original_filename,
    mediaType: row.media_type,
    byteSize: row.byte_size,
    sha256: row.sha256,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    ...(row.status === "rejected" && row.rejected_reason
      ? { rejectedReason: row.rejected_reason.slice(0, 300) }
      : {}),
  };
}
function allowedMediaType(value: string): value is Asset["mediaType"] {
  return (assetMediaTypes as readonly string[]).includes(value);
}
function isValidationResult(value: unknown): value is AssetValidationResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return candidate.status === "validated" || candidate.status === "rejected";
}

export function isAssetUploadSignature(
  expected: string,
  supplied: string,
): boolean {
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return (
    expectedBytes.length === suppliedBytes.length &&
    timingSafeEqual(expectedBytes, suppliedBytes)
  );
}
