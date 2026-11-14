import { decryptWebhookSecret, signWebhookPayload } from "./webhook-crypto.js";

export type LeadDeliveryTarget =
  | { id: string; channel: "email"; recipients: readonly string[] }
  | { id: string; channel: "webhook"; url: string; secretCiphertext: string };

export type LeadCreated = {
  id: string;
  createdAt: string;
  workspace: { id: string; name: string };
  touchpoint: { id: string; name: string | null };
  lead: {
    name?: string;
    email: string;
    phone?: string;
    message?: string;
  };
  deliveries: readonly LeadDeliveryTarget[];
};

export type DeliveryEnv = {
  LEAD_WEBHOOK_KEY?: string;
  RESEND_API_KEY?: string;
  LEAD_EMAIL_FROM?: string;
};

export type DeliveryOutcome = {
  id: string;
  status: "sent" | "failed";
  attempts: number;
  lastError?: string;
};

export type DeliveryOptions = {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
};

const defaultTimeoutMs = 5_000;
const maxAttempts = 2;
const backoffBaseMs = 250;

/** Delivers every pending channel for one lead, recording each outcome. */
export async function deliverLead(
  created: LeadCreated,
  env: DeliveryEnv,
  recordResult: (outcome: DeliveryOutcome) => Promise<void>,
  options: DeliveryOptions = {},
): Promise<void> {
  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  await Promise.all(
    created.deliveries.map(async (delivery) => {
      const outcome =
        delivery.channel === "webhook"
          ? await deliverWebhook(created, delivery, env, fetchFn, timeoutMs)
          : await deliverEmail(created, delivery, env, fetchFn, timeoutMs);
      await recordResult(outcome);
    }),
  );
}

async function deliverWebhook(
  created: LeadCreated,
  delivery: Extract<LeadDeliveryTarget, { channel: "webhook" }>,
  env: DeliveryEnv,
  fetchFn: typeof fetch,
  timeoutMs: number,
): Promise<DeliveryOutcome> {
  const urlCheck = validateWebhookUrl(delivery.url);
  if (!urlCheck.ok) {
    return {
      id: delivery.id,
      status: "failed",
      attempts: 0,
      lastError: urlCheck.reason,
    };
  }
  if (!env.LEAD_WEBHOOK_KEY) {
    return {
      id: delivery.id,
      status: "failed",
      attempts: 0,
      lastError: "WEBHOOK_SECRET_UNAVAILABLE",
    };
  }
  let secret: string;
  try {
    secret = await decryptWebhookSecret(
      delivery.secretCiphertext,
      env.LEAD_WEBHOOK_KEY,
      created.workspace.id,
    );
  } catch {
    return {
      id: delivery.id,
      status: "failed",
      attempts: 0,
      lastError: "WEBHOOK_SECRET_UNAVAILABLE",
    };
  }

  const rawBody = JSON.stringify({
    event: "lead.created",
    id: created.id,
    createdAt: created.createdAt,
    workspace: { id: created.workspace.id, name: created.workspace.name },
    touchpoint: { id: created.touchpoint.id, name: created.touchpoint.name },
    lead: {
      name: created.lead.name ?? null,
      email: created.lead.email,
      phone: created.lead.phone ?? null,
      message: created.lead.message ?? null,
    },
  });

  const result = await sendWithRetry(async () => {
    const signature = await signWebhookPayload(secret, rawBody);
    return fetchWithTimeout(
      fetchFn,
      delivery.url,
      {
        method: "POST",
        redirect: "manual",
        headers: {
          "content-type": "application/json",
          "user-agent": "Kardo-Webhooks/1",
          "x-kardo-event": "lead.created",
          "x-kardo-delivery": delivery.id,
          "x-kardo-signature": signature,
        },
        body: rawBody,
      },
      timeoutMs,
    );
  });
  return { id: delivery.id, ...result };
}

async function deliverEmail(
  created: LeadCreated,
  delivery: Extract<LeadDeliveryTarget, { channel: "email" }>,
  env: DeliveryEnv,
  fetchFn: typeof fetch,
  timeoutMs: number,
): Promise<DeliveryOutcome> {
  if (!env.RESEND_API_KEY || !env.LEAD_EMAIL_FROM) {
    // createLead only creates an email delivery row when both are configured
    // at creation time; this guards against a platform config change between
    // creation and delivery rather than a normal case.
    return {
      id: delivery.id,
      status: "failed",
      attempts: 0,
      lastError: "EMAIL_NOT_CONFIGURED",
    };
  }

  const touchpointName = created.touchpoint.name ?? "tu QR o etiqueta";
  const body = JSON.stringify({
    from: env.LEAD_EMAIL_FROM,
    to: [...delivery.recipients],
    subject: `Nuevo contacto en ${touchpointName}`,
    text: leadEmailText(created.lead),
    html: leadEmailHtml(created.lead),
  });

  const result = await sendWithRetry(() =>
    fetchWithTimeout(
      fetchFn,
      "https://api.resend.com/emails",
      {
        method: "POST",
        redirect: "manual",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${env.RESEND_API_KEY}`,
        },
        body,
      },
      timeoutMs,
    ),
  );
  return { id: delivery.id, ...result };
}

function leadEmailText(lead: LeadCreated["lead"]): string {
  return [
    `Nombre: ${lead.name ?? "-"}`,
    `Email: ${lead.email}`,
    `Teléfono: ${lead.phone ?? "-"}`,
    `Mensaje: ${lead.message ?? "-"}`,
  ].join("\n");
}

function leadEmailHtml(lead: LeadCreated["lead"]): string {
  const row = (label: string, value: string) =>
    `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`;
  return [
    row("Nombre", lead.name ?? "-"),
    row("Email", lead.email),
    row("Teléfono", lead.phone ?? "-"),
    row("Mensaje", lead.message ?? "-"),
  ].join("\n");
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ] ?? character,
  );
}

/**
 * Sends with up to `maxAttempts` tries and a small backoff between them.
 * A redirect (3xx) is never retried: `redirect: "manual"` means it was not
 * followed, and asking again would only get the same redirect back.
 */
async function sendWithRetry(send: () => Promise<Response>): Promise<{
  status: "sent" | "failed";
  attempts: number;
  lastError?: string;
}> {
  let lastError = "UNKNOWN_ERROR";
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await send();
      if (response.ok) return { status: "sent", attempts: attempt };
      if (response.status >= 300 && response.status < 400) {
        return {
          status: "failed",
          attempts: attempt,
          lastError: "REDIRECT_NOT_FOLLOWED",
        };
      }
      lastError = `HTTP_${response.status}`;
    } catch (error) {
      lastError =
        error instanceof DeliveryTimeoutError ? "TIMEOUT" : "NETWORK_ERROR";
    }
    if (attempt < maxAttempts) await sleep(backoffBaseMs * attempt);
  }
  return { status: "failed", attempts: maxAttempts, lastError };
}

class DeliveryTimeoutError extends Error {}

async function fetchWithTimeout(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted)
      throw new DeliveryTimeoutError("Request timed out.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * SSRF defense for customer-supplied webhook URLs: HTTPS only, no embedded
 * credentials, the default port (or none), and a hostname that cannot point
 * at an internal network (IP literal, `localhost`, `*.local`, `*.internal`).
 * This only rejects the obvious cases available from a hostname string alone
 * — it does not resolve DNS — matching what the Resolver/Publisher already
 * do for other customer-supplied URLs.
 */
export function validateWebhookUrl(
  value: string,
): { ok: true } | { ok: false; reason: "WEBHOOK_URL_INVALID" } {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: "WEBHOOK_URL_INVALID" };
  }
  if (url.protocol !== "https:")
    return { ok: false, reason: "WEBHOOK_URL_INVALID" };
  if (url.username || url.password)
    return { ok: false, reason: "WEBHOOK_URL_INVALID" };
  if (url.port !== "" && url.port !== "443")
    return { ok: false, reason: "WEBHOOK_URL_INVALID" };
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  )
    return { ok: false, reason: "WEBHOOK_URL_INVALID" };
  if (isIpLiteral(hostname))
    return { ok: false, reason: "WEBHOOK_URL_INVALID" };
  return { ok: true };
}

function isIpLiteral(hostname: string): boolean {
  const bare =
    hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : hostname;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(bare)) return true;
  return bare.includes(":");
}
