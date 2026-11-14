import type {
  CustomerNotificationCategory,
  Notification,
  NotificationInbox,
} from "@kardo/contracts";
import type { Sql } from "postgres";
import { InvalidCursorError, NotFoundError } from "../errors.js";
import { type CustomerIdentity, withCustomerContext } from "./context.js";

/**
 * The bell of the panel (ADR 022): notifications Kardo's staff publishes in
 * Operations, plus those the database writes by itself in the same
 * transaction as the event (ADR 022, addendum of 2026-10-13): a new request
 * (`lead`), an ownership transfer for its recipient and the plan's notices
 * (both `account`). The bell is the person's, not one organization's, so
 * these calls take no workspace. Who sees what is decided by RLS
 * (`kardo_private.notification_visible`); the queries only add the "live
 * now" filter so the planner can use the partial index first.
 */
export type NotificationRepository = {
  listInbox(
    identity: CustomerIdentity,
    query: { limit: number; cursor?: string; unread?: boolean },
  ): Promise<NotificationInbox>;
  markRead(identity: CustomerIdentity, notificationId: string): Promise<void>;
  markAllRead(identity: CustomerIdentity): Promise<void>;
  markOpened(identity: CustomerIdentity): Promise<void>;
};

export class NotificationRepositoryError extends Error {}

export function unavailableNotificationRepository(): NotificationRepository {
  const unavailable = () =>
    Promise.reject(
      new NotificationRepositoryError(
        "Notification storage is not configured.",
      ),
    );
  return {
    listInbox: unavailable,
    markRead: unavailable,
    markAllRead: unavailable,
    markOpened: unavailable,
  };
}

type InboxRow = {
  id: string;
  category: CustomerNotificationCategory;
  title: string;
  body: string;
  action_label: string | null;
  action_url: string | null;
  audience: string;
  workspace_id: string | null;
  workspace_name: string | null;
  pinned: boolean;
  publish_at: Date | string;
  publish_us: string;
  edited_at: Date | string | null;
  expires_at: Date | string | null;
  read_at: Date | string | null;
};

type CountRow = { unread: number | string; auto_open: boolean | null };

type Cursor = { pinned: 0 | 1; publishUs: string; id: string };

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `pinned|microseconds since epoch|id`, base64url. Microseconds (not a JS
 * Date) so two notifications published in the same millisecond never skip
 * or repeat across pages. */
export function encodeNotificationCursor(cursor: Cursor): string {
  return Buffer.from(
    `${cursor.pinned}|${cursor.publishUs}|${cursor.id}`,
  ).toString("base64url");
}

export function decodeNotificationCursor(value: string): Cursor {
  const parts = Buffer.from(value, "base64url").toString("utf8").split("|");
  const [pinned, publishUs, id] = parts;
  if (
    parts.length !== 3 ||
    (pinned !== "0" && pinned !== "1") ||
    !publishUs ||
    !/^-?\d{1,20}$/.test(publishUs) ||
    !id ||
    !uuidPattern.test(id)
  ) {
    throw new InvalidCursorError();
  }
  return { pinned: pinned === "1" ? 1 : 0, publishUs, id };
}

function iso(value: Date | string): string {
  return new Date(value).toISOString();
}

function isoOrNull(value: Date | string | null): string | null {
  return value === null ? null : iso(value);
}

export function toNotification(row: InboxRow): Notification {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    body: row.body,
    action:
      row.action_label !== null && row.action_url !== null
        ? { label: row.action_label, url: row.action_url }
        : null,
    pinned: row.pinned,
    publishedAt: iso(row.publish_at),
    editedAt: isoOrNull(row.edited_at),
    expiresAt: isoOrNull(row.expires_at),
    readAt: isoOrNull(row.read_at),
    workspace:
      row.audience === "workspace" &&
      row.workspace_id !== null &&
      row.workspace_name !== null
        ? { id: row.workspace_id, name: row.workspace_name }
        : null,
  };
}

export function createPostgresNotificationRepository(
  sql: Sql,
): NotificationRepository {
  return {
    async listInbox(identity, query) {
      const cursor = query.cursor
        ? decodeNotificationCursor(query.cursor)
        : null;
      const subject = identity.subject;
      const { rows, counts } = await withCustomerContext(
        sql,
        identity,
        async (tx) => {
          const rows = await tx<InboxRow[]>`
            select
              n.id, n.category, n.title, n.body, n.action_label, n.action_url,
              n.audience, n.workspace_id, w.name as workspace_name, n.pinned,
              n.publish_at,
              (extract(epoch from n.publish_at) * 1000000)::bigint::text as publish_us,
              n.edited_at, n.expires_at, r.read_at
            from kardo_core.notifications n
            left join kardo_core.workspaces w
              on w.id = n.workspace_id and n.audience = 'workspace'
            left join kardo_core.notification_reads r
              on r.notification_id = n.id and r.profile_id = ${subject}::uuid
            where n.retired_at is null
              and n.publish_at <= now()
              and (n.expires_at is null or n.expires_at > now())
              ${query.unread ? tx`and r.read_at is null` : tx``}
              ${
                cursor
                  ? tx`and (n.pinned::int, (extract(epoch from n.publish_at) * 1000000)::bigint, n.id)
                         < (${cursor.pinned}::int, ${cursor.publishUs}::bigint, ${cursor.id}::uuid)`
                  : tx``
              }
            order by n.pinned desc, n.publish_at desc, n.id desc
            limit ${query.limit + 1}
          `;
          // `bool_or` over no rows is NULL, not false (relevo 12).
          const counts = await tx<CountRow[]>`
            select
              count(*) filter (where r.read_at is null) as unread,
              coalesce(bool_or(
                r.read_at is null
                and n.publish_at > coalesce(inbox.opened_at, '-infinity'::timestamptz)
              ), false) as auto_open
            from kardo_core.notifications n
            left join kardo_core.notification_reads r
              on r.notification_id = n.id and r.profile_id = ${subject}::uuid
            left join kardo_core.notification_inbox inbox
              on inbox.profile_id = ${subject}::uuid
            where n.retired_at is null
              and n.publish_at <= now()
              and (n.expires_at is null or n.expires_at > now())
          `;
          return { rows, counts: counts[0] };
        },
      );

      const page = rows.slice(0, query.limit);
      const last = page.at(-1);
      return {
        items: page.map(toNotification),
        unreadCount: Number(counts?.unread ?? 0),
        autoOpen: counts?.auto_open === true,
        nextCursor:
          rows.length > query.limit && last
            ? encodeNotificationCursor({
                pinned: last.pinned ? 1 : 0,
                publishUs: last.publish_us,
                id: last.id,
              })
            : null,
      };
    },

    async markRead(identity, notificationId) {
      await withCustomerContext(sql, identity, async (tx) => {
        // RLS answers "is it yours": a notification you cannot see is a 404.
        const visible = await tx<{ id: string }[]>`
          select n.id from kardo_core.notifications n
          where n.id = ${notificationId}::uuid
        `;
        if (!visible[0]) throw new NotFoundError();
        await tx`
          insert into kardo_core.notification_reads (notification_id, profile_id)
          values (${notificationId}::uuid, ${identity.subject}::uuid)
          on conflict (notification_id, profile_id) do nothing
        `;
      });
    },

    async markAllRead(identity) {
      await withCustomerContext(sql, identity, async (tx) => {
        await tx`
          insert into kardo_core.notification_reads (notification_id, profile_id)
          select n.id, ${identity.subject}::uuid
          from kardo_core.notifications n
          where n.retired_at is null
            and n.publish_at <= now()
            and (n.expires_at is null or n.expires_at > now())
          on conflict (notification_id, profile_id) do nothing
        `;
      });
    },

    async markOpened(identity) {
      await withCustomerContext(sql, identity, async (tx) => {
        await tx`
          insert into kardo_core.notification_inbox (profile_id, opened_at)
          values (${identity.subject}::uuid, now())
          on conflict (profile_id) do update set opened_at = excluded.opened_at
        `;
      });
    },
  };
}
