import { z } from "zod";

const environmentSchema = z.enum([
  "local",
  "development",
  "test",
  "production",
]);

export const customerApiConfigSchema = z.object({
  KARDO_ENV: environmentSchema.default("local"),
  CUSTOMER_API_PORT: z.coerce.number().int().positive().default(3001),
  /** Bind address. Defaults to loopback locally and all interfaces elsewhere
   * (containers). */
  CUSTOMER_API_HOST: z.string().min(1).optional(),
  /** Proxy hops to trust for the client IP (rate limits). 0 locally; 1
   * behind Cloud Run's front end, which appends the real client address. */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(3).default(0),
  CUSTOMER_APP_ORIGIN: z.url().default("http://localhost:5173"),
  SUPABASE_JWT_ISSUER: z.url().optional(),
  SUPABASE_JWT_AUDIENCE: z.string().min(1).default("authenticated"),
  SUPABASE_DATABASE_URL: z.url().optional(),
  ASSET_WORKER_URL: z.url().optional(),
  ASSET_UPLOAD_SIGNING_KEY: z.string().min(32).optional(),
  TAP_RESOLVER_URL: z.url().optional(),
  /** Where Links live: <this>/<negocio>/<link> (https://kardo.com.mx in
   * production). Unset: the Resolver's own address, which serves them too.
   * The help assistant names it, so a domain change is only this setting. */
  LINKS_BASE_URL: z.url().optional(),
  PUBLISH_COMMAND_KEY: z.string().min(16).optional(),
  // Optional: lets the API trigger the Publisher immediately after queueing.
  PUBLISHER_URL: z.url().optional(),
  CLOUDFLARE_ACCOUNT_ID: z
    .string()
    .regex(/^[0-9a-f]{32}$/i)
    .optional(),
  CLOUDFLARE_ANALYTICS_API_TOKEN: z.string().min(20).optional(),
  TAP_ANALYTICS_DATASET: z.string().min(1).default("kardo_taps"),
  TAP_ANALYTICS_ENVIRONMENT: z.string().min(1).optional(),
  /** AES-256-GCM key (32 raw bytes, base64url-encoded) used to encrypt lead
   * webhook signing secrets at rest. Optional: without it, saving or testing
   * a webhook fails closed with `WEBHOOK_UNAVAILABLE` instead of storing an
   * unencryptable secret. */
  LEAD_WEBHOOK_KEY: z.string().min(40).optional(),
  /** Whether an email provider is wired up for lead-delivery notifications.
   * Purely informational for the panel (`LeadDeliverySettings.emailAvailable`);
   * actual delivery happens in the Analytics Worker, not here. */
  LEAD_EMAIL_AVAILABLE: z.string().optional(),
  /** Optional transactional email (Resend) for workspace invitations. Without
   * both values the panel shares the invitation link manually. */
  RESEND_API_KEY: z.string().min(10).optional(),
  INVITATION_EMAIL_FROM: z.string().min(3).max(200).optional(),
  /** Optional in-app help assistant (Claude). Without a key the panel shows
   * the written guide only. */
  ANTHROPIC_API_KEY: z.string().min(20).optional(),
  HELP_ASSISTANT_MODEL: z.string().min(3).default("claude-haiku-4-5"),
  /** Optional Gemini API key for fast photo-to-menu/catalog extraction. */
  GEMINI_API_KEY: z.string().min(20).optional(),
  GEMINI_SCAN_MODEL: z.string().min(3).default("gemini-3.5-flash-lite"),
  /** Estudio de Experiences, modo HTML: "Pídele a la IA de Kardo" (ADR 018,
   * extended 2026-09-29). `CUSTOM_HTML_AI_MODEL` is read directly from
   * `process.env` in `app.ts` (out of this file's original scope), not
   * through this schema. `anthropic` is the default when `ANTHROPIC_API_KEY`
   * is set; `dev-bridge` needs `KARDO_AI_BRIDGE_DIR` and refuses to build
   * outside development (see `custom-html/dev-bridge-model.ts`).
   * `CUSTOM_HTML_AI_ENABLED=false` turns the feature off outright. */
  CUSTOM_HTML_AI_PROVIDER: z.enum(["anthropic", "dev-bridge"]).optional(),
  CUSTOM_HTML_AI_ENABLED: z.string().optional(),
  /** Global daily budget in USD across every organization's generations. */
  CUSTOM_HTML_AI_DAILY_BUDGET_USD: z.coerce.number().positive().default(10),
  /** Absolute path to the dev AI bridge's job folder (pending/working/done). */
  KARDO_AI_BRIDGE_DIR: z.string().min(1).optional(),
  KARDO_AI_BRIDGE_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(240_000),
  /** Suscripciones con Stripe (ADR 019). Without both values every billing
   * endpoint answers 503 BILLING_UNAVAILABLE and nothing else changes. Use a
   * restricted key (`rk_`) scoped to Customers, Checkout, Billing Portal and
   * read access to Subscriptions, Invoices, Prices, Products and Refunds. */
  STRIPE_SECRET_KEY: z
    .string()
    .regex(/^(sk|rk)_(test|live)_[A-Za-z0-9]{10,}$/)
    .optional(),
  STRIPE_WEBHOOK_SECRET: z
    .string()
    .regex(/^whsec_[A-Za-z0-9]{10,}$/)
    .optional(),
  /** Manual "IVA 16%" Tax Rate (inclusive) applied to new subscriptions. */
  STRIPE_TAX_RATE_ID: z
    .string()
    .regex(/^txr_[A-Za-z0-9]{6,}$/)
    .optional(),
  /** `"true"` asks for a card even during a free trial (default: no card). */
  STRIPE_TRIAL_REQUIRES_CARD: z.string().optional(),
  /** `"true"` requires ticking the Terms of Service box in Checkout (set the
   * Terms URL in Stripe first). Must be on before charging real customers. */
  STRIPE_REQUIRE_TERMS_CONSENT: z.string().optional(),
  /** Kardo logo and icon uploaded to Stripe (Files API, `business_logo` /
   * `business_icon`) by scripts/stripe/setup-billing.mts, for Checkout's
   * `branding_settings`. Without them Checkout still uses Kardo's colors. */
  STRIPE_BRAND_LOGO_FILE_ID: z
    .string()
    .regex(/^file_[A-Za-z0-9]{6,}$/)
    .optional(),
  STRIPE_BRAND_ICON_FILE_ID: z
    .string()
    .regex(/^file_[A-Za-z0-9]{6,}$/)
    .optional(),
  /** CFDI con Facturapi (ADR 020 §6, fase 2): `sk_test_` crea CFDI de
   * prueba sin timbrar; `sk_live_` los timbra ante el SAT. Sin ella, la
   * emisión es manual en el portal del SAT. */
  FACTURAPI_KEY: z
    .string()
    .regex(/^sk_(test|live)_[A-Za-z0-9_-]{10,}$/)
    .optional(),
  /** Sender of billing notices (renewal, cancellation); falls back to
   * INVITATION_EMAIL_FROM. Needs RESEND_API_KEY. */
  BILLING_EMAIL_FROM: z.string().min(3).max(200).optional(),
  /** Public Terms of Subscription page, linked from every billing notice. */
  BILLING_TERMS_URL: z.url().optional(),
  /** Bearer key of the hourly scheduler that calls /internal/billing/tick
   * (trial-ending notices and notice retries). Without it the route is 404. */
  BILLING_CRON_KEY: z.string().min(32).optional(),
  /** ADR 022: key the status Worker sends (`x-kardo-status-key`) to read
   * GET /health/ready (database and publish queue). Without it the route
   * is 404. */
  STATUS_PROBE_KEY: z.string().min(32).optional(),
  /** Kardo trial started when sign up finishes (ADR 020): days, 0 turns it
   * off. BILLING_TRIAL_PLAN is the plan code when the visitor did not pick
   * one on /precios/. */
  BILLING_TRIAL_DAYS: z.coerce.number().int().min(0).max(60).default(15),
  BILLING_TRIAL_PLAN: z
    .string()
    .regex(/^[a-z0-9_-]{2,64}$/)
    .default("profesional"),
  /** ADR 020 §4: pauses and resumes public pages in the Resolver
   * (`/internal/billing-pause`, with TAP_RESOLVER_URL). A secret of its own,
   * never the publish or the staff suspension key. Without it, access states
   * and notices still work but pages are not paused. */
  BILLING_COMMAND_KEY: z.string().min(16).optional(),
  /** Resolver for the billing pause only; defaults to TAP_RESOLVER_URL. Lets
   * a local demo pause pages in `wrangler dev` without moving publishing. */
  BILLING_RESOLVER_URL: z.url().optional(),
  /** ADR 020, addendum of 2026-10-01: `"true"` deletes organizations 90
   * days after they lapsed (and announces it 15 days before); `"dry-run"`
   * only counts what would go, without notices; anything else is off. Off in
   * every deployment until the owner decides, after the lawyer. */
  BILLING_DELETE_ENABLED: z.string().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type CustomerApiConfig = Omit<
  z.infer<typeof customerApiConfigSchema>,
  "TAP_ANALYTICS_ENVIRONMENT" | "LEAD_EMAIL_AVAILABLE" | "CUSTOMER_API_HOST"
> & {
  CUSTOMER_API_HOST: string;
  /** Defaults to `KARDO_ENV` when unset; used to filter analytics rows by environment. */
  TAP_ANALYTICS_ENVIRONMENT: string;
  /** Parsed from the `LEAD_EMAIL_AVAILABLE` env string (`"true"` only). */
  LEAD_EMAIL_AVAILABLE: boolean;
};

/**
 * `.env.example` lists every variable uncommented, many of them empty
 * (`STRIPE_SECRET_KEY=`). An empty or blank value means "not set": without
 * this, an optional key with a format (a URL, a `sk_` prefix) would fail
 * validation, and a coerced number would silently become 0.
 */
export function withoutEmptyValues(
  env: Record<string, string | undefined>,
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(env).filter(
      ([, value]) => value !== undefined && value.trim() !== "",
    ),
  );
}

export function loadCustomerApiConfig(
  env: Record<string, string | undefined> = process.env,
): CustomerApiConfig {
  const config = customerApiConfigSchema.parse(withoutEmptyValues(env));
  return {
    ...config,
    CUSTOMER_API_HOST:
      config.CUSTOMER_API_HOST ?? defaultHost(config.KARDO_ENV),
    TAP_ANALYTICS_ENVIRONMENT:
      config.TAP_ANALYTICS_ENVIRONMENT ?? config.KARDO_ENV,
    LEAD_EMAIL_AVAILABLE: config.LEAD_EMAIL_AVAILABLE === "true",
  };
}

export const staffApiConfigSchema = z.object({
  KARDO_ENV: environmentSchema.default("local"),
  STAFF_API_PORT: z.coerce.number().int().positive().default(3002),
  OPERATIONS_APP_ORIGIN: z.url().default("http://localhost:5174"),
  SUPABASE_JWT_ISSUER: z.url().optional(),
  SUPABASE_JWT_AUDIENCE: z.string().min(1).default("authenticated"),
  STAFF_DATABASE_URL: z.url().optional(),
  /** Bind address; loopback locally, all interfaces elsewhere. */
  STAFF_API_HOST: z.string().min(1).optional(),
  /** Proxy hops to trust for the client IP (rate limits). 0 locally; 1
   * behind Cloud Run's front end, which appends the real client address. */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(3).default(0),
  /** Public Resolver origin (Touchpoint URLs shown to staff) and the
   * staff-only command key for `/internal/suspension`. */
  TAP_RESOLVER_URL: z.url().optional(),
  SUSPENSION_COMMAND_KEY: z.string().min(16).optional(),
  /** Public Website origin (ADR 026): the activation card of a Kardo piece
   * order carries a QR to `<sitio>/activar/?codigo=…`. Without it the card
   * prints only the code. */
  WEBSITE_URL: z.url().optional(),
  /** ADR 022: the status Worker (technical detail for Operations and the
   * incidents it shows). Without both, the Estado section answers 503. */
  STATUS_URL: z.url().optional(),
  STATUS_COMMAND_KEY: z.string().min(32).optional(),
  /** Wakes the Publisher after a staff retry (same key the Publisher checks). */
  PUBLISHER_URL: z.url().optional(),
  PUBLISH_COMMAND_KEY: z.string().min(16).optional(),
  CLOUDFLARE_ACCOUNT_ID: z
    .string()
    .regex(/^[0-9a-f]{32}$/i)
    .optional(),
  CLOUDFLARE_ANALYTICS_API_TOKEN: z.string().min(20).optional(),
  TAP_ANALYTICS_DATASET: z.string().min(1).default("kardo_taps"),
  TAP_ANALYTICS_ENVIRONMENT: z.string().min(1).optional(),
  /** Suscripciones (ADR 019): a restricted key distinct from the Customer
   * API's, adding write access to Subscriptions and Refunds. */
  STRIPE_SECRET_KEY: z
    .string()
    .regex(/^(sk|rk)_(test|live)_[A-Za-z0-9]{10,}$/)
    .optional(),
  /** CFDI con Facturapi (ADR 020 §6, fase 2): `sk_test_` crea CFDI de
   * prueba sin timbrar; `sk_live_` los timbra ante el SAT. Sin ella, la
   * emisión es manual en el portal del SAT. */
  FACTURAPI_KEY: z
    .string()
    .regex(/^sk_(test|live)_[A-Za-z0-9_-]{10,}$/)
    .optional(),
  /** ADR 020 §4: pauses and resumes public pages in the Resolver
   * (`/internal/billing-pause`, with TAP_RESOLVER_URL). A secret of its own,
   * never the publish or the staff suspension key. Without it, access states
   * and notices still work but pages are not paused. */
  BILLING_COMMAND_KEY: z.string().min(16).optional(),
  /** Resolver for the billing pause only; defaults to TAP_RESOLVER_URL. Lets
   * a local demo pause pages in `wrangler dev` without moving publishing. */
  BILLING_RESOLVER_URL: z.url().optional(),
  /** Same as the Customer API (ADR 020, addendum of 2026-10-01): `"true"`
   * shows deletions as announced in Operations. The hourly tick that deletes
   * runs in the Customer API. */
  BILLING_DELETE_ENABLED: z.string().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type StaffApiConfig = Omit<
  z.infer<typeof staffApiConfigSchema>,
  "TAP_ANALYTICS_ENVIRONMENT" | "STAFF_API_HOST"
> & { TAP_ANALYTICS_ENVIRONMENT: string; STAFF_API_HOST: string };

export function loadStaffApiConfig(
  env: Record<string, string | undefined> = process.env,
): StaffApiConfig {
  const config = staffApiConfigSchema.parse(withoutEmptyValues(env));
  return {
    ...config,
    TAP_ANALYTICS_ENVIRONMENT:
      config.TAP_ANALYTICS_ENVIRONMENT ?? config.KARDO_ENV,
    STAFF_API_HOST: config.STAFF_API_HOST ?? defaultHost(config.KARDO_ENV),
  };
}

/** Processes run on a developer machine (local/development) listen on
 * loopback only; deployed containers (test/production) need all interfaces.
 * Either can be overridden explicitly. */
export function defaultHost(
  environment: z.infer<typeof environmentSchema>,
): string {
  return environment === "local" || environment === "development"
    ? "127.0.0.1"
    : "0.0.0.0";
}
