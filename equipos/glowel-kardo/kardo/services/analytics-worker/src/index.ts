import postgres, { type Sql, type TransactionSql } from "postgres";
import type {
  DeliveryOutcome,
  LeadCreated,
  LeadDeliveryTarget,
} from "./delivery.js";

export type {
  DeliveryOutcome,
  LeadCreated,
  LeadDeliveryTarget,
} from "./delivery.js";

export type AnalyticsEvent = {
  schemaVersion: 1;
  eventId: string;
  occurredAt: string;
  publicId: string;
  publicationRevision: number;
  type: "tap" | "view" | "click";
  channel: "nfc" | "qr" | "link";
  test: boolean;
};

export type LeadSubmission = {
  publicId: string;
  email: string;
  consent: true;
  name?: string;
  phone?: string;
  message?: string;
};

export type LeadDeliveryCapabilities = {
  /** Whether the platform-level Resend configuration exists in this environment. */
  emailCapable: boolean;
};

export type AnalyticsRepository = {
  ingest(events: readonly AnalyticsEvent[]): Promise<{ accepted: number }>;
  createLead(
    input: LeadSubmission,
    capabilities: LeadDeliveryCapabilities,
  ): Promise<LeadCreated>;
  recordDeliveryResult(outcome: DeliveryOutcome): Promise<void>;
  purge(): Promise<void>;
};

export function parseAnalyticsEvent(value: unknown): AnalyticsEvent | null {
  if (!isRecord(value)) return null;
  const {
    schemaVersion,
    eventId,
    occurredAt,
    publicId,
    publicationRevision,
    type,
    channel,
    test,
  } = value;
  if (
    schemaVersion !== 1 ||
    typeof eventId !== "string" ||
    !uuidPattern.test(eventId) ||
    typeof occurredAt !== "string" ||
    !validEventTime(occurredAt) ||
    typeof publicId !== "string" ||
    !publicIdPattern.test(publicId) ||
    typeof publicationRevision !== "number" ||
    !Number.isInteger(publicationRevision) ||
    publicationRevision < 1 ||
    (type !== "tap" && type !== "view" && type !== "click") ||
    (channel !== "nfc" && channel !== "qr" && channel !== "link") ||
    typeof test !== "boolean"
  )
    return null;
  return {
    schemaVersion,
    eventId,
    occurredAt,
    publicId,
    publicationRevision,
    type,
    channel,
    test,
  };
}

export function parseLeadSubmission(value: unknown): LeadSubmission | null {
  if (!isRecord(value)) return null;
  const { publicId, email, consent, name, phone, message } = value;
  if (
    typeof publicId !== "string" ||
    !publicIdPattern.test(publicId) ||
    typeof email !== "string" ||
    !emailPattern.test(email) ||
    email.length > 320 ||
    consent !== true ||
    (name !== undefined &&
      (typeof name !== "string" || !trimmedLength(name, 1, 120))) ||
    (phone !== undefined &&
      (typeof phone !== "string" ||
        !trimmedLength(phone, 3, 40) ||
        !phonePattern.test(phone.trim()))) ||
    (message !== undefined &&
      (typeof message !== "string" || !trimmedLength(message, 1, 2000)))
  )
    return null;
  return {
    publicId,
    email: email.trim().toLowerCase(),
    consent,
    ...(typeof name === "string" ? { name: name.trim() } : {}),
    ...(typeof phone === "string" ? { phone: phone.trim() } : {}),
    ...(typeof message === "string" ? { message: message.trim() } : {}),
  };
}

export function createPostgresAnalyticsRepository(
  databaseUrl: string,
): AnalyticsRepository & { close(): Promise<void> } {
  const sql = postgres(databaseUrl, { max: 2, prepare: false });
  return {
    ingest: (events) => ingest(sql, events),
    createLead: (input, capabilities) => createLead(sql, input, capabilities),
    recordDeliveryResult: (outcome) => recordDeliveryResult(sql, outcome),
    purge: () =>
      withAnalyticsRole(sql, async (transaction) => {
        await transaction`select kardo_core.purge_analytics_retention()`;
      }),
    close: () => sql.end(),
  };
}

async function ingest(
  sql: Sql,
  events: readonly AnalyticsEvent[],
): Promise<{ accepted: number }> {
  const valid = events
    .map(parseAnalyticsEvent)
    .filter((event): event is AnalyticsEvent => event !== null);
  if (valid.length === 0) return { accepted: 0 };
  return withAnalyticsRole(sql, async (transaction) => {
    const batchHash = await sha256(
      valid
        .map((event) => event.eventId)
        .sort()
        .join("\n"),
    );
    const batch = await transaction`
      insert into kardo_core.analytics_ingest_batches (batch_hash)
      values (${batchHash})
      on conflict (batch_hash) do nothing
    `;
    if (batch.count === 0) return { accepted: 0 };
    let accepted = 0;
    for (const event of valid) {
      const dedup = await transaction`
        insert into kardo_core.analytics_event_dedup (event_id, occurred_at, expires_at)
        values (${event.eventId}::uuid, ${event.occurredAt}::timestamptz, ${event.occurredAt}::timestamptz + interval '8 days')
        on conflict (event_id) do nothing
      `;
      if (dedup.count === 0) continue;
      const target = await transaction<
        { workspace_id: string; touchpoint_id: string }[]
      >`
        select touchpoint.workspace_id, touchpoint.id as touchpoint_id
        from kardo_core.touchpoints touchpoint
        join kardo_core.publications publication on publication.touchpoint_id = touchpoint.id
        where touchpoint.public_id = ${event.publicId}
          and touchpoint.status = 'active'
          and publication.status = 'published'
          and publication.superseded_at is null
          and publication.revision = ${event.publicationRevision}
        limit 1
      `;
      const mapped = target[0];
      if (!mapped) continue;
      await transaction`
        insert into kardo_core.analytics_raw_events (
          event_id, workspace_id, touchpoint_id, publication_revision, event_type, channel, is_test, occurred_at
        ) values (
          ${event.eventId}::uuid, ${mapped.workspace_id}::uuid, ${mapped.touchpoint_id}::uuid,
          ${event.publicationRevision}, ${event.type}::kardo_core.analytics_event_type,
          ${event.channel}::kardo_core.analytics_channel, ${event.test}, ${event.occurredAt}::timestamptz
        )
      `;
      await transaction`
        insert into kardo_core.analytics_hourly (
          workspace_id, touchpoint_id, publication_revision, bucket_start, event_type, channel, is_test, event_count
        ) values (
          ${mapped.workspace_id}::uuid, ${mapped.touchpoint_id}::uuid, ${event.publicationRevision},
          date_trunc('hour', ${event.occurredAt}::timestamptz), ${event.type}::kardo_core.analytics_event_type,
          ${event.channel}::kardo_core.analytics_channel, ${event.test}, 1
        ) on conflict (touchpoint_id, publication_revision, bucket_start, event_type, channel, is_test)
        do update set event_count = kardo_core.analytics_hourly.event_count + 1
      `;
      await transaction`
        insert into kardo_core.analytics_daily (
          workspace_id, touchpoint_id, publication_revision, bucket_start, event_type, channel, is_test, event_count
        ) values (
          ${mapped.workspace_id}::uuid, ${mapped.touchpoint_id}::uuid, ${event.publicationRevision},
          (${event.occurredAt}::timestamptz at time zone 'UTC')::date, ${event.type}::kardo_core.analytics_event_type,
          ${event.channel}::kardo_core.analytics_channel, ${event.test}, 1
        ) on conflict (touchpoint_id, publication_revision, bucket_start, event_type, channel, is_test)
        do update set event_count = kardo_core.analytics_daily.event_count + 1
      `;
      accepted += 1;
    }
    return { accepted };
  });
}

async function createLead(
  sql: Sql,
  input: LeadSubmission,
  capabilities: LeadDeliveryCapabilities,
): Promise<LeadCreated> {
  return withAnalyticsRole(sql, async (transaction) => {
    const target = await transaction<LeadTargetRow[]>`
      select
        touchpoint.workspace_id,
        touchpoint.id as touchpoint_id,
        touchpoint.operational_name as touchpoint_name,
        workspace.name as workspace_name,
        publication.revision
      from kardo_core.touchpoints touchpoint
      join kardo_core.workspaces workspace on workspace.id = touchpoint.workspace_id
      join kardo_core.publications publication on publication.touchpoint_id = touchpoint.id
      join kardo_core.experience_versions version on version.id = publication.experience_version_id
      join kardo_core.experiences experience on experience.id = version.experience_id
      where touchpoint.public_id = ${input.publicId}
        and touchpoint.status = 'active'
        and publication.status = 'published'
        and publication.superseded_at is null
        and experience.type = 'form'
      limit 1
    `;
    const mapped = target[0];
    if (!mapped) throw new LeadTargetUnavailableError();

    const id = crypto.randomUUID();
    const inserted = await transaction<{ created_at: string }[]>`
      insert into kardo_core.leads (
        id, workspace_id, touchpoint_id, publication_revision, email, name, phone, message, consented_at
      ) values (
        ${id}::uuid, ${mapped.workspace_id}::uuid, ${mapped.touchpoint_id}::uuid, ${mapped.revision},
        ${input.email}, ${input.name ?? null}, ${input.phone ?? null}, ${input.message ?? null}, now()
      )
      returning created_at
    `;
    const createdAt = inserted[0]?.created_at;
    if (!createdAt) throw new Error("Lead insert did not return created_at.");

    await transaction`
      insert into kardo_audit.events (
        workspace_id, actor_type, action, target_type, target_id, result, metadata
      ) values (
        ${mapped.workspace_id}::uuid, 'service', 'lead.created', 'lead', ${id}::uuid,
        'succeeded', ${transaction.json({ touchpointId: mapped.touchpoint_id, revision: mapped.revision })}
      )
    `;

    const deliveries = await createLeadDeliveries(transaction, {
      leadId: id,
      workspaceId: mapped.workspace_id,
      emailCapable: capabilities.emailCapable,
    });

    return {
      id,
      createdAt,
      workspace: { id: mapped.workspace_id, name: mapped.workspace_name },
      touchpoint: { id: mapped.touchpoint_id, name: mapped.touchpoint_name },
      lead: {
        ...(input.name ? { name: input.name } : {}),
        email: input.email,
        ...(input.phone ? { phone: input.phone } : {}),
        ...(input.message ? { message: input.message } : {}),
      },
      deliveries,
    };
  });
}

type LeadTargetRow = {
  workspace_id: string;
  touchpoint_id: string;
  touchpoint_name: string | null;
  workspace_name: string;
  revision: number;
};

type DeliverySettingsRow = {
  notify_email: boolean;
  notify_recipients: string[];
  webhook_url: string | null;
  webhook_secret_ciphertext: string | null;
};

/**
 * Reads the workspace's delivery settings and enqueues one 'pending' row per
 * active channel: email when the workspace opted in (with recipients) AND
 * this environment can actually send email, webhook whenever a URL is
 * configured (an attempt without a usable secret still gets recorded, and
 * fails clearly with WEBHOOK_SECRET_UNAVAILABLE, instead of never being
 * enqueued and going unnoticed).
 */
async function createLeadDeliveries(
  transaction: TransactionSql,
  input: { leadId: string; workspaceId: string; emailCapable: boolean },
): Promise<LeadDeliveryTarget[]> {
  const settingsRows = await transaction<DeliverySettingsRow[]>`
    select notify_email, notify_recipients, webhook_url, webhook_secret_ciphertext
    from kardo_core.lead_delivery_settings
    where workspace_id = ${input.workspaceId}::uuid
  `;
  const settings = settingsRows[0];
  if (!settings) return [];

  const deliveries: LeadDeliveryTarget[] = [];

  if (
    input.emailCapable &&
    settings.notify_email &&
    settings.notify_recipients.length > 0
  ) {
    const row = await insertPendingDelivery(
      transaction,
      input.leadId,
      input.workspaceId,
      "email",
    );
    if (row)
      deliveries.push({
        id: row,
        channel: "email",
        recipients: settings.notify_recipients,
      });
  }

  if (settings.webhook_url) {
    const row = await insertPendingDelivery(
      transaction,
      input.leadId,
      input.workspaceId,
      "webhook",
    );
    if (row)
      deliveries.push({
        id: row,
        channel: "webhook",
        url: settings.webhook_url,
        secretCiphertext: settings.webhook_secret_ciphertext ?? "",
      });
  }

  return deliveries;
}

async function insertPendingDelivery(
  transaction: TransactionSql,
  leadId: string,
  workspaceId: string,
  channel: "email" | "webhook",
): Promise<string | null> {
  const row = await transaction<{ id: string }[]>`
    insert into kardo_core.lead_deliveries (lead_id, workspace_id, channel, status)
    values (${leadId}::uuid, ${workspaceId}::uuid, ${channel}, 'pending')
    returning id
  `;
  return row[0]?.id ?? null;
}

async function recordDeliveryResult(
  sql: Sql,
  outcome: DeliveryOutcome,
): Promise<void> {
  await withAnalyticsRole(sql, async (transaction) => {
    await transaction`
      update kardo_core.lead_deliveries
      set
        status = ${outcome.status},
        attempts = ${outcome.attempts},
        last_error = ${outcome.lastError?.slice(0, 300) ?? null},
        updated_at = now()
      where id = ${outcome.id}::uuid
    `;
  });
}

export class LeadTargetUnavailableError extends Error {}

async function withAnalyticsRole<T>(
  sql: Sql,
  callback: (transaction: TransactionSql) => Promise<T>,
): Promise<T> {
  return sql.begin(async (transaction): Promise<T> => {
    await transaction.unsafe("set local role kardo_analytics");
    return callback(transaction);
  }) as Promise<T>;
}

async function sha256(value: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validEventTime(value: string): boolean {
  const time = Date.parse(value);
  return (
    Number.isFinite(time) &&
    time <= Date.now() + 5 * 60_000 &&
    time >= Date.now() - 8 * 24 * 60 * 60_000
  );
}
function trimmedLength(value: string, min: number, max: number): boolean {
  const length = value.trim().length;
  return length >= min && length <= max;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const publicIdPattern = /^[A-Za-z0-9_-]{16,32}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[0-9 +()\-.]{1,40}$/;
