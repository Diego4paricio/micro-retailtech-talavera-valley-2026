import { randomUUID } from "node:crypto";
import type {
  LeadDeliverySettings,
  LeadDeliverySettingsResult,
  UpdateLeadDeliverySettings,
} from "@kardo/contracts";
import type { Sql } from "postgres";
import { assertFeature } from "../billing/entitlements.js";
import { ContentValidationError, UnavailableError } from "../errors.js";
import { safeFetch } from "../ssrf.js";
import {
  decryptWebhookSecret,
  encryptWebhookSecret,
  generateWebhookSecret,
  signWebhookPayload,
} from "../webhook-crypto.js";
import { validateWebhookUrl } from "../webhook-url.js";
import {
  type CustomerIdentity,
  insertAuditEvent,
  requireMembershipWithPermission,
  withCustomerContext,
} from "./context.js";

export type WebhookTestResult = { delivered: boolean; status: number | null };

export type LeadDeliveryRepository = {
  getSettings(
    identity: CustomerIdentity,
    workspaceId: string,
  ): Promise<LeadDeliverySettings>;
  updateSettings(
    identity: CustomerIdentity,
    workspaceId: string,
    input: UpdateLeadDeliverySettings,
  ): Promise<LeadDeliverySettingsResult>;
  testWebhook(
    identity: CustomerIdentity,
    workspaceId: string,
  ): Promise<WebhookTestResult>;
  /** Only a new signing secret; the rest of the settings stays as stored
   * (domain audit A2-50: «Rotar» used to save the whole form too). */
  rotateWebhookSecret(
    identity: CustomerIdentity,
    workspaceId: string,
  ): Promise<LeadDeliverySettingsResult>;
};

export class LeadDeliveryRepositoryError extends Error {}

export function unavailableLeadDeliveryRepository(): LeadDeliveryRepository {
  const unavailable = () =>
    Promise.reject(
      new LeadDeliveryRepositoryError(
        "Lead delivery storage is not configured.",
      ),
    );
  return {
    getSettings: unavailable,
    updateSettings: unavailable,
    testWebhook: unavailable,
    rotateWebhookSecret: unavailable,
  };
}

/** Every read/write here requires owner or admin. `leads.manage` is the
 * permission for managing requests (state, deletion, retention, and now
 * their delivery: domain audit A2-53), so a future role that only reads
 * requests cannot change where they are sent; the settings table's RLS
 * policy keeps its own owner/admin check. */
const LEAD_DELIVERY_PERMISSION = "leads.manage" as const;

type SettingsRow = {
  notify_email: boolean;
  notify_recipients: string[];
  webhook_url: string | null;
  webhook_secret_ciphertext: string | null;
};

function toSettings(
  row: SettingsRow | undefined,
  emailAvailable: boolean,
): LeadDeliverySettings {
  return {
    notifyEmail: row?.notify_email ?? false,
    notifyRecipients: row?.notify_recipients ?? [],
    webhookUrl: row?.webhook_url ?? null,
    webhookConfigured: Boolean(row?.webhook_secret_ciphertext),
    emailAvailable,
  };
}

/** Normalizes to lowercase and rejects duplicates; the `maxItems: 5` bound
 * itself is already enforced by the request body's JSON schema. */
function validateNotifyRecipients(emails: readonly string[]): string[] {
  const normalized = emails.map((email) => email.trim().toLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    throw new ContentValidationError(
      "INVALID_LEAD_DELIVERY_SETTINGS",
      "Cada correo puede aparecer una sola vez en la lista.",
    );
  }
  return normalized;
}

export function createPostgresLeadDeliveryRepository(
  sql: Sql,
  options: { webhookKey: string | null; emailAvailable: boolean },
): LeadDeliveryRepository {
  return {
    async getSettings(identity, workspaceId) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          LEAD_DELIVERY_PERMISSION,
        );
        const rows = await tx<SettingsRow[]>`
          select notify_email, notify_recipients, webhook_url, webhook_secret_ciphertext
          from kardo_core.lead_delivery_settings
          where workspace_id = ${workspaceId}::uuid
        `;
        return toSettings(rows[0], options.emailAvailable);
      });
    },
    async updateSettings(identity, workspaceId, input) {
      const webhookUrl = input.webhookUrl
        ? validateWebhookUrl(input.webhookUrl)
        : null;
      const notifyRecipients = validateNotifyRecipients(input.notifyRecipients);
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          LEAD_DELIVERY_PERMISSION,
        );
        // A lead notification goes out from Kardo's own domain and carries
        // the visitor's own name and message. Letting the organization aim it
        // at any address turned the feature into a phishing/spam relay with
        // Kardo's sender reputation (security review 2026-10-12). Restrict the
        // recipients to the verified emails of this organization's own
        // members: adding a teammate is the supported way to notify someone.
        if (notifyRecipients.length > 0) {
          const memberRows = await tx<{ email: string | null }[]>`
            select profile.email
            from kardo_core.workspace_memberships membership
            join kardo_core.profiles profile on profile.id = membership.profile_id
            where membership.workspace_id = ${workspaceId}::uuid
          `;
          const memberEmails = new Set(
            memberRows
              .map((row) => row.email?.trim().toLowerCase())
              .filter((email): email is string => Boolean(email)),
          );
          const foreign = notifyRecipients.filter(
            (email) => !memberEmails.has(email),
          );
          if (foreign.length > 0) {
            throw new ContentValidationError(
              "INVALID_LEAD_DELIVERY_SETTINGS",
              "Las solicitudes solo pueden avisar a los correos del equipo de la organización. Invita a esa persona a tu equipo para avisarle.",
            );
          }
        }
        const existing = await tx<SettingsRow[]>`
          select notify_email, notify_recipients, webhook_url, webhook_secret_ciphertext
          from kardo_core.lead_delivery_settings
          where workspace_id = ${workspaceId}::uuid
        `;
        const current = existing[0];
        const hadSecret = Boolean(current?.webhook_secret_ciphertext);
        const wantsWebhook = webhookUrl !== null;
        // A plan without webhooks can still turn an existing one off.
        if (wantsWebhook && webhookUrl !== current?.webhook_url) {
          await assertFeature(tx, workspaceId, "leads.webhook");
        }
        const shouldRotate =
          input.rotateWebhookSecret === true || (wantsWebhook && !hadSecret);

        let plainSecret: string | null = null;
        let ciphertext: string | null =
          current?.webhook_secret_ciphertext ?? null;

        if (!wantsWebhook) {
          // "Quitar la URL borra también el ciphertext": no URL, no secret.
          ciphertext = null;
        } else if (shouldRotate) {
          if (!options.webhookKey) {
            throw new UnavailableError(
              "WEBHOOK_UNAVAILABLE",
              "Kardo todavía no puede firmar webhooks en este ambiente. Intenta más tarde.",
            );
          }
          plainSecret = generateWebhookSecret();
          ciphertext = await encryptWebhookSecret({
            plaintext: plainSecret,
            workspaceId,
            base64UrlKey: options.webhookKey,
          });
        }

        await tx`
          insert into kardo_core.lead_delivery_settings (
            workspace_id, notify_email, notify_recipients, webhook_url,
            webhook_secret_ciphertext, updated_by, updated_at
          ) values (
            ${workspaceId}::uuid, ${input.notifyEmail}, ${notifyRecipients}::text[], ${webhookUrl},
            ${ciphertext}, ${identity.subject}::uuid, now()
          )
          on conflict (workspace_id) do update set
            notify_email = excluded.notify_email,
            notify_recipients = excluded.notify_recipients,
            webhook_url = excluded.webhook_url,
            webhook_secret_ciphertext = excluded.webhook_secret_ciphertext,
            updated_by = excluded.updated_by,
            updated_at = now()
        `;
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "lead_delivery.updated",
          targetType: "workspace",
          targetId: workspaceId,
          result: "succeeded",
          metadata: {
            notifyEmail: input.notifyEmail,
            hasWebhook: wantsWebhook,
            rotatedSecret: shouldRotate,
          },
        });

        return {
          settings: {
            notifyEmail: input.notifyEmail,
            notifyRecipients,
            webhookUrl,
            webhookConfigured: ciphertext !== null,
            emailAvailable: options.emailAvailable,
          },
          webhookSecret: plainSecret,
        };
      });
    },
    async testWebhook(identity, workspaceId) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          LEAD_DELIVERY_PERMISSION,
        );
        const rows = await tx<SettingsRow[]>`
          select notify_email, notify_recipients, webhook_url, webhook_secret_ciphertext
          from kardo_core.lead_delivery_settings
          where workspace_id = ${workspaceId}::uuid
        `;
        const row = rows[0];
        if (!row?.webhook_url || !row.webhook_secret_ciphertext) {
          throw new UnavailableError(
            "WEBHOOK_UNAVAILABLE",
            "Primero guarda la URL de tu webhook.",
          );
        }
        if (!options.webhookKey) {
          throw new UnavailableError(
            "WEBHOOK_UNAVAILABLE",
            "Kardo todavía no puede firmar webhooks en este ambiente. Intenta más tarde.",
          );
        }
        const secret = await decryptWebhookSecret({
          envelope: row.webhook_secret_ciphertext,
          workspaceId,
          base64UrlKey: options.webhookKey,
        }).catch(() => {
          throw new UnavailableError(
            "WEBHOOK_UNAVAILABLE",
            "No pudimos leer el secreto de tu webhook. Genera uno nuevo con «Rotar secreto».",
          );
        });

        // Same shape, headers and signature as a real `lead.created`
        // delivery (services/analytics-worker/src/delivery.ts), with sample
        // data and its own event name, so a receiver that checks headers
        // and fields passes the test only if it will pass for real
        // (domain audit A2-53).
        const [workspaceRow] = await tx<{ name: string }[]>`
          select name from kardo_core.workspaces where id = ${workspaceId}::uuid
        `;
        const deliveryId = randomUUID();
        const body = JSON.stringify({
          event: "lead.test",
          id: randomUUID(),
          createdAt: new Date().toISOString(),
          workspace: { id: workspaceId, name: workspaceRow?.name ?? "" },
          touchpoint: { id: randomUUID(), name: "Prueba de Kardo" },
          lead: {
            name: "Persona de prueba",
            email: "prueba@kardo.test",
            phone: null,
            message: "Este es un aviso de prueba de Kardo.",
          },
        });
        const signature = await signWebhookPayload(secret, body);

        let delivered = false;
        let status: number | null = null;
        try {
          const response = await safeFetch({
            url: row.webhook_url,
            method: "POST",
            headers: {
              "content-type": "application/json",
              "user-agent": "Kardo-Webhooks/1",
              "x-kardo-event": "lead.test",
              "x-kardo-delivery": deliveryId,
              "x-kardo-signature": signature,
            },
            body,
            timeoutMs: 5_000,
          });
          status = response.status;
          delivered = response.ok;
        } catch {
          delivered = false;
        }

        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "lead_delivery.tested",
          targetType: "workspace",
          targetId: workspaceId,
          result: delivered ? "succeeded" : "failed",
          metadata: { status },
        });

        return { delivered, status };
      });
    },
    async rotateWebhookSecret(identity, workspaceId) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          LEAD_DELIVERY_PERMISSION,
        );
        const rows = await tx<SettingsRow[]>`
          select notify_email, notify_recipients, webhook_url, webhook_secret_ciphertext
          from kardo_core.lead_delivery_settings
          where workspace_id = ${workspaceId}::uuid
          for update
        `;
        const row = rows[0];
        if (!row?.webhook_url) {
          throw new UnavailableError(
            "WEBHOOK_UNAVAILABLE",
            "Primero guarda la URL de tu webhook.",
          );
        }
        if (!options.webhookKey) {
          throw new UnavailableError(
            "WEBHOOK_UNAVAILABLE",
            "Kardo todavía no puede firmar webhooks en este ambiente. Intenta más tarde.",
          );
        }
        const plainSecret = generateWebhookSecret();
        const ciphertext = await encryptWebhookSecret({
          plaintext: plainSecret,
          workspaceId,
          base64UrlKey: options.webhookKey,
        });
        await tx`
          update kardo_core.lead_delivery_settings
          set webhook_secret_ciphertext = ${ciphertext},
              updated_by = ${identity.subject}::uuid, updated_at = now()
          where workspace_id = ${workspaceId}::uuid
        `;
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "lead_delivery.updated",
          targetType: "workspace",
          targetId: workspaceId,
          result: "succeeded",
          metadata: { rotatedSecret: true, rotateOnly: true },
        });
        return {
          settings: toSettings(
            { ...row, webhook_secret_ciphertext: ciphertext },
            options.emailAvailable,
          ),
          webhookSecret: plainSecret,
        };
      });
    },
  };
}
