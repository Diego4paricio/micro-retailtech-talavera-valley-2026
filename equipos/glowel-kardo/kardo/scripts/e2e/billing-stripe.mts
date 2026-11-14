// End-to-end check of subscriptions against the REAL Stripe test mode
// (ADR 019). Needs the local Customer API running with the .env and
// `node scripts/stripe/listen.mjs` forwarding webhooks to it.
//
//   E2E_API_URL=http://localhost:3011 \
//     services/customer-api/node_modules/.bin/tsx scripts/e2e/billing-stripe.mts
//   (with `node scripts/stripe/listen.mjs --port=3011` forwarding to that API)
//
// Uses a Stripe test clock to walk a 14-day trial with a card: contract
// notice, renewal notice, first charge with IVA, cancellation at period end
// with folio, and the fall back to no plan. Everything happens in a dedicated
// "Kardo Billing E2E" organization of a dedicated person
// (e2e-billing-stripe@kardo.test): since ADR 024 the plan is the person's,
// so no other dev account gets a plan or limits from it.
// Test keys only; the test clock (and its customer) is deleted at the end.
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const requireFromBilling = createRequire(
  path.join(root, "packages/billing/package.json"),
);
const Stripe = requireFromBilling("stripe");
const postgres = requireFromBilling("postgres");

const env: Record<string, string> = Object.fromEntries(
  fs
    .readFileSync(path.join(root, ".env"), "utf8")
    .split("\n")
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => [
      line.slice(0, line.indexOf("=")).trim(),
      line.slice(line.indexOf("=") + 1).trim(),
    ]),
);
if (!/^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY ?? ""))
  throw new Error("A Stripe TEST key is required.");
const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-08-26.dahlia",
});
const sql = postgres(env.SUPABASE_ADMIN_DATABASE_URL, {
  max: 1,
  prepare: false,
  onnotice: () => {},
});

const results: { step: string; ok: boolean; detail?: string }[] = [];
const check = (step: string, ok: boolean, detail?: unknown) => {
  results.push({
    step,
    ok,
    detail:
      detail === undefined ? undefined : JSON.stringify(detail).slice(0, 400),
  });
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${step}${ok || detail === undefined ? "" : `  ${JSON.stringify(detail).slice(0, 400)}`}`,
  );
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const DAY = 86_400;

async function waitFor<T>(
  label: string,
  read: () => Promise<T | null | undefined | false>,
  seconds = 60,
): Promise<T | null> {
  for (let elapsed = 0; elapsed < seconds; elapsed += 2) {
    const value = await read();
    if (value) return value as T;
    await sleep(2000);
  }
  console.log(`  (timeout waiting for ${label})`);
  return null;
}

async function advance(clockId: string, to: number) {
  await stripe.testHelpers.testClocks.advance(clockId, { frozen_time: to });
  await waitFor(
    "test clock",
    async () =>
      (await stripe.testHelpers.testClocks.retrieve(clockId)).status ===
      "ready",
    120,
  );
}

const clockIds: string[] = [];
try {
  // Dedicated person (ADR 024: her account is the one that pays) and her
  // organization; both are created once and reused.
  const ownerEmail = "e2e-billing-stripe@kardo.test";
  let [owner] =
    await sql`select id from kardo_core.profiles where email = ${ownerEmail}`;
  if (!owner) {
    [owner] = await sql`
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        email_change_token_current, reauthentication_token, phone_change, phone_change_token
      ) values (
        '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
        ${ownerEmail}, '', now(), '{"provider":"email","providers":["email"]}'::jsonb,
        '{"display_name":"Kardo Billing E2E"}'::jsonb, now(), now(), '', '', '', '', '', '', '', ''
      ) returning id`;
  }
  let [workspace] = await sql`
    select w.id from kardo_core.workspaces w
    join kardo_core.workspace_memberships m on m.workspace_id = w.id and m.role = 'owner'
    where w.name = 'Kardo Billing E2E' and w.kind = 'organization' and m.profile_id = ${owner.id}
    limit 1`;
  if (!workspace) {
    [workspace] = await sql`
      insert into kardo_core.workspaces (public_id, kind, name)
      values (${`e2ebilling${Date.now().toString(36)}`.padEnd(16, "0").slice(0, 24)}, 'organization', 'Kardo Billing E2E')
      returning id`;
    await sql`insert into kardo_core.workspace_memberships (workspace_id, profile_id, role) values (${workspace.id}, ${owner.id}, 'owner')`;
  }
  const workspaceId: string = workspace.id;
  const [{ account: accountId }] =
    await sql`select kardo_billing.account_of(${workspaceId}::uuid) as account`;
  const [price] =
    await sql`select stripe_price_id from kardo_billing.prices where lookup_key = 'kardo_esencial_month' and active`;
  check("catalog mirrored (kardo_esencial_month)", Boolean(price));

  const start = Math.floor(Date.now() / 1000);
  const clock = await stripe.testHelpers.testClocks.create({
    frozen_time: start,
    name: "Kardo billing E2E",
  });
  clockIds.push(clock.id);

  const customer = await stripe.customers.create({
    email: "delivered@resend.dev",
    name: "Kardo Billing E2E",
    test_clock: clock.id,
    preferred_locales: ["es-419"],
    metadata: { kardo_workspace_id: workspaceId, kardo_account_id: accountId },
  });
  // Re-runs start clean: only this test person's mirror is removed.
  const cleanMirror = async () => {
    for (const table of ["notices", "refunds"])
      await sql`delete from ${sql(`kardo_billing.${table}`)} where workspace_id = ${workspaceId}`;
    for (const table of ["invoices", "subscriptions", "customers"])
      await sql`delete from ${sql(`kardo_billing.${table}`)} where account_id = ${accountId} or workspace_id = ${workspaceId}`;
  };
  await cleanMirror();
  await sql`
    insert into kardo_billing.customers (workspace_id, account_id, stripe_customer_id, livemode, email, created_by)
    values (${workspaceId}, ${accountId}, ${customer.id}, false, 'delivered@resend.dev', ${owner.id})`;
  const paymentMethod = await stripe.paymentMethods.attach("pm_card_visa", {
    customer: customer.id,
  });
  await stripe.customers.update(customer.id, {
    invoice_settings: { default_payment_method: paymentMethod.id },
  });

  const subscription = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: price.stripe_price_id }],
    trial_period_days: 14,
    default_payment_method: paymentMethod.id,
    ...(env.STRIPE_TAX_RATE_ID
      ? { default_tax_rates: [env.STRIPE_TAX_RATE_ID] }
      : {}),
    metadata: { kardo_workspace_id: workspaceId, kardo_profile_id: owner.id },
  });

  const trialing = await waitFor("mirror trialing", async () => {
    const [row] =
      await sql`select status::text as status from kardo_billing.subscriptions where stripe_subscription_id = ${subscription.id}`;
    return row?.status === "trialing" ? row : null;
  });
  check("webhook mirrored the trial", Boolean(trialing));
  const [effective] =
    await sql`select p.code from kardo_billing.resolve_effective_plan(${workspaceId}) r join kardo_core.plans p on p.id = r.plan_id`;
  check(
    "trial governs the plan (esencial)",
    effective?.code === "esencial",
    effective,
  );
  const started = await waitFor(
    "contract notice sent",
    async () => {
      const [row] =
        await sql`select status from kardo_billing.notices where stripe_subscription_id = ${subscription.id} and kind = 'subscription_started'`;
      return row?.status === "sent" ? row : null;
    },
    30,
  );
  check("contract notice sent (Resend)", Boolean(started), started);

  // 7 days before the first charge: the upcoming-invoice notice.
  await advance(clock.id, start + 7 * DAY + 3600);
  const renewal = await waitFor(
    "renewal notice",
    async () => {
      const [row] =
        await sql`select status, payload from kardo_billing.notices where stripe_subscription_id = ${subscription.id} and kind = 'renewal_upcoming'`;
      return row ?? null;
    },
    45,
  );
  check(
    "renewal notice queued at least 5 days before the charge (Stripe 'upcoming renewal events' ≥ 7 days)",
    Boolean(renewal),
    renewal?.payload,
  );

  // Past the trial: first invoice paid with IVA.
  await advance(clock.id, start + 14 * DAY + 2 * 3600);
  const paid = await waitFor(
    "first invoice paid",
    async () => {
      const [row] =
        await sql`select status, total, tax from kardo_billing.invoices where stripe_subscription_id = ${subscription.id} and status = 'paid' and total > 0`;
      return row ?? null;
    },
    150,
  );
  check(
    "first charge mirrored with IVA included",
    Boolean(paid) && Number(paid?.total) === 19900 && Number(paid?.tax) > 0,
    paid,
  );
  const active = await waitFor("active", async () => {
    const [row] =
      await sql`select status::text as status from kardo_billing.subscriptions where stripe_subscription_id = ${subscription.id}`;
    return row?.status === "active" ? row : null;
  });
  check("subscription active after trial", Boolean(active));

  // Customer cancels in the portal: with API 2026-08-26.dahlia Stripe sets
  // cancel_at to the period end and leaves cancel_at_period_end false (seen
  // in the sandbox, video 3). Kardo must treat it as scheduled, with folio.
  const beforeCancel = await stripe.subscriptions.retrieve(subscription.id);
  await stripe.subscriptions.update(subscription.id, {
    cancel_at: beforeCancel.items.data[0].current_period_end,
    cancellation_details: { comment: "E2E" },
  });
  const cancellation = await waitFor(
    "cancellation notice",
    async () => {
      const [row] =
        await sql`select status, payload from kardo_billing.notices where stripe_subscription_id = ${subscription.id} and kind = 'cancellation_confirmed'`;
      return row?.status === "sent" ? row : null;
    },
    45,
  );
  check(
    "cancellation confirmed by email with folio",
    /^KC-[0-9A-F]{8}$/.test(cancellation?.payload?.folio ?? ""),
    cancellation?.payload,
  );
  const [stillPlan] =
    await sql`select p.code from kardo_billing.resolve_effective_plan(${workspaceId}) r join kardo_core.plans p on p.id = r.plan_id`;
  check(
    "keeps the plan until the end of the paid period",
    stillPlan?.code === "esencial",
    stillPlan,
  );

  // Past the period end: no more charges, no plan.
  await advance(clock.id, start + 45 * DAY);
  const ended = await waitFor(
    "canceled",
    async () => {
      const [row] =
        await sql`select status::text as status from kardo_billing.subscriptions where stripe_subscription_id = ${subscription.id}`;
      return row?.status === "canceled" ? row : null;
    },
    60,
  );
  check("subscription ended at period end", Boolean(ended));
  const after =
    await sql`select p.code from kardo_billing.resolve_effective_plan(${workspaceId}) r join kardo_core.plans p on p.id = r.plan_id`;
  check(
    "falls back (no default plan in dev → no limits)",
    after.length === 0 || after[0].code !== "esencial",
    after,
  );
  const [charges] =
    await sql`select count(*)::int as n from kardo_billing.invoices where stripe_subscription_id = ${subscription.id} and status = 'paid' and total > 0`;
  check(
    "only one paid charge (no charge after cancelling)",
    charges.n === 1,
    charges,
  );
  const [failed] =
    await sql`select count(*)::int as n from kardo_billing.webhook_events where status = 'failed' and received_at > to_timestamp(${start - 60})`;
  check("no failed webhook events", failed.n === 0, failed);

  // Scenario 2: 14-day trial WITHOUT a card. LFPC: notice 7 days before the
  // trial ends, and no charge ever happens; the workspace falls back.
  await cleanMirror();
  const start2 = Math.floor(Date.now() / 1000);
  const clock2 = await stripe.testHelpers.testClocks.create({
    frozen_time: start2,
    name: "Kardo trial without card E2E",
  });
  clockIds.push(clock2.id);
  const customer2 = await stripe.customers.create({
    email: "delivered@resend.dev",
    name: "Kardo Billing E2E sin tarjeta",
    test_clock: clock2.id,
    preferred_locales: ["es-419"],
    metadata: { kardo_workspace_id: workspaceId, kardo_account_id: accountId },
  });
  await sql`
    insert into kardo_billing.customers (workspace_id, account_id, stripe_customer_id, livemode, email, created_by)
    values (${workspaceId}, ${accountId}, ${customer2.id}, false, 'delivered@resend.dev', ${owner.id})`;
  const noCard = await stripe.subscriptions.create({
    customer: customer2.id,
    items: [{ price: price.stripe_price_id }],
    // Ends in 6 REAL days: the hourly tick reads the database clock, not the
    // Stripe test clock, so the trial must really be inside its 7-day window.
    trial_end: start2 + 6 * DAY,
    trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
    ...(env.STRIPE_TAX_RATE_ID
      ? { default_tax_rates: [env.STRIPE_TAX_RATE_ID] }
      : {}),
    metadata: { kardo_workspace_id: workspaceId, kardo_profile_id: owner.id },
  });
  const trial2 = await waitFor("mirror trialing without card", async () => {
    const [row] =
      await sql`select status::text as status from kardo_billing.subscriptions where stripe_subscription_id = ${noCard.id}`;
    return row?.status === "trialing" ? row : null;
  });
  check("trial without card mirrored", Boolean(trial2));
  // Stripe announces no invoice for a trial without a card: the hourly tick
  // (Cloud Scheduler in production) sends the 7-day notice.
  // E2E_API_URL: the API that receives the forwarded webhooks; without it,
  // the one in .env (CUSTOMER_API_PORT).
  const apiUrl = (
    process.env.E2E_API_URL ??
    `http://127.0.0.1:${env.CUSTOMER_API_PORT ?? 3001}`
  ).replace(/\/$/, "");
  const tick = await fetch(`${apiUrl}/internal/billing/tick`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.BILLING_CRON_KEY ?? ""}` },
  });
  check("scheduler tick accepted", tick.status === 200, tick.status);
  const ending = await waitFor(
    "trial ending notice",
    async () => {
      const [row] =
        await sql`select kind, status from kardo_billing.notices where stripe_subscription_id = ${noCard.id} and kind in ('trial_ending', 'renewal_upcoming')`;
      return row ?? null;
    },
    45,
  );
  check(
    "7 days before: 'trial ending, no charge' notice (not a charge notice)",
    ending?.kind === "trial_ending",
    ending,
  );
  await advance(clock2.id, start2 + 6 * DAY + 2 * 3600);
  const ended2 = await waitFor(
    "trial canceled",
    async () => {
      const [row] =
        await sql`select status::text as status from kardo_billing.subscriptions where stripe_subscription_id = ${noCard.id}`;
      return row?.status === "canceled" ? row : null;
    },
    60,
  );
  check("trial without card ends canceled", Boolean(ended2));
  const [charged2] =
    await sql`select count(*)::int as n from kardo_billing.invoices where stripe_subscription_id = ${noCard.id} and amount_paid > 0`;
  check("no charge without a card", charged2.n === 0, charged2);
  const notices2 =
    await sql`select kind from kardo_billing.notices where stripe_subscription_id = ${noCard.id} order by created_at`;
  check(
    "no 'you cancelled' email for an expired trial",
    !notices2.some(
      (row: { kind: string }) => row.kind === "cancellation_confirmed",
    ),
    notices2.map((row: { kind: string }) => row.kind),
  );
} catch (error) {
  console.error(
    "FAILED:",
    (error as Error).message.replace(/(sk|rk)_[A-Za-z0-9_]+/g, "***"),
  );
  process.exitCode = 1;
} finally {
  for (const id of clockIds) {
    await stripe.testHelpers.testClocks.del(id).catch(() => undefined);
  }
  await sql.end({ timeout: 5 });
}
console.log(`${results.filter((r) => r.ok).length}/${results.length}`);
