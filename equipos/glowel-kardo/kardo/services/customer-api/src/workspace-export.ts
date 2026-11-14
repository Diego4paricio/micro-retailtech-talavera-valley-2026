import type { Sql } from "postgres";
import {
  type CustomerIdentity,
  insertAuditEvent,
  requireMembershipWithPermission,
  withCustomerContext,
} from "./repositories/context.js";

// ---------------------------------------------------------------------------
// «Descargar los datos de la organización» (ADR 020 §4, LFPDPPP; it lived in
// billing until the domain audit of 2026-10-13, A2-64: it is the
// organization's data, not its plan): one JSON document with
// what the organization created — its Touchpoints, Experiences (draft and
// live content), groups and leads — so it can leave with its data before the
// deletion, in any access state. Reads run as the customer role (RLS).
// ---------------------------------------------------------------------------

/** Leads in one export; the CSV export keeps working for bigger archives. */
export const EXPORT_MAX_LEADS = 20_000;

export type WorkspaceExport = {
  format: "kardo.workspace-export";
  version: 1;
  exportedAt: string;
  workspace: {
    id: string;
    name: string;
    kind: string;
    createdAt: string;
    profile: unknown;
  };
  members: { email: string | null; displayName: string | null; role: string }[];
  groups: {
    id: string;
    name: string;
    description: string | null;
    /** The group it lives in (groups nest, ADR 021). */
    parentId: string | null;
    kind: "location" | "group";
  }[];
  touchpoints: {
    id: string;
    publicId: string;
    kind: string;
    handle: string | null;
    status: string;
    name: string | null;
    physicalType: string | null;
    groupId: string | null;
    createdAt: string;
  }[];
  experiences: {
    id: string;
    name: string;
    type: string;
    touchpointId: string | null;
    archivedAt: string | null;
    createdAt: string;
    draftContent: unknown;
    /** Latest published version, if any. */
    publishedContent: unknown;
    publishedRevision: number | null;
  }[];
  leads: {
    id: string;
    touchpointId: string | null;
    name: string | null;
    email: string | null;
    phone: string | null;
    message: string | null;
    fields: unknown;
    status: string | null;
    consentedAt: string | null;
    createdAt: string;
  }[];
  /** True when there were more than `EXPORT_MAX_LEADS` leads. */
  leadsTruncated: boolean;
};

const iso = (value: Date | null): string | null =>
  value ? new Date(value).toISOString() : null;

export async function readWorkspaceExport(
  tx: Sql,
  workspaceId: string,
): Promise<WorkspaceExport> {
  const [workspace] = await tx<
    {
      id: string;
      name: string;
      kind: string;
      created_at: Date;
      profile: unknown;
    }[]
  >`
    select id, name, kind::text as kind, created_at, profile
    from kardo_core.workspaces where id = ${workspaceId}::uuid
  `;
  const members = await tx<
    { email: string | null; display_name: string | null; role: string }[]
  >`
    select p.email, p.display_name, m.role::text as role
    from kardo_core.workspace_memberships m
    join kardo_core.profiles p on p.id = m.profile_id
    where m.workspace_id = ${workspaceId}::uuid
    order by m.created_at
  `;
  const groupRows = await tx<
    {
      id: string;
      name: string;
      description: string | null;
      parent_id: string | null;
      kind: "location" | "group";
    }[]
  >`
    select id, name, description, parent_id, kind from kardo_core.touchpoint_groups
    where workspace_id = ${workspaceId}::uuid
    order by created_at
  `;
  const groups = groupRows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    parentId: row.parent_id,
    kind: row.kind,
  }));
  const touchpoints = await tx<
    {
      id: string;
      public_id: string;
      kind: string;
      handle: string | null;
      status: string;
      operational_name: string | null;
      physical_type: string | null;
      group_id: string | null;
      created_at: Date;
    }[]
  >`
    select id, public_id, kind, handle, status::text as status, operational_name,
      physical_type, group_id, created_at
    from kardo_core.touchpoints
    where workspace_id = ${workspaceId}::uuid
    order by created_at
  `;
  const experiences = await tx<
    {
      id: string;
      name: string;
      type: string;
      touchpoint_id: string | null;
      archived_at: Date | null;
      created_at: Date;
      draft_content: unknown;
      published_content: unknown;
      published_revision: number | null;
    }[]
  >`
    select e.id, e.name, e.type::text as type, e.touchpoint_id, e.archived_at,
      e.created_at, e.draft_content,
      v.content as published_content, v.revision as published_revision
    from kardo_core.experiences e
    left join lateral (
      select ev.content, ev.revision from kardo_core.experience_versions ev
      where ev.experience_id = e.id
      order by ev.revision desc
      limit 1
    ) v on true
    where e.workspace_id = ${workspaceId}::uuid
    order by e.created_at
  `;
  const leads = await tx<
    {
      id: string;
      touchpoint_id: string | null;
      name: string | null;
      email: string | null;
      phone: string | null;
      message: string | null;
      fields: unknown;
      status: string | null;
      consented_at: Date | null;
      created_at: Date;
    }[]
  >`
    select l.id, l.touchpoint_id, l.name, l.email, l.phone, l.message,
      l.fields, l.status, l.consented_at, l.created_at
    from kardo_core.leads l
    join kardo_core.workspaces w on w.id = l.workspace_id
    where l.workspace_id = ${workspaceId}::uuid
      -- Same retention as the leads list and CSV: leads past it are hidden
      -- before the daily purge deletes them (security review 2026-10).
      and (
        w.lead_retention_days is null
        or l.created_at >= now() - make_interval(days => w.lead_retention_days)
      )
    order by l.created_at desc
    limit ${EXPORT_MAX_LEADS + 1}
  `;

  return {
    format: "kardo.workspace-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    workspace: {
      id: workspace?.id ?? workspaceId,
      name: workspace?.name ?? "",
      kind: workspace?.kind ?? "organization",
      createdAt:
        iso(workspace?.created_at ?? null) ?? new Date(0).toISOString(),
      profile: workspace?.profile ?? null,
    },
    members: members.map((row) => ({
      email: row.email,
      displayName: row.display_name,
      role: row.role,
    })),
    groups,
    touchpoints: touchpoints.map((row) => ({
      id: row.id,
      publicId: row.public_id,
      kind: row.kind,
      handle: row.handle,
      status: row.status,
      name: row.operational_name,
      physicalType: row.physical_type,
      groupId: row.group_id,
      createdAt: new Date(row.created_at).toISOString(),
    })),
    experiences: experiences.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      touchpointId: row.touchpoint_id,
      archivedAt: iso(row.archived_at),
      createdAt: new Date(row.created_at).toISOString(),
      draftContent: row.draft_content,
      publishedContent: row.published_content ?? null,
      publishedRevision: row.published_revision ?? null,
    })),
    leads: leads.slice(0, EXPORT_MAX_LEADS).map((row) => ({
      id: row.id,
      touchpointId: row.touchpoint_id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      message: row.message,
      fields: row.fields,
      status: row.status,
      consentedAt: iso(row.consented_at),
      createdAt: new Date(row.created_at).toISOString(),
    })),
    leadsTruncated: leads.length > EXPORT_MAX_LEADS,
  };
}

export type WorkspaceExporter = {
  /** The organization's data as one document (Owner and Admin: it carries
   * the requests' personal data). Writes the `workspace.exported` audit. */
  exportWorkspace(
    identity: CustomerIdentity,
    workspaceId: string,
  ): Promise<WorkspaceExport>;
};

export class WorkspaceExportUnavailableError extends Error {}

export function unavailableWorkspaceExporter(): WorkspaceExporter {
  return {
    exportWorkspace: () =>
      Promise.reject(
        new WorkspaceExportUnavailableError("Export is not configured."),
      ),
  };
}

export function createPostgresWorkspaceExporter(sql: Sql): WorkspaceExporter {
  return {
    async exportWorkspace(identity, workspaceId) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "leads.read",
          // Leaving with its data works in every access state (ADR 020 §4).
          { allowWithoutPlan: true },
        );
        const document = await readWorkspaceExport(tx, workspaceId);
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "workspace.exported",
          targetType: "workspace",
          targetId: workspaceId,
          result: "succeeded",
          metadata: {
            touchpoints: document.touchpoints.length,
            experiences: document.experiences.length,
            leads: document.leads.length,
          },
        });
        return document;
      });
    },
  };
}
