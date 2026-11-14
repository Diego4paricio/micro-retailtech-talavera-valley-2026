// Integration check of @kardo/billing's webhook sync (ADR 019) against the
// database in .env (SUPABASE_ADMIN_DATABASE_URL, never printed), inside one
// transaction that is always rolled back. Stripe is faked in memory; nothing
// is sent to Stripe and nothing stays in the database.
// Run: services/customer-api/node_modules/.bin/tsx scripts/e2e/billing-sync.mts
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  BillingEventSnapshot,
  BillingGateway,
  InvoiceSnapshot,
  PriceSnapshot,
  RefundSnapshot,
  SubscriptionSnapshot,
} from "../../packages/billing/src/index.ts";
import {
  ACCESS_GRACE_DAYS,
  CONVERSION_COUPON,
  createAccessReconciler,
  createBillingSync,
  createNoticeSender,
  DELETE_AFTER_DAYS,
  liveSubscriptionStatuses,
  renderNotice,
} from "../../packages/billing/src/index.ts";
import { PLAN_OVERAGE_WINDOW_DAYS } from "../../packages/contracts/src/billing.ts";
import { assertWithinLimit } from "../../services/customer-api/src/billing/entitlements.ts";
import { readWorkspaceExport } from "../../services/customer-api/src/workspace-export.ts";
import {
  PlanLimitError,
  PlanRequiredError,
} from "../../services/customer-api/src/errors.ts";
import { requireMembershipWithPermission } from "../../services/customer-api/src/repositories/context.ts";
import { createPostgresMemberRepository } from "../../services/customer-api/src/repositories/members.ts";
import { createPostgresCustomerWorkspaceRepository } from "../../services/customer-api/src/repositories/workspaces.ts";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const require = createRequire(
  path.join(root, "services/customer-api/package.json"),
);
const postgres = require("postgres");
const envText = fs.readFileSync(path.join(root, ".env"), "utf8");
const env = Object.fromEntries(
  envText
    .split("\n")
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => [
      line.slice(0, line.indexOf("=")).trim(),
      line.slice(line.indexOf("=") + 1).trim(),
    ]),
);
const sql = postgres(env.SUPABASE_ADMIN_DATABASE_URL, {
  max: 1,
  prepare: false,
  onnotice: () => {},
});

const results: { step: string; ok: boolean; detail?: string }[] = [];
const check = (step: string, ok: boolean, detail?: unknown) =>
  results.push({
    step,
    ok,
    detail: detail === undefined ? undefined : JSON.stringify(detail),
  });

class Rollback extends Error {}

const now = new Date();
const days = (n: number) => new Date(now.getTime() + n * 86_400_000);

try {
  // Domain audit A2-62: the rules the billing functions share in SQL say
  // the same as the TypeScript that writes the notices and the panel.
  const [rules] = await sql`
    select
      extract(day from kardo_billing.access_grace_period())::int as grace,
      extract(day from kardo_billing.deletion_period())::int as deletion,
      extract(day from kardo_billing.conversion_offer_period())::int as offer,
      extract(day from kardo_billing.plan_overage_window())::int as overage,
      array(
        select s::text from unnest(enum_range(null::kardo_billing.subscription_status)) s
        where kardo_billing.is_live_subscription(s) order by s::text
      ) as live,
      array(
        select s::text from unnest(enum_range(null::kardo_core.touchpoint_status)) s
        where kardo_billing.holds_plan_place(s) order by s::text
      ) as places`;
  const catalog = JSON.parse(
    fs.readFileSync(
      path.join(root, "Docs/engineering/config/billing-catalog.json"),
      "utf8",
    ),
  );
  check(
    "SQL billing rules match TypeScript and the catalog (grace, deletion, offer, downgrade window, live states)",
    rules.grace === ACCESS_GRACE_DAYS &&
      rules.grace === catalog.access.graceDays &&
      rules.deletion === DELETE_AFTER_DAYS &&
      rules.deletion === catalog.access.deleteAfterDays &&
      rules.offer === CONVERSION_COUPON.validDays &&
      rules.offer === catalog.offers.conversionCoupon.validDaysAfterTrial &&
      rules.overage === PLAN_OVERAGE_WINDOW_DAYS &&
      rules.live.join(",") === [...liveSubscriptionStatuses].sort().join(",") &&
      rules.places.join(",") === "active,assigned,paused",
    rules,
  );
  // ADR 026: the kits the SQL applies (kit's panel plan and days, its
  // pieces) say the same as kits-catalog.json, the site's source.
  const kitsCatalog = JSON.parse(
    fs.readFileSync(path.join(root, "Docs/engineering/config/kits-catalog.json"), "utf8"),
  ) as {
    panelDays: number;
    kits: { code: string; name: string; panelPlan: string; items: { piece: string; quantity: number }[] }[];
  };
  const kitRows = await sql`select code, name, panel_plan_code, panel_days, items from kardo_billing.kits`;
  const sortedItems = (items: { piece: string; quantity: number }[]) =>
    JSON.stringify([...items].sort((a, b) => a.piece.localeCompare(b.piece)));
  check(
    "SQL kits match kits-catalog.json (name, panel plan, days, pieces)",
    kitRows.length === kitsCatalog.kits.length &&
      kitsCatalog.kits.every((kit) => {
        const row = kitRows.find((item: { code: string }) => item.code === kit.code);
        return (
          row &&
          row.name === kit.name &&
          row.panel_plan_code === kit.panelPlan &&
          row.panel_days === kitsCatalog.panelDays &&
          sortedItems(row.items) === sortedItems(kit.items)
        );
      }),
    kitRows,
  );
  await sql.begin(async (outer: any) => {
    // `begin` inside the sync becomes a savepoint of this transaction.
    const shim = new Proxy(outer, {
      get(target, prop) {
        if (prop === "begin") return (fn: any) => target.savepoint(fn);
        return target[prop];
      },
    });
    const asAdmin = () => outer`select set_config('role', 'postgres', true)`;

    const [ws] = await outer`
      select w.id, m.profile_id from kardo_core.workspaces w
      join kardo_core.workspace_memberships m on m.workspace_id = w.id and m.role = 'owner'
      where w.kind = 'organization' order by w.created_at limit 1`;
    const [plan] = await outer`
      insert into kardo_core.plans (code, name, is_active, is_public) values ('zz-negocio', 'Negocio', true, true) returning id`;
    await outer`insert into kardo_core.plan_entitlements (plan_id, key, value) values (${plan.id}, 'touchpoints.max', '10'::jsonb)`;
    await outer`delete from kardo_core.workspace_plans where workspace_id = ${ws.id}`;
    // ADR 024: the plan and the Customer are the person's account. Inside
    // this rolled-back transaction, its manual plan goes and an earlier
    // test-mode Customer steps aside, so this one is the account's.
    const [{ account }] = await outer`
      select kardo_billing.account_of(${ws.id}::uuid) as account`;
    await outer`delete from kardo_billing.account_plans where account_id = ${account}`;
    await outer`
      update kardo_billing.customers set account_id = null
      where account_id = ${account} and not livemode`;
    await outer`
      insert into kardo_billing.customers (workspace_id, stripe_customer_id, livemode, created_by)
      values (${ws.id}, 'cus_TESTsync01', false, ${ws.profile_id})`;

    // --- Fake Stripe --------------------------------------------------------
    let subscription: SubscriptionSnapshot = {
      id: "sub_TESTsync01",
      customerId: "cus_TESTsync01",
      status: "trialing",
      livemode: false,
      createdAt: now,
      priceId: "price_TESTsync01",
      planCode: "zz-negocio",
      interval: "month",
      intervalCount: 1,
      unitAmount: 29900,
      currency: "mxn",
      currentPeriodStart: now,
      currentPeriodEnd: days(14),
      trialStart: now,
      trialEnd: days(14),
      cancelAtPeriodEnd: false,
      cancelAt: null,
      canceledAt: null,
      endedAt: null,
      cancellationReason: null,
      cancellationFeedback: null,
      paymentMethod: {
        type: "card",
        brand: "visa",
        last4: "4242",
        expMonth: 12,
        expYear: 2030,
      },
      latestInvoiceId: "in_TESTsync01",
      workspaceId: ws.id,
      profileId: ws.profile_id,
      items: [],
    };
    const invoice: InvoiceSnapshot = {
      id: "in_TESTsync01",
      customerId: "cus_TESTsync01",
      subscriptionId: "sub_TESTsync01",
      number: "KARDO-0001",
      status: "paid",
      billingReason: "subscription_create",
      currency: "mxn",
      subtotal: 29900,
      tax: 4124,
      total: 29900,
      amountDue: 29900,
      amountPaid: 29900,
      amountRemaining: 0,
      hostedInvoiceUrl: "https://invoice.stripe.com/i/test",
      invoicePdf: "https://pay.stripe.com/invoice/test/pdf",
      periodStart: now,
      periodEnd: days(30),
      paidAt: now,
      attemptCount: 1,
      nextPaymentAttempt: null,
      livemode: false,
      createdAt: now,
    };
    const price: PriceSnapshot = {
      id: "price_TESTsync01",
      productId: "prod_TESTsync01",
      planCode: "zz-negocio",
      lookupKey: "zz_negocio_month",
      currency: "mxn",
      unitAmount: 29900,
      interval: "month",
      intervalCount: 1,
      taxBehavior: "inclusive",
      active: true,
      livemode: false,
      extraCode: null,
    };
    const refund: RefundSnapshot = {
      id: "re_TESTsync01",
      amount: 10000,
      currency: "mxn",
      status: "succeeded",
      paymentIntentId: "pi_TESTsync01",
      invoiceId: "in_TESTsync01",
      reason: "prueba",
      livemode: false,
      createdAt: now,
    };
    let failSubscription = false;
    // Extra subscriptions for the notice checks (step 9).
    const others = new Map<string, SubscriptionSnapshot>();
    // One line per subscription, the plan's (ADR 024), unless a step sets
    // its own.
    const withItems = (snapshot: SubscriptionSnapshot): SubscriptionSnapshot =>
      snapshot.items?.length
        ? snapshot
        : {
            ...snapshot,
            items: [
              {
                id: `si_${snapshot.id.replace(/[^A-Za-z0-9]/g, "")}`,
                priceId: snapshot.priceId,
                planCode: snapshot.planCode,
                extraCode: null,
                quantity: 1,
                unitAmount: snapshot.unitAmount,
              },
            ],
          };
    const gateway = {
      livemode: false,
      getSubscription: async (id: string) => {
        if (failSubscription)
          throw new Error("Stripe timeout (sk_test_secretvalue leaked?)");
        return withItems(others.get(id) ?? subscription);
      },
      getInvoice: async () => invoice,
      getPrice: async () => price,
      listPrices: async () => [price],
      getRefund: async () => refund,
      findInvoiceForPaymentIntent: async () => "in_TESTsync01",
    } as unknown as BillingGateway;
    const sync = createBillingSync(shim, gateway);

    let n = 0;
    const event = (
      type: string,
      extra: Partial<BillingEventSnapshot> = {},
    ): BillingEventSnapshot => ({
      id: `evt_TESTsync${String(++n).padStart(3, "0")}`,
      type,
      livemode: false,
      apiVersion: "2026-08-26.dahlia",
      createdAt: now,
      objectType: null,
      objectId: "sub_TESTsync01",
      customerId: "cus_TESTsync01",
      subscriptionId: null,
      invoiceSubscriptionId: null,
      productId: null,
      customerEmail: null,
      termsAccepted: false,
      upcomingAmount: null,
      upcomingAt: null,
      ...extra,
    });

    // 1. Checkout completed with consent.
    const checkout = event("checkout.session.completed", {
      objectType: "checkout.session",
      objectId: "cs_test_1",
      subscriptionId: "sub_TESTsync01",
      termsAccepted: true,
    });
    check(
      "checkout processed",
      (await sync.processEvent(checkout)) === "processed",
    );
    check(
      "duplicate event skipped",
      (await sync.processEvent(checkout)) === "duplicate",
    );
    await asAdmin();
    const [sub] =
      await outer`select status::text, plan_id, payment_method_last4, current_period_end from kardo_billing.subscriptions where stripe_subscription_id = 'sub_TESTsync01'`;
    check(
      "subscription mirrored",
      sub?.status === "trialing" &&
        sub.plan_id === plan.id &&
        sub.payment_method_last4 === "4242",
      sub,
    );
    const [cust] =
      await outer`select trial_consumed_at, trial_consumed_by from kardo_billing.customers where stripe_customer_id = 'cus_TESTsync01'`;
    check(
      "trial consumed by owner",
      cust?.trial_consumed_at !== null &&
        cust.trial_consumed_by === ws.profile_id,
    );
    const audits =
      await outer`select action, metadata from kardo_audit.events where workspace_id = ${ws.id} and action like 'billing.%' and occurred_at >= ${now} order by occurred_at`;
    check(
      "audit: change + consent",
      audits.some((a: any) => a.action === "billing.subscription_changed") &&
        audits.some(
          (a: any) =>
            a.action === "billing.checkout_completed" &&
            a.metadata.termsAccepted === true,
        ),
      audits.map((a: any) => a.action),
    );

    // 2. Effective plan as the owner.
    await outer`select set_config('role', 'kardo_customer_api', true), set_config('kardo.subject', ${ws.profile_id}, true)`;
    const [eff] =
      await outer`select plan_code, source, entitlements from kardo_billing.effective_plan(${ws.id})`;
    check(
      "effective plan = subscription",
      eff?.plan_code === "zz-negocio" && eff.source === "subscription",
      eff,
    );
    await asAdmin();

    // 3. Invoice paid.
    check(
      "invoice processed",
      (await sync.processEvent(
        event("invoice.paid", {
          objectType: "invoice",
          objectId: "in_TESTsync01",
          invoiceSubscriptionId: "sub_TESTsync01",
        }),
      )) === "processed",
    );
    await asAdmin();
    const [inv] =
      await outer`select status, total, tax from kardo_billing.invoices where stripe_invoice_id = 'in_TESTsync01'`;
    check(
      "invoice mirrored",
      inv?.status === "paid" &&
        Number(inv.total) === 29900 &&
        Number(inv.tax) === 4124,
      inv,
    );

    // 4. Failure then retry.
    failSubscription = true;
    const failing = event("customer.subscription.updated");
    let threw = false;
    try {
      await sync.processEvent(failing);
    } catch {
      threw = true;
    }
    await asAdmin();
    const [failedRow] =
      await outer`select status, attempts, last_error from kardo_billing.webhook_events where stripe_event_id = ${failing.id}`;
    check(
      "failure recorded, secret redacted",
      threw &&
        failedRow?.status === "failed" &&
        !String(failedRow.last_error).includes("sk_test_"),
      failedRow,
    );
    failSubscription = false;
    subscription = {
      ...subscription,
      status: "past_due",
      trialStart: subscription.trialStart,
    };
    check(
      "retry processed",
      (await sync.processEvent(failing)) === "processed",
    );
    await asAdmin();
    const [retried] =
      await outer`select status, attempts from kardo_billing.webhook_events where stripe_event_id = ${failing.id}`;
    check(
      "retry counted",
      retried?.status === "processed" && retried.attempts === 2,
      retried,
    );
    await outer`select set_config('role', 'kardo_customer_api', true), set_config('kardo.subject', ${ws.profile_id}, true)`;
    const [pastDue] =
      await outer`select plan_code from kardo_billing.effective_plan(${ws.id})`;
    check("past_due keeps plan", pastDue?.plan_code === "zz-negocio");
    await asAdmin();

    // 5. Refund.
    check(
      "refund processed",
      (await sync.processEvent(
        event("refund.created", {
          objectType: "refund",
          objectId: "re_TESTsync01",
          customerId: null,
        }),
      )) === "processed",
    );
    await asAdmin();
    const [refunded] =
      await outer`select amount_refunded from kardo_billing.invoices where stripe_invoice_id = 'in_TESTsync01'`;
    check(
      "invoice amount_refunded",
      Number(refunded?.amount_refunded) === 10000,
      refunded,
    );

    // 6. Price mapping.
    check(
      "price processed",
      (await sync.processEvent(
        event("price.created", {
          objectType: "price",
          objectId: "price_TESTsync01",
          productId: "prod_TESTsync01",
        }),
      )) === "processed",
    );
    await asAdmin();
    const [pr] =
      await outer`select plan_id from kardo_billing.prices where stripe_price_id = 'price_TESTsync01'`;
    check("price mapped to plan", pr?.plan_id === plan.id);

    // 7. Canceled → falls back.
    subscription = {
      ...subscription,
      status: "canceled",
      endedAt: now,
      canceledAt: now,
    };
    check(
      "deleted processed",
      (await sync.processEvent(event("customer.subscription.deleted"))) ===
        "processed",
    );
    await outer`select set_config('role', 'kardo_customer_api', true), set_config('kardo.subject', ${ws.profile_id}, true)`;
    const fallback =
      await outer`select plan_code from kardo_billing.effective_plan(${ws.id})`;
    check(
      "canceled → no plan (no default yet)",
      fallback.length === 0 || fallback[0].plan_code !== "zz-negocio",
      fallback,
    );
    await asAdmin();

    // 8. Unknown customer and livemode mismatch are ignored, not failed.
    subscription = { ...subscription, customerId: "cus_TESTunknown" };
    check(
      "unknown customer ignored",
      (await sync.processEvent(event("customer.subscription.updated"))) ===
        "ignored",
    );
    check(
      "livemode mismatch ignored",
      (await sync.processEvent(
        event("customer.subscription.updated", { livemode: true }),
      )) === "ignored",
    );

    // 9. Customer notices (LFPC art. 76 Bis): contract, renewal (7 days
    // before, once), cancellation with folio, trial ending without card.
    await asAdmin();
    await outer`update kardo_billing.customers set email = 'delivered@resend.dev' where stripe_customer_id = 'cus_TESTsync01'`;
    const paid: SubscriptionSnapshot = {
      ...subscription,
      id: "sub_TESTsync02",
      customerId: "cus_TESTsync01",
      status: "active",
      trialStart: null,
      trialEnd: null,
      endedAt: null,
      canceledAt: null,
      cancelAt: null,
      cancelAtPeriodEnd: false,
      cancellationReason: null,
      currentPeriodEnd: days(30),
    };
    others.set(paid.id, paid);
    await sync.processEvent(
      event("customer.subscription.created", { objectId: paid.id }),
    );
    const upcoming = event("invoice.upcoming", {
      objectType: "invoice",
      objectId: null,
      invoiceSubscriptionId: paid.id,
      upcomingAmount: 29900,
      upcomingAt: days(30),
    });
    await sync.processEvent(upcoming);
    await sync.processEvent({ ...upcoming, id: "evt_TESTsyncUP2" });
    others.set(paid.id, {
      ...paid,
      cancelAtPeriodEnd: true,
      canceledAt: now,
      cancelAt: days(30),
      cancellationReason: "cancellation_requested",
    });
    await sync.processEvent(
      event("customer.subscription.updated", { objectId: paid.id }),
    );
    const trial: SubscriptionSnapshot = {
      ...paid,
      id: "sub_TESTsync03",
      status: "trialing",
      trialStart: now,
      trialEnd: days(3),
      paymentMethod: null,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      cancelAt: null,
      cancellationReason: null,
    };
    others.set(trial.id, trial);
    await sync.processEvent(
      event("customer.subscription.created", { objectId: trial.id }),
    );
    await sync.processEvent(
      event("customer.subscription.trial_will_end", { objectId: trial.id }),
    );
    await asAdmin();
    const queued = await outer`
      select kind, stripe_subscription_id, payload from kardo_billing.notices
      where stripe_subscription_id in ('sub_TESTsync02', 'sub_TESTsync03') order by created_at`;
    const kinds = queued.map(
      (row: any) => `${row.kind}:${row.stripe_subscription_id}`,
    );
    check(
      "contract notices queued",
      kinds.includes("subscription_started:sub_TESTsync02") &&
        kinds.includes("subscription_started:sub_TESTsync03"),
      kinds,
    );
    check(
      "renewal notice queued once",
      kinds.filter((k: string) => k === "renewal_upcoming:sub_TESTsync02")
        .length === 1,
      kinds,
    );
    const cancel = queued.find(
      (row: any) => row.kind === "cancellation_confirmed",
    );
    check(
      "cancellation notice with folio",
      /^KC-[0-9A-F]{8}$/.test(cancel?.payload?.folio ?? ""),
      cancel?.payload,
    );
    check(
      "trial without card gets trial_ending",
      kinds.includes("trial_ending:sub_TESTsync03") &&
        !kinds.includes("renewal_upcoming:sub_TESTsync03"),
      kinds,
    );
    const renewal = queued.find((row: any) => row.kind === "renewal_upcoming");
    const rendered = renderNotice("renewal_upcoming", renewal.payload, {
      appOrigin: "https://app.kardo.test",
      termsUrl: null,
    });
    check(
      "renewal email names amount and how to cancel",
      rendered.text.includes("$299 MXN, IVA incluido") &&
        rendered.text.includes("/settings/plan"),
      rendered.subject,
    );

    const outbox: string[] = [];
    let failNext = true;
    const sender = createNoticeSender({
      sql: shim,
      emailer: {
        async send(message) {
          if (failNext) {
            failNext = false;
            throw new Error("Resend answered 503.");
          }
          outbox.push(`${message.to}|${message.subject}`);
          return { id: `msg_${outbox.length}` };
        },
      },
      links: {
        appOrigin: "https://app.kardo.test",
        termsUrl: "https://kardo.test/terminos",
      },
    });
    // kardo-dev keeps the pending notices of other accounts (a local API
    // without Resend); inside this rolled-back transaction they wait, so
    // the sender reaches this test's own.
    await asAdmin();
    await outer`
      update kardo_billing.notices set attempts = 99
      where status in ('pending', 'failed') and created_at < ${now}`;
    const first = await sender.deliverPending(20);
    const second = await sender.deliverPending(20);
    await asAdmin();
    const states = await outer`
      select status, attempts, sent_to from kardo_billing.notices
      where workspace_id = ${ws.id} and created_at >= ${now}`;
    check(
      "a failed send is retried, then all are sent",
      first.failed === 1 &&
        states.every(
          (row: any) =>
            row.status === "sent" && row.sent_to === "delivered@resend.dev",
        ),
      { first, second, states },
    );
    const sentAudit =
      await outer`select count(*)::int as count from kardo_audit.events where action = 'billing.notice_sent' and workspace_id = ${ws.id} and occurred_at >= ${now}`;
    check(
      "each sent notice is audited",
      sentAudit[0].count === states.length,
      sentAudit[0],
    );
    // Only this test's recipient: kardo-dev may hold real pending notices
    // (a local API without Resend), which the fake sender also picks up.
    const ownSends = () =>
      outbox.filter((entry) => entry.startsWith("delivered@resend.dev|"));
    check(
      "nothing is sent twice",
      (await sender.deliverPending(20)).sent === 0 &&
        ownSends().length === states.length,
      outbox,
    );

    // 10. Hourly tick: a trial without card ending in 5 days gets its
    // notice even though Stripe announces no invoice for it.
    const lateTrial: SubscriptionSnapshot = {
      ...trial,
      id: "sub_TESTsync04",
      trialEnd: days(5),
    };
    others.set(lateTrial.id, lateTrial);
    await sync.processEvent(
      event("customer.subscription.created", { objectId: lateTrial.id }),
    );
    await sync.runScheduledNotices();
    await asAdmin();
    const [tickNotice] = await outer`
      select kind from kardo_billing.notices
      where stripe_subscription_id = 'sub_TESTsync04' and kind = 'trial_ending'`;
    check("hourly tick queues the 7-day trial notice", Boolean(tickNotice));

    // 11. Kardo trial (ADR 020): starts at sign up, one per person, governs
    // the plan, gets its reminders from the tick and ends when paid.
    await asAdmin();
    const trialEmail = `trial-${now.getTime()}@kardo.test`;
    const [person] = await outer`
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        email_change_token_current, reauthentication_token, phone_change, phone_change_token
      ) values (
        '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
        ${trialEmail}, '', now(), '{"provider":"email","providers":["email"]}'::jsonb,
        '{"display_name":"Prueba"}'::jsonb, now(), now(), '', '', '', '', '', '', '', ''
      ) returning id`;
    const [personal] = await outer`
      select workspace_id as id from kardo_core.workspace_memberships
      where profile_id = ${person.id} and role = 'owner' limit 1`;
    check("sign up creates the personal workspace", Boolean(personal));
    const asPerson = () =>
      outer`select set_config('role', 'kardo_customer_api', true), set_config('kardo.subject', ${person.id}, true)`;
    const startTrial = async (workspaceId: string) => {
      const [row] = await outer`
        select kardo_private.start_workspace_trial(
          ${workspaceId}::uuid, 'negocio', 'profesional', 'year', 15
        ) as id`;
      return row.id as string | null;
    };

    await asPerson();
    const trialId = await startTrial(personal.id);
    check("onboarding starts the trial of the chosen plan", Boolean(trialId));
    const [trialPlan] =
      await outer`select plan_code, source from kardo_billing.effective_plan(${personal.id})`;
    check(
      "the trial governs the plan (source trial)",
      trialPlan?.plan_code === "negocio" && trialPlan.source === "trial",
      trialPlan,
    );
    const [visible] = await outer`
      select billing_interval, (ends_at - started_at) as length
      from kardo_billing.trials where workspace_id = ${personal.id}`;
    check(
      "members read their trial (interval and 15 days)",
      visible?.billing_interval === "year" &&
        String(visible.length).startsWith("15 days"),
      visible,
    );
    const hashDenied = await outer
      .savepoint(async (sp: any) => {
        await sp`select email_sha256 from kardo_billing.trials limit 1`;
        return false;
      })
      .catch(() => true);
    check("the email hash is not readable by the Customer API", hashDenied);
    check(
      "a second call does not start another trial",
      (await startTrial(personal.id)) === null,
    );

    await asAdmin();
    const [secondOrg] = await outer`
      insert into kardo_core.workspaces (public_id, kind, name)
      values (${`zztrialsecond${String(now.getTime()).slice(-8)}`}, 'organization', 'Segunda') returning id`;
    await outer`
      insert into kardo_core.workspace_memberships (workspace_id, profile_id, role)
      values (${secondOrg.id}, ${person.id}, 'owner')`;
    await asPerson();
    check(
      "one trial per person: a second organization starts without one",
      (await startTrial(secondOrg.id)) === null,
    );

    await asAdmin();
    const [started] = await outer`
      select kind, payload from kardo_billing.notices
      where workspace_id = ${personal.id} and kind = 'trial_started'`;
    check(
      "day 0 notice with the plan price",
      started?.payload?.planName === "Negocio" &&
        Number(started.payload.amount) > 0,
      started,
    );

    await outer`update kardo_billing.trials set ends_at = now() + interval '2 days 1 hour' where id = ${trialId}`;
    await sync.runScheduledNotices();
    await sync.runScheduledNotices();
    await asAdmin();
    const reminders = await outer`
      select dedupe_key, payload->>'daysLeft' as days from kardo_billing.notices
      where workspace_id = ${personal.id} and kind = 'trial_reminder'`;
    check(
      "3 days left: one reminder, never twice",
      reminders.length === 1 &&
        reminders[0].dedupe_key.endsWith(":3") &&
        reminders[0].days === "3",
      reminders,
    );

    await outer`update kardo_billing.trials set ends_at = now() - interval '1 hour', started_at = now() - interval '15 days 1 hour' where id = ${trialId}`;
    await sync.runScheduledNotices();
    await asAdmin();
    const [ended] = await outer`
      select payload from kardo_billing.notices
      where workspace_id = ${personal.id} and kind = 'trial_ended'`;
    check(
      "end of trial notice with the grace date",
      Boolean(ended?.payload?.graceEndsAt),
      ended,
    );
    await asPerson();
    const afterTrial =
      await outer`select source from kardo_billing.effective_plan(${personal.id})`;
    check(
      "an ended trial no longer grants the plan",
      afterTrial.length === 0 || afterTrial[0].source !== "trial",
      afterTrial,
    );

    await asAdmin();
    const trialOutbox = outbox.length;
    await sender.deliverPending(20);
    check(
      "trial notices go to the email of whoever started it",
      outbox
        .slice(trialOutbox)
        .some((entry) => entry.startsWith(`${trialEmail}|`)),
      outbox.slice(trialOutbox),
    );

    await outer`update kardo_billing.trials set ends_at = now() + interval '9 days' where id = ${trialId}`;
    await outer`
      insert into kardo_billing.customers (workspace_id, stripe_customer_id, livemode, created_by)
      values (${personal.id}, 'cus_TESTtrial01', false, ${person.id})`;
    await outer`
      insert into kardo_billing.subscriptions (
        stripe_subscription_id, workspace_id, stripe_customer_id, status, plan_id, livemode, stripe_created_at
      ) values ('sub_TESTtrial01', ${personal.id}, 'cus_TESTtrial01', 'trialing', ${plan.id}, false, now())`;
    const [converted] = await outer`
      select converted_at from kardo_billing.trials where id = ${trialId}`;
    check(
      "paying during the trial marks it converted",
      Boolean(converted?.converted_at),
    );

    // 12. Access states (ADR 020 §4 and §8): limited, paused, internal,
    // courtesy; the API refuses writes without a plan; the tick pauses and
    // resumes public pages (fake Resolver) and queues the access notices.
    await asAdmin();
    const accessEmail = `access-${now.getTime()}@kardo.test`;
    const [owner] = await outer`
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        email_change_token_current, reauthentication_token, phone_change, phone_change_token
      ) values (
        '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
        ${accessEmail}, '', now(), '{"provider":"email","providers":["email"]}'::jsonb,
        '{"display_name":"Acceso"}'::jsonb, now(), now(), '', '', '', '', '', '', '', ''
      ) returning id`;
    const [shop] = await outer`
      select workspace_id as id from kardo_core.workspace_memberships
      where profile_id = ${owner.id} and role = 'owner' limit 1`;
    const identity = { subject: owner.id as string, email: accessEmail };
    const asOwner = () =>
      outer`select set_config('role', 'kardo_customer_api', true), set_config('kardo.subject', ${owner.id}, true), set_config('kardo.email', ${accessEmail}, true)`;
    const accessOf = async (workspaceId: string) => {
      await asAdmin();
      const [row] = await outer`
        select * from kardo_billing.resolve_workspace_access(${workspaceId}::uuid)`;
      return row;
    };
    const writeError = async (
      workspaceId: string,
      permission: any,
      options = {},
    ) => {
      await asOwner();
      return outer
        .savepoint((sp: any) =>
          requireMembershipWithPermission(
            sp,
            identity,
            workspaceId,
            permission,
            options,
          ),
        )
        .then(() => null)
        .catch((error: unknown) => error);
    };

    const fresh = await accessOf(shop.id);
    check(
      "a new organization without trial nor plan must choose one (limited, none)",
      fresh?.state === "limited" &&
        fresh.source === "none" &&
        fresh.grace_ends_at === null,
      fresh,
    );
    check(
      "finishing sign up is allowed without a plan (it starts the trial)",
      (await writeError(shop.id, "workspace.manage", {
        allowWithoutPlan: true,
      })) === null,
    );
    await asOwner();
    const [accessTrial] = await outer`
      select kardo_private.start_workspace_trial(${shop.id}::uuid, 'negocio', 'profesional', 'month', 15) as id`;
    const inTrial = await accessOf(shop.id);
    check(
      "day 0: trial of Negocio for 15 days",
      inTrial?.state === "trial" && inTrial.plan_code === "negocio",
      inTrial,
    );
    check(
      "a trial organization can write",
      (await writeError(shop.id, "touchpoints.manage")) === null,
    );

    await asAdmin();
    const publicId = `zzaccess${String(now.getTime()).slice(-10)}`;
    await outer`
      insert into kardo_core.touchpoints (public_id, workspace_id, status, physical_type, kind)
      values (${publicId}, ${shop.id}, 'active', 'label', 'qr')`;
    await outer`update kardo_billing.trials set ends_at = now() - interval '1 hour', started_at = now() - interval '15 days 1 hour' where id = ${accessTrial.id}`;
    const day15 = await accessOf(shop.id);
    check(
      "day 15: limited, pages pause in 7 days, deletion in 90, coupon for 7 days",
      day15?.state === "limited" &&
        day15.source === "trial" &&
        Math.round(
          (new Date(day15.grace_ends_at).getTime() -
            new Date(day15.lapsed_at).getTime()) /
            86_400_000,
        ) === 7 &&
        Math.round(
          (new Date(day15.delete_at).getTime() -
            new Date(day15.lapsed_at).getTime()) /
            86_400_000,
        ) === 90 &&
        Math.round(
          (new Date(day15.offer_until).getTime() -
            new Date(day15.lapsed_at).getTime()) /
            86_400_000,
        ) === 7,
      day15,
    );
    const refused = await writeError(shop.id, "touchpoints.manage");
    check(
      "limited: writes answer PLAN_REQUIRED",
      refused instanceof PlanRequiredError && refused.accessState === "limited",
      String(refused),
    );
    check(
      "limited: reading leads, exporting and billing stay open",
      (await writeError(shop.id, "leads.read")) === null &&
        (await writeError(shop.id, "billing.manage")) === null,
    );
    await asOwner();
    const exported = await outer.savepoint((sp: any) =>
      readWorkspaceExport(sp, shop.id),
    );
    check(
      "the export has the organization's Touchpoints",
      exported.touchpoints.some(
        (t: { publicId: string }) => t.publicId === publicId,
      ),
      exported.touchpoints.length,
    );
    await asAdmin();
    await sync.runScheduledNotices();
    await asAdmin();
    const [trialEnded] = await outer`
      select payload from kardo_billing.notices
      where workspace_id = ${shop.id} and kind = 'trial_ended'`;
    check(
      "trial_ended announces the conversion coupon",
      Boolean(trialEnded?.payload?.offerUntil),
      trialEnded,
    );

    const pauseCalls: { publicIds: string[]; paused: boolean }[] = [];
    const accessErrors: string[] = [];
    const access = createAccessReconciler({
      sql: shim,
      pause: {
        async setPaused(input) {
          // Only this test's pages: kardo-dev may hold other organizations
          // whose pause is due (the tick does not run there).
          if (input.publicIds.some((id) => id.startsWith("zz")))
            pauseCalls.push(input);
        },
      },
      deletionEnabled: false,
      onError: (id, error) =>
        accessErrors.push(`${id}: ${(error as Error).message}`),
    });
    await asAdmin();
    await outer`update kardo_billing.trials set ends_at = now() - interval '3 days 12 hours', started_at = now() - interval '18 days 12 hours' where id = ${accessTrial.id}`;
    await access.runAccessTick();
    await access.runAccessTick();
    await asAdmin();
    const day18 = await outer`
      select dedupe_key from kardo_billing.notices
      where workspace_id = ${shop.id} and kind = 'pause_upcoming'`;
    check(
      "day 18: one pause_upcoming notice, never twice, pages still open",
      day18.length === 1 &&
        day18[0].dedupe_key.endsWith(":3") &&
        pauseCalls.length === 0,
      { day18, pauseCalls },
    );

    await outer`update kardo_billing.trials set ends_at = now() - interval '7 days 1 hour', started_at = now() - interval '22 days 1 hour' where id = ${accessTrial.id}`;
    const tick22 = await access.runAccessTick();
    await access.runAccessTick();
    await asAdmin();
    const [stateRow] = await outer`
      select pages_paused_at, pages_paused_count from kardo_billing.access_states where workspace_id = ${shop.id}`;
    const [pausedNotice] = await outer`
      select payload from kardo_billing.notices where workspace_id = ${shop.id} and kind = 'pages_paused'`;
    check(
      "day 22: paused; the Resolver pauses its pages once and the owner is told",
      (await accessOf(shop.id))?.state === "paused" &&
        pauseCalls.length === 1 &&
        pauseCalls[0].paused === true &&
        pauseCalls[0].publicIds.includes(publicId) &&
        Boolean(stateRow?.pages_paused_at) &&
        stateRow.pages_paused_count === 1 &&
        Boolean(pausedNotice) &&
        tick22.paused >= 1,
      { pauseCalls, stateRow, tick22 },
    );
    const pausedRefusal = await writeError(shop.id, "experiences.publish");
    check(
      "paused: writes answer PLAN_REQUIRED (paused)",
      pausedRefusal instanceof PlanRequiredError &&
        pausedRefusal.accessState === "paused",
    );

    // Staff marks it internal: pages come back at once, no limits. The
    // functions check the staff subject and permission themselves (the
    // migration login cannot become kardo_staff_api).
    const staffId = "3c9247f8-f166-4180-92a1-8954337b958b";
    const asStaff = () =>
      outer`select set_config('role', 'postgres', true), set_config('kardo.staff_subject', ${staffId}, true)`;
    await asStaff();
    const [marked] = await outer`
      select kardo_private.set_workspace_internal(${shop.id}::uuid, true, 'Demo del dueño') as changed`;
    const resumed = await access.reconcileWorkspace(shop.id);
    await asAdmin();
    const [internalAudit] = await outer`
      select action, reason from kardo_audit.events
      where workspace_id = ${shop.id} and action = 'billing.internal_marked'`;
    check(
      "internal: staff marks it (audited), pages resume, writes allowed",
      marked?.changed === true &&
        (await accessOf(shop.id))?.state === "internal" &&
        resumed.pages === "resumed" &&
        pauseCalls.at(-1)?.paused === false &&
        internalAudit?.reason === "Demo del dueño" &&
        (await writeError(shop.id, "experiences.publish")) === null,
      { resumed, internalAudit },
    );
    await asAdmin();
    const noticeCount = async () =>
      (
        await outer`select count(*)::int as n from kardo_billing.notices where workspace_id = ${shop.id}`
      )[0].n as number;
    const beforeInternalTick = await noticeCount();
    await access.runAccessTick();
    await sync.runScheduledNotices();
    await asAdmin();
    check(
      "internal organizations get no access or trial notices",
      (await noticeCount()) === beforeInternalTick,
    );
    await asStaff();
    await outer`select kardo_private.set_workspace_internal(${shop.id}::uuid, false, 'Ya no es demo')`;
    await access.reconcileWorkspace(shop.id);
    check(
      "clearing the internal mark returns it to paused (pages pause again)",
      (await accessOf(shop.id))?.state === "paused" &&
        pauseCalls.at(-1)?.paused === true,
      pauseCalls.at(-1),
    );

    // Staff extends (reopens) the Kardo trial: back to trial, pages resume.
    await asStaff();
    const [extended] = await outer`
      select kardo_private.extend_workspace_trial(${shop.id}::uuid, 5, 'Amigo en prueba') as ends_at`;
    await access.resumeReactivated();
    const reopened = await accessOf(shop.id);
    check(
      "extending the Kardo trial reopens it for 5 days and resumes the pages",
      reopened?.state === "trial" &&
        Math.round(
          (new Date(extended.ends_at).getTime() - Date.now()) / 86_400_000,
        ) === 5 &&
        pauseCalls.at(-1)?.paused === false,
      { reopened, last: pauseCalls.at(-1) },
    );
    const noStaff = await outer
      .savepoint(async (sp: any) => {
        await sp`select set_config('kardo.staff_subject', '', true)`;
        await sp`select kardo_private.extend_workspace_trial(${shop.id}::uuid, 5, 'sin permiso')`;
        return false;
      })
      .catch(() => true);
    check("only staff with billing.write can extend or mark", noStaff);

    // A live subscription reactivates at once (webhook path).
    await asAdmin();
    await outer`update kardo_billing.trials set ends_at = now() - interval '8 days' where workspace_id = ${shop.id}`;
    await access.reconcileWorkspace(shop.id);
    const pausedAgain = pauseCalls.at(-1)?.paused === true;
    await outer`
      insert into kardo_billing.customers (workspace_id, stripe_customer_id, livemode, created_by)
      values (${shop.id}, 'cus_TESTaccess01', false, ${owner.id})`;
    await outer`
      insert into kardo_billing.subscriptions (
        stripe_subscription_id, workspace_id, stripe_customer_id, status, plan_id, livemode, stripe_created_at
      ) values ('sub_TESTaccess01', ${shop.id}, 'cus_TESTaccess01', 'active', ${plan.id}, false, now())`;
    const back = await access.resumeReactivated();
    await asAdmin();
    const [cleared] = await outer`
      select pages_paused_at from kardo_billing.access_states where workspace_id = ${shop.id}`;
    check(
      "paying reactivates everything at once, printed QR codes included",
      pausedAgain &&
        back === 1 &&
        pauseCalls.at(-1)?.paused === false &&
        cleared?.pages_paused_at === null &&
        (await accessOf(shop.id))?.state === "active",
      { back, cleared },
    );

    // A courtesy that ends: 7-day notice to the Owner (no Stripe Customer,
    // no trial), then plan_ended. ADR 024: the courtesy is the person's, so
    // it goes to a friend's account (the Owner above now pays).
    await asAdmin();
    const friendEmail = `friend-${now.getTime()}@kardo.test`;
    const [friend] = await outer`
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        email_change_token_current, reauthentication_token, phone_change, phone_change_token
      ) values (
        '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
        ${friendEmail}, '', now(), '{"provider":"email","providers":["email"]}'::jsonb,
        '{"display_name":"Amigo"}'::jsonb, now(), now(), '', '', '', '', '', '', '', ''
      ) returning id`;
    const [friendOrg] = await outer`
      select workspace_id as id from kardo_core.workspace_memberships
      where profile_id = ${friend.id} and role = 'owner' limit 1`;
    const [{ account: friendAccount }] = await outer`
      select kardo_billing.account_of(${friendOrg.id}::uuid) as account`;
    await outer`
      insert into kardo_billing.account_plans (account_id, plan_id, override_until)
      values (${friendAccount}, ${plan.id}, now() + interval '6 days 12 hours')`;
    await access.runAccessTick();
    await asAdmin();
    const [courtesy] = await outer`
      select dedupe_key from kardo_billing.notices
      where workspace_id = ${friendOrg.id} and kind = 'courtesy_ending'`;
    check(
      "courtesy: notice 7 days before it ends",
      courtesy?.dedupe_key?.endsWith(":7"),
      courtesy,
    );
    await outer`update kardo_billing.account_plans set override_until = now() - interval '1 hour' where account_id = ${friendAccount}`;
    await access.runAccessTick();
    await asAdmin();
    const [ended2] = await outer`
      select payload from kardo_billing.notices
      where workspace_id = ${friendOrg.id} and kind = 'plan_ended'`;
    const expired = await accessOf(friendOrg.id);
    check(
      "courtesy ended: limited like an ended trial, plan_ended (courtesy)",
      expired?.state === "limited" &&
        expired.source === "manual" &&
        ended2?.payload?.endedKind === "manual",
      { expired, ended2 },
    );
    const courtesyOutbox = outbox.length;
    await sender.deliverPending(50);
    check(
      "access notices without Customer nor trial go to the Owner",
      outbox
        .slice(courtesyOutbox)
        .some(
          (entry) =>
            entry.startsWith(`${friendEmail}|`) && entry.includes("cortesía"),
        ),
      outbox.slice(courtesyOutbox),
    );

    const legacyWs = await outer`
      select w.id from kardo_core.workspaces w
      where w.created_at < (select legacy_before from kardo_billing.access_policy)
        and not exists (select 1 from kardo_billing.trials t where t.workspace_id = w.id)
        and not exists (select 1 from kardo_billing.subscriptions s where s.workspace_id = w.id)
        and not exists (select 1 from kardo_core.workspace_plans p where p.workspace_id = w.id)
        and not exists (select 1 from kardo_billing.internal_workspaces i where i.workspace_id = w.id)
      limit 1`;
    check(
      "an organization from before ADR 020 without plan stays legacy (no limits)",
      legacyWs.length === 0 ||
        (await accessOf(legacyWs[0].id))?.state === "legacy",
    );
    await asOwner();
    const foreign = await outer
      .savepoint(async (sp: any) => {
        await sp`select set_config('kardo.staff_subject', '', true)`;
        await sp`select * from kardo_billing.workspace_access(${friendOrg.id}::uuid)`;
        await sp`select set_config('kardo.subject', ${person.id}, true)`;
        await sp`select * from kardo_billing.workspace_access(${friendOrg.id}::uuid)`;
        return false;
      })
      .catch(() => true);
    check("only members (or staff) read an organization's access", foreign);
    check(
      "the access tick had no errors",
      accessErrors.length === 0,
      accessErrors,
    );

    // 13. Fiscal data and CFDI (ADR 020 §6): optional data (never the
    // Constancia), request for a payment of this month, staff marks it
    // issued (notice), and "factura de cada pago" asks by itself.
    const asWsOwner = () =>
      outer`select set_config('role', 'kardo_customer_api', true), set_config('kardo.subject', ${ws.profile_id}, true), set_config('kardo.staff_subject', '', true)`;
    const saveProfile = (rfc: string, each = false) =>
      outer.savepoint(
        (sp: any) =>
          sp`select kardo_private.upsert_fiscal_profile(
          ${ws.id}::uuid, ${rfc}, 'Florería Lila SA de CV', '601', '06700', 'G03',
          'contabilidad@kardo.test', ${each}
        )`,
      );
    await asWsOwner();
    const badRfc = await saveProfile("XAXX010101000")
      .then(() => false)
      .catch((e: Error) => e.message.includes("INVALID_FISCAL_PROFILE"));
    check("the generic RFC is refused (it would not need a CFDI)", badRfc);
    await saveProfile("fli120101ab1");
    const [savedProfile] =
      await outer`select rfc from kardo_billing.fiscal_profiles where workspace_id = ${ws.id}`;
    check(
      "fiscal data saved, RFC in capitals",
      savedProfile?.rfc === "FLI120101AB1",
      savedProfile,
    );

    await asAdmin();
    await outer`
      insert into kardo_billing.invoices (
        stripe_invoice_id, workspace_id, stripe_customer_id, status, currency, total,
        amount_due, amount_paid, tax, number, paid_at, livemode, stripe_created_at
      ) values
        ('in_TESTcfdi01', ${ws.id}, 'cus_TESTsync01', 'paid', 'mxn', 44900, 44900, 44900, 6193, 'KARDO-0101', now(), false, now()),
        ('in_TESTcfdi02', ${ws.id}, 'cus_TESTsync01', 'paid', 'mxn', 44900, 44900, 44900, 6193, 'KARDO-0100', now() - interval '40 days', false, now() - interval '40 days')`;
    await asWsOwner();
    const [cfdi] =
      await outer`select kardo_private.request_cfdi(${ws.id}::uuid, 'in_TESTcfdi01') as id`;
    const [again] =
      await outer`select kardo_private.request_cfdi(${ws.id}::uuid, 'in_TESTcfdi01') as id`;
    const [snap] =
      await outer`select fiscal_snapshot->>'rfc' as rfc, status from kardo_billing.cfdi_requests where id = ${cfdi.id}`;
    check(
      "a payment of this month asks for its CFDI once, with the data as they were",
      Boolean(cfdi?.id) &&
        again.id === cfdi.id &&
        snap?.rfc === "FLI120101AB1" &&
        snap.status === "pending",
      snap,
    );
    const oldMonth = await outer
      .savepoint(
        (sp: any) =>
          sp`select kardo_private.request_cfdi(${ws.id}::uuid, 'in_TESTcfdi02')`,
      )
      .then(() => false)
      .catch((e: Error) => e.message.includes("CFDI_PERIOD_CLOSED"));
    check("a payment of an earlier month goes to the global invoice", oldMonth);

    await outer`select set_config('role', 'postgres', true), set_config('kardo.staff_subject', ${"3c9247f8-f166-4180-92a1-8954337b958b"}, true)`;
    const badUuid = await outer
      .savepoint(
        (sp: any) =>
          sp`select kardo_private.resolve_cfdi_request(${cfdi.id}::uuid, 'issued', 'nope', null)`,
      )
      .then(() => false)
      .catch((e: Error) => e.message.includes("INVALID_SAT_UUID"));
    check("marking it issued needs the SAT folio", badUuid);
    await outer`select kardo_private.resolve_cfdi_request(${cfdi.id}::uuid, 'issued', '5F0C2D6E-1A2B-4C3D-8E9F-0A1B2C3D4E5F', null)`;
    const [issued] =
      await outer`select status, sat_uuid, handled_by from kardo_billing.cfdi_requests where id = ${cfdi.id}`;
    const [issuedNotice] =
      await outer`select payload from kardo_billing.notices where dedupe_key = ${`cfdi_issued:${cfdi.id}`}`;
    check(
      "staff marks it issued: folio stored and the customer is told",
      issued?.status === "issued" &&
        issued.sat_uuid === "5f0c2d6e-1a2b-4c3d-8e9f-0a1b2c3d4e5f" &&
        issuedNotice?.payload?.satUuid === issued.sat_uuid &&
        issuedNotice.payload.fiscalEmail === "contabilidad@kardo.test",
      { issued, issuedNotice },
    );
    const backwards = await outer
      .savepoint(
        (sp: any) =>
          sp`select kardo_private.resolve_cfdi_request(${cfdi.id}::uuid, 'rejected', null, 'ya no')`,
      )
      .then(() => false)
      .catch((e: Error) => e.message.includes("INVALID_TRANSITION"));
    check("an issued CFDI can only be canceled, never rejected", backwards);

    await asWsOwner();
    await saveProfile("FLI120101AB1", true);
    await asAdmin();
    invoice.id = "in_TESTcfdi03";
    invoice.number = "KARDO-0102";
    invoice.paidAt = new Date();
    await sync.processEvent(
      event("invoice.paid", { objectId: "in_TESTcfdi03" }),
    );
    await asAdmin();
    const [auto] = await outer`
      select requested_by, status from kardo_billing.cfdi_requests where stripe_invoice_id = 'in_TESTcfdi03'`;
    check(
      "factura de cada pago: a new payment asks for its CFDI by itself",
      auto?.status === "pending" && auto.requested_by === null,
      auto,
    );
    // A payment of a month already closed (Mexico City) never asks by
    // itself, even within the 3 days: it belongs to that month's global.
    const [{ monthStart }] = await outer`
      select (date_trunc('month', now() at time zone 'America/Mexico_City')
        at time zone 'America/Mexico_City') as "monthStart"`;
    const lastMonth = new Date(new Date(monthStart).getTime() - 3_600_000);
    if (Date.now() - lastMonth.getTime() < 3 * 86_400_000) {
      invoice.id = "in_TESTcfdi04";
      invoice.number = "KARDO-0103";
      invoice.paidAt = lastMonth;
      await sync.processEvent(
        event("invoice.paid", { objectId: "in_TESTcfdi04" }),
      );
      await asAdmin();
      const [late] = await outer`
        select count(*)::int as n from kardo_billing.cfdi_requests where stripe_invoice_id = 'in_TESTcfdi04'`;
      check(
        "factura de cada pago: a payment of a closed month is left to the global",
        late.n === 0,
        late,
      );
    } else {
      check(
        "factura de cada pago: closed month (only testable in the first 3 days of a month)",
        true,
      );
    }
    await asWsOwner();
    await outer`select kardo_private.delete_fiscal_profile(${ws.id}::uuid)`;
    await asAdmin();
    const [gone] =
      await outer`select count(*)::int as n from kardo_billing.fiscal_profiles where workspace_id = ${ws.id}`;
    const [kept] =
      await outer`select count(*)::int as n from kardo_billing.cfdi_requests where workspace_id = ${ws.id}`;
    check(
      "deleting the fiscal data keeps the requests already made (issued CFDI)",
      gone.n === 0 && kept.n === 2,
      { gone, kept },
    );

    // 14. Deletion 90 days after the end (ADR 020, addendum of 2026-10-01).
    // Only a test organization created here, inside this rolled-back
    // transaction; another organization of the same Owner stays intact.
    // Cleanup outside the database is faked (nothing reaches R2 or a
    // Resolver).
    await asAdmin();
    const deletionEmail = `deletion-${now.getTime()}@kardo.test`;
    const [doomedOwner] = await outer`
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        email_change_token_current, reauthentication_token, phone_change, phone_change_token
      ) values (
        '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
        ${deletionEmail}, '', now(), '{"provider":"email","providers":["email"]}'::jsonb,
        '{"display_name":"Borrado"}'::jsonb, now(), now(), '', '', '', '', '', '', '', ''
      ) returning id`;
    const [doomed] = await outer`
      select workspace_id as id from kardo_core.workspace_memberships
      where profile_id = ${doomedOwner.id} and role = 'owner' limit 1`;
    // ADR 024: the organizations of one account share its trial and would
    // lapse together, so the neighbor is in another person's account (its
    // first Owner) and the doomed Owner co-owns it.
    const [neighborOwner] = await outer`
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        email_change_token_current, reauthentication_token, phone_change, phone_change_token
      ) values (
        '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
        ${`neighbor-${now.getTime()}@kardo.test`}, '', now(), '{"provider":"email","providers":["email"]}'::jsonb,
        '{"display_name":"Vecino"}'::jsonb, now(), now(), '', '', '', '', '', '', '', ''
      ) returning id`;
    const [neighbor] = await outer`
      insert into kardo_core.workspaces (public_id, kind, name)
      values (${`zzneighbor${String(now.getTime()).slice(-8)}`}, 'organization', 'Vecino') returning id`;
    await outer`
      insert into kardo_core.workspace_memberships (workspace_id, profile_id, role)
      values (${neighbor.id}, ${neighborOwner.id}, 'owner'), (${neighbor.id}, ${doomedOwner.id}, 'owner')`;
    const stamp = String(now.getTime()).slice(-9);
    const [kept1] = await outer`
      insert into kardo_core.touchpoints (public_id, workspace_id, status, physical_type, kind, operational_name)
      values (${`zzkept${stamp}xx`}, ${neighbor.id}, 'active', 'label', 'qr', 'Mostrador') returning id, public_id`;
    const [tp1] = await outer`
      insert into kardo_core.touchpoints (public_id, workspace_id, status, physical_type, kind, operational_name)
      values (${`zzdoomed${stamp}a`}, ${doomed.id}, 'active', 'label', 'qr', 'Mesa 1') returning id, public_id`;
    const [tp2] = await outer`
      insert into kardo_core.touchpoints (public_id, workspace_id, status, physical_type, kind, retired_at)
      values (${`zzdoomed${stamp}b`}, ${doomed.id}, 'retired', 'label', 'qr', now()) returning id, public_id`;
    const [group] = await outer`
      insert into kardo_core.touchpoint_groups (workspace_id, name) values (${doomed.id}, 'Terraza') returning id`;
    await outer`update kardo_core.touchpoints set group_id = ${group.id} where id = ${tp1.id}`;
    const [exp] = await outer`
      insert into kardo_core.experiences (workspace_id, type, name, created_by, touchpoint_id)
      values (${doomed.id}, 'redirect', 'Menú del día', ${doomedOwner.id}, ${tp1.id}) returning id`;
    const [version] = await outer`
      insert into kardo_core.experience_versions (experience_id, revision, content, created_by)
      values (${exp.id}, 1, '{"type":"redirect"}'::jsonb, ${doomedOwner.id}) returning id`;
    await outer`
      insert into kardo_core.publications (touchpoint_id, experience_version_id, revision, status, idempotency_key, created_by, published_at)
      values (${tp1.id}, ${version.id}, 1, 'published', gen_random_uuid(), ${doomedOwner.id}, now())`;
    const sharedHash = "a".repeat(64);
    const [upload] = await outer`
      insert into kardo_core.assets (workspace_id, storage_key, original_filename, media_type, byte_size, sha256, status, created_by, derivative_key, validated_at)
      values (${doomed.id}, ${`originals/zz-${stamp}`}, 'menu.png', 'image/png', 10, ${sharedHash}, 'published', ${doomedOwner.id}, ${`assets/${sharedHash}`}, now())
      returning id`;
    await outer`
      insert into kardo_core.experience_assets (experience_id, asset_id, purpose)
      values (${exp.id}, ${upload.id}, 'primary')`;
    await outer`
      insert into kardo_core.leads (workspace_id, touchpoint_id, publication_revision, email, consented_at)
      values (${doomed.id}, ${tp1.id}, 1, 'cliente@kardo.test', now())`;
    await outer`
      insert into kardo_core.workspace_invitations (workspace_id, email, role, token_hash, expires_at)
      values (${doomed.id}, 'invitada@kardo.test', 'editor', ${"b".repeat(64)}, now() + interval '7 days')`;
    await outer`
      insert into kardo_billing.fiscal_profiles (workspace_id, rfc, legal_name, tax_regime, postal_code, cfdi_use, email, invoice_each_payment)
      values (${doomed.id}, 'BOR200101AB1', 'Borrado SA de CV', '601', '06700', 'G03', 'fiscal@kardo.test', false)`;
    await outer`
      insert into kardo_billing.notices (workspace_id, kind, dedupe_key, payload, status, sent_at, sent_to)
      values
        (${doomed.id}, 'trial_ended', ${`zz-sent-${stamp}`}, '{}'::jsonb, 'sent', now(), 'borrado@kardo.test'),
        (${doomed.id}, 'deletion_upcoming', ${`zz-pending-${stamp}`}, '{}'::jsonb, 'pending', null, null)`;
    const asDoomedOwner = () =>
      outer`select set_config('role', 'kardo_customer_api', true), set_config('kardo.subject', ${doomedOwner.id}, true), set_config('kardo.email', ${deletionEmail}, true), set_config('kardo.staff_subject', '', true)`;
    await asDoomedOwner();
    const [doomedTrial] = await outer`
      select kardo_private.start_workspace_trial(${doomed.id}::uuid, 'profesional', 'profesional', 'month', 15) as id`;
    const asSync = () =>
      outer`select set_config('role', 'kardo_billing_sync', true)`;
    const deleteNow = async (dryRun: boolean) => {
      await asSync();
      const [row] = await outer`
        select kardo_private.delete_workspace_data(${doomed.id}::uuid, 'billing.retention_expired', ${dryRun}) as outcome`;
      return row.outcome;
    };
    const lapse = async (daysAgo: number) => {
      await asAdmin();
      await outer`
        update kardo_billing.trials
        set ends_at = now() - make_interval(days => ${daysAgo}), started_at = now() - make_interval(days => ${daysAgo + 15})
        where id = ${doomedTrial.id}`;
    };

    await lapse(80);
    const early = await deleteNow(false);
    check(
      "deletion: not before its date (day 95 of 105)",
      early.status === "not_due" && early.why === "delete_at",
      early,
    );
    await lapse(91);
    await asAdmin();
    await outer`insert into kardo_billing.internal_workspaces (workspace_id, reason) values (${doomed.id}, 'prueba interna')`;
    const internalOutcome = await deleteNow(false);
    check(
      "deletion: never an internal organization",
      internalOutcome.status === "not_due",
      internalOutcome,
    );
    await asAdmin();
    await outer`delete from kardo_billing.internal_workspaces where workspace_id = ${doomed.id}`;
    const preview = await deleteNow(true);
    await asAdmin();
    const [stillThere] = await outer`
      select (select count(*)::int from kardo_core.experiences where workspace_id = ${doomed.id}) as experiences,
        (select deleted_at from kardo_core.workspaces where id = ${doomed.id}) as deleted_at`;
    check(
      "deletion dry run: counts what would go and deletes nothing",
      preview.status === "dry_run" &&
        preview.counts.touchpoints === 2 &&
        preview.counts.experiences === 1 &&
        preview.counts.assets === 1 &&
        preview.counts.leads === 1 &&
        preview.counts.members === 1 &&
        stillThere.experiences === 1 &&
        stillThere.deleted_at === null,
      { preview, stillThere },
    );

    await asDoomedOwner();
    const guardDenied = await outer
      .savepoint(
        (sp: any) =>
          sp`update kardo_core.workspaces set deleted_at = now() where id = ${neighbor.id}`,
      )
      .then(() => false)
      // The column grant refuses it first (security review 2026-10); the
      // trigger still guards any other role.
      .catch(
        (e: Error) =>
          e.message.includes("permission denied") ||
          e.message.includes("WORKSPACE_DELETION_REQUIRED"),
      );
    check("the Customer API cannot mark an organization deleted", guardDenied);
    const callDenied = await outer
      .savepoint(
        (sp: any) =>
          sp`select kardo_private.delete_workspace_data(${doomed.id}::uuid, 'a mano', false)`,
      )
      .then(() => false)
      .catch((e: Error) => /permission denied/i.test(e.message));
    check("the Customer API cannot run the deletion", callDenied);

    // The hourly tick, with deletion on and a cleanup that fails once.
    const retired: string[] = [];
    const removed: { storageKey: string; deleteDerivative: boolean }[] = [];
    let failRetire = true;
    const deletionErrors: string[] = [];
    const deleter = createAccessReconciler({
      sql: shim,
      pause: { async setPaused() {} },
      deletionEnabled: true,
      cleanup: {
        async retireTouchpoint(id) {
          if (failRetire) throw new Error("Resolver down");
          retired.push(id);
        },
        async deleteAsset(target) {
          removed.push(target);
        },
      },
      onError: (id, error) =>
        deletionErrors.push(`${id}: ${(error as Error).message}`),
    });
    await asAdmin();
    const tick = await deleter.runAccessTick();
    await asAdmin();
    const [after] = await outer`
      select w.name, w.deleted_at, w.profile,
        (select count(*)::int from kardo_core.touchpoints t where t.workspace_id = w.id and t.status = 'retired' and t.operational_name is null and t.group_id is null) as tombstones,
        (select count(*)::int from kardo_core.experiences e where e.workspace_id = w.id) as experiences,
        (select count(*)::int from kardo_core.experience_versions v where v.experience_id = ${exp.id}) as versions,
        (select count(*)::int from kardo_core.publications p where p.touchpoint_id = ${tp1.id}) as publications,
        (select count(*)::int from kardo_core.assets a where a.workspace_id = w.id) as assets,
        (select count(*)::int from kardo_core.leads l where l.workspace_id = w.id) as leads,
        (select count(*)::int from kardo_core.workspace_memberships m where m.workspace_id = w.id) as members,
        (select count(*)::int from kardo_core.workspace_invitations i where i.workspace_id = w.id) as invitations,
        (select count(*)::int from kardo_core.touchpoint_groups g where g.workspace_id = w.id) as groups,
        (select count(*)::int from kardo_billing.fiscal_profiles f where f.workspace_id = w.id) as fiscal,
        (select count(*)::int from kardo_billing.trials t where t.workspace_id = w.id) as trials,
        (select status from kardo_billing.notices n where n.dedupe_key = ${`zz-sent-${stamp}`}) as sent_notice,
        (select status from kardo_billing.notices n where n.dedupe_key = ${`zz-pending-${stamp}`}) as pending_notice,
        (select count(*)::int from kardo_audit.events e where e.workspace_id = w.id and e.action = 'workspace.deleted') as audited
      from kardo_core.workspaces w where w.id = ${doomed.id}`;
    check(
      "the tick deletes exactly the due test organization",
      tick.deletion?.deleted === 1 && deletionErrors.length === 0,
      { deletion: tick.deletion, deletionErrors },
    );
    check(
      "deleted: anonymized name, no profile, retired tombstones (public ids kept)",
      after.name === "Organización eliminada" &&
        after.deleted_at !== null &&
        JSON.stringify(after.profile) === "{}" &&
        after.tombstones === 2,
      after,
    );
    check(
      "deleted: content, uploads, leads, members, invitations and groups are gone",
      after.experiences === 0 &&
        after.versions === 0 &&
        after.publications === 0 &&
        after.assets === 0 &&
        after.leads === 0 &&
        after.members === 0 &&
        after.invitations === 0 &&
        after.groups === 0,
      after,
    );
    check(
      "deleted: trial, sent notices and audit are kept; the fiscal profile without CFDI is not",
      after.trials === 1 &&
        after.sent_notice === "sent" &&
        after.pending_notice === "skipped" &&
        after.audited === 1 &&
        after.fiscal === 0,
      after,
    );
    check(
      "deleted: the access state says so and nothing is paused or resumed",
      (await accessOf(doomed.id))?.state === "deleted" &&
        (await deleter.reconcileWorkspace(doomed.id)).pages === null,
    );
    await asAdmin();
    const [pending] = await outer`
      select
        (select count(*)::int from kardo_billing.deletion_cleanup c where c.workspace_id = ${doomed.id} and c.done_at is null and c.kind = 'resolver' and c.last_error is not null) as failed_resolver,
        (select count(*)::int from kardo_billing.deletion_cleanup c where c.workspace_id = ${doomed.id} and c.done_at is not null and c.kind = 'asset') as done_assets,
        (select cleanup_completed_at from kardo_billing.workspace_deletions d where d.workspace_id = ${doomed.id}) as completed`;
    check(
      "cleanup: a Resolver failure keeps the items pending and the deletion unfinished",
      pending.failed_resolver === 2 &&
        pending.done_assets === 1 &&
        pending.completed === null,
      pending,
    );
    check(
      "cleanup: the upload goes, and its public derivative only because nobody else shares it",
      removed.length === 1 && removed[0].deleteDerivative === true,
      removed,
    );
    failRetire = false;
    const retry = await deleter.runDeletionCleanup();
    await asAdmin();
    const [completed] = await outer`
      select cleanup_completed_at from kardo_billing.workspace_deletions where workspace_id = ${doomed.id}`;
    check(
      "cleanup: the next hour retires both public ids and finishes",
      // At least these two: kardo-dev may hold other organizations' pending
      // cleanup (the hourly task does not run there).
      retry.done >= 2 &&
        retired.includes(tp1.public_id) &&
        retired.includes(tp2.public_id) &&
        completed.cleanup_completed_at !== null,
      { retry, retired },
    );
    const deletedAgain = await deleteNow(false);
    check(
      "deletion is idempotent",
      deletedAgain.status === "already_deleted",
      deletedAgain,
    );
    await asAdmin();
    const [neighborAfter] = await outer`
      select w.name, w.deleted_at,
        (select status::text from kardo_core.touchpoints where id = ${kept1.id}) as touchpoint,
        (select operational_name from kardo_core.touchpoints where id = ${kept1.id}) as touchpoint_name,
        (select count(*)::int from kardo_core.workspace_memberships m where m.workspace_id = w.id) as members,
        (select count(*)::int from kardo_core.profiles p where p.id = ${doomedOwner.id}) as profile
      from kardo_core.workspaces w where w.id = ${neighbor.id}`;
    check(
      "the Owner's other organization and account stay intact",
      neighborAfter.deleted_at === null &&
        neighborAfter.name === "Vecino" &&
        neighborAfter.touchpoint === "active" &&
        neighborAfter.touchpoint_name === "Mostrador" &&
        neighborAfter.members === 2 &&
        neighborAfter.profile === 1 &&
        (await accessOf(shop.id))?.state !== "deleted",
      neighborAfter,
    );

    // 15. The sign up creates an organization (owner decision, 2026-10-01):
    // the business can invite its team under the same plan; a space never
    // goes back to personal.
    await asAdmin();
    const setupEmail = `setup-${now.getTime()}@kardo.test`;
    const [setupUser] = await outer`
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        email_change_token_current, reauthentication_token, phone_change, phone_change_token
      ) values (
        '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
        ${setupEmail}, '', now(), '{"provider":"email","providers":["email"]}'::jsonb,
        '{"display_name":"Alta"}'::jsonb, now(), now(), '', '', '', '', '', '', '', ''
      ) returning id`;
    const [setupSpace] = await outer`
      select w.id, w.kind from kardo_core.workspace_memberships m
      join kardo_core.workspaces w on w.id = m.workspace_id
      where m.profile_id = ${setupUser.id} and m.role = 'owner' limit 1`;
    const onboarded = await createPostgresCustomerWorkspaceRepository(shim, {
      trial: { days: 15, defaultPlan: "profesional" },
    }).completeOnboarding(
      { subject: setupUser.id, email: setupEmail },
      setupSpace.id,
      { workspaceName: "Taller Nuevo", accountType: "business" },
    );
    await asAdmin();
    const [setupTrial] = await outer`
      select count(*)::int as n from kardo_billing.trials where workspace_id = ${setupSpace.id}`;
    check(
      "sign up: the personal space becomes the business organization, with its trial",
      setupSpace.kind === "personal" &&
        onboarded.kind === "organization" &&
        onboarded.name === "Taller Nuevo" &&
        onboarded.accountType === "business" &&
        setupTrial.n === 1,
      { before: setupSpace.kind, onboarded, setupTrial },
    );
    const backToPersonal = await outer
      .savepoint(
        (sp: any) =>
          sp`update kardo_core.workspaces set kind = 'personal' where id = ${setupSpace.id}`,
      )
      .then(() => false)
      .catch((e: Error) => e.message.includes("WORKSPACE_KIND_LOCKED"));
    check("an organization never goes back to personal", backToPersonal);

    // The display name: sign up sets it to the business while it is the
    // default one; a person who joined by invitation keeps their own name
    // (the default loses " · Personal" when they accept) even after they
    // create their own business.
    const [ownerProfile] = await outer`
      select display_name from kardo_core.profiles where id = ${setupUser.id}`;
    const guestEmail = `guest-${now.getTime()}@kardo.test`;
    const [guestUser] = await outer`
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change,
        email_change_token_current, reauthentication_token, phone_change, phone_change_token
      ) values (
        '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
        ${guestEmail}, '', now(), '{"provider":"email","providers":["email"]}'::jsonb,
        '{"display_name":"Rocío"}'::jsonb, now(), now(), '', '', '', '', '', '', '', ''
      ) returning id`;
    const inviteToken = `kardo-e2e-invite-${now.getTime()}`;
    await outer`
      insert into kardo_core.workspace_invitations (
        workspace_id, email, role, token_hash, status, invited_by, expires_at
      ) values (
        ${setupSpace.id}, ${guestEmail}, 'editor',
        encode(extensions.digest(${inviteToken}, 'sha256'), 'hex'), 'pending',
        ${setupUser.id}, now() + interval '7 days'
      )`;
    const guestIdentity = { subject: guestUser.id, email: guestEmail };
    await createPostgresMemberRepository(shim).acceptInvitation(
      guestIdentity,
      inviteToken,
    );
    await asAdmin();
    const [guestAfterJoin] = await outer`
      select display_name from kardo_core.profiles where id = ${guestUser.id}`;
    const [guestSpace] = await outer`
      select w.id from kardo_core.workspace_memberships m
      join kardo_core.workspaces w on w.id = m.workspace_id
      where m.profile_id = ${guestUser.id} and m.role = 'owner' limit 1`;
    await createPostgresCustomerWorkspaceRepository(shim, {
      trial: { days: 15, defaultPlan: "profesional" },
    }).completeOnboarding(guestIdentity, guestSpace.id, {
      workspaceName: "Estudio Rocío",
      accountType: "personal",
    });
    await asAdmin();
    const [guestAfterBusiness] = await outer`
      select display_name from kardo_core.profiles where id = ${guestUser.id}`;
    check(
      "display name: the business on sign up; an invited person keeps their name",
      ownerProfile.display_name === "Taller Nuevo" &&
        guestAfterJoin.display_name === "Rocío" &&
        guestAfterBusiness.display_name === "Rocío",
      { ownerProfile, guestAfterJoin, guestAfterBusiness },
    );
    // Personal or business is kept with the space; either way it is an
    // organization that can invite (owner decision, 2026-10-01).
    const declared = await outer`
      select id, kind, account_type from kardo_core.workspaces
      where id in (${setupSpace.id}, ${guestSpace.id})`;
    const typeOf = (id: string) =>
      declared.find((row: { id: string }) => row.id === id);
    const badType = await outer
      .savepoint(
        (sp: any) =>
          sp`update kardo_core.workspaces set account_type = 'empresa' where id = ${setupSpace.id}`,
      )
      .then(() => false)
      .catch((e: Error) => e.message.includes("workspaces_account_type_check"));
    check(
      "sign up keeps personal or business; both are organizations",
      typeOf(setupSpace.id)?.account_type === "business" &&
        typeOf(guestSpace.id)?.account_type === "personal" &&
        declared.every(
          (row: { kind: string }) => row.kind === "organization",
        ) &&
        badType,
      { declared, badType },
    );

    // 16. AI spend cap per organization (table D, 2026-10-01): the cost of the
    // month's audited generations, in US cents, against
    // `ai.spend_cents_month`. Taller Nuevo is on its Profesional trial (US$2).
    await asAdmin();
    const auditGeneration = (costMicroUsd: number) => outer`
      insert into kardo_audit.events (workspace_id, actor_subject, actor_type, action, target_type, result, metadata)
      values (${setupSpace.id}::uuid, ${setupUser.id}::uuid, 'customer', 'experience.design_generated',
        'experience', 'succeeded', ${outer.json({ costMicroUsd })})`;
    const spendCheck = async () => {
      await outer`select set_config('role', 'kardo_customer_api', true), set_config('kardo.subject', ${setupUser.id}, true)`;
      return outer
        .savepoint((sp: any) =>
          assertWithinLimit(sp, setupSpace.id, "ai.spend_cents_month"),
        )
        .then(() => null)
        .catch((error: unknown) => error);
    };
    const spentCents = async () => {
      const [row] = await outer`
        select (kardo_billing.workspace_usage(${setupSpace.id}::uuid) ->> 'ai.spend_cents_month')::int as cents`;
      return row?.cents as number | undefined;
    };
    await auditGeneration(1_000_000); // US$1.00
    const underCap = await spendCheck();
    const halfway = await spentCents();
    await asAdmin();
    await auditGeneration(999_999); // rounded up, the month reaches 200 cents
    const atCap = await spendCheck();
    const full = await spentCents();
    await asAdmin();
    const caps = await outer`
      select p.code, (e.value)::text::int as cents from kardo_core.plan_entitlements e
      join kardo_core.plans p on p.id = e.plan_id
      where e.key = 'ai.spend_cents_month' and p.code in ('esencial', 'profesional', 'negocio')
      order by p.sort_order`;
    check(
      "AI spend cap: US$1 / US$2 / US$4 a month, and generating stops at the cap",
      underCap === null &&
        halfway === 100 &&
        atCap instanceof PlanLimitError &&
        full === 200 &&
        caps.map((row: { cents: number }) => row.cents).join(",") ===
          "100,200,400",
      {
        underCap,
        halfway,
        atCap: (atCap as Error | null)?.message,
        full,
        caps,
      },
    );
    throw new Rollback();
  });
} catch (error) {
  if (!(error instanceof Rollback)) {
    console.error("FAILED:", (error as Error).message);
    process.exitCode = 1;
  }
} finally {
  await sql.end({ timeout: 5 });
}
for (const r of results)
  console.log(
    `${r.ok ? "PASS" : "FAIL"}  ${r.step}${r.ok ? "" : `  ${r.detail ?? ""}`}`,
  );
console.log(
  `${results.filter((r) => r.ok).length}/${results.length} (rolled back)`,
);
