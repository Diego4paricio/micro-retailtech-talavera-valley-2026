import { randomUUID } from "node:crypto";
import type {
  CreateTouchpoint,
  CreateTouchpointBatch,
  PieceModel,
  Touchpoint,
  TouchpointBatchResult,
  TouchpointKind,
  TouchpointObject,
  TouchpointObjectProbe,
  TouchpointObjectStep,
  UpdateTouchpoint,
  UpdateTouchpointObject,
} from "@kardo/contracts";
import type { Sql } from "postgres";
import type { FirstVisitFinder } from "../analytics-engine.js";
import { assertWithinLimit } from "../billing/entitlements.js";
import { syncBusinessRoutes } from "../business-routes.js";
import {
  ConflictError,
  ContentValidationError,
  NotFoundError,
  UnavailableError,
} from "../errors.js";
import type { TouchpointAvailabilityClient } from "../resolver-clients/touchpoint-availability.js";
import {
  type CustomerIdentity,
  insertAuditEvent,
  requireMembership,
  requireMembershipWithPermission,
  withCustomerContext,
} from "./context.js";
import { propagateGroupExperience } from "./propagation.js";
import { assertTemplateInWorkspace } from "./qr-designs.js";

export type UpdateTouchpointStatusInput = { status: "active" | "paused" };

export type TouchpointRepository = {
  listTouchpoints(
    identity: CustomerIdentity,
    workspaceId: string,
  ): Promise<readonly Touchpoint[]>;
  /** `resolver` is required when a Link is created with a handle. */
  createTouchpoint(
    identity: CustomerIdentity,
    workspaceId: string,
    input: CreateTouchpoint,
    resolver?: TouchpointAvailabilityClient | null,
  ): Promise<Touchpoint>;
  createTouchpointBatch(
    identity: CustomerIdentity,
    workspaceId: string,
    input: CreateTouchpointBatch,
  ): Promise<TouchpointBatchResult>;
  /** `resolver` is required when a Link's handle changes. */
  updateTouchpoint(
    identity: CustomerIdentity,
    workspaceId: string,
    touchpointId: string,
    input: UpdateTouchpoint,
    resolver?: TouchpointAvailabilityClient | null,
  ): Promise<Touchpoint>;
  updateTouchpointStatus(
    identity: CustomerIdentity,
    workspaceId: string,
    touchpointId: string,
    input: UpdateTouchpointStatusInput,
    resolver: TouchpointAvailabilityClient,
  ): Promise<Touchpoint>;
  retireTouchpoint(
    identity: CustomerIdentity,
    workspaceId: string,
    touchpointId: string,
    resolver: TouchpointAvailabilityClient,
  ): Promise<Touchpoint>;
  /** «Conecta el objeto»: mark or undo a step, or replace the chip. */
  updateTouchpointObject(
    identity: CustomerIdentity,
    workspaceId: string,
    touchpointId: string,
    input: UpdateTouchpointObject,
  ): Promise<Touchpoint>;
  /** «Pruébalo»: marks it tested when its first visit has arrived. */
  probeTouchpointObject(
    identity: CustomerIdentity,
    workspaceId: string,
    touchpointId: string,
    findFirstVisit: FirstVisitFinder | null,
    /** When the panel opened «Pruébalo»: older visits never count. */
    openedAt?: Date,
  ): Promise<TouchpointObjectProbe>;
};

export class TouchpointRepositoryError extends Error {}

export function unavailableTouchpointRepository(): TouchpointRepository {
  const unavailable = () =>
    Promise.reject(
      new TouchpointRepositoryError("Touchpoint storage is not configured."),
    );
  return {
    listTouchpoints: unavailable,
    createTouchpoint: unavailable,
    createTouchpointBatch: unavailable,
    updateTouchpoint: unavailable,
    updateTouchpointStatus: unavailable,
    retireTouchpoint: unavailable,
    updateTouchpointObject: unavailable,
    probeTouchpointObject: unavailable,
  };
}

type TouchpointRow = {
  id: string;
  public_id: string;
  operational_name: string;
  physical_type: "card" | "label" | "other";
  kind: TouchpointKind;
  /** Only Kardo pieces (ADR 026). */
  piece_model?: PieceModel | null;
  handle: string | null;
  slug: string | null;
  slug_changed_at?: string | Date | null;
  status: "assigned" | "active" | "paused" | "retired";
  group_id: string | null;
  created_at: string;
  suspended: boolean;
  plan_excluded: boolean;
  publishing: boolean;
  live_experience_id: string | null;
  live_experience_name: string | null;
  live_experience_type: string | null;
  live_revision: number | null;
  live_published_at: string | null;
} & Partial<ObjectColumns>;

/** The object's steps (migration 20261007180000) and the QR download. */
type ObjectColumns = {
  qr_last_export_at: string | Date | null;
  object_prepared_at: string | Date | null;
  object_tested_at: string | Date | null;
  object_backup_at: string | Date | null;
  object_placed_at: string | Date | null;
  object_replacing_at: string | Date | null;
  object_replace_ready_at: string | Date | null;
  object_replace_prepared_at: string | Date | null;
  object_replace_tested_at: string | Date | null;
};

/** Columns + joins shared by every Touchpoint read: the "live" Experience is
 * the one whose version is the Resolver's currently served (`published`, not
 * `superseded`) publication for the Touchpoint, if any. */
function touchpointSelect(tx: Sql) {
  return tx`
    select t.id, t.public_id, t.operational_name, t.physical_type, t.kind, t.piece_model, t.handle, t.slug, t.slug_changed_at, t.status, t.group_id, t.created_at,
           (t.suspended_at is not null) as suspended,
           (t.plan_excluded_at is not null) as plan_excluded,
           t.qr_last_export_at, t.object_prepared_at, t.object_tested_at, t.object_backup_at,
           t.object_placed_at, t.object_replacing_at, t.object_replace_ready_at,
           t.object_replace_prepared_at, t.object_replace_tested_at,
           exists (
             select 1 from kardo_core.publications queued
             where queued.touchpoint_id = t.id and queued.status in ('pending', 'processing')
           ) as publishing,
           live_experience.id as live_experience_id,
           live_experience.name as live_experience_name,
           live_experience.type as live_experience_type,
           live.revision as live_revision,
           live.published_at as live_published_at
    from kardo_core.touchpoints t
    left join lateral (
      select p.revision, p.published_at, ev.experience_id
      from kardo_core.publications p
      join kardo_core.experience_versions ev on ev.id = p.experience_version_id
      where p.touchpoint_id = t.id and p.status = 'published' and p.superseded_at is null
      limit 1
    ) live on true
    left join kardo_core.experiences live_experience on live_experience.id = live.experience_id
  `;
}

/** Several Touchpoints of the same read, in the order the panel lists a
 * batch (used by the piece activation, ADR 026). */
export async function fetchTouchpointsByIds(
  tx: Sql,
  touchpointIds: readonly string[],
): Promise<Touchpoint[]> {
  const rows = await tx<TouchpointRow[]>`
    ${touchpointSelect(tx)}
    where t.id = any(${[...touchpointIds]}::uuid[])
    order by t.created_at asc, t.operational_name asc
  `;
  return rows.map(toTouchpoint);
}

export async function fetchTouchpointById(
  tx: Sql,
  touchpointId: string,
): Promise<TouchpointRow | undefined> {
  const rows = await tx<TouchpointRow[]>`
    ${touchpointSelect(tx)}
    where t.id = ${touchpointId}::uuid
  `;
  return rows[0];
}

async function assertGroupInWorkspace(
  tx: Sql,
  workspaceId: string,
  groupId: string,
): Promise<void> {
  const rows = await tx<{ id: string }[]>`
    select id from kardo_core.touchpoint_groups
    where id = ${groupId}::uuid and workspace_id = ${workspaceId}::uuid
  `;
  if (!rows[0]) throw new NotFoundError("Group was not found.");
}

/** Handles that would collide with product routes or impersonate Kardo. */
const reservedHandles = new Set([
  "admin",
  "api",
  "app",
  "ayuda",
  "help",
  "kardo",
  "login",
  "ops",
  "operations",
  "privacidad",
  "privacy",
  "root",
  "soporte",
  "staff",
  "support",
  "t",
  "terminos",
  "terms",
  "www",
]);

export function assertHandleAllowed(handle: string): void {
  if (reservedHandles.has(handle) || handle.startsWith("kardo")) {
    throw new ContentValidationError(
      "HANDLE_RESERVED",
      "Ese nombre de usuario está reservado. Elige otro.",
    );
  }
}

/** Legacy `physical_type` kept in sync with the new `kind`. A Kardo piece
 * carries a chip, so it reads as a card. */
function legacyPhysicalType(kind: TouchpointKind): "card" | "label" | "other" {
  if (kind === "nfc" || kind === "kardo") return "card";
  if (kind === "qr") return "label";
  return "other";
}

/** A taken handle surfaces as the partial unique index violation. */
async function catchingHandleTaken<T>(query: Promise<T>): Promise<T> {
  try {
    return await query;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code?: string }).code === "23505" &&
      error.message.includes("touchpoints_handle_unique")
    ) {
      throw new ConflictError(
        "HANDLE_TAKEN",
        "Ese nombre de usuario ya está en uso. Elige otro.",
      );
    }
    throw error;
  }
}

export async function insertTouchpoint(
  tx: Sql,
  workspaceId: string,
  input: {
    operationalName: string;
    kind: TouchpointKind;
    groupId: string | null;
    handle?: string | null;
  },
): Promise<{ id: string; publicId: string }> {
  const created = await catchingHandleTaken(tx<
    { id: string; public_id: string }[]
  >`
    insert into kardo_core.touchpoints (
      public_id, workspace_id, status, physical_type, kind, handle, operational_name, group_id
    ) values (
      ${publicId()}, ${workspaceId}::uuid, 'assigned', ${legacyPhysicalType(input.kind)}, ${input.kind},
      ${input.handle ?? null}, ${input.operationalName}, ${input.groupId}
    )
    returning id, public_id
  `);
  const row = created[0];
  if (!row) {
    throw new TouchpointRepositoryError("Touchpoint was not created.");
  }
  return { id: row.id, publicId: row.public_id };
}

/** Batch names: "<prefix> <n>" for n = start … start + count - 1. */
export function batchTouchpointNames(input: {
  namePrefix: string;
  start: number;
  count: number;
}): string[] {
  const prefix = input.namePrefix.trim();
  return Array.from({ length: input.count }, (_, index) =>
    `${prefix} ${input.start + index}`.slice(0, 120),
  );
}

export function createPostgresTouchpointRepository(
  sql: Sql,
): TouchpointRepository {
  return {
    async listTouchpoints(identity, workspaceId) {
      const rows = await withCustomerContext(sql, identity, async (tx) => {
        await requireMembership(tx, identity, workspaceId);
        return tx<TouchpointRow[]>`
          ${touchpointSelect(tx)}
          where t.workspace_id = ${workspaceId}::uuid
          order by t.created_at desc
        `;
      });
      return rows.map(toTouchpoint);
    },
    async createTouchpoint(identity, workspaceId, input) {
      // Only physical objects here: a Link is created with `POST …/links`,
      // which gives it its address and the page it shows (domain audit A9-19).
      const kind: TouchpointKind =
        input.kind ??
        (input.physicalType === "card"
          ? "nfc"
          : input.physicalType === "other"
            ? "other"
            : "qr");
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "touchpoints.manage",
        );
        await assertWithinLimit(tx, workspaceId, "touchpoints.max");
        if (input.groupId) {
          await assertGroupInWorkspace(tx, workspaceId, input.groupId);
        }
        const created = await insertTouchpoint(tx, workspaceId, {
          operationalName: input.operationalName,
          kind,
          groupId: input.groupId ?? null,
        });
        const createdId = created.id;
        await linkQrTemplate(
          tx,
          workspaceId,
          kind,
          [createdId],
          input.qrTemplateId,
        );
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "touchpoint.created",
          targetType: "touchpoint",
          targetId: createdId,
          result: "succeeded",
          metadata: { operationalName: input.operationalName, kind },
        });
        if (input.groupId) {
          await propagateGroupExperience(tx, {
            workspaceId,
            touchpointIds: [createdId],
            createdBy: identity.subject,
          });
        }
        const row = await fetchTouchpointById(tx, createdId);
        if (!row) {
          throw new TouchpointRepositoryError("Touchpoint was not created.");
        }
        return toTouchpoint(row);
      });
    },
    async createTouchpointBatch(identity, workspaceId, input) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "touchpoints.manage",
        );
        if (input.groupId) {
          await assertGroupInWorkspace(tx, workspaceId, input.groupId);
        }
        const kind: TouchpointKind =
          input.kind ??
          (input.physicalType === "card"
            ? "nfc"
            : input.physicalType === "other"
              ? "other"
              : "qr");
        await assertWithinLimit(
          tx,
          workspaceId,
          "touchpoints.max",
          input.count,
        );
        const ids: string[] = [];
        for (const operationalName of batchTouchpointNames(input)) {
          const created = await insertTouchpoint(tx, workspaceId, {
            operationalName,
            kind,
            groupId: input.groupId ?? null,
          });
          ids.push(created.id);
        }
        await linkQrTemplate(tx, workspaceId, kind, ids, input.qrTemplateId);
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "touchpoint.batch_created",
          targetType: "workspace",
          targetId: workspaceId,
          result: "succeeded",
          metadata: {
            count: ids.length,
            namePrefix: input.namePrefix,
            start: input.start,
            groupId: input.groupId ?? null,
          },
        });
        const propagatedPublications = input.groupId
          ? await propagateGroupExperience(tx, {
              workspaceId,
              touchpointIds: ids,
              createdBy: identity.subject,
            })
          : 0;
        const rows = await tx<TouchpointRow[]>`
          ${touchpointSelect(tx)}
          where t.id = any(${ids}::uuid[])
          order by t.created_at asc, t.operational_name asc
        `;
        return {
          touchpoints: rows.map(toTouchpoint),
          propagatedPublications,
        };
      });
    },
    async updateTouchpoint(identity, workspaceId, touchpointId, input) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "touchpoints.manage",
        );
        // `groupId` has three meaningful states: absent (leave the current
        // group untouched), `null` (ungroup), or a uuid (must belong to this
        // workspace — move it there).
        if (input.groupId) {
          await assertGroupInWorkspace(tx, workspaceId, input.groupId);
        }
        const current = await tx<
          {
            status: string;
            group_id: string | null;
            kind: TouchpointKind;
          }[]
        >`
          select status::text as status, group_id, kind
          from kardo_core.touchpoints
          where id = ${touchpointId}::uuid and workspace_id = ${workspaceId}::uuid
          for update
        `;
        const existing = current[0];
        if (!existing) throw new NotFoundError("Touchpoint was not found.");
        if (existing.status === "retired") {
          throw new ConflictError(
            "TOUCHPOINT_RETIRED",
            "A retired Touchpoint can no longer be changed.",
          );
        }
        // A Kardo piece already prints its QR and carries its chip: it
        // never changes format (ADR 026), and nothing becomes a piece.
        if (
          existing.kind === "kardo" &&
          input.kind &&
          (input.kind as TouchpointKind) !== "kardo"
        ) {
          throw new ConflictError(
            "PIECE_KIND_FIXED",
            "Una pieza de Kardo ya trae su QR y su NFC: no cambia de formato.",
          );
        }
        const isLink = existing.kind === "link";
        if (isLink && input.kind) {
          throw new ContentValidationError(
            "INVALID_TOUCHPOINT_KIND",
            "Un Link no puede convertirse en un QR o etiqueta físico.",
          );
        }
        if (isLink && input.groupId) {
          throw new ContentValidationError(
            "INVALID_TOUCHPOINT_KIND",
            "Los Links no pertenecen a grupos físicos.",
          );
        }
        const nextKind = input.kind ?? existing.kind;
        const rows = await tx<{ id: string }[]>`
          update kardo_core.touchpoints
          set operational_name = ${input.operationalName},
              kind = ${nextKind},
              physical_type = ${input.kind ? legacyPhysicalType(input.kind) : sql`physical_type`},
              group_id = ${input.groupId === undefined ? sql`group_id` : input.groupId},
              updated_at = now()
          where id = ${touchpointId}::uuid and workspace_id = ${workspaceId}::uuid
          returning id
        `;
        if (!rows[0]) throw new NotFoundError("Touchpoint was not found.");
        if (input.kind && input.kind !== existing.kind) {
          // Another format is another physical object: its steps start over,
          // and nothing of it was downloaded yet. The design stays (relevo 38).
          await tx`
            update kardo_core.touchpoints
            set object_prepared_at = null, object_tested_at = null,
                object_backup_at = null, object_placed_at = null,
                object_replacing_at = null, object_replace_ready_at = null,
                object_replace_prepared_at = null, object_replace_tested_at = null,
                qr_last_export_at = null, qr_last_export_fingerprint = null,
                qr_last_export_format = null
            where id = ${touchpointId}::uuid
          `;
        }
        const joinedGroup =
          typeof input.groupId === "string" &&
          input.groupId !== existing.group_id;
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "touchpoint.updated",
          targetType: "touchpoint",
          targetId: touchpointId,
          result: "succeeded",
          metadata: {
            operationalName: input.operationalName,
            ...(input.groupId === undefined ? {} : { groupId: input.groupId }),
            ...(input.kind ? { kind: input.kind } : {}),
          },
        });
        if (joinedGroup) {
          await propagateGroupExperience(tx, {
            workspaceId,
            touchpointIds: [touchpointId],
            createdBy: identity.subject,
          });
        }
        const row = await fetchTouchpointById(tx, touchpointId);
        if (!row) throw new NotFoundError("Touchpoint was not found.");
        return toTouchpoint(row);
      });
    },
    async updateTouchpointStatus(
      identity,
      workspaceId,
      touchpointId,
      input,
      resolver,
    ) {
      return withCustomerContext(sql, identity, async (tx) => {
        // Authorization first: a viewer or editor without `touchpoints.manage`
        // must never reach the Resolver call below, let alone flip public
        // availability for the Touchpoint.
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "touchpoints.manage",
        );

        const current = await tx<
          {
            id: string;
            public_id: string;
            status: string;
            suspended: boolean;
            plan_excluded: boolean;
          }[]
        >`
          select id, public_id, status,
                 (suspended_at is not null) as suspended,
                 (plan_excluded_at is not null) as plan_excluded
          from kardo_core.touchpoints
          where id = ${touchpointId}::uuid and workspace_id = ${workspaceId}::uuid
          for update
        `;
        const touchpoint = current[0];
        if (!touchpoint) throw new NotFoundError("Touchpoint was not found.");
        if (touchpoint.status === "retired") {
          throw new ConflictError(
            "TOUCHPOINT_RETIRED",
            "A retired Touchpoint can no longer be changed.",
          );
        }
        const validTransition =
          (touchpoint.status === "active" && input.status === "paused") ||
          (touchpoint.status === "paused" && input.status === "active");
        if (!validTransition) {
          throw new NotFoundError(
            "Touchpoint cannot change to the requested status.",
          );
        }
        // Resuming is never a customer-controlled transition when Kardo
        // suspended the Touchpoint or the plan excluded it (A9-11): the
        // panel hides the button, but a direct call or a stale screen must
        // not flip `status` back to `active` while the public page stays
        // blocked (the Resolver tracks suspension and plan exclusion on its
        // own) and the activity KPI counts it as active.
        if (input.status === "active" && touchpoint.suspended) {
          throw new ConflictError(
            "TOUCHPOINT_SUSPENDED",
            "Kardo pausó este QR. Escríbenos si crees que es un error.",
          );
        }
        if (input.status === "active" && touchpoint.plan_excluded) {
          throw new ConflictError(
            "TOUCHPOINT_PLAN_EXCLUDED",
            "Este QR quedó fuera de tu plan. Actívalo en Plan y facturación.",
          );
        }

        const updated = await tx<{ id: string }[]>`
          update kardo_core.touchpoints
          set status = ${input.status}, updated_at = now()
          where id = ${touchpointId}::uuid
          returning id
        `;
        if (!updated[0]) {
          throw new TouchpointRepositoryError("Touchpoint was not updated.");
        }

        // The Resolver call happens inside this still-open transaction, before
        // it commits. A failure here throws out of `withCustomerContext`'s
        // callback, which rolls the whole transaction back — the status
        // update above is never persisted — and the caller turns it into a
        // 503 instead of leaving the panel and the public Resolver disagreeing
        // about whether the Touchpoint is reachable.
        try {
          await resolver.setAvailability({
            publicId: touchpoint.public_id,
            status: input.status,
          });
        } catch {
          throw new UnavailableError(
            "TOUCHPOINT_AVAILABILITY_UNAVAILABLE",
            "The public availability service could not confirm this change.",
          );
        }

        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action:
            input.status === "paused"
              ? "touchpoint.paused"
              : "touchpoint.resumed",
          targetType: "touchpoint",
          targetId: touchpointId,
          result: "succeeded",
        });

        const row = await fetchTouchpointById(tx, touchpointId);
        if (!row) throw new NotFoundError("Touchpoint was not found.");
        return toTouchpoint(row);
      });
    },
    async retireTouchpoint(identity, workspaceId, touchpointId, resolver) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "touchpoints.retire",
        );
        const current = await tx<
          { public_id: string; status: string; kind: string }[]
        >`
          select public_id, status::text as status, kind::text as kind
          from kardo_core.touchpoints
          where id = ${touchpointId}::uuid and workspace_id = ${workspaceId}::uuid
          for update
        `;
        const touchpoint = current[0];
        if (!touchpoint) throw new NotFoundError("Touchpoint was not found.");
        if (touchpoint.status !== "retired") {
          // The trigger stamps `retired_at` and removes it from its group.
          await tx`
            update kardo_core.touchpoints
            set status = 'retired', updated_at = now()
            where id = ${touchpointId}::uuid
          `;
          await tx`
            delete from kardo_core.experience_targets
            where touchpoint_id = ${touchpointId}::uuid and workspace_id = ${workspaceId}::uuid
          `;
          // Same rule as pause/resume: the Resolver must confirm before the
          // transaction commits, or nothing changes.
          try {
            await resolver.setAvailability({
              publicId: touchpoint.public_id,
              status: "retired",
            });
          } catch {
            throw new UnavailableError(
              "TOUCHPOINT_AVAILABILITY_UNAVAILABLE",
              "The public availability service could not confirm this change.",
            );
          }
          await insertAuditEvent(tx, {
            workspaceId,
            actorSubject: identity.subject,
            action: "touchpoint.retired",
            targetType: "touchpoint",
            targetId: touchpointId,
            result: "succeeded",
          });
          // A retired link leaves kardo.com.mx/<negocio>/<link> (its
          // addresses are free again).
          if (touchpoint.kind === "link" && resolver.setBusiness)
            await syncBusinessRoutes(
              tx,
              { setBusiness: resolver.setBusiness.bind(resolver) },
              workspaceId,
            );
        }
        const row = await fetchTouchpointById(tx, touchpointId);
        if (!row) throw new NotFoundError("Touchpoint was not found.");
        return toTouchpoint(row);
      });
    },
    async updateTouchpointObject(identity, workspaceId, touchpointId, input) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "touchpoints.manage",
        );
        const current = await tx<
          {
            status: string;
            kind: TouchpointKind;
            replacing: boolean;
          }[]
        >`
          select status::text as status, kind,
                 (object_replacing_at is not null) as replacing
          from kardo_core.touchpoints
          where id = ${touchpointId}::uuid and workspace_id = ${workspaceId}::uuid
          for update
        `;
        const existing = current[0];
        if (!existing) throw new NotFoundError("Touchpoint was not found.");
        if (existing.status === "retired") {
          throw new ConflictError(
            "TOUCHPOINT_RETIRED",
            "A retired Touchpoint can no longer be changed.",
          );
        }
        const plan = planObjectUpdate(existing, input);
        const where = tx`where id = ${touchpointId}::uuid and workspace_id = ${workspaceId}::uuid`;
        if (plan.kind === "mark") {
          await tx`
            update kardo_core.touchpoints
            set ${tx(plan.column)} = coalesce(${tx(plan.column)}, now()), updated_at = now()
            ${where}
          `;
        } else if (plan.kind === "unmark") {
          await tx`
            update kardo_core.touchpoints
            set ${tx(plan.column)} = null, updated_at = now()
            ${where}
          `;
        } else if (plan.kind === "finish_replace") {
          // The new card is in place: its steps become the object's.
          await tx`
            update kardo_core.touchpoints
            set object_prepared_at = coalesce(object_replace_prepared_at, object_prepared_at),
                object_tested_at = coalesce(object_replace_tested_at, object_tested_at),
                object_placed_at = now(),
                object_replacing_at = null, object_replace_ready_at = null,
                object_replace_prepared_at = null, object_replace_tested_at = null,
                updated_at = now()
            ${where}
          `;
        } else if (plan.kind === "start_replace") {
          await tx`
            update kardo_core.touchpoints
            set object_replacing_at = coalesce(object_replacing_at, now()), updated_at = now()
            ${where}
          `;
        } else {
          await tx`
            update kardo_core.touchpoints
            set object_replacing_at = null, object_replace_ready_at = null,
                object_replace_prepared_at = null, object_replace_tested_at = null,
                updated_at = now()
            ${where}
          `;
        }
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "touchpoint.object_updated",
          targetType: "touchpoint",
          targetId: touchpointId,
          result: "succeeded",
          metadata: {
            action: input.action,
            ...(input.step ? { step: input.step } : {}),
          },
        });
        const row = await fetchTouchpointById(tx, touchpointId);
        if (!row) throw new NotFoundError("Touchpoint was not found.");
        return toTouchpoint(row);
      });
    },
    async probeTouchpointObject(
      identity,
      workspaceId,
      touchpointId,
      findFirstVisit,
      openedAt,
    ) {
      // Read, ask Analytics Engine outside the transaction (it can take a few
      // seconds), then write only if the step is still waiting.
      const before = await withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "touchpoints.manage",
        );
        const owned = await tx<{ id: string }[]>`
          select id from kardo_core.touchpoints
          where id = ${touchpointId}::uuid and workspace_id = ${workspaceId}::uuid
        `;
        if (!owned[0]) throw new NotFoundError("Touchpoint was not found.");
        const row = await fetchTouchpointById(tx, touchpointId);
        if (!row) throw new NotFoundError("Touchpoint was not found.");
        return { row, touchpoint: toTouchpoint(row) };
      });
      const target = probeTarget(before.row, before.touchpoint, openedAt);
      if (!target) {
        return {
          touchpoint: before.touchpoint,
          detected: false,
          source: "analytics",
        };
      }
      if (target.done) {
        return {
          touchpoint: before.touchpoint,
          detected: true,
          source: "analytics",
        };
      }
      if (!findFirstVisit) {
        return {
          touchpoint: before.touchpoint,
          detected: false,
          source: "unavailable",
        };
      }
      let first: string | null;
      try {
        first = await findFirstVisit({
          publicId: before.touchpoint.publicId,
          channel: target.channel,
          since: target.since,
        });
        if (!first && target.alsoChannel)
          first = await findFirstVisit({
            publicId: before.touchpoint.publicId,
            channel: target.alsoChannel,
            since: target.since,
          });
      } catch {
        return {
          touchpoint: before.touchpoint,
          detected: false,
          source: "unavailable",
        };
      }
      if (!first) {
        return {
          touchpoint: before.touchpoint,
          detected: false,
          source: "analytics",
        };
      }
      const touchpoint = await withCustomerContext(
        sql,
        identity,
        async (tx) => {
          await requireMembershipWithPermission(
            tx,
            identity,
            workspaceId,
            "touchpoints.manage",
          );
          const updated = await tx<{ id: string }[]>`
          update kardo_core.touchpoints
          set ${tx(target.column)} = coalesce(${tx(target.column)}, ${first}::timestamptz),
              updated_at = now()
          where id = ${touchpointId}::uuid and workspace_id = ${workspaceId}::uuid
            and status <> 'retired'
            and ${target.column === "object_replace_tested_at" ? tx`object_replacing_at is not null` : tx`true`}
          returning id
        `;
          if (updated[0]) {
            await insertAuditEvent(tx, {
              workspaceId,
              actorSubject: identity.subject,
              action: "touchpoint.object_updated",
              targetType: "touchpoint",
              targetId: touchpointId,
              result: "succeeded",
              metadata: { action: "detected", step: target.step },
            });
          }
          const row = await fetchTouchpointById(tx, touchpointId);
          if (!row) throw new NotFoundError("Touchpoint was not found.");
          return toTouchpoint(row);
        },
      );
      return { touchpoint, detected: true, source: "analytics" };
    },
  };
}

const objectStepColumns = {
  prepared: "object_prepared_at",
  tested: "object_tested_at",
  backup: "object_backup_at",
  placed: "object_placed_at",
  replace_ready: "object_replace_ready_at",
  replace_prepared: "object_replace_prepared_at",
  replace_tested: "object_replace_tested_at",
} as const satisfies Record<TouchpointObjectStep, keyof ObjectColumns>;

type ObjectStepColumn = (typeof objectStepColumns)[TouchpointObjectStep];

export type ObjectUpdatePlan =
  | { kind: "mark" | "unmark"; column: ObjectStepColumn }
  | { kind: "finish_replace" | "start_replace" | "cancel_replace" };

/**
 * What one «Conecta el objeto» action does (pure, so it is tested alone):
 * - a Link has no object, and only an NFC has a backup QR and a chip to
 *   replace;
 * - the replacement steps exist only while a replacement is under way;
 * - «Colocado» during a replacement finishes it.
 */
export function planObjectUpdate(
  current: { kind: TouchpointKind; replacing: boolean },
  input: UpdateTouchpointObject,
): ObjectUpdatePlan {
  if (current.kind === "link") {
    throw new ContentValidationError(
      "INVALID_TOUCHPOINT_KIND",
      "Un Link no es un objeto físico.",
    );
  }
  const isNfc = current.kind === "nfc";
  if (input.action === "start_replace" || input.action === "cancel_replace") {
    if (!isNfc) {
      throw new ContentValidationError(
        "INVALID_OBJECT_STEP",
        "Solo un NFC tiene una tarjeta que reemplazar.",
      );
    }
    return { kind: input.action };
  }
  const step = input.step;
  if (!step) {
    throw new ContentValidationError(
      "INVALID_OBJECT_STEP",
      "Falta el paso que quieres marcar.",
    );
  }
  if (step === "backup" && !isNfc) {
    throw new ContentValidationError(
      "INVALID_OBJECT_STEP",
      "Solo un NFC lleva QR de respaldo.",
    );
  }
  if (step.startsWith("replace_") && !current.replacing) {
    throw new ConflictError(
      "OBJECT_NOT_REPLACING",
      "Esta tarjeta no se está reemplazando.",
    );
  }
  if (input.action === "done" && step === "placed" && current.replacing) {
    return { kind: "finish_replace" };
  }
  return {
    kind: input.action === "done" ? "mark" : "unmark",
    column: objectStepColumns[step],
  };
}

const iso = (value: string | Date | null | undefined) =>
  value ? new Date(value).toISOString() : null;

export function toTouchpointObject(row: ObjectColumns): TouchpointObject {
  const replacingAt = iso(row.object_replacing_at);
  const preparedAt = iso(row.object_prepared_at);
  const placedAt = iso(row.object_placed_at);
  return {
    state: replacingAt
      ? "replacing"
      : placedAt
        ? "placed"
        : preparedAt
          ? "ready"
          : "pending",
    preparedAt,
    testedAt: iso(row.object_tested_at),
    backupAt: iso(row.object_backup_at),
    placedAt,
    downloadedAt: iso(row.qr_last_export_at),
    replacingAt,
    replaceReadyAt: iso(row.object_replace_ready_at),
    replacePreparedAt: iso(row.object_replace_prepared_at),
    replaceTestedAt: iso(row.object_replace_tested_at),
  };
}

/**
 * Which «Pruébalo» is waiting and since when it counts. Visits are only
 * recorded while something is published, so without a live page there is
 * nothing to look for (the panel offers «Ya lo probé»).
 */
export function probeTarget(
  row: TouchpointRow,
  touchpoint: Touchpoint,
  openedAt?: Date,
  now: Date = new Date(),
): {
  done: boolean;
  step: TouchpointObjectStep;
  column: ObjectStepColumn;
  channel: "nfc" | "qr" | "link";
  /** A Kardo piece is tested by its chip or by its printed QR (ADR 026). */
  alsoChannel?: "qr";
  since: Date;
} | null {
  const object = touchpoint.object;
  if (!object || !row.live_experience_id || touchpoint.status !== "active")
    return null;
  const replacing = object.replacingAt !== null;
  const step: TouchpointObjectStep = replacing ? "replace_tested" : "tested";
  const done = Boolean(replacing ? object.replaceTestedAt : object.testedAt);
  const start =
    (replacing
      ? (object.replacePreparedAt ?? object.replacingAt)
      : (object.preparedAt ?? object.downloadedAt)) ??
    touchpoint.createdAt ??
    new Date().toISOString();
  // A couple of minutes of slack for clocks that do not agree.
  const stepStart = new Date(start).getTime() - 2 * 60_000;
  // Only visits after the panel opened the step: an undone test or a reload
  // never counts an old visit (owner, 2026-10-07: «se aplicó solo»). A minute
  // of slack, and never later than now.
  const opened =
    openedAt && Number.isFinite(openedAt.getTime())
      ? Math.min(openedAt.getTime(), now.getTime()) - 60_000
      : Number.NEGATIVE_INFINITY;
  const since = new Date(Math.max(stepStart, opened));
  const kind = touchpoint.kind ?? "qr";
  return {
    done,
    step,
    column: objectStepColumns[step],
    channel:
      kind === "nfc" || kind === "kardo"
        ? "nfc"
        : kind === "qr"
          ? "qr"
          : "link",
    ...(kind === "kardo" ? { alsoChannel: "qr" as const } : {}),
    since,
  };
}

function publicId(): string {
  return randomUUID().replaceAll("-", "");
}

export function toTouchpoint(row: TouchpointRow): Touchpoint {
  return {
    id: row.id,
    publicId: row.public_id,
    operationalName: row.operational_name,
    physicalType: row.physical_type,
    kind: row.kind,
    ...(row.piece_model !== undefined
      ? { pieceModel: row.piece_model ?? null }
      : {}),
    handle: row.handle,
    ...(row.slug !== undefined ? { slug: row.slug } : {}),
    ...(row.slug_changed_at !== undefined
      ? {
          slugChangedAt: row.slug_changed_at
            ? new Date(row.slug_changed_at).toISOString()
            : null,
        }
      : {}),
    status: row.status,
    groupId: row.group_id,
    createdAt: new Date(row.created_at).toISOString(),
    suspended: row.suspended,
    planExcluded: row.plan_excluded,
    publishing: row.publishing,
    ...(row.kind !== "link" && row.object_prepared_at !== undefined
      ? { object: toTouchpointObject(row as ObjectColumns) }
      : {}),
    live: row.live_experience_id
      ? {
          experienceId: row.live_experience_id,
          experienceName: row.live_experience_name ?? "",
          experienceType: row.live_experience_type ?? "",
          revision: row.live_revision ?? 1,
          publishedAt: row.live_published_at
            ? new Date(row.live_published_at).toISOString()
            : new Date().toISOString(),
        }
      : null,
  };
}

/**
 * A QR Touchpoint can be created with a library design; otherwise it follows
 * its group's design (or Kardo's default).
 */
async function linkQrTemplate(
  tx: Sql,
  workspaceId: string,
  kind: TouchpointKind,
  touchpointIds: readonly string[],
  templateId: string | undefined,
): Promise<void> {
  if (!templateId) return;
  if (kind !== "qr") {
    throw new ContentValidationError(
      "INVALID_TOUCHPOINT_KIND",
      "Solo los QR llevan diseño QR.",
    );
  }
  await assertTemplateInWorkspace(tx, workspaceId, templateId);
  await tx`
    update kardo_core.touchpoints
    set qr_template_id = ${templateId}::uuid
    where id = any(${[...touchpointIds]}::uuid[]) and workspace_id = ${workspaceId}::uuid
  `;
}
