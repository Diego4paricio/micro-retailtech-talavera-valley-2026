import {
  type AddStatusUpdate,
  type CreateStatusIncident,
  closingStatusUpdate,
  type PublicStatusIncident,
  type StaffStatusIncident,
  type StaffStatusIncidentList,
  type StatusComponentId,
  type StatusIncidentImpact,
  type StatusIncidentKind,
  type StatusUpdateKind,
  staffPermissions,
  statusUpdateKindsFor,
} from "@kardo/contracts";
import type { Sql } from "postgres";
import type { StatusWorkerClient } from "../clients/status-worker.js";
import {
  insertStaffAuditEvent,
  requireStaffPermission,
  withStaffContext,
} from "../http/context.js";
import {
  StaffConflictError,
  StaffDependencyError,
  StaffNotFoundError,
  StaffRepositoryError,
  StaffValidationError,
} from "../http/errors.js";

/**
 * Incidents and scheduled maintenance (ADR 022 §5). Postgres is the audited
 * source of truth; after every change the full live set is pushed to the
 * status Worker inside the same transaction. If the Worker does not confirm,
 * the change rolls back (503), so what customers see never drifts from what
 * Operations shows.
 */
export type StaffStatusRepository = {
  /** Throws unless the staff member holds `permission` (status.read/write). */
  requirePermission(
    subject: string,
    permission: "status.read" | "status.write",
  ): Promise<void>;
  listIncidents(subject: string): Promise<StaffStatusIncidentList>;
  createIncident(
    subject: string,
    input: CreateStatusIncident,
    worker: StatusWorkerClient,
  ): Promise<StaffStatusIncident>;
  addUpdate(
    subject: string,
    incidentId: string,
    input: AddStatusUpdate,
    worker: StatusWorkerClient,
  ): Promise<StaffStatusIncident>;
  /** Pushes the live set again (after a fresh Worker deploy). */
  resync(subject: string, worker: StatusWorkerClient): Promise<number>;
};

export function unavailableStaffStatusRepository(): StaffStatusRepository {
  const unavailable = () => Promise.reject(new StaffRepositoryError());
  return {
    requirePermission: unavailable,
    listIncidents: unavailable,
    createIncident: unavailable,
    addUpdate: unavailable,
    resync: unavailable,
  };
}

type IncidentRow = {
  id: string;
  kind: StatusIncidentKind;
  title: string;
  impact: StatusIncidentImpact;
  components: StatusComponentId[] | string;
  starts_at: Date | string;
  ends_at: Date | string | null;
  resolved_at: Date | string | null;
  created_at: Date | string;
  created_by_name: string | null;
};

type UpdateRow = {
  incident_id: string;
  status: StatusUpdateKind;
  message: string;
  created_at: Date | string;
};

function iso(value: Date | string): string {
  return new Date(value).toISOString();
}
function isoOrNull(value: Date | string | null): string | null {
  return value === null ? null : iso(value);
}
function components(value: StatusComponentId[] | string): StatusComponentId[] {
  if (Array.isArray(value)) return value;
  const inner = value.replace(/^\{|\}$/g, "");
  return (inner ? inner.split(",") : []) as StatusComponentId[];
}

function toStaffIncident(
  row: IncidentRow,
  updates: readonly UpdateRow[],
): StaffStatusIncident {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    impact: row.impact,
    components: components(row.components),
    startsAt: iso(row.starts_at),
    endsAt: isoOrNull(row.ends_at),
    resolvedAt: isoOrNull(row.resolved_at),
    updates: updates
      .filter((update) => update.incident_id === row.id)
      .map((update) => ({
        status: update.status,
        message: update.message,
        at: iso(update.created_at),
      })),
    createdAt: iso(row.created_at),
    createdBy: row.created_by_name,
  };
}

export function toPublicIncident(
  incident: StaffStatusIncident,
): PublicStatusIncident {
  const { createdAt: _createdAt, createdBy: _createdBy, ...rest } = incident;
  return rest;
}

async function readIncidents(
  tx: Sql,
  where: "open" | "recent" | { id: string },
): Promise<StaffStatusIncident[]> {
  const filter =
    where === "open"
      ? tx`i.resolved_at is null`
      : where === "recent"
        ? tx`i.resolved_at is not null and i.resolved_at > now() - interval '30 days'`
        : tx`i.id = ${where.id}::uuid`;
  const rows = await tx<IncidentRow[]>`
    select i.id, i.kind, i.title, i.impact, i.components, i.starts_at, i.ends_at,
           i.resolved_at, i.created_at,
           coalesce(author.display_name, author_profile.email) as created_by_name
    from kardo_core.status_incidents i
    left join kardo_staff.staff_profiles author on author.id = i.created_by
    left join kardo_core.profiles author_profile on author_profile.id = i.created_by
    where ${filter}
    order by i.starts_at desc, i.id desc
    limit 50
  `;
  if (rows.length === 0) return [];
  const updates = await tx<UpdateRow[]>`
    select u.incident_id, u.status, u.message, u.created_at
    from kardo_core.status_incident_updates u
    where u.incident_id = any(${rows.map((row) => row.id)}::uuid[])
    order by u.created_at desc, u.id desc
  `;
  return rows.map((row) => toStaffIncident(row, updates));
}

/** Sends every open incident and maintenance (in progress or upcoming). */
async function pushLiveSet(
  tx: Sql,
  worker: StatusWorkerClient,
): Promise<number> {
  const open = await readIncidents(tx, "open");
  const versionRows = await tx<{ version: string }[]>`
    select nextval('kardo_core.status_publication_seq')::text as version
  `;
  const version = Number(versionRows[0]?.version ?? 0);
  try {
    await worker.publishIncidents({
      version,
      incidents: open.map(toPublicIncident),
    });
  } catch {
    throw new StaffDependencyError(
      "The status service did not confirm the change.",
    );
  }
  return open.length;
}

export function createPostgresStaffStatusRepository(
  sql: Sql,
): StaffStatusRepository {
  return {
    async requirePermission(subject, permission) {
      await withStaffContext(sql, subject, (tx) =>
        requireStaffPermission(tx, subject, permission),
      );
    },

    async listIncidents(subject) {
      return withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(tx, subject, staffPermissions.statusRead);
        const [open, recent] = [
          await readIncidents(tx, "open"),
          await readIncidents(tx, "recent"),
        ];
        return { open, recent };
      });
    },

    async createIncident(subject, input, worker) {
      const title = input.title.trim();
      const message = input.message.trim();
      if (!title || !message) {
        throw new StaffValidationError("Title and message are required.");
      }
      const isMaintenance = input.kind === "maintenance";
      if (isMaintenance !== (input.impact === "maintenance")) {
        throw new StaffValidationError(
          "Maintenance has its own impact; incidents cannot use it.",
        );
      }
      const startsAt = input.startsAt ? new Date(input.startsAt) : new Date();
      const endsAt = input.endsAt ? new Date(input.endsAt) : null;
      if (isMaintenance && !endsAt) {
        throw new StaffValidationError("Maintenance needs an end time.");
      }
      if (endsAt && endsAt.getTime() <= startsAt.getTime()) {
        throw new StaffValidationError("It must end after it starts.");
      }
      const firstUpdate: StatusUpdateKind = isMaintenance
        ? startsAt.getTime() > Date.now()
          ? "scheduled"
          : "in_progress"
        : "investigating";

      const incident = await withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(tx, subject, staffPermissions.statusWrite);
        const inserted = await tx<{ id: string }[]>`
          insert into kardo_core.status_incidents (
            kind, title, impact, components, starts_at, ends_at, created_by, updated_by
          ) values (
            ${input.kind}, ${title}, ${input.impact},
            ${[...new Set(input.components)]}::text[],
            ${startsAt.toISOString()}::timestamptz,
            ${endsAt ? endsAt.toISOString() : null}::timestamptz,
            ${subject}::uuid, ${subject}::uuid
          )
          returning id
        `;
        const id = inserted[0]?.id;
        if (!id) throw new StaffRepositoryError();
        await tx`
          insert into kardo_core.status_incident_updates (incident_id, status, message, created_by)
          values (${id}::uuid, ${firstUpdate}, ${message}, ${subject}::uuid)
        `;
        await insertStaffAuditEvent(tx, {
          actorSubject: subject,
          action: isMaintenance
            ? "status.maintenance_scheduled"
            : "status.incident_opened",
          targetType: "status_incident",
          targetId: id,
          result: "succeeded",
          metadata: {
            impact: input.impact,
            components: input.components,
            messageLength: message.length,
          },
        });
        await pushLiveSet(tx, worker);
        return (await readIncidents(tx, { id }))[0];
      });
      if (!incident) throw new StaffRepositoryError();
      return incident;
    },

    async addUpdate(subject, incidentId, input, worker) {
      const message = input.message.trim();
      if (!message) throw new StaffValidationError("The message is empty.");
      const incident = await withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(tx, subject, staffPermissions.statusWrite);
        const current = (await readIncidents(tx, { id: incidentId }))[0];
        if (!current) throw new StaffNotFoundError();
        if (current.resolvedAt !== null) {
          throw new StaffConflictError("This incident is already closed.");
        }
        if (!statusUpdateKindsFor(current.kind).includes(input.status)) {
          throw new StaffValidationError(
            "That update does not apply to this kind.",
          );
        }
        if (input.impact !== undefined) {
          if (
            current.kind === "maintenance" ||
            input.impact === "maintenance"
          ) {
            throw new StaffValidationError(
              "Only incidents change their impact.",
            );
          }
        }
        const closes = input.status === closingStatusUpdate(current.kind);
        await tx`
          insert into kardo_core.status_incident_updates (incident_id, status, message, created_by)
          values (${incidentId}::uuid, ${input.status}, ${message}, ${subject}::uuid)
        `;
        await tx`
          update kardo_core.status_incidents
          set updated_by = ${subject}::uuid,
              updated_at = now()
              ${input.impact !== undefined ? tx`, impact = ${input.impact}` : tx``}
              ${closes ? tx`, resolved_at = now()` : tx``}
              ${
                current.kind === "maintenance" && input.status === "in_progress"
                  ? tx`, starts_at = least(starts_at, now())`
                  : tx``
              }
          where id = ${incidentId}::uuid
        `;
        await insertStaffAuditEvent(tx, {
          actorSubject: subject,
          action: closes
            ? current.kind === "maintenance"
              ? "status.maintenance_completed"
              : "status.incident_resolved"
            : "status.incident_updated",
          targetType: "status_incident",
          targetId: incidentId,
          result: "succeeded",
          metadata: {
            status: input.status,
            impact: input.impact ?? null,
            messageLength: message.length,
          },
        });
        await pushLiveSet(tx, worker);
        return (await readIncidents(tx, { id: incidentId }))[0];
      });
      if (!incident) throw new StaffNotFoundError();
      return incident;
    },

    async resync(subject, worker) {
      return withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(tx, subject, staffPermissions.statusWrite);
        return pushLiveSet(tx, worker);
      });
    },
  };
}
