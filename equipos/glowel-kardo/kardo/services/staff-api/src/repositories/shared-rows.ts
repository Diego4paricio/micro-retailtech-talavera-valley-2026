import type {
  StaffAuditEvent,
  StaffPublicationRow,
  StaffTouchpointRow,
} from "@kardo/contracts";
import type { Sql } from "postgres";

/**
 * Row shapes and SQL fragments shared by the touchpoints, workspaces,
 * publications and audit repositories, so a Touchpoint (or publication, or
 * audit event) always looks the same whether it is returned from its own
 * list/detail endpoint or embedded inside a workspace's detail view.
 */

export type TouchpointRow = {
  id: string;
  public_id: string;
  workspace_id: string | null;
  workspace_name: string | null;
  operational_name: string | null;
  physical_type: string;
  status: string;
  suspended: boolean;
  group_name: string | null;
  live_experience_name: string | null;
  live_experience_type: string | null;
  last_publication_status: string | null;
  created_at: string;
};

/** Every column `mapTouchpointRow` needs, with the joins that produce them.
 * Callers embed this once in a query's `select`/`from` and add their own
 * `where`/`order by`/`limit`. */
export function touchpointRowSelect(sql: Sql) {
  return sql`
    t.id, t.public_id, t.workspace_id,
    w.name as workspace_name,
    t.operational_name,
    t.physical_type,
    t.status::text as status,
    (t.suspended_at is not null) as suspended,
    g.name as group_name,
    live_exp.name as live_experience_name,
    live_exp.type::text as live_experience_type,
    last_pub.status::text as last_publication_status,
    t.created_at
  `;
}

export function touchpointRowFrom(sql: Sql) {
  return sql`
    from kardo_core.touchpoints t
    left join kardo_core.workspaces w on w.id = t.workspace_id
    left join kardo_core.touchpoint_groups g on g.id = t.group_id
    left join lateral (
      select p.status, ev.experience_id
      from kardo_core.publications p
      join kardo_core.experience_versions ev on ev.id = p.experience_version_id
      where p.touchpoint_id = t.id and p.status = 'published' and p.superseded_at is null
      limit 1
    ) live on true
    left join kardo_core.experiences live_exp on live_exp.id = live.experience_id
    left join lateral (
      select p2.status
      from kardo_core.publications p2
      where p2.touchpoint_id = t.id
      order by p2.created_at desc
      limit 1
    ) last_pub on true
  `;
}

export function mapTouchpointRow(row: TouchpointRow): StaffTouchpointRow {
  return {
    id: row.id,
    publicId: row.public_id,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    operationalName: row.operational_name,
    physicalType: row.physical_type,
    status: row.status as StaffTouchpointRow["status"],
    suspended: row.suspended,
    groupName: row.group_name,
    liveExperienceName: row.live_experience_name,
    liveExperienceType: row.live_experience_type,
    lastPublicationStatus:
      row.last_publication_status as StaffTouchpointRow["lastPublicationStatus"],
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export type PublicationRow = {
  id: string;
  touchpoint_id: string;
  touchpoint_public_id: string;
  touchpoint_name: string | null;
  workspace_id: string | null;
  workspace_name: string | null;
  experience_id: string;
  experience_name: string;
  experience_type: string;
  version_revision: number;
  status: string;
  job_status: string | null;
  attempts: number;
  last_error: string | null;
  created_at: string;
  published_at: string | null;
};

export function publicationRowSelect(sql: Sql) {
  return sql`
    pub.id, pub.touchpoint_id, t.public_id as touchpoint_public_id, t.operational_name as touchpoint_name,
    t.workspace_id, w.name as workspace_name,
    e.id as experience_id, e.name as experience_name, e.type::text as experience_type,
    pub.revision as version_revision,
    pub.status::text as status,
    job.status as job_status,
    coalesce(job.attempts, 0) as attempts,
    job.last_error,
    pub.created_at,
    pub.published_at
  `;
}

export function publicationRowFrom(sql: Sql) {
  return sql`
    from kardo_core.publications pub
    join kardo_core.touchpoints t on t.id = pub.touchpoint_id
    left join kardo_core.workspaces w on w.id = t.workspace_id
    join kardo_core.experience_versions ev on ev.id = pub.experience_version_id
    join kardo_core.experiences e on e.id = ev.experience_id
    left join lateral (
      select j.status, j.attempts, j.last_error
      from kardo_core.publication_jobs j
      where j.publication_id = pub.id
      order by j.created_at desc
      limit 1
    ) job on true
  `;
}

export function mapPublicationRow(row: PublicationRow): StaffPublicationRow {
  return {
    id: row.id,
    touchpointId: row.touchpoint_id,
    touchpointPublicId: row.touchpoint_public_id,
    touchpointName: row.touchpoint_name,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    experienceId: row.experience_id,
    experienceName: row.experience_name,
    experienceType: row.experience_type,
    versionRevision: row.version_revision,
    status: row.status as StaffPublicationRow["status"],
    jobStatus: row.job_status as StaffPublicationRow["jobStatus"],
    attempts: row.attempts,
    lastError: row.last_error,
    createdAt: new Date(row.created_at).toISOString(),
    publishedAt: row.published_at
      ? new Date(row.published_at).toISOString()
      : null,
  };
}

export type AuditEventRow = {
  id: string;
  occurred_at: string;
  workspace_id: string | null;
  workspace_name: string | null;
  actor_type: string;
  actor_subject: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  result: string;
  metadata: Record<string, unknown>;
};

export function auditEventRowSelect(sql: Sql) {
  return sql`
    event.id, event.occurred_at, event.workspace_id, workspace.name as workspace_name,
    event.actor_type, event.actor_subject, actor_profile.email as actor_email,
    event.action, event.target_type, event.target_id::text as target_id, event.result, event.metadata
  `;
}

export function auditEventRowFrom(sql: Sql) {
  return sql`
    from kardo_audit.events event
    left join kardo_core.workspaces workspace on workspace.id = event.workspace_id
    left join kardo_core.profiles actor_profile on actor_profile.id = event.actor_subject
  `;
}

export function mapAuditEventRow(row: AuditEventRow): StaffAuditEvent {
  return {
    id: row.id,
    occurredAt: new Date(row.occurred_at).toISOString(),
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    actorType: row.actor_type,
    actorSubject: row.actor_subject,
    actorEmail: row.actor_email,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    result: row.result,
    metadata: row.metadata ?? {},
  };
}
