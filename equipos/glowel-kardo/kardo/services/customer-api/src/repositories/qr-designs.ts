import {
  type ApplyQrTemplate,
  type ApplyQrTemplateResult,
  type CreateQrTemplate,
  imageMediaTypes,
  maxQrTemplatesPerWorkspace,
  type QrDesign,
  type QrDesignOverview,
  type QrExportFormat,
  type QrTemplate,
  type QrTemplateDetail,
  type RecordQrExports,
  type SaveTouchpointQrDesign,
  type TouchpointQrDesign,
  type UpdateQrTemplate,
} from "@kardo/contracts";
import type { Sql } from "postgres";
import { assertWithinLimit } from "../billing/entitlements.js";
import {
  ConflictError,
  ContentValidationError,
  NotFoundError,
} from "../errors.js";
import {
  type CustomerIdentity,
  insertAuditEvent,
  requireMembership,
  requireMembershipWithPermission,
  withCustomerContext,
} from "./context.js";

type JsonValue = Parameters<Sql["json"]>[0];

/**
 * Estudio QR persistence. A QR encodes the Touchpoint's permanent address, so
 * a design is purely visual: changing it never invalidates printed codes. A
 * Touchpoint's design resolves as its own design → a library design applied
 * to it → its group's default design → Kardo's default.
 */
export type QrDesignRepository = {
  getTouchpointDesign(
    identity: CustomerIdentity,
    workspaceId: string,
    touchpointId: string,
  ): Promise<TouchpointQrDesign>;
  saveTouchpointDesign(
    identity: CustomerIdentity,
    workspaceId: string,
    touchpointId: string,
    input: SaveTouchpointQrDesign,
  ): Promise<TouchpointQrDesign>;
  overview(
    identity: CustomerIdentity,
    workspaceId: string,
  ): Promise<QrDesignOverview>;
  listTemplates(
    identity: CustomerIdentity,
    workspaceId: string,
  ): Promise<QrTemplate[]>;
  getTemplate(
    identity: CustomerIdentity,
    workspaceId: string,
    templateId: string,
  ): Promise<QrTemplateDetail>;
  createTemplate(
    identity: CustomerIdentity,
    workspaceId: string,
    input: CreateQrTemplate,
  ): Promise<QrTemplate>;
  updateTemplate(
    identity: CustomerIdentity,
    workspaceId: string,
    templateId: string,
    input: UpdateQrTemplate,
  ): Promise<QrTemplate>;
  deleteTemplate(
    identity: CustomerIdentity,
    workspaceId: string,
    templateId: string,
  ): Promise<void>;
  applyTemplate(
    identity: CustomerIdentity,
    workspaceId: string,
    templateId: string,
    input: ApplyQrTemplate,
  ): Promise<ApplyQrTemplateResult>;
  setGroupTemplate(
    identity: CustomerIdentity,
    workspaceId: string,
    groupId: string,
    templateId: string | null,
  ): Promise<void>;
  recordExports(
    identity: CustomerIdentity,
    workspaceId: string,
    input: RecordQrExports,
  ): Promise<void>;
};

export class QrDesignRepositoryError extends Error {}

export function unavailableQrDesignRepository(): QrDesignRepository {
  const unavailable = () =>
    Promise.reject(
      new QrDesignRepositoryError("QR design storage is not configured."),
    );
  return {
    getTouchpointDesign: unavailable,
    saveTouchpointDesign: unavailable,
    overview: unavailable,
    listTemplates: unavailable,
    getTemplate: unavailable,
    createTemplate: unavailable,
    updateTemplate: unavailable,
    deleteTemplate: unavailable,
    applyTemplate: unavailable,
    setGroupTemplate: unavailable,
    recordExports: unavailable,
  };
}

/**
 * Checks the schema cannot express. The route already rejected anything
 * outside `QrDesignSchema` (closed enums, bounded numbers, `#rrggbb` colors,
 * bounded text without control characters or markup delimiters).
 */
export function normalizeQrDesign(design: QrDesign): QrDesign {
  const next: QrDesign = structuredClone(design);
  next.frame.text = next.frame.text.replace(/\s+/g, " ").trim();
  if (next.logo) {
    if (next.logo.source === "asset" && !next.logo.assetId) {
      throw new ContentValidationError(
        "INVALID_QR_DESIGN",
        "Elige una imagen de tu biblioteca para el logo.",
      );
    }
    if (next.logo.source === "brand") {
      const { assetId: _ignored, ...logo } = next.logo;
      next.logo = logo;
    }
  }
  return next;
}

/** A QR prints its own code; an NFC prints its backup QR (relevo 38). */
export function hasQrDesign(kind: string): boolean {
  return kind === "qr" || kind === "nfc";
}

export function normalizeQrTemplateName(name: string): string {
  const normalized = name.replace(/\s+/g, " ").trim();
  if (!normalized) {
    throw new ContentValidationError(
      "INVALID_QR_DESIGN",
      "Ponle un nombre al diseño.",
    );
  }
  return normalized;
}

async function assertLogoAsset(
  tx: Sql,
  workspaceId: string,
  design: QrDesign,
): Promise<void> {
  const assetId = design.logo?.source === "asset" ? design.logo.assetId : null;
  if (!assetId) return;
  const rows = await tx<{ id: string }[]>`
    select id from kardo_core.assets
    where id = ${assetId}::uuid
      and workspace_id = ${workspaceId}::uuid
      and status = 'validated'
      and media_type = any(${[...imageMediaTypes]}::text[])
  `;
  if (!rows[0]) {
    throw new ContentValidationError(
      "INVALID_QR_DESIGN",
      "El logo debe ser una imagen validada de tu biblioteca.",
    );
  }
}

/** A library design of this workspace, or 404. */
export async function assertTemplateInWorkspace(
  tx: Sql,
  workspaceId: string,
  templateId: string,
): Promise<{ id: string; name: string }> {
  const rows = await tx<{ id: string; name: string }[]>`
    select id, name from kardo_core.qr_design_templates
    where id = ${templateId}::uuid and workspace_id = ${workspaceId}::uuid
  `;
  const row = rows[0];
  if (!row) throw new NotFoundError("QR template was not found.");
  return row;
}

function isTemplateLimitError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error as { code?: string }).code === "23514" &&
    error.message.includes("QR_TEMPLATE_LIMIT")
  );
}

type LastExportColumns = {
  qr_last_export_at: Date | null;
  qr_last_export_fingerprint: string | null;
  qr_last_export_format: string | null;
};

function toLastExport(
  row: LastExportColumns,
): TouchpointQrDesign["lastExport"] {
  if (
    !row.qr_last_export_at ||
    !row.qr_last_export_fingerprint ||
    !row.qr_last_export_format
  )
    return null;
  return {
    at: row.qr_last_export_at.toISOString(),
    fingerprint: row.qr_last_export_fingerprint,
    format: row.qr_last_export_format as QrExportFormat,
  };
}

type ResolveRow = LastExportColumns & {
  qr_design: QrDesign | null;
  qr_design_updated_at: Date | null;
  qr_template_id: string | null;
  template_name: string | null;
  template_design: QrDesign | null;
  group_id: string | null;
  group_name: string | null;
  group_template_id: string | null;
  group_template_name: string | null;
  group_template_design: QrDesign | null;
};

/** own design → library design → nearest group design → Kardo default. */
export function resolveTouchpointDesign(row: ResolveRow): TouchpointQrDesign {
  const groupTemplate =
    row.group_template_id && row.group_template_name
      ? { id: row.group_template_id, name: row.group_template_name }
      : null;
  const base = {
    group:
      row.group_id && row.group_name
        ? { id: row.group_id, name: row.group_name, template: groupTemplate }
        : null,
    lastExport: toLastExport(row),
  };
  if (row.qr_design)
    return {
      ...base,
      source: "custom",
      design: row.qr_design,
      updatedAt: row.qr_design_updated_at?.toISOString() ?? null,
      template: null,
    };
  if (row.qr_template_id && row.template_name && row.template_design)
    return {
      ...base,
      source: "library",
      design: row.template_design,
      updatedAt: null,
      template: { id: row.qr_template_id, name: row.template_name },
    };
  if (groupTemplate && row.group_template_design)
    return {
      ...base,
      source: "group",
      design: row.group_template_design,
      updatedAt: null,
      template: groupTemplate,
    };
  return {
    ...base,
    source: "default",
    design: null,
    updatedAt: null,
    template: null,
  };
}

/**
 * The library design a Touchpoint inherits from its groups: its own group's,
 * else the nearest group above it that has one (groups nest, ADR 021). Joins
 * `inherited.qr_template_id` off the Touchpoint's group `g`.
 */
function nearestGroupTemplate(tx: Sql) {
  return tx`
    left join lateral (
      select ancestor.qr_template_id
      from unnest(g.path) with ordinality as chain(group_id, position)
      join kardo_core.touchpoint_groups ancestor on ancestor.id = chain.group_id
      where ancestor.qr_template_id is not null
      order by chain.position desc
      limit 1
    ) inherited on true
  `;
}

async function readTouchpointDesign(
  tx: Sql,
  workspaceId: string,
  touchpointId: string,
): Promise<TouchpointQrDesign> {
  const rows = await tx<ResolveRow[]>`
    select tp.qr_design, tp.qr_design_updated_at, tp.qr_template_id,
           t.name as template_name, t.design as template_design,
           g.id as group_id, g.name as group_name,
           inherited.qr_template_id as group_template_id,
           gt.name as group_template_name, gt.design as group_template_design,
           tp.qr_last_export_at, tp.qr_last_export_fingerprint, tp.qr_last_export_format
    from kardo_core.touchpoints tp
    left join kardo_core.qr_design_templates t on t.id = tp.qr_template_id
    left join kardo_core.touchpoint_groups g on g.id = tp.group_id
    ${nearestGroupTemplate(tx)}
    left join kardo_core.qr_design_templates gt on gt.id = inherited.qr_template_id
    where tp.id = ${touchpointId}::uuid and tp.workspace_id = ${workspaceId}::uuid
  `;
  const row = rows[0];
  if (!row) throw new NotFoundError("Touchpoint was not found.");
  return resolveTouchpointDesign(row);
}

type TemplateRow = {
  id: string;
  name: string;
  design: QrDesign;
  created_at: Date;
  updated_at: Date;
  touchpoints: number;
  groups: number;
};

function toTemplate(row: TemplateRow): QrTemplate {
  return {
    id: row.id,
    name: row.name,
    design: row.design,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    usage: { touchpoints: row.touchpoints, groups: row.groups },
  };
}

async function readTemplates(
  tx: Sql,
  workspaceId: string,
  templateId: string | null,
): Promise<TemplateRow[]> {
  return tx<TemplateRow[]>`
    select t.id, t.name, t.design, t.created_at, t.updated_at,
      (select count(tp.id)::int from kardo_core.touchpoints tp
        where tp.qr_template_id = t.id and tp.kind in ('qr', 'nfc')
          and tp.status::text <> 'retired') as touchpoints,
      (select count(g.id)::int from kardo_core.touchpoint_groups g
        where g.qr_template_id = t.id) as groups
    from kardo_core.qr_design_templates t
    where t.workspace_id = ${workspaceId}::uuid
      and (${templateId}::uuid is null or t.id = ${templateId}::uuid)
    order by t.updated_at desc
    limit ${maxQrTemplatesPerWorkspace}
  `;
}

export function createPostgresQrDesignRepository(sql: Sql): QrDesignRepository {
  return {
    async getTouchpointDesign(identity, workspaceId, touchpointId) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembership(tx, identity, workspaceId);
        return readTouchpointDesign(tx, workspaceId, touchpointId);
      });
    },

    async saveTouchpointDesign(identity, workspaceId, touchpointId, input) {
      const design = "design" in input ? normalizeQrDesign(input.design) : null;
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "touchpoints.manage",
        );
        const current = await tx<{ status: string; kind: string }[]>`
          select status::text as status, kind
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
        // An NFC carries the design of its backup QR (relevo 38, model A):
        // same page, `?src=qr`, not another touchpoint.
        if (!hasQrDesign(existing.kind)) {
          throw new ConflictError(
            "TOUCHPOINT_NOT_QR",
            "Solo un QR, o el QR de respaldo de un NFC, lleva diseño.",
          );
        }
        let templateId: string | null = null;
        if (design) await assertLogoAsset(tx, workspaceId, design);
        if ("templateId" in input) {
          templateId = (
            await assertTemplateInWorkspace(tx, workspaceId, input.templateId)
          ).id;
        }
        await tx`
          update kardo_core.touchpoints
          set qr_design = ${design ? tx.json(design as JsonValue) : null},
              qr_design_updated_at = ${design ? tx`now()` : null},
              qr_template_id = ${templateId}::uuid,
              updated_at = now()
          where id = ${touchpointId}::uuid and workspace_id = ${workspaceId}::uuid
        `;
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "touchpoint.qr_design_updated",
          targetType: "touchpoint",
          targetId: touchpointId,
          result: "succeeded",
          metadata: {
            source: design ? "custom" : templateId ? "library" : "inherit",
            ...(templateId ? { templateId } : {}),
          },
        });
        return readTouchpointDesign(tx, workspaceId, touchpointId);
      });
    },

    async overview(identity, workspaceId) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembership(tx, identity, workspaceId);
        const rows = await tx<
          (LastExportColumns & {
            id: string;
            qr_design: QrDesign | null;
            qr_template_id: string | null;
            group_template_id: string | null;
          })[]
        >`
          select tp.id, tp.qr_design, tp.qr_template_id,
                 inherited.qr_template_id as group_template_id,
                 tp.qr_last_export_at, tp.qr_last_export_fingerprint, tp.qr_last_export_format
          from kardo_core.touchpoints tp
          left join kardo_core.touchpoint_groups g on g.id = tp.group_id
          ${nearestGroupTemplate(tx)}
          where tp.workspace_id = ${workspaceId}::uuid
            and tp.kind in ('qr', 'nfc')
            and tp.status::text <> 'retired'
          order by tp.created_at
          limit 5000
        `;
        return rows.map((row) => {
          const source = row.qr_design
            ? "custom"
            : row.qr_template_id
              ? "library"
              : row.group_template_id
                ? "group"
                : "default";
          return {
            touchpointId: row.id,
            source,
            templateId:
              source === "library"
                ? row.qr_template_id
                : source === "group"
                  ? row.group_template_id
                  : null,
            design: row.qr_design,
            lastExport: toLastExport(row),
          };
        });
      });
    },

    async listTemplates(identity, workspaceId) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembership(tx, identity, workspaceId);
        return (await readTemplates(tx, workspaceId, null)).map(toTemplate);
      });
    },

    async getTemplate(identity, workspaceId, templateId) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembership(tx, identity, workspaceId);
        const row = (await readTemplates(tx, workspaceId, templateId))[0];
        if (!row) throw new NotFoundError("QR template was not found.");
        const touchpoints = await tx<{ id: string }[]>`
          select id from kardo_core.touchpoints
          where workspace_id = ${workspaceId}::uuid
            and qr_template_id = ${templateId}::uuid
            and kind in ('qr', 'nfc')
            and status::text <> 'retired'
          order by created_at
          limit 5000
        `;
        const groups = await tx<{ id: string }[]>`
          select id from kardo_core.touchpoint_groups
          where workspace_id = ${workspaceId}::uuid and qr_template_id = ${templateId}::uuid
          order by created_at
          limit 1000
        `;
        return {
          template: toTemplate(row),
          touchpointIds: touchpoints.map((item) => item.id),
          groupIds: groups.map((item) => item.id),
        };
      });
    },

    async createTemplate(identity, workspaceId, input) {
      const name = normalizeQrTemplateName(input.name);
      const design = normalizeQrDesign(input.design);
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "touchpoints.manage",
        );
        await assertWithinLimit(tx, workspaceId, "qr_designs.max");
        await assertLogoAsset(tx, workspaceId, design);
        let created: { id: string }[];
        try {
          created = await tx<{ id: string }[]>`
            insert into kardo_core.qr_design_templates (workspace_id, name, design, created_by, updated_by)
            values (
              ${workspaceId}::uuid,
              ${name},
              ${tx.json(design as JsonValue)},
              ${identity.subject}::uuid,
              ${identity.subject}::uuid
            )
            returning id
          `;
        } catch (error) {
          if (isTemplateLimitError(error)) {
            throw new ConflictError(
              "QR_TEMPLATE_LIMIT",
              `Tu biblioteca admite hasta ${maxQrTemplatesPerWorkspace} diseños. Borra uno para guardar otro.`,
            );
          }
          throw error;
        }
        const id = created[0]?.id;
        if (!id) throw new NotFoundError("Workspace was not found.");
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "qr_template.created",
          targetType: "qr_template",
          targetId: id,
          result: "succeeded",
          metadata: { name },
        });
        const row = (await readTemplates(tx, workspaceId, id))[0];
        if (!row) throw new NotFoundError("QR template was not found.");
        return toTemplate(row);
      });
    },

    async updateTemplate(identity, workspaceId, templateId, input) {
      const name =
        input.name === undefined ? null : normalizeQrTemplateName(input.name);
      const design =
        input.design === undefined ? null : normalizeQrDesign(input.design);
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "touchpoints.manage",
        );
        if (design) await assertLogoAsset(tx, workspaceId, design);
        const rows = await tx<{ id: string }[]>`
          update kardo_core.qr_design_templates
          set name = coalesce(${name}, name),
              design = ${design ? tx.json(design as JsonValue) : tx`design`},
              updated_at = now(),
              updated_by = ${identity.subject}::uuid
          where id = ${templateId}::uuid and workspace_id = ${workspaceId}::uuid
          returning id
        `;
        if (!rows[0]) throw new NotFoundError("QR template was not found.");
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "qr_template.updated",
          targetType: "qr_template",
          targetId: templateId,
          result: "succeeded",
          metadata: { fields: Object.keys(input) },
        });
        const row = (await readTemplates(tx, workspaceId, templateId))[0];
        if (!row) throw new NotFoundError("QR template was not found.");
        return toTemplate(row);
      });
    },

    async deleteTemplate(identity, workspaceId, templateId) {
      await withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "touchpoints.manage",
        );
        const row = (await readTemplates(tx, workspaceId, templateId))[0];
        if (!row) throw new NotFoundError("QR template was not found.");
        if (row.touchpoints + row.groups > 0) {
          throw new ConflictError(
            "QR_TEMPLATE_IN_USE",
            `Este diseño lo usan ${row.touchpoints} Touchpoints y ${row.groups} grupos. Asígnales otro diseño antes de borrarlo.`,
          );
        }
        // Retired Touchpoints never print again: release their reference.
        await tx`
          update kardo_core.touchpoints
          set qr_template_id = null
          where workspace_id = ${workspaceId}::uuid
            and qr_template_id = ${templateId}::uuid
            and status::text = 'retired'
        `;
        await tx`
          delete from kardo_core.qr_design_templates
          where id = ${templateId}::uuid and workspace_id = ${workspaceId}::uuid
        `;
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "qr_template.deleted",
          targetType: "qr_template",
          targetId: templateId,
          result: "succeeded",
          metadata: { name: row.name },
        });
      });
    },

    async applyTemplate(identity, workspaceId, templateId, input) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "touchpoints.manage",
        );
        await assertTemplateInWorkspace(tx, workspaceId, templateId);
        const touchpoints = input.touchpointIds.length
          ? await tx<{ id: string }[]>`
              update kardo_core.touchpoints
              set qr_template_id = ${templateId}::uuid,
                  qr_design = null,
                  qr_design_updated_at = null,
                  updated_at = now()
              where workspace_id = ${workspaceId}::uuid
                and id = any(${input.touchpointIds}::uuid[])
                and kind in ('qr', 'nfc')
                and status::text <> 'retired'
              returning id
            `
          : [];
        const groups = input.groupIds.length
          ? await tx<{ id: string }[]>`
              update kardo_core.touchpoint_groups
              set qr_template_id = ${templateId}::uuid, updated_at = now()
              where workspace_id = ${workspaceId}::uuid
                and id = any(${input.groupIds}::uuid[])
              returning id
            `
          : [];
        const result = {
          touchpoints: touchpoints.length,
          groups: groups.length,
          skipped:
            input.touchpointIds.length -
            touchpoints.length +
            (input.groupIds.length - groups.length),
        };
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "qr_template.applied",
          targetType: "qr_template",
          targetId: templateId,
          result: "succeeded",
          metadata: result,
        });
        return result;
      });
    },

    async setGroupTemplate(identity, workspaceId, groupId, templateId) {
      await withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "touchpoints.manage",
        );
        if (templateId)
          await assertTemplateInWorkspace(tx, workspaceId, templateId);
        const rows = await tx<{ id: string }[]>`
          update kardo_core.touchpoint_groups
          set qr_template_id = ${templateId}::uuid, updated_at = now()
          where id = ${groupId}::uuid and workspace_id = ${workspaceId}::uuid
          returning id
        `;
        if (!rows[0]) throw new NotFoundError("Group was not found.");
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "touchpoint_group.qr_design_updated",
          targetType: "touchpoint_group",
          targetId: groupId,
          result: "succeeded",
          metadata: { templateId },
        });
      });
    },

    async recordExports(identity, workspaceId, input) {
      await withCustomerContext(sql, identity, async (tx) => {
        // Any member may export (a viewer too): recording it is metadata only.
        await requireMembership(tx, identity, workspaceId);
        const ids = input.items.map((item) => item.touchpointId);
        const fingerprints = input.items.map((item) => item.fingerprint);
        // A QR's download marks «Descargar» (it reads the export time); an
        // NFC's backup QR marks «Respaldo» once (relevo 38), outside a
        // replacement, which has steps of its own.
        const rows = await tx<{ id: string }[]>`
          update kardo_core.touchpoints tp
          set qr_last_export_at = now(),
              qr_last_export_fingerprint = item.fingerprint,
              qr_last_export_format = ${input.format},
              object_backup_at = case
                when tp.kind = 'nfc' and tp.object_replacing_at is null
                  then coalesce(tp.object_backup_at, now())
                else tp.object_backup_at
              end
          from unnest(${ids}::uuid[], ${fingerprints}::text[]) as item(id, fingerprint)
          where tp.id = item.id
            and tp.workspace_id = ${workspaceId}::uuid
            and tp.kind in ('qr', 'nfc')
            and tp.status::text <> 'retired'
          returning tp.id
        `;
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "qr.exported",
          targetType: "workspace",
          targetId: workspaceId,
          result: "succeeded",
          metadata: { format: input.format, touchpoints: rows.length },
        });
      });
    },
  };
}

/**
 * Called inside the asset deletion transaction: designs that used the asset
 * as their logo keep everything else and simply lose the logo.
 */
export async function detachQrLogoAsset(
  tx: Sql,
  workspaceId: string,
  assetId: string,
): Promise<void> {
  await tx`
    update kardo_core.touchpoints
    set qr_design = jsonb_set(qr_design, '{logo}', 'null'::jsonb),
        qr_design_updated_at = now()
    where workspace_id = ${workspaceId}::uuid
      and qr_design->'logo'->>'assetId' = ${assetId}
  `;
  await tx`
    update kardo_core.qr_design_templates
    set design = jsonb_set(design, '{logo}', 'null'::jsonb), updated_at = now()
    where workspace_id = ${workspaceId}::uuid
      and design->'logo'->>'assetId' = ${assetId}
  `;
}
