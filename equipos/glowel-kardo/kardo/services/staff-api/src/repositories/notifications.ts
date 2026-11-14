import {
  type CreateStaffNotification,
  checkNotificationAudience,
  isBroadcastAudience,
  type NotificationAudience,
  type NotificationAudienceEstimate,
  type NotificationCategory,
  normalizeNotificationActionUrl,
  type StaffNotification,
  type StaffNotificationPage,
  type StaffNotificationQuery,
  type StaffNotificationState,
  type StaffPermission,
  type StaffProfileLookup,
  staffPermissions,
  type UpdateStaffNotification,
} from "@kardo/contracts";
import type { Sql } from "postgres";
import {
  escapeLikePattern,
  insertStaffAuditEvent,
  requireStaffPermission,
  withStaffContext,
} from "../http/context.js";
import {
  StaffConflictError,
  StaffNotFoundError,
  StaffRepositoryError,
  StaffValidationError,
} from "../http/errors.js";
import {
  decodeKeysetCursor,
  encodeKeysetCursor,
  resolveLimit,
} from "../http/pagination.js";

/**
 * Notifications for the panel's bell (ADR 022). Writing to one organization
 * or person needs `notifications.send`; to everyone or a segment,
 * `notifications.broadcast`. RLS repeats both rules. The audience never
 * changes after creation; the text can be corrected (marked "edited", no new
 * alert) and the notification retired. Audit events never carry the text.
 */
export type StaffNotificationRepository = {
  list(
    subject: string,
    query: StaffNotificationQuery,
  ): Promise<StaffNotificationPage>;
  get(subject: string, notificationId: string): Promise<StaffNotification>;
  create(
    subject: string,
    input: CreateStaffNotification,
  ): Promise<StaffNotification>;
  update(
    subject: string,
    notificationId: string,
    input: UpdateStaffNotification,
  ): Promise<StaffNotification>;
  retire(subject: string, notificationId: string): Promise<StaffNotification>;
  estimate(
    subject: string,
    audience: NotificationAudience,
  ): Promise<NotificationAudienceEstimate>;
  lookupProfiles(subject: string, email: string): Promise<StaffProfileLookup>;
};

export function unavailableStaffNotificationRepository(): StaffNotificationRepository {
  const unavailable = () => Promise.reject(new StaffRepositoryError());
  return {
    list: unavailable,
    get: unavailable,
    create: unavailable,
    update: unavailable,
    retire: unavailable,
    estimate: unavailable,
    lookupProfiles: unavailable,
  };
}

type Row = {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  action_label: string | null;
  action_url: string | null;
  audience: NotificationAudience["kind"];
  workspace_id: string | null;
  profile_id: string | null;
  plan_codes: string[] | null;
  billing_states: string[] | null;
  account_types: string[] | null;
  roles: string[] | null;
  pinned: boolean;
  state: StaffNotificationState;
  publish_at: Date | string;
  expires_at: Date | string | null;
  edited_at: Date | string | null;
  retired_at: Date | string | null;
  created_at: Date | string;
  cursor_at: string;
  created_by_name: string | null;
  workspace_name: string | null;
  profile_email: string | null;
  reads: number | string;
};

function iso(value: Date | string): string {
  return new Date(value).toISOString();
}
function isoOrNull(value: Date | string | null): string | null {
  return value === null ? null : iso(value);
}

/** Postgres returns enum arrays as `{owner,admin}` text unless the type is
 * registered; accept both. */
function textArray(value: string[] | string | null): string[] | null {
  if (value === null) return null;
  if (Array.isArray(value)) return value;
  const inner = value.replace(/^\{|\}$/g, "");
  return inner.length === 0 ? [] : inner.split(",");
}

export function audienceFromRow(row: Row): NotificationAudience {
  const roles = textArray(row.roles) as NotificationAudience["roles"] | null;
  const planCodes = textArray(row.plan_codes);
  const billingStates = textArray(row.billing_states) as
    | NotificationAudience["billingStates"]
    | null;
  const accountTypes = textArray(row.account_types) as
    | NotificationAudience["accountTypes"]
    | null;
  return {
    kind: row.audience,
    ...(row.workspace_id ? { workspaceId: row.workspace_id } : {}),
    ...(row.profile_id ? { profileId: row.profile_id } : {}),
    ...(planCodes ? { planCodes } : {}),
    ...(billingStates ? { billingStates } : {}),
    ...(accountTypes ? { accountTypes } : {}),
    ...(roles ? { roles } : {}),
  };
}

export function toStaffNotification(row: Row): StaffNotification {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    body: row.body,
    action:
      row.action_label !== null && row.action_url !== null
        ? { label: row.action_label, url: row.action_url }
        : null,
    audience: audienceFromRow(row),
    audienceLabel: {
      workspaceName: row.workspace_name,
      profileEmail: row.profile_email,
    },
    pinned: row.pinned,
    state: row.state,
    publishAt: iso(row.publish_at),
    expiresAt: isoOrNull(row.expires_at),
    editedAt: isoOrNull(row.edited_at),
    retiredAt: isoOrNull(row.retired_at),
    createdAt: iso(row.created_at),
    createdBy: row.created_by_name,
    reads: Number(row.reads),
  };
}

/** Writing (and editing, and retiring) one audience needs this permission. */
export function permissionFor(audience: NotificationAudience): StaffPermission {
  return isBroadcastAudience(audience)
    ? staffPermissions.notificationsBroadcast
    : staffPermissions.notificationsSend;
}

function normalizeAction(
  action: CreateStaffNotification["action"],
): { label: string; url: string } | null {
  if (!action) return null;
  const label = action.label.trim();
  const url = normalizeNotificationActionUrl(action.url);
  if (!label || !url) {
    throw new StaffValidationError(
      "The button needs a label and a panel path or an https address.",
    );
  }
  return { label, url };
}

function requireText(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new StaffValidationError(`The ${field} is empty.`);
  return trimmed;
}

const selectColumns = (tx: Sql) => tx`
  n.id, n.category, n.title, n.body, n.action_label, n.action_url, n.audience,
  n.workspace_id, n.profile_id, n.plan_codes, n.billing_states, n.account_types,
  n.roles::text[] as roles, n.pinned, n.publish_at, n.expires_at, n.edited_at,
  n.retired_at, n.created_at,
  to_char(n.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_at,
  case
    when n.retired_at is not null then 'retired'
    when n.publish_at > now() then 'scheduled'
    when n.expires_at is not null and n.expires_at <= now() then 'expired'
    else 'active'
  end as state,
  coalesce(author.display_name, author_profile.email) as created_by_name,
  w.name as workspace_name,
  p.email as profile_email,
  (select count(r.notification_id) from kardo_core.notification_reads r where r.notification_id = n.id) as reads
`;

const fromClause = (tx: Sql) => tx`
  kardo_core.notifications n
  left join kardo_staff.staff_profiles author on author.id = n.created_by
  left join kardo_core.profiles author_profile on author_profile.id = n.created_by
  left join kardo_core.workspaces w on w.id = n.workspace_id
  left join kardo_core.profiles p on p.id = n.profile_id
`;

async function readOne(tx: Sql, id: string): Promise<Row | undefined> {
  const rows = await tx<Row[]>`
    select ${selectColumns(tx)} from ${fromClause(tx)} where n.id = ${id}::uuid
  `;
  return rows[0];
}

function rolesParam(tx: Sql, roles: readonly string[] | undefined) {
  return roles
    ? tx`${roles as string[]}::kardo_core.membership_role[]`
    : tx`null`;
}
function textArrayParam(tx: Sql, values: readonly string[] | undefined) {
  return values ? tx`${values as string[]}::text[]` : tx`null`;
}

/** Maps the guard trigger's fixed messages to API errors. */
function mapGuardError(error: unknown): never {
  const failure = error as { code?: string; message?: string };
  if (failure?.code === "P0001") {
    if (failure.message === "NOTIFICATION_RETIRED") {
      throw new StaffConflictError("This notification was retired.");
    }
    if (failure.message === "NOTIFICATION_ALREADY_PUBLISHED") {
      throw new StaffConflictError(
        "The publish date only moves before publishing.",
      );
    }
    if (failure.message === "NOTIFICATION_AUDIENCE_LOCKED") {
      throw new StaffConflictError("The audience cannot change.");
    }
  }
  // 23514: a CHECK the API did not anticipate (dates, sizes).
  if (failure?.code === "23514") {
    throw new StaffValidationError("The notification is not valid.");
  }
  throw error;
}

export function createPostgresStaffNotificationRepository(
  sql: Sql,
): StaffNotificationRepository {
  return {
    async list(subject, query) {
      const limit = resolveLimit(query.limit);
      const cursor = query.cursor ? decodeKeysetCursor(query.cursor) : null;
      const rows = await withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(
          tx,
          subject,
          staffPermissions.notificationsRead,
        );
        const stateFilter =
          query.state === "retired"
            ? tx`and n.retired_at is not null`
            : query.state === "scheduled"
              ? tx`and n.retired_at is null and n.publish_at > now()`
              : query.state === "expired"
                ? tx`and n.retired_at is null and n.publish_at <= now() and n.expires_at <= now()`
                : query.state === "active"
                  ? tx`and n.retired_at is null and n.publish_at <= now() and (n.expires_at is null or n.expires_at > now())`
                  : tx``;
        return tx<Row[]>`
          select ${selectColumns(tx)}
          from ${fromClause(tx)}
          where true ${stateFilter}
            ${
              cursor
                ? // `::text` first: postgres.js would serialize a timestamptz
                  // parameter through Date and drop the microseconds.
                  tx`and (n.created_at, n.id) < (${cursor.timestamp}::text::timestamptz, ${cursor.id}::uuid)`
                : tx``
            }
          order by n.created_at desc, n.id desc
          limit ${limit + 1}
        `;
      });
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: page.map(toStaffNotification),
        nextCursor:
          rows.length > limit && last
            ? encodeKeysetCursor({ timestamp: last.cursor_at, id: last.id })
            : null,
      };
    },

    async get(subject, notificationId) {
      const row = await withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(
          tx,
          subject,
          staffPermissions.notificationsRead,
        );
        return readOne(tx, notificationId);
      });
      if (!row) throw new StaffNotFoundError();
      return toStaffNotification(row);
    },

    async create(subject, input) {
      if (checkNotificationAudience(input.audience)) {
        throw new StaffValidationError("The audience is not valid.");
      }
      const title = requireText(input.title, "title");
      const body = requireText(input.body, "text");
      const action = normalizeAction(input.action);
      const publishAt = input.publishAt ? new Date(input.publishAt) : null;
      const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
      if (
        expiresAt &&
        expiresAt.getTime() <= (publishAt ?? new Date()).getTime()
      ) {
        throw new StaffValidationError("It must expire after it is published.");
      }
      const audience = input.audience;
      const row = await withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(tx, subject, permissionFor(audience));
        if (audience.kind === "workspace") {
          const exists = await tx`
            select 1 from kardo_core.workspaces where id = ${audience.workspaceId ?? null}::uuid
          `;
          if (!exists[0]) throw new StaffNotFoundError();
        }
        if (audience.kind === "profile") {
          const exists = await tx`
            select 1 from kardo_core.profiles where id = ${audience.profileId ?? null}::uuid
          `;
          if (!exists[0]) throw new StaffNotFoundError();
        }
        const inserted = await tx<{ id: string }[]>`
          insert into kardo_core.notifications (
            category, title, body, action_label, action_url, audience,
            workspace_id, profile_id, plan_codes, billing_states, account_types, roles,
            pinned, publish_at, expires_at, created_by, updated_by
          ) values (
            ${input.category}, ${title}, ${body},
            ${action?.label ?? null}, ${action?.url ?? null},
            ${audience.kind},
            ${audience.workspaceId ?? null}::uuid,
            ${audience.profileId ?? null}::uuid,
            ${textArrayParam(tx, audience.planCodes)},
            ${textArrayParam(tx, audience.billingStates)},
            ${textArrayParam(tx, audience.accountTypes)},
            ${rolesParam(tx, audience.roles)},
            ${input.pinned ?? false},
            ${publishAt ? tx`${publishAt.toISOString()}::timestamptz` : tx`now()`},
            ${expiresAt ? expiresAt.toISOString() : null}::timestamptz,
            ${subject}::uuid, ${subject}::uuid
          )
          returning id
        `.catch(mapGuardError);
        const id = inserted[0]?.id;
        if (!id) throw new StaffRepositoryError();
        await insertStaffAuditEvent(tx, {
          workspaceId:
            audience.kind === "workspace"
              ? (audience.workspaceId ?? null)
              : null,
          actorSubject: subject,
          action: "notification.published",
          targetType: "notification",
          targetId: id,
          result: "succeeded",
          metadata: {
            category: input.category,
            audience: audience.kind,
            roles: audience.roles ?? null,
            scheduled: publishAt !== null && publishAt.getTime() > Date.now(),
            pinned: input.pinned ?? false,
            titleLength: title.length,
            bodyLength: body.length,
          },
        });
        return readOne(tx, id);
      });
      if (!row) throw new StaffRepositoryError();
      return toStaffNotification(row);
    },

    async update(subject, notificationId, input) {
      // Fastify drops unknown fields (an `audience`, say) before this runs:
      // an edit left with nothing to change is refused, not silently "done".
      const editable = [
        "category",
        "title",
        "body",
        "action",
        "pinned",
        "publishAt",
        "expiresAt",
      ] as const;
      if (!editable.some((field) => input[field] !== undefined)) {
        throw new StaffValidationError("Nothing to change.");
      }
      const row = await withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(
          tx,
          subject,
          staffPermissions.notificationsRead,
        );
        const current = await readOne(tx, notificationId);
        if (!current) throw new StaffNotFoundError();
        await requireStaffPermission(
          tx,
          subject,
          permissionFor(audienceFromRow(current)),
        );
        if (current.retired_at !== null) {
          throw new StaffConflictError("This notification was retired.");
        }
        const textChanged =
          (input.title !== undefined && input.title.trim() !== current.title) ||
          (input.body !== undefined && input.body.trim() !== current.body) ||
          input.action !== undefined ||
          (input.category !== undefined && input.category !== current.category);
        const published = new Date(current.publish_at).getTime() <= Date.now();
        const action =
          input.action === undefined
            ? undefined
            : normalizeAction(input.action);
        const sets = [
          input.category !== undefined
            ? tx`category = ${input.category}`
            : null,
          input.title !== undefined
            ? tx`title = ${requireText(input.title, "title")}`
            : null,
          input.body !== undefined
            ? tx`body = ${requireText(input.body, "text")}`
            : null,
          action !== undefined
            ? tx`action_label = ${action?.label ?? null}, action_url = ${action?.url ?? null}`
            : null,
          input.pinned !== undefined ? tx`pinned = ${input.pinned}` : null,
          input.publishAt !== undefined
            ? tx`publish_at = ${new Date(input.publishAt).toISOString()}::timestamptz`
            : null,
          input.expiresAt !== undefined
            ? tx`expires_at = ${input.expiresAt ? new Date(input.expiresAt).toISOString() : null}::timestamptz`
            : null,
          textChanged && published ? tx`edited_at = now()` : null,
          tx`updated_by = ${subject}::uuid`,
        ].filter((part) => part !== null);
        let assignments = sets[0] ?? tx``;
        for (const part of sets.slice(1))
          assignments = tx`${assignments}, ${part}`;
        await tx`
          update kardo_core.notifications set ${assignments}
          where id = ${notificationId}::uuid
        `.catch(mapGuardError);
        await insertStaffAuditEvent(tx, {
          workspaceId:
            current.audience === "workspace" ? current.workspace_id : null,
          actorSubject: subject,
          action: "notification.edited",
          targetType: "notification",
          targetId: notificationId,
          result: "succeeded",
          metadata: {
            fields: Object.keys(input).sort(),
            markedEdited: textChanged && published,
          },
        });
        return readOne(tx, notificationId);
      });
      if (!row) throw new StaffNotFoundError();
      return toStaffNotification(row);
    },

    async retire(subject, notificationId) {
      const row = await withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(
          tx,
          subject,
          staffPermissions.notificationsRead,
        );
        const current = await readOne(tx, notificationId);
        if (!current) throw new StaffNotFoundError();
        await requireStaffPermission(
          tx,
          subject,
          permissionFor(audienceFromRow(current)),
        );
        if (current.retired_at !== null) {
          throw new StaffConflictError("This notification was retired.");
        }
        await tx`
          update kardo_core.notifications
          set retired_at = now(), retired_by = ${subject}::uuid, updated_by = ${subject}::uuid
          where id = ${notificationId}::uuid
        `.catch(mapGuardError);
        await insertStaffAuditEvent(tx, {
          workspaceId:
            current.audience === "workspace" ? current.workspace_id : null,
          actorSubject: subject,
          action: "notification.retired",
          targetType: "notification",
          targetId: notificationId,
          result: "succeeded",
          metadata: {
            audience: current.audience,
            reads: Number(current.reads),
          },
        });
        return readOne(tx, notificationId);
      });
      if (!row) throw new StaffNotFoundError();
      return toStaffNotification(row);
    },

    async estimate(subject, audience) {
      if (checkNotificationAudience(audience)) {
        throw new StaffValidationError("The audience is not valid.");
      }
      const rows = await withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(
          tx,
          subject,
          staffPermissions.notificationsRead,
        );
        return tx<{ profiles: string | number; workspaces: string | number }[]>`
          select profiles, workspaces from kardo_private.notification_audience_count(
            ${audience.kind},
            ${audience.workspaceId ?? null}::uuid,
            ${audience.profileId ?? null}::uuid,
            ${textArrayParam(tx, audience.planCodes)},
            ${textArrayParam(tx, audience.billingStates)},
            ${textArrayParam(tx, audience.accountTypes)},
            ${rolesParam(tx, audience.roles)}
          )
        `;
      });
      return {
        profiles: Number(rows[0]?.profiles ?? 0),
        workspaces: Number(rows[0]?.workspaces ?? 0),
      };
    },

    async lookupProfiles(subject, email) {
      const term = email.trim().toLowerCase();
      if (term.length < 3) return { items: [] };
      const rows = await withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(
          tx,
          subject,
          staffPermissions.notificationsSend,
        );
        return tx<
          {
            id: string;
            email: string;
            display_name: string | null;
            workspaces: number | string;
          }[]
        >`
          select p.id, p.email, p.display_name,
                 (select count(m.workspace_id) from kardo_core.workspace_memberships m where m.profile_id = p.id) as workspaces
          from kardo_core.profiles p
          where p.email ilike ${`${escapeLikePattern(term)}%`} escape '\\'
          order by p.email
          limit 10
        `;
      });
      return {
        items: rows.map((row) => ({
          id: row.id,
          email: row.email,
          displayName: row.display_name,
          workspaces: Number(row.workspaces),
        })),
      };
    },
  };
}
