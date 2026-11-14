// Local-only visual walkthrough of Kardo Operations. `VITE_DEMO_MODE` is
// replaced at build time, so production bundles never contain a reachable
// demo branch unless the flag is explicitly enabled for a local build.
// `vite.config.ts` refuses to build with the flag set while `mode: "production"`.
import { ApiRequestError } from "./api-errors.js";
import { demoNotificationsRequest } from "./demo-notifications.js";
import { demoPiecesRequest } from "./demo-pieces.js";

export const isDemoMode = import.meta.env.VITE_DEMO_MODE === "true";

type DemoOptions = { method?: string; body?: unknown };
type Obj = Record<string, unknown>;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => window.setTimeout(() => resolve(value), 200));
}

function clone<T>(value: unknown): T {
  return structuredClone(value) as T;
}

function isoDaysAgo(days: number, hours = 0): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(date.getUTCHours() - hours);
  return date.toISOString();
}

function dateOnly(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/** Small deterministic PRNG so the demo dataset is stable across reloads. */
function seeded(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value * 1103515245 + 12345) & 0x7fffffff;
    return value / 0x7fffffff;
  };
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

function demoPrice(
  id: string,
  interval: "month" | "year",
  unitAmount: number,
  livemode = true,
  active = true,
): Obj {
  return { id, interval, unitAmount, currency: "mxn", active, livemode };
}

const plans: Obj[] = [
  {
    id: "10000000-0000-4000-8000-000000000002",
    code: "esencial",
    name: "Esencial",
    isActive: true,
    description: "Para un negocio pequeño con varios puntos de contacto.",
    isPublic: true,
    isDefault: false,
    sortOrder: 10,
    trialDays: 15,
    entitlements: {
      "touchpoints.max": 5,
      "links.max": 3,
      "members.max": 3,
      "qr_designs.max": 10,
      "assets.storage_mb": 250,
      "ai.generations_month": 30,
      "analytics.history_days": 30,
      "custom_html.enabled": false,
      "leads.export": true,
      "leads.webhook": false,
    },
    prices: [
      demoPrice("price_1EsencialMonth", "month", 19_900),
      demoPrice("price_1EsencialYear", "year", 219_000),
    ],
    workspaces: 0,
    createdAt: isoDaysAgo(300),
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    code: "profesional",
    name: "Profesional",
    isActive: true,
    description: "Para equipos que operan varias sucursales o campañas.",
    isPublic: true,
    isDefault: false,
    sortOrder: 20,
    trialDays: 15,
    entitlements: {
      "touchpoints.max": 25,
      "links.max": 10,
      "members.max": 10,
      "qr_designs.max": 50,
      "assets.storage_mb": 2_000,
      "ai.generations_month": 200,
      "analytics.history_days": 180,
      "custom_html.enabled": true,
      "leads.export": true,
      "leads.webhook": true,
    },
    prices: [
      demoPrice("price_1ProfesionalMonth", "month", 37_900),
      demoPrice("price_1ProfesionalYear", "year", 379_000),
      demoPrice("price_1ProfesionalMonthTest", "month", 37_900, false),
      demoPrice("price_1ProfesionalLegacy", "month", 44_900, true, false),
    ],
    workspaces: 0,
    createdAt: isoDaysAgo(300),
  },
  {
    id: "10000000-0000-4000-8000-000000000004",
    code: "negocio",
    name: "Negocio",
    isActive: true,
    description: "Para cadenas y organizaciones con mucho volumen.",
    isPublic: true,
    isDefault: false,
    sortOrder: 30,
    trialDays: 15,
    entitlements: {
      "touchpoints.max": 100,
      "links.max": 25,
      "members.max": 30,
      "qr_designs.max": 200,
      "assets.storage_mb": 10_000,
      "ai.generations_month": 1_000,
      "analytics.history_days": 365,
      "custom_html.enabled": true,
      "leads.export": true,
      "leads.webhook": true,
    },
    prices: [
      demoPrice("price_1NegocioMonth", "month", 69_900),
      demoPrice("price_1NegocioYear", "year", 699_000),
    ],
    workspaces: 0,
    createdAt: isoDaysAgo(300),
  },
  {
    id: "10000000-0000-4000-8000-000000000005",
    code: "corporativo",
    name: "Corporativo",
    isActive: true,
    description: "A la medida, se asigna a mano y sin precio de lista.",
    isPublic: false,
    isDefault: false,
    sortOrder: 40,
    trialDays: null,
    entitlements: {
      "touchpoints.max": null,
      "links.max": null,
      "members.max": null,
      "qr_designs.max": null,
      "assets.storage_mb": null,
      "ai.generations_month": 5_000,
      "analytics.history_days": null,
      "custom_html.enabled": true,
      "leads.export": true,
      "leads.webhook": true,
    },
    prices: [],
    workspaces: 0,
    createdAt: isoDaysAgo(300),
  },
];

const businessNames = [
  "Café Nube",
  "Estudio Lumen",
  "Panadería Trigo",
  "Taller Cobalto",
  "Clínica Vitalis",
  "Hostal Raíces",
  "Barbería Norte",
  "Boutique Alma",
  "Gimnasio Pulso",
  "Vivero Musgo",
  "Librería Andar",
  "Cantina Roble",
  "Spa Cauce",
  "Galería Ocre",
  "Óptica Faro",
  "Florería Eliminada",
];

const workspaces: Obj[] = businessNames.map((name, index) => {
  const random = seeded(index + 7);
  const kind = index % 4 === 0 ? "organization" : "personal";
  // Only the three priced plans; Corporativo is assigned by hand.
  const plan = plans[index % 3] as Obj;
  const createdDaysAgo = 20 + Math.round(random() * 300);
  return {
    id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    publicId: `kardowsp${String(index + 1).padStart(8, "0")}`,
    name,
    kind,
    createdAt: isoDaysAgo(createdDaysAgo),
    ownerEmail: `${name.toLowerCase().replaceAll(/[^a-z]+/g, ".")}@kardodemo.mx`,
    members: kind === "organization" ? 2 + (index % 4) : 1,
    touchpoints: 0,
    activeTouchpoints: 0,
    suspendedTouchpoints: 0,
    experiences: 0,
    leads: Math.round(random() * 40),
    planCode: plan.code,
    lastActivityAt: isoDaysAgo(Math.round(random() * 6)),
  };
});

// ---------------------------------------------------------------------------
// Billing (ADR 019): subscriptions, invoices, refunds and webhook events
// ---------------------------------------------------------------------------

type BillingState = {
  subscriptions: Obj[];
  invoices: Obj[];
  refunds: Obj[];
  manualPlanUntil: string | null;
  trialConsumedAt: string | null;
  livemode: boolean;
  /** Kardo trial (ADR 020): no card, no Stripe subscription. */
  kardoTrial: {
    planCode: string;
    startedAt: string;
    endsAt: string;
    converted: boolean;
  } | null;
  /** Something that ended without a new plan: starts grace, pause, deletion. */
  lapse: {
    source: "trial" | "subscription" | "manual" | "none";
    lapsedAt: string;
  } | null;
  internal: { reason: string; setAt: string; setByName: string | null } | null;
  /** Deleted after 90 days without hiring (ADR 020, adenda del 2026-10-01). */
  deletion: Obj | null;
};

const billingByWorkspace = new Map<string, BillingState>();
const billingEvents: Obj[] = [];
const alnum = (prefix: string, n: number, extra = "") =>
  `${prefix}_${extra}${String(n).padStart(10, "0")}Demo`;

const subscriptionPlan: Record<number, { status: string; extra?: Obj }> = {
  1: { status: "active" },
  2: { status: "trialing" },
  3: { status: "active", extra: { cancelAtPeriodEnd: true } },
  5: { status: "past_due" },
  6: { status: "active" },
  7: { status: "active", extra: { interval: "year" } },
  9: { status: "canceled" },
  10: { status: "trialing", extra: { trialInDays: 3 } },
  11: { status: "active" },
  13: { status: "active", extra: { livemode: false } },
};

function priceFor(planCode: string, interval: "month" | "year"): Obj | null {
  const plan = plans.find((item) => item.code === planCode);
  const list = ((plan?.prices ?? []) as Obj[]).filter(
    (price) => price.active && price.livemode,
  );
  return list.find((price) => price.interval === interval) ?? null;
}

function seedBilling(): void {
  let counter = 0;
  for (const [index, workspace] of workspaces.entries()) {
    const planned = subscriptionPlan[index];
    const state: BillingState = {
      subscriptions: [],
      invoices: [],
      refunds: [],
      manualPlanUntil: null,
      trialConsumedAt: null,
      livemode: planned?.extra?.livemode !== false,
      kardoTrial: null,
      lapse: null,
      internal: null,
      deletion: null,
    };
    if (index === 0)
      state.internal = {
        reason: "Cuenta de demostración para ventas.",
        setAt: isoDaysAgo(40, 3),
        setByName: "Staff Demo",
      };
    if (index === 4) {
      // Kardo trial in progress (9 of 15 days used).
      workspace.planCode = "profesional";
      state.kardoTrial = {
        planCode: "profesional",
        startedAt: isoDaysAgo(9),
        endsAt: isoDaysAgo(-6),
        converted: false,
      };
      state.trialConsumedAt = isoDaysAgo(9);
    }
    if (index === 12) {
      // Trial ended 80 days ago: paused, deletion due in 10 days. The
      // Resolver never applied the pause (`pagesPausedAt` stays null).
      state.kardoTrial = {
        planCode: "esencial",
        startedAt: isoDaysAgo(95),
        endsAt: isoDaysAgo(80),
        converted: false,
      };
      state.trialConsumedAt = isoDaysAgo(95);
      state.lapse = { source: "trial", lapsedAt: isoDaysAgo(80) };
    }
    if (index === 15) {
      // Trial ended 100 days ago; deleted 10 days ago. Invoices stay, the
      // outside cleanup (R2) still has two objects pending.
      state.kardoTrial = {
        planCode: "esencial",
        startedAt: isoDaysAgo(130),
        endsAt: isoDaysAgo(115),
        converted: false,
      };
      state.trialConsumedAt = isoDaysAgo(130);
      state.lapse = { source: "trial", lapsedAt: isoDaysAgo(100) };
      state.deletion = {
        deletedAt: isoDaysAgo(10),
        reason: "billing.retention_expired",
        counts: {
          touchpoints: 4,
          experiences: 6,
          experienceVersions: 11,
          assets: 18,
          leads: 37,
          members: 2,
          invitations: 1,
          groups: 2,
          qrTemplates: 0,
          analyticsRows: 1_240,
          invoicesKept: 2,
          cfdiKept: 1,
        },
        cleanupPending: 2,
        cleanupCompletedAt: null,
        lastCleanupError: "R2 respondió 503 al borrar el archivo.",
      };
      for (const [cycle, daysAgo] of [135, 105].entries())
        state.invoices.push({
          id: alnum("in", 900 + cycle),
          number: `KARDO-${String(2000 + cycle)}`,
          status: "paid",
          total: 19_900,
          amountPaid: 19_900,
          amountRefunded: 0,
          currency: "mxn",
          periodStart: isoDaysAgo(daysAgo),
          periodEnd: isoDaysAgo(daysAgo - 30),
          paidAt: isoDaysAgo(daysAgo),
          hostedInvoiceUrl: `https://invoice.stripe.com/i/acct_demo/test_del${cycle}`,
          invoicePdf: `https://pay.stripe.com/invoice/acct_demo/test_del${cycle}/pdf`,
          createdAt: isoDaysAgo(daysAgo),
        });
    }
    if (index === 14)
      // Second organization of someone who already used their trial.
      state.lapse = { source: "none", lapsedAt: isoDaysAgo(3) };
    if (index === 8) {
      // Courtesy plan with an expiry date, no Stripe subscription.
      workspace.planCode = "profesional";
      state.manualPlanUntil = isoDaysAgo(-6);
    }
    if (planned) {
      counter += 1;
      const planCode =
        index === 9
          ? "esencial"
          : ((workspace.planCode as string) ?? "esencial");
      const interval = (planned.extra?.interval as "month" | "year") ?? "month";
      const price = priceFor(planCode, interval);
      const plan = plans.find((item) => item.code === planCode) as Obj;
      const trialing = planned.status === "trialing";
      const trialInDays = (planned.extra?.trialInDays as number) ?? 6;
      const createdDaysAgo = 15 + index * 9;
      const subscription: Obj = {
        id: alnum("sub", counter),
        status: planned.status,
        planCode,
        planName: plan.name,
        interval,
        unitAmount: (price?.unitAmount as number) ?? 19_900,
        currency: "mxn",
        currentPeriodEnd:
          planned.status === "canceled"
            ? isoDaysAgo(10)
            : isoDaysAgo(-(8 + index)),
        trialEnd: trialing ? isoDaysAgo(-trialInDays) : null,
        cancelAtPeriodEnd: planned.extra?.cancelAtPeriodEnd === true,
        cancelAt: planned.extra?.cancelAtPeriodEnd
          ? isoDaysAgo(-(8 + index))
          : null,
        canceledAt: planned.status === "canceled" ? isoDaysAgo(10) : null,
        paymentMethod: trialing
          ? null
          : {
              type: "card",
              brand: index % 2 ? "visa" : "mastercard",
              last4: String(4000 + index * 37).slice(0, 4),
              expMonth: 1 + (index % 12),
              expYear: 2028,
            },
        createdAt: isoDaysAgo(createdDaysAgo),
      };
      state.subscriptions.push(subscription);
      state.trialConsumedAt = plan.trialDays
        ? isoDaysAgo(createdDaysAgo)
        : null;
      if (!trialing) {
        const cycles =
          interval === "year" ? 1 : Math.min(4, Math.ceil(createdDaysAgo / 30));
        for (let cycle = 0; cycle < cycles; cycle += 1) {
          const daysAgo = createdDaysAgo - cycle * 30;
          const total = subscription.unitAmount as number;
          const open = planned.status === "past_due" && cycle === cycles - 1;
          state.invoices.unshift({
            id: alnum("in", counter * 10 + cycle),
            number: `KARDO-${String(1000 + counter * 10 + cycle)}`,
            status: open ? "open" : "paid",
            total,
            amountPaid: open ? 0 : total,
            amountRefunded: 0,
            currency: "mxn",
            periodStart: isoDaysAgo(Math.max(0, daysAgo)),
            periodEnd: isoDaysAgo(Math.max(0, daysAgo) - 30),
            paidAt: open ? null : isoDaysAgo(Math.max(0, daysAgo)),
            hostedInvoiceUrl: `https://invoice.stripe.com/i/acct_demo/test_${counter}${cycle}`,
            invoicePdf: `https://pay.stripe.com/invoice/acct_demo/test_${counter}${cycle}/pdf`,
            createdAt: isoDaysAgo(Math.max(0, daysAgo)),
          });
        }
      }
      if (index === 6) {
        const invoice = state.invoices[0] as Obj;
        invoice.amountRefunded = 10_000;
        state.refunds.push({
          id: "re_DemoRefund0001",
          invoiceId: invoice.id,
          amount: 10_000,
          currency: "mxn",
          status: "succeeded",
          reason: "Cobro duplicado por error de la tarjeta.",
          createdAt: isoDaysAgo(2),
        });
      }
      const events: [string, string, number, string | null][] = [
        ["checkout.session.completed", "processed", 1, null],
        ["invoice.paid", "processed", 1, null],
        ["customer.subscription.updated", "processed", 1, null],
      ];
      if (planned.status === "past_due")
        events.unshift([
          "invoice.payment_failed",
          "failed",
          3,
          "No se pudo actualizar la suscripción: timeout al consultar Stripe.",
        ]);
      for (const [
        eventIndex,
        [type, status, attempts, lastError],
      ] of events.entries())
        billingEvents.push({
          id: `evt_${alnum("Demo", counter * 10 + eventIndex)}`,
          type,
          status,
          attempts,
          lastError,
          workspaceId: workspace.id,
          receivedAt: isoDaysAgo(eventIndex, eventIndex * 3),
        });
    }
    if (index === 9)
      state.lapse = { source: "subscription", lapsedAt: isoDaysAgo(10) };
    billingByWorkspace.set(workspace.id as string, state);
  }
  billingEvents.push(
    {
      id: "evt_DemoUnknownWorkspace",
      type: "customer.subscription.created",
      status: "failed",
      attempts: 5,
      lastError:
        "No encontramos la organización asociada al cliente de Stripe.",
      workspaceId: null,
      receivedAt: isoDaysAgo(1, 4),
    },
    {
      id: "evt_DemoIgnored0001",
      type: "charge.succeeded",
      status: "ignored",
      attempts: 1,
      lastError: null,
      workspaceId: null,
      receivedAt: isoDaysAgo(3),
    },
  );
  billingEvents.sort(
    (a, b) =>
      new Date(b.receivedAt as string).getTime() -
      new Date(a.receivedAt as string).getTime(),
  );
}
seedBilling();

/** Staff actions on a deleted organization answer 409, like the API. */
function rejectDeleted(state: BillingState): void {
  if (state.deletion)
    throw new ApiRequestError(
      "La organización fue eliminada.",
      409,
      "STAFF_CONFLICT",
    );
}

function workspaceOf(id: string): Obj | undefined {
  return workspaces.find((item) => item.id === id);
}

function isLive(status: string): boolean {
  return ["active", "trialing", "past_due"].includes(status);
}

function monthlyCents(subscription: Obj): number {
  const amount = subscription.unitAmount as number;
  return subscription.interval === "year" ? Math.round(amount / 12) : amount;
}

function allSubscriptionRows(): Obj[] {
  return workspaces.flatMap((workspace) => {
    const state = billingByWorkspace.get(workspace.id as string);
    return (state?.subscriptions ?? []).map((subscription) => ({
      ...subscription,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      ownerEmail: workspace.ownerEmail,
      stripeCustomerId: `cus_${String(workspace.publicId).slice(-8)}Demo`,
      livemode: state?.livemode ?? true,
    }));
  });
}

type Access = {
  state:
    | "internal"
    | "active"
    | "trial"
    | "limited"
    | "paused"
    | "deleted"
    | "legacy";
  source:
    | "internal"
    | "subscription"
    | "manual"
    | "trial"
    | "legacy"
    | "none"
    | "excluded";
  lapsedAt: string | null;
  graceEndsAt: string | null;
  deleteAt: string | null;
  pagesPausedAt: string | null;
  internal: BillingState["internal"];
  deletion: Obj | null;
};

function addDays(iso: string, days: number): string {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

/** Access state per ADR 020 §4: 7 days of grace, deletion at 90 days. */
function accessOf(state: BillingState): Access {
  const empty: Omit<Access, "state" | "source"> = {
    lapsedAt: null,
    graceEndsAt: null,
    deleteAt: null,
    pagesPausedAt: null,
    internal: state.internal,
    deletion: null,
  };
  const now = Date.now();
  if (state.deletion)
    return {
      ...empty,
      state: "deleted",
      source: "none",
      deleteAt: state.deletion.deletedAt as string,
      deletion: state.deletion,
    };
  if (state.internal)
    return { ...empty, state: "internal", source: "internal" };
  if (state.subscriptions.some((item) => isLive(item.status as string)))
    return { ...empty, state: "active", source: "subscription" };
  if (state.manualPlanUntil && new Date(state.manualPlanUntil).getTime() > now)
    return { ...empty, state: "active", source: "manual" };
  if (
    state.kardoTrial &&
    !state.kardoTrial.converted &&
    new Date(state.kardoTrial.endsAt).getTime() > now
  )
    return { ...empty, state: "trial", source: "trial" };
  if (state.lapse) {
    const graceEndsAt = addDays(state.lapse.lapsedAt, 7);
    const paused = new Date(graceEndsAt).getTime() <= now;
    return {
      ...empty,
      state: paused ? "paused" : "limited",
      source: state.lapse.source,
      lapsedAt: state.lapse.lapsedAt,
      graceEndsAt,
      deleteAt: addDays(state.lapse.lapsedAt, 90),
      // Workspace 12 models a Resolver that is not configured.
      pagesPausedAt:
        paused && state.lapse.source !== "trial" ? graceEndsAt : null,
    };
  }
  return { ...empty, state: "legacy", source: "legacy" };
}

function trialView(state: BillingState): Obj | null {
  const trial = state.kardoTrial;
  if (!trial) return null;
  const plan = plans.find((item) => item.code === trial.planCode) as Obj;
  const endsMs = new Date(trial.endsAt).getTime();
  return {
    planCode: trial.planCode,
    planName: plan.name,
    interval: "month",
    startedAt: trial.startedAt,
    endsAt: trial.endsAt,
    daysLeft: Math.max(0, Math.ceil((endsMs - Date.now()) / 86_400_000)),
    status: trial.converted
      ? "converted"
      : endsMs > Date.now()
        ? "active"
        : "ended",
  };
}

function accessRows(): Obj[] {
  return workspaces.map((workspace) => {
    const state = billingByWorkspace.get(
      workspace.id as string,
    ) as BillingState;
    const access = accessOf(state);
    const plan = effectivePlan(workspace, state);
    return {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      ownerEmail: workspace.ownerEmail,
      ...access,
      planName: plan?.name ?? null,
      endsAt:
        access.state === "trial"
          ? state.kardoTrial?.endsAt
          : (state.manualPlanUntil ?? null),
    };
  });
}

function pendingDeletion(row: Obj): boolean {
  return (
    (row.state === "limited" || row.state === "paused") &&
    typeof row.deleteAt === "string" &&
    new Date(row.deleteAt).getTime() <= Date.now() + 15 * 86_400_000
  );
}

function billingOverview(): Obj {
  const accessAll = accessRows();
  const rows = allSubscriptionRows();
  const thirtyDays = Date.now() - 30 * 86_400_000;
  const sevenDays = Date.now() + 7 * 86_400_000;
  const byPlan = new Map<string, Obj>();
  for (const row of rows.filter((item) => isLive(item.status as string))) {
    const code = row.planCode as string;
    const entry = byPlan.get(code) ?? {
      planCode: code,
      planName: row.planName,
      subscriptions: 0,
      mrr: 0,
    };
    entry.subscriptions = (entry.subscriptions as number) + 1;
    if (row.status !== "trialing")
      entry.mrr = (entry.mrr as number) + monthlyCents(row);
    byPlan.set(code, entry);
  }
  return {
    currency: "mxn",
    mrr: rows
      .filter((row) => row.status === "active" || row.status === "past_due")
      .reduce((total, row) => total + monthlyCents(row), 0),
    active: rows.filter((row) => row.status === "active").length,
    trialing: rows.filter((row) => row.status === "trialing").length,
    pastDue: rows.filter((row) => row.status === "past_due").length,
    canceledLast30Days: rows.filter(
      (row) =>
        row.canceledAt &&
        new Date(row.canceledAt as string).getTime() > thirtyDays,
    ).length,
    trialsEndingNext7Days: rows.filter(
      (row) =>
        row.status === "trialing" &&
        row.trialEnd &&
        new Date(row.trialEnd as string).getTime() < sevenDays,
    ).length,
    failedWebhookEvents: billingEvents.filter(
      (event) => event.status === "failed",
    ).length,
    access: {
      kardoTrials: accessAll.filter((row) => row.state === "trial").length,
      limited: accessAll.filter((row) => row.state === "limited").length,
      paused: accessAll.filter((row) => row.state === "paused").length,
      pendingDeletion: accessAll.filter(pendingDeletion).length,
      deleted: accessAll.filter((row) => row.state === "deleted").length,
      deletionMode: "dry-run",
      internal: accessAll.filter((row) => row.state === "internal").length,
    },
    byPlan: [...byPlan.values()],
  };
}

function effectivePlan(workspace: Obj, state: BillingState): Obj | null {
  const access = accessOf(state);
  const live = state.subscriptions.find((item) =>
    isLive(item.status as string),
  );
  let code: string | null = null;
  let source: string | null = null;
  if (access.state === "internal") {
    code = "corporativo";
    source = "manual";
  } else if (live) {
    code = live.planCode as string;
    source = "subscription";
  } else if (access.state === "active") {
    code = workspace.planCode as string;
    source = "manual";
  } else if (access.state === "trial" && state.kardoTrial) {
    code = state.kardoTrial.planCode;
    source = "trial";
  }
  const plan = plans.find((item) => item.code === code);
  if (!plan || !source) return null;
  return { code: plan.code, name: plan.name, source };
}

function notice(
  n: number,
  kind: string,
  daysAgo: number,
  extra: Obj = {},
): Obj {
  return {
    id: `7b1c2d3e-4f50-4617-8a9b-0c1d2e3f4a${String(n).padStart(2, "0")}`,
    kind,
    status: "sent",
    subscriptionId: null,
    folio: null,
    sentTo: "dueno@negocio.mx",
    attempts: 1,
    createdAt: isoDaysAgo(daysAgo, 1),
    sentAt: isoDaysAgo(daysAgo),
    ...extra,
  };
}

function noticesFor(state: BillingState): Obj[] {
  const subscriptionId = String(state.subscriptions[0]?.id ?? "sub_demo000000");
  const list: Obj[] = [];
  if (state.subscriptions.length)
    list.push(
      notice(51, "subscription_started", 20, { subscriptionId }),
      notice(52, "renewal_upcoming", 2, { subscriptionId }),
    );
  if (state.kardoTrial) {
    list.push(notice(53, "trial_started", 9));
    if (state.lapse?.source === "trial")
      list.push(notice(54, "trial_ended", 80));
  }
  if (state.manualPlanUntil) list.push(notice(55, "courtesy_ending", 1));
  if (state.lapse) {
    const since = Math.round(
      (Date.now() - new Date(state.lapse.lapsedAt).getTime()) / 86_400_000,
    );
    list.push(notice(56, "plan_ended", since));
    if (since >= 4) list.push(notice(57, "pause_upcoming", since - 3));
    if (since >= 7) list.push(notice(58, "pages_paused", since - 7));
    if (since >= 75)
      list.push(
        notice(59, "deletion_upcoming", since - 75, {
          status: "failed",
          attempts: 2,
          sentAt: null,
        }),
      );
  }
  return list;
}

/** Custom number of organizations set from the manual plan (Corporativo). */
const customOrganizationsMax = new Map<string, number>();

/** ADR 024: the person's account, here Mariana Ríos with her organizations. */
function demoAccount(workspaceId: string): Obj {
  const index = Math.max(
    0,
    workspaces.findIndex((item) => item.id === workspaceId),
  );
  const mine = [workspaces[index], workspaces[(index + 1) % workspaces.length]]
    .filter((item): item is Obj => Boolean(item))
    .filter((item, at, list) => list.indexOf(item) === at);
  return {
    accountId: "00000000-0000-4000-8000-0000000000a1",
    holderName: "Mariana Ríos",
    holderEmail: "mariana@ejemplo.mx",
    organizationsUsed: mine.length,
    organizationsLimit: customOrganizationsMax.get(workspaceId) ?? 3,
    organizations: mine.map((item) => ({
      id: item.id,
      name: item.name,
      excluded: false,
      internal: false,
    })),
    extras: [
      { code: "touchpoints", name: "10 QR y etiquetas más", quantity: 1 },
    ],
    monthlyAmount: 42800,
  };
}

function workspaceBilling(workspaceId: string): Obj | null {
  const workspace = workspaceOf(workspaceId);
  const state = billingByWorkspace.get(workspaceId);
  if (!workspace || !state) return null;
  const plan = effectivePlan(workspace, state);
  const planRow = plans.find((item) => item.code === plan?.code);
  const usage: Record<string, number> = {
    "touchpoints.max": workspace.touchpoints as number,
    "links.max": Math.min(2, workspace.touchpoints as number),
    "members.max": workspace.members as number,
    "qr_designs.max": (workspace.experiences as number) * 2,
    "assets.storage_mb": 20 + (workspace.leads as number) * 3,
    "ai.generations_month": (workspace.leads as number) % 30,
  };
  return {
    workspaceId,
    workspaceName: workspace.name,
    stripeCustomerId: state.subscriptions.length
      ? `cus_${String(workspace.publicId).slice(-8)}Demo`
      : null,
    stripeDashboardUrl: state.subscriptions.length
      ? `https://dashboard.stripe.com${state.livemode ? "" : "/test"}/customers/cus_${String(workspace.publicId).slice(-8)}Demo`
      : null,
    trialConsumedAt: state.trialConsumedAt,
    trial: trialView(state),
    access: accessOf(state),
    plan,
    manualPlanUntil: state.manualPlanUntil,
    entitlements: (planRow?.entitlements as Obj) ?? {},
    usage,
    subscriptions: state.subscriptions,
    invoices: state.invoices,
    refunds: state.refunds,
    events: billingEvents.filter((event) => event.workspaceId === workspaceId),
    notices: noticesFor(state),
    account: demoAccount(workspaceId),
  };
}

function findSubscription(
  subscriptionId: string,
): { workspaceId: string; state: BillingState; subscription: Obj } | null {
  for (const [workspaceId, state] of billingByWorkspace) {
    const subscription = state.subscriptions.find(
      (item) => item.id === subscriptionId,
    );
    if (subscription) return { workspaceId, state, subscription };
  }
  return null;
}

const physicalTypes = ["card", "label", "other"];
const experienceTypesList = [
  "redirect",
  "links",
  "profile",
  "image",
  "document",
  "menu",
  "catalog",
  "form",
];
const touchpointStatuses = [
  "prepared",
  "available",
  "assigned",
  "active",
  "active",
  "active",
  "paused",
  "lost",
  "replaced",
  "retired",
];

const touchpoints: Obj[] = [];
const experiences: Obj[] = [];
let touchpointCounter = 0;
let experienceCounter = 0;

for (const [workspaceIndex, workspace] of workspaces.entries()) {
  const random = seeded(workspaceIndex * 31 + 11);
  const count = 1 + Math.floor(random() * 4);
  const workspaceExperiences: Obj[] = [];
  for (let index = 0; index < Math.max(1, count - 1); index += 1) {
    experienceCounter += 1;
    const type =
      experienceTypesList[
        (workspaceIndex + index) % experienceTypesList.length
      ];
    const experience: Obj = {
      id: `40000000-0000-4000-8000-${String(experienceCounter).padStart(12, "0")}`,
      name: `${type === "menu" ? "Menú" : type === "catalog" ? "Catálogo" : type === "links" ? "Enlaces" : "Perfil"} ${index + 1}`,
      type,
      archived: false,
      liveTouchpoints: 0,
      versions: 1 + Math.floor(random() * 4),
      updatedAt: isoDaysAgo(Math.round(random() * 40)),
    };
    workspaceExperiences.push(experience);
    experiences.push({ ...experience, workspaceId: workspace.id });
  }

  let active = 0;
  let suspended = 0;
  for (let index = 0; index < count; index += 1) {
    touchpointCounter += 1;
    const status =
      touchpointStatuses[
        (workspaceIndex + index) % touchpointStatuses.length
      ] ?? "active";
    const isSuspended = random() < 0.12;
    const live =
      status === "active" && workspaceExperiences.length
        ? workspaceExperiences[index % workspaceExperiences.length]
        : null;
    if (live && typeof live.liveTouchpoints === "number")
      live.liveTouchpoints += 1;
    if (status === "active") active += 1;
    if (isSuspended) suspended += 1;
    touchpoints.push({
      id: `30000000-0000-4000-8000-${String(touchpointCounter).padStart(12, "0")}`,
      publicId: crypto.randomUUID().replaceAll("-", ""),
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      operationalName: `${workspace.name} · Punto ${index + 1}`,
      physicalType: physicalTypes[touchpointCounter % physicalTypes.length],
      status,
      suspended: isSuspended,
      groupName: index % 3 === 0 ? "Mostrador" : null,
      liveExperienceName: live ? live.name : null,
      liveExperienceType: live ? live.type : null,
      lastPublicationStatus: live
        ? "published"
        : status === "assigned"
          ? "pending"
          : null,
      createdAt: isoDaysAgo(10 + Math.round(random() * 200)),
      suspension: isSuspended
        ? {
            suspendedAt: isoDaysAgo(Math.round(random() * 5)),
            reason: "Reporte de contenido inapropiado en revisión.",
            suspendedByEmail: "trust-safety@kardo.app",
          }
        : null,
    });
  }
  workspace.touchpoints = count;
  workspace.activeTouchpoints = active;
  workspace.suspendedTouchpoints = suspended;
  workspace.experiences = workspaceExperiences.length;
}

const publications: Obj[] = [];
const publicationStatuses = [
  "published",
  "published",
  "published",
  "pending",
  "processing",
  "failed",
];
let publicationCounter = 0;
for (const [index, touchpoint] of touchpoints.entries()) {
  const random = seeded(index * 17 + 3);
  const revisions = 1 + Math.floor(random() * 2);
  for (let revision = 1; revision <= revisions; revision += 1) {
    publicationCounter += 1;
    const status =
      publicationStatuses[(index + revision) % publicationStatuses.length];
    const failed = status === "failed";
    publications.push({
      id: `50000000-0000-4000-8000-${String(publicationCounter).padStart(12, "0")}`,
      touchpointId: touchpoint.id,
      touchpointPublicId: touchpoint.publicId,
      touchpointName: touchpoint.operationalName,
      workspaceId: touchpoint.workspaceId,
      workspaceName: touchpoint.workspaceName,
      experienceId: `40000000-0000-4000-8000-${String((index % Math.max(1, experienceCounter)) + 1).padStart(12, "0")}`,
      experienceName: touchpoint.liveExperienceName ?? "Experience borrador",
      experienceType: touchpoint.liveExperienceType ?? "links",
      versionRevision: revision,
      status,
      jobStatus:
        status === "published"
          ? "succeeded"
          : status === "failed"
            ? "failed"
            : status === "processing"
              ? "running"
              : "pending",
      attempts: failed ? 2 + Math.floor(random() * 3) : 1,
      lastError: failed
        ? "El Worker de publicación devolvió un error 502 al desplegar la revisión."
        : null,
      createdAt: isoDaysAgo(
        Math.round(random() * 20),
        Math.round(random() * 20),
      ),
      publishedAt:
        status === "published" ? isoDaysAgo(Math.round(random() * 15)) : null,
    });
  }
}

const staffMembers: Obj[] = [
  {
    id: "60000000-0000-4000-8000-000000000001",
    email: "admin@kardo.app",
    displayName: "Laura Méndez",
    status: "active",
    roles: ["platform-admin"],
    createdAt: isoDaysAgo(400),
  },
  {
    id: "60000000-0000-4000-8000-000000000002",
    email: "ops@kardo.app",
    displayName: "Diego Salas",
    status: "active",
    roles: ["operations"],
    createdAt: isoDaysAgo(300),
  },
  {
    id: "60000000-0000-4000-8000-000000000003",
    email: "soporte@kardo.app",
    displayName: "Renata Cobos",
    status: "active",
    roles: ["support"],
    createdAt: isoDaysAgo(250),
  },
  {
    id: "60000000-0000-4000-8000-000000000004",
    email: "comercial@kardo.app",
    displayName: "Iván Torres",
    status: "active",
    roles: ["commercial"],
    createdAt: isoDaysAgo(200),
  },
  {
    id: "60000000-0000-4000-8000-000000000005",
    email: "confianza@kardo.app",
    displayName: "Sofía Ibarra",
    status: "active",
    roles: ["trust-safety"],
    createdAt: isoDaysAgo(180),
  },
  {
    id: "60000000-0000-4000-8000-000000000006",
    email: "invitado@kardo.app",
    displayName: null,
    status: "invited",
    roles: ["support"],
    createdAt: isoDaysAgo(3),
  },
];

const auditActions = [
  ["staff", "touchpoint.suspended", "touchpoint"],
  ["staff", "touchpoint.suspension_lifted", "touchpoint"],
  ["staff", "workspace.plan_assigned", "workspace"],
  ["staff", "publication.retried", "publication"],
  ["customer", "touchpoint.created", "touchpoint"],
  ["customer", "experience.published", "experience"],
  ["service", "publication.failed", "publication"],
] as const;

const auditEvents: Obj[] = Array.from({ length: 48 }, (_, index) => {
  const random = seeded(index * 13 + 5);
  const workspace = workspaces[index % workspaces.length] as Obj;
  // `noUncheckedIndexedAccess` sees this as possibly undefined; the modulo
  // guarantees an in-bounds index into a non-empty, fixed-length tuple array.
  const [actorType, action, targetType] = auditActions[
    index % auditActions.length
  ] as (typeof auditActions)[number];
  return {
    id: `70000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    occurredAt: isoDaysAgo(
      Math.floor(random() * 30),
      Math.floor(random() * 24),
    ),
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    actorType,
    actorSubject:
      actorType === "service" ? null : "60000000-0000-4000-8000-000000000002",
    actorEmail: actorType === "service" ? null : "ops@kardo.app",
    action,
    targetType,
    targetId: `${targetType}-${index}`,
    result: action.includes("failed") ? "failure" : "success",
    metadata: { reason: "Revisión operativa de rutina.", index },
  };
}).sort(
  (a, b) =>
    new Date(b.occurredAt as string).getTime() -
    new Date(a.occurredAt as string).getTime(),
);

// ---------------------------------------------------------------------------
// Metrics overview
// ---------------------------------------------------------------------------

function metricsOverview(days: number): Obj {
  const daily = Array.from({ length: days }, (_, index) => {
    const random = seeded(index + days);
    const weekday = new Date(dateOnly(days - 1 - index)).getUTCDay();
    const isWeekend = weekday === 0 || weekday === 6;
    return {
      date: dateOnly(days - 1 - index),
      newCustomers: Math.round(random() * (isWeekend ? 1 : 3)),
      newTouchpoints: Math.round(random() * (isWeekend ? 2 : 5)),
      publications: Math.round(3 + random() * (isWeekend ? 4 : 10)),
      failedPublications: Math.round(random() * 2),
      leads: Math.round(random() * (isWeekend ? 3 : 8)),
    };
  });
  const tapsDaily = daily.map((day, index) => {
    const random = seeded(index + 500);
    const nfc = Math.round(6 + random() * 14);
    const qr = Math.round(4 + random() * 10);
    const link = Math.round(1 + random() * 6);
    return { date: day.date, nfc, qr, link };
  });
  const sum = (
    key: "newCustomers" | "newTouchpoints" | "publications" | "leads",
  ) => daily.reduce((total, day) => total + (day[key] as number), 0);
  const tapsTotal = tapsDaily.reduce(
    (total, day) => total + day.nfc + day.qr + day.link,
    0,
  );

  const activeTouchpoints = touchpoints.filter(
    (item) => item.status === "active",
  ).length;
  const suspendedTouchpoints = touchpoints.filter(
    (item) => item.suspended,
  ).length;
  const liveExperiences = touchpoints.filter(
    (item) => item.liveExperienceName,
  ).length;

  const experienceTypeCounts = new Map<
    string,
    { total: number; live: number }
  >();
  for (const experience of experiences) {
    const type = experience.type as string;
    const entry = experienceTypeCounts.get(type) ?? { total: 0, live: 0 };
    entry.total += 1;
    if ((experience.liveTouchpoints as number) > 0) entry.live += 1;
    experienceTypeCounts.set(type, entry);
  }

  const statusCounts = new Map<string, number>();
  for (const touchpoint of touchpoints) {
    const status = touchpoint.status as string;
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
  }

  const planCounts = new Map<string, number>();
  for (const workspace of workspaces) {
    const code = workspace.planCode as string;
    planCounts.set(code, (planCounts.get(code) ?? 0) + 1);
  }

  const topWorkspaces = [...workspaces]
    .sort((a, b) => (b.leads as number) - (a.leads as number))
    .slice(0, 8)
    .map((workspace) => ({
      workspaceId: workspace.id,
      name: workspace.name,
      kind: workspace.kind,
      taps: Math.round((workspace.leads as number) * 6 + 20),
      touchpoints: workspace.touchpoints,
      leads: workspace.leads,
    }));

  const succeeded = publications.filter(
    (item) => item.status === "published",
  ).length;
  const failed = publications.filter((item) => item.status === "failed").length;
  const pending = publications.filter((item) =>
    ["pending", "processing"].includes(item.status as string),
  ).length;

  return {
    days,
    generatedAt: new Date().toISOString(),
    totals: {
      customers: workspaces.length + 6,
      workspaces: workspaces.length,
      organizations: workspaces.filter((item) => item.kind === "organization")
        .length,
      touchpoints: touchpoints.length,
      activeTouchpoints,
      suspendedTouchpoints,
      experiences: experiences.length,
      liveExperiences,
      leads: workspaces.reduce(
        (total, item) => total + (item.leads as number),
        0,
      ),
      pendingPublications: pending,
      failedPublicationsLast24Hours: publications.filter(
        (item) =>
          item.status === "failed" &&
          Date.now() - new Date(item.createdAt as string).getTime() <
            24 * 3_600_000,
      ).length,
    },
    period: {
      newCustomers: sum("newCustomers"),
      newWorkspaces:
        sum("newTouchpoints") > 0 ? Math.round(sum("newCustomers") * 0.6) : 0,
      newTouchpoints: sum("newTouchpoints"),
      publications: sum("publications"),
      leads: sum("leads"),
      previousNewCustomers: Math.round(sum("newCustomers") * 0.85),
      previousNewTouchpoints: Math.round(sum("newTouchpoints") * 1.1),
      previousPublications: Math.round(sum("publications") * 0.9),
      previousLeads: Math.round(sum("leads") * 0.8),
    },
    daily,
    taps: {
      total: tapsTotal,
      previousTotal: Math.round(tapsTotal * 0.88),
      byChannel: {
        nfc: tapsDaily.reduce((total, day) => total + day.nfc, 0),
        qr: tapsDaily.reduce((total, day) => total + day.qr, 0),
        link: tapsDaily.reduce((total, day) => total + day.link, 0),
      },
      daily: tapsDaily,
      clicks: Math.round(tapsTotal * 0.3),
    },
    experienceTypes: [...experienceTypeCounts.entries()].map(
      ([type, value]) => ({ type, ...value }),
    ),
    touchpointStatuses: [...statusCounts.entries()].map(([status, total]) => ({
      status,
      total,
    })),
    plans: [...planCounts.entries()].map(([planCode, count]) => ({
      planCode,
      name:
        (plans.find((plan) => plan.code === planCode) as Obj)?.name ?? planCode,
      workspaces: count,
    })),
    topWorkspaces,
    publicationHealth: {
      succeeded,
      failed,
      pending,
      successRate:
        succeeded + failed > 0 ? succeeded / (succeeded + failed) : null,
      medianSeconds: 38,
    },
  };
}

// ---------------------------------------------------------------------------
// Request handling
// ---------------------------------------------------------------------------

function paginate<T extends Obj>(
  items: readonly T[],
  cursor: string | null,
  limit: number,
): { items: T[]; nextCursor: string | null } {
  const offset = cursor ? Number.parseInt(cursor, 10) || 0 : 0;
  const page = items.slice(offset, offset + limit);
  const nextOffset = offset + limit;
  return {
    items: page,
    nextCursor: nextOffset < items.length ? String(nextOffset) : null,
  };
}

function workspaceDetail(workspaceId: string): Obj | null {
  const workspace = workspaces.find((item) => item.id === workspaceId);
  if (!workspace) return null;
  const members = Array.from(
    { length: workspace.members as number },
    (_, index) => ({
      profileId: `80000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      displayName: index === 0 ? "Owner del espacio" : `Miembro ${index + 1}`,
      email:
        index === 0 ? workspace.ownerEmail : `miembro${index}@kardodemo.mx`,
      role: index === 0 ? "owner" : index === 1 ? "admin" : "editor",
      joinedAt: isoDaysAgo(30 + index * 10),
    }),
  );
  const plan = plans.find((item) => item.code === workspace.planCode) ?? null;
  return {
    workspace,
    members,
    touchpoints: touchpoints.filter((item) => item.workspaceId === workspaceId),
    experiences: experiences
      .filter((item) => item.workspaceId === workspaceId)
      .map(({ workspaceId: _drop, ...rest }) => rest),
    plan: plan
      ? {
          planId: plan.id,
          code: plan.code,
          name: plan.name,
          assignedAt: isoDaysAgo(60),
        }
      : null,
    leads: {
      total: workspace.leads,
      last30Days: Math.round((workspace.leads as number) * 0.4),
    },
    taps30Days: Math.round((workspace.leads as number) * 8 + 12),
    recentAudit: auditEvents
      .filter((item) => item.workspaceId === workspaceId)
      .slice(0, 10),
  };
}

function touchpointDetail(touchpointId: string): Obj | null {
  const touchpoint = touchpoints.find((item) => item.id === touchpointId);
  if (!touchpoint) return null;
  const publicId = touchpoint.publicId as string;
  return {
    touchpoint,
    urls: {
      link: `https://k.kardo.app/t/${publicId}`,
      nfc: `https://k.kardo.app/t/${publicId}?src=nfc`,
      qr: `https://k.kardo.app/t/${publicId}?src=qr`,
    },
    suspension: touchpoint.suspension,
    publications: publications.filter(
      (item) => item.touchpointId === touchpointId,
    ),
    taps30Days: 64,
  };
}

// CFDI queue (ADR 020 §6): two pending (one past 24 h), one issued, one rejected.
const cfdiInvoiceUrl = (n: number) =>
  `https://dashboard.stripe.com/test/invoices/in_DemoCfdi${n}`;
const cfdiRequests: Obj[] = [
  [
    0,
    30,
    28,
    "AAA010101AAA",
    "Café Nube SA de CV",
    "601",
    "64000",
    "G03",
    false,
    "pending",
  ],
  [
    1,
    6,
    5,
    "XAXX0101019",
    "Taller Brote",
    "612",
    "06600",
    "G03",
    true,
    "pending",
  ],
  [
    2,
    70,
    68,
    "BBB020202BB2",
    "Panadería Sol SC",
    "601",
    "03100",
    "G03",
    false,
    "issued",
  ],
  [
    3,
    50,
    48,
    "CCC030303CC3",
    "Floresta Estudio",
    "626",
    "44100",
    "G01",
    false,
    "rejected",
  ],
].map((row, index) => {
  const [
    workspaceIndex,
    paidHoursAgo,
    requestedHoursAgo,
    rfc,
    name,
    regime,
    cp,
    use,
    automatic,
    status,
  ] = row as [
    number,
    number,
    number,
    string,
    string,
    string,
    string,
    string,
    boolean,
    string,
  ];
  const workspace = workspaces[workspaceIndex] as Obj;
  const issued = status === "issued";
  return {
    id: `70000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    invoiceId: `in_DemoCfdi${index + 1}`,
    status,
    requestedAt: isoDaysAgo(0, requestedHoursAgo),
    issuedAt: issued ? isoDaysAgo(0, requestedHoursAgo - 6) : null,
    satUuid: issued ? "3f2504e0-4f89-41d3-9a0c-0305e82c3301" : null,
    notes:
      status === "rejected" ? "El RFC no coincide con la razón social." : null,
    automatic,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    invoiceNumber: `KARDO-00${index + 41}`,
    amountPaid: 49_900 + index * 10_000,
    tax: Math.round(49_900 + index * 10_000 - (49_900 + index * 10_000) / 1.16),
    currency: "mxn",
    paidAt: isoDaysAgo(0, paidHoursAgo),
    fiscal: {
      rfc,
      legalName: name,
      taxRegime: regime,
      postalCode: cp,
      cfdiUse: use,
      email: `facturas@${String(workspace.ownerEmail).split("@")[1]}`,
    },
    stripeInvoiceUrl: cfdiInvoiceUrl(index + 1),
    handledAt:
      status === "pending" ? null : isoDaysAgo(0, requestedHoursAgo - 6),
    // The demo issues with Facturapi in test mode (ADR 020 §6, phase 2).
    facturapi: "test",
    document: issued ? { provider: "facturapi", test: true } : null,
  };
});

function demoGlobalInvoice(month: string): Obj {
  const items = workspaces.slice(3, 9).map((workspace, index) => {
    const total = 19_900 + index * 15_000;
    const day = String(3 + index * 4).padStart(2, "0");
    return {
      invoiceId: `in_DemoGlobal${month}${index}`,
      number: `KARDO-${month.replace("-", "")}${index + 1}`,
      workspaceName: workspace.name,
      paidAt: `${month}-${day}T18:${String(10 + index).padStart(2, "0")}:00.000Z`,
      total,
      tax: Math.round(total - total / 1.16),
    };
  });
  return {
    month,
    currency: "mxn",
    total: items.reduce((sum, item) => sum + item.total, 0),
    tax: items.reduce((sum, item) => sum + item.tax, 0),
    items,
  };
}

/** Demo of the accountant's month: the demo global plus two individual
 * CFDI, one refund and Stripe's side (no real data). */
function demoAccounting(month: string): Obj {
  const split = (cents: number) => {
    const base = Math.round(cents / 1.16);
    return { base, iva: cents - base };
  };
  const global = demoGlobalInvoice(month) as {
    items: {
      invoiceId: string;
      number: string;
      workspaceName: string;
      paidAt: string;
      total: number;
    }[];
  };
  const payments = [
    ...global.items.map((item, index) => ({
      invoiceId: item.invoiceId,
      number: item.number,
      workspaceName: item.workspaceName,
      paidAt: item.paidAt,
      total: item.total,
      ...split(item.total),
      refunded: 0,
      path: "global",
      satUuid: null,
      cfdiTest: false,
      stripeChargeId: `ch_DemoAcct${index}0000`,
      stripeFee: Math.round(item.total * 0.043) + 300,
      stripeFeeIva: Math.round((Math.round(item.total * 0.043) + 300) * 0.16),
    })),
    ...workspaces.slice(0, 2).map((workspace, index) => ({
      invoiceId: `in_DemoAcctInd${index}000`,
      number: `KARDO-${month.replace("-", "")}9${index}`,
      workspaceName: workspace.name,
      paidAt: `${month}-1${index}T17:00:00.000Z`,
      total: 37_900,
      ...split(37_900),
      refunded: 0,
      path: "individual",
      satUuid: `9f1c2a3b-4d5e-4f60-8a7b-1c2d3e4f5a6${index}`,
      cfdiTest: true,
      stripeChargeId: `ch_DemoAcctInd${index}000`,
      stripeFee: 1930,
      stripeFeeIva: 309,
    })),
  ];
  const sum = (items: typeof payments) => ({
    count: items.length,
    total: items.reduce((acc, item) => acc + item.total, 0),
    base: items.reduce((acc, item) => acc + item.base, 0),
    iva: items.reduce((acc, item) => acc + item.iva, 0),
  });
  const refund = { amount: 8_334, ...split(8_334) };
  const fees = payments.reduce((acc, item) => acc + item.stripeFee, 0);
  const feesIva = payments.reduce((acc, item) => acc + item.stripeFeeIva, 0);
  const all = sum(payments);
  return {
    month,
    currency: "mxn",
    livemode: false,
    generatedAt: new Date().toISOString(),
    payments,
    refunds: [
      {
        refundId: "re_DemoAcct0001",
        invoiceId: payments[0]?.invoiceId ?? null,
        number: payments[0]?.number ?? null,
        workspaceName: payments[0]?.workspaceName ?? "Organización",
        createdAt: `${month}-20T18:00:00.000Z`,
        status: "succeeded",
        ...refund,
        originalPath: "global",
        originalSatUuid: null,
        originalMonth: month,
      },
    ],
    totals: {
      individual: sum(payments.filter((item) => item.path === "individual")),
      individual_pending: { count: 0, total: 0, base: 0, iva: 0 },
      global: sum(payments.filter((item) => item.path === "global")),
      internal: { count: 0, total: 0, base: 0, iva: 0 },
      all,
      refunds: {
        count: 1,
        total: refund.amount,
        base: refund.base,
        iva: refund.iva,
      },
    },
    stripe: {
      charges: { count: payments.length, amount: all.total },
      refunds: { count: 1, amount: refund.amount },
      fees: { amount: fees, iva: feesIva, total: fees + feesIva },
      net: all.total - refund.amount - fees - feesIva,
      matchedCharges: payments.length,
    },
    warnings: [
      {
        kind: "refund",
        reference: "re_DemoAcct0001",
        message: `Reembolso de ${payments[0]?.number ?? "un pago"}, que no tiene CFDI individual (factura global): confirmar con el contador cómo se refleja.`,
      },
    ],
  };
}

export function demoRequest<T>(path: string, options: DemoOptions): Promise<T> {
  const method = options.method ?? "GET";
  const body = (options.body ?? {}) as Obj;
  const url = new URL(path, "https://demo.local");
  const params = url.searchParams;
  const cursor = params.get("cursor");
  const limit = Number.parseInt(params.get("limit") ?? "20", 10);

  const extra = demoNotificationsRequest(
    path,
    method,
    body,
    (id) =>
      (workspaces.find((item) => item.id === id)?.name as string | undefined) ??
      null,
  );
  if (extra) return extra as Promise<T>;

  const pieces = demoPiecesRequest(path, method, body);
  if (pieces) return pieces as Promise<T>;

  if (path === "/v1/staff/session")
    return delay(
      clone({
        subject: "60000000-0000-4000-8000-000000000001",
        email: "demo@kardo.app",
        displayName: "Staff Demo",
        permissions: [
          "operations.diagnostics.read",
          "operations.metrics.read",
          "customers.read",
          "touchpoints.operations.read",
          "touchpoints.operations.write",
          "touchpoints.suspend.write",
          "publications.retry",
          "audit.read",
          "commercial.catalog.read",
          "commercial.catalog.write",
          "billing.read",
          "billing.write",
          "billing.refund",
          "staff.roles.manage",
          "notifications.read",
          "notifications.send",
          "notifications.broadcast",
          "status.read",
          "status.write",
          "pieces.read",
          "pieces.write",
        ],
      }),
    );

  if (path === "/v1/staff/diagnostics")
    return delay(
      clone({
        touchpointsAwaitingAssignment: touchpoints.filter(
          (item) => item.status === "prepared" || item.status === "available",
        ).length,
        pendingPublications: publications.filter((item) =>
          ["pending", "processing"].includes(item.status as string),
        ).length,
        failedPublicationsLast24Hours: publications.filter(
          (item) => item.status === "failed",
        ).length,
      }),
    );

  if (url.pathname === "/v1/staff/metrics/overview") {
    const days = Number.parseInt(params.get("days") ?? "7", 10) as 7 | 30 | 90;
    return delay(clone(metricsOverview(days)));
  }

  if (url.pathname === "/v1/staff/workspaces") {
    const query = (params.get("query") ?? "").toLowerCase();
    const kind = params.get("kind");
    let filtered = workspaces as Obj[];
    if (query)
      filtered = filtered.filter((item) =>
        (item.name as string).toLowerCase().includes(query),
      );
    if (kind) filtered = filtered.filter((item) => item.kind === kind);
    return delay(clone(paginate(filtered, cursor, limit)));
  }

  const workspaceMatch = /^\/v1\/staff\/workspaces\/([^/]+)(\/plan)?$/.exec(
    url.pathname,
  );
  if (workspaceMatch?.[1]) {
    const workspace = workspaces.find((item) => item.id === workspaceMatch[1]);
    if (workspaceMatch[2] && method === "PUT" && workspace) {
      const billingState = billingByWorkspace.get(workspaceMatch[1]);
      if (billingState) rejectDeleted(billingState);
      const plan = plans.find((item) => item.id === body.planId);
      if (plan) workspace.planCode = plan.code;
      if (
        plan?.code === "corporativo" &&
        typeof body.organizationsMax === "number"
      )
        customOrganizationsMax.set(
          workspace.id as string,
          body.organizationsMax,
        );
      else customOrganizationsMax.delete(workspace.id as string);
      if (billingState)
        billingState.manualPlanUntil =
          typeof body.until === "string" ? body.until : null;
      return delay(clone(workspaceDetail(workspaceMatch[1])));
    }
    return delay(clone(workspaceDetail(workspaceMatch[1])));
  }

  if (url.pathname === "/v1/staff/touchpoints") {
    const query = (params.get("query") ?? "").toLowerCase();
    const status = params.get("status");
    const suspended = params.get("suspended");
    let filtered = touchpoints as Obj[];
    if (query)
      filtered = filtered.filter(
        (item) =>
          (item.publicId as string).toLowerCase().includes(query) ||
          (item.operationalName as string).toLowerCase().includes(query),
      );
    if (status) filtered = filtered.filter((item) => item.status === status);
    if (suspended !== null)
      filtered = filtered.filter(
        (item) => item.suspended === (suspended === "true"),
      );
    return delay(clone(paginate(filtered, cursor, limit)));
  }

  const suspensionMatch =
    /^\/v1\/staff\/touchpoints\/([^/]+)\/suspension$/.exec(url.pathname);
  if (suspensionMatch?.[1]) {
    const touchpoint = touchpoints.find(
      (item) => item.id === suspensionMatch[1],
    );
    if (touchpoint) {
      if (method === "POST") {
        touchpoint.suspended = true;
        touchpoint.suspension = {
          suspendedAt: new Date().toISOString(),
          reason: body.reason,
          suspendedByEmail: "demo@kardo.app",
        };
      } else if (method === "DELETE") {
        touchpoint.suspended = false;
        touchpoint.suspension = null;
      }
    }
    return delay(clone(touchpointDetail(suspensionMatch[1])));
  }

  const touchpointMatch = /^\/v1\/staff\/touchpoints\/([^/]+)$/.exec(
    url.pathname,
  );
  if (touchpointMatch?.[1])
    return delay(clone(touchpointDetail(touchpointMatch[1])));

  if (url.pathname === "/v1/staff/publications") {
    const status = params.get("status");
    const workspaceId = params.get("workspaceId");
    let filtered = publications as Obj[];
    if (status) filtered = filtered.filter((item) => item.status === status);
    if (workspaceId)
      filtered = filtered.filter((item) => item.workspaceId === workspaceId);
    return delay(clone(paginate(filtered, cursor, limit)));
  }

  const retryMatch = /^\/v1\/staff\/publications\/([^/]+)\/retry$/.exec(
    url.pathname,
  );
  if (retryMatch?.[1]) {
    const publication = publications.find((item) => item.id === retryMatch[1]);
    if (publication) {
      publication.status = "pending";
      publication.jobStatus = "pending";
      publication.lastError = null;
    }
    return delay(clone(publication));
  }

  if (url.pathname === "/v1/staff/audit") {
    const workspaceId = params.get("workspaceId");
    const actorType = params.get("actorType");
    const action = params.get("action");
    let filtered = auditEvents as Obj[];
    if (workspaceId)
      filtered = filtered.filter((item) => item.workspaceId === workspaceId);
    if (actorType)
      filtered = filtered.filter((item) => item.actorType === actorType);
    if (action)
      filtered = filtered.filter((item) =>
        (item.action as string).startsWith(action),
      );
    return delay(clone(paginate(filtered, cursor, limit)));
  }

  if (url.pathname === "/v1/staff/plans" && method === "GET") {
    for (const plan of plans)
      plan.workspaces = workspaces.filter(
        (item) => item.planCode === plan.code,
      ).length;
    return delay(clone(plans));
  }
  if (url.pathname === "/v1/staff/plans" && method === "POST") {
    const plan: Obj = {
      id: crypto.randomUUID(),
      code: body.code,
      name: body.name,
      isActive: body.isActive,
      entitlements: body.entitlements,
      description: body.description ?? null,
      isPublic: body.isPublic ?? true,
      isDefault: body.isDefault ?? false,
      sortOrder: body.sortOrder ?? 0,
      trialDays: body.trialDays ?? null,
      prices: [],
      workspaces: 0,
      createdAt: new Date().toISOString(),
    };
    if (plan.isDefault) for (const other of plans) other.isDefault = false;
    plans.push(plan);
    return delay(clone(plan));
  }
  const planMatch = /^\/v1\/staff\/plans\/([^/]+)$/.exec(url.pathname);
  if (planMatch?.[1] && method === "PUT") {
    const plan = plans.find((item) => item.id === planMatch[1]);
    if (plan) {
      if (body.isDefault === true)
        for (const other of plans) other.isDefault = false;
      Object.assign(plan, body);
    }
    return delay(clone(plan));
  }

  if (url.pathname === "/v1/staff/billing/overview")
    return delay(clone(billingOverview()));

  if (url.pathname === "/v1/staff/billing/subscriptions") {
    const status = params.get("status");
    const plan = params.get("plan");
    const query = (params.get("q") ?? "").toLowerCase();
    let filtered = allSubscriptionRows();
    if (status) filtered = filtered.filter((item) => item.status === status);
    if (plan) filtered = filtered.filter((item) => item.planCode === plan);
    if (query)
      filtered = filtered.filter(
        (item) =>
          (item.workspaceName as string).toLowerCase().includes(query) ||
          ((item.ownerEmail as string) ?? "").toLowerCase().includes(query),
      );
    return delay(clone(paginate(filtered, cursor, 8)));
  }

  if (url.pathname === "/v1/staff/billing/events") {
    const only = params.get("status") !== "all";
    return delay(
      clone(
        billingEvents.filter((event) => !only || event.status === "failed"),
      ),
    );
  }

  if (url.pathname === "/v1/staff/billing/cfdi" && method === "GET") {
    const wanted = params.get("status") ?? "pending";
    return delay(
      clone(cfdiRequests.filter((request) => request.status === wanted)),
    );
  }

  const cfdiResolveMatch =
    /^\/v1\/staff\/billing\/cfdi\/([^/]+)\/resolve$/.exec(url.pathname);
  if (cfdiResolveMatch?.[1] && method === "POST") {
    const request = cfdiRequests.find(
      (item) => item.id === cfdiResolveMatch[1],
    );
    if (!request)
      throw new ApiRequestError(
        "No encontramos este elemento.",
        404,
        "STAFF_NOT_FOUND",
      );
    request.status = body.status;
    request.handledAt = new Date().toISOString();
    if (body.status === "issued") {
      request.satUuid = body.satUuid ?? null;
      request.issuedAt = request.handledAt;
    } else request.notes = body.notes ?? null;
    return delay(clone(request));
  }

  const cfdiFacturapiMatch =
    /^\/v1\/staff\/billing\/cfdi\/([^/]+)\/facturapi$/.exec(url.pathname);
  if (cfdiFacturapiMatch?.[1] && method === "POST") {
    const request = cfdiRequests.find(
      (item) => item.id === cfdiFacturapiMatch[1],
    );
    if (!request)
      throw new ApiRequestError(
        "No encontramos este elemento.",
        404,
        "STAFF_NOT_FOUND",
      );
    if (request.status !== "pending")
      throw new ApiRequestError(
        "Solo se emite una solicitud pendiente.",
        409,
        "STAFF_CONFLICT",
      );
    request.status = "issued";
    request.handledAt = new Date().toISOString();
    request.issuedAt = request.handledAt;
    request.satUuid = "9f1c2a3b-4d5e-4f60-8a7b-1c2d3e4f5a6b";
    request.notes = "Facturapi (prueba, sin validez fiscal)";
    request.document = { provider: "facturapi", test: true };
    return delay(clone(request));
  }

  if (url.pathname === "/v1/staff/billing/accounting")
    return delay(
      clone(demoAccounting(params.get("month") ?? dateOnly(30).slice(0, 7))),
    );

  if (url.pathname === "/v1/staff/billing/global-invoice")
    return delay(
      clone(demoGlobalInvoice(params.get("month") ?? dateOnly(30).slice(0, 7))),
    );

  if (url.pathname === "/v1/staff/billing/access") {
    const wanted = params.get("state");
    const rows = accessRows().filter((row) =>
      wanted === "deletion"
        ? pendingDeletion(row)
        : wanted === "trial" ||
            wanted === "limited" ||
            wanted === "paused" ||
            wanted === "deleted" ||
            wanted === "internal"
          ? row.state === wanted
          : false,
    );
    return delay(clone(rows));
  }

  const internalMatch = /^\/v1\/staff\/workspaces\/([^/]+)\/internal$/.exec(
    url.pathname,
  );
  if (internalMatch?.[1] && method === "PUT") {
    const state = billingByWorkspace.get(internalMatch[1]);
    if (!state)
      throw new ApiRequestError(
        "No encontramos este elemento.",
        404,
        "STAFF_NOT_FOUND",
      );
    rejectDeleted(state);
    state.internal =
      body.internal === true
        ? {
            reason: String(body.reason ?? ""),
            setAt: new Date().toISOString(),
            setByName: "Staff Demo",
          }
        : null;
    return delay(clone(workspaceBilling(internalMatch[1])));
  }

  const kardoTrialMatch =
    /^\/v1\/staff\/workspaces\/([^/]+)\/kardo-trial\/extend$/.exec(
      url.pathname,
    );
  if (kardoTrialMatch?.[1] && method === "POST") {
    const state = billingByWorkspace.get(kardoTrialMatch[1]);
    if (state) rejectDeleted(state);
    if (!state?.kardoTrial || state.kardoTrial.converted)
      throw new ApiRequestError(
        "Esta organización no tiene una prueba de Kardo por extender.",
        409,
        "BILLING_CONFLICT",
      );
    const from = Math.max(
      Date.now(),
      new Date(state.kardoTrial.endsAt).getTime(),
    );
    state.kardoTrial.endsAt = addDays(
      new Date(from).toISOString(),
      Number(body.days ?? 0),
    );
    state.lapse = null;
    return delay(clone(workspaceBilling(kardoTrialMatch[1])));
  }

  const workspaceBillingMatch =
    /^\/v1\/staff\/workspaces\/([^/]+)\/billing$/.exec(url.pathname);
  if (workspaceBillingMatch?.[1])
    return delay(clone(workspaceBilling(workspaceBillingMatch[1])));

  const subscriptionActionMatch =
    /^\/v1\/staff\/billing\/subscriptions\/([^/]+)\/(cancel|resume|extend-trial|resync)$/.exec(
      url.pathname,
    );
  if (subscriptionActionMatch?.[1] && method === "POST") {
    const found = findSubscription(subscriptionActionMatch[1]);
    if (!found)
      throw new ApiRequestError(
        "No encontramos este elemento.",
        404,
        "STAFF_NOT_FOUND",
      );
    const { subscription, workspaceId, state } = found;
    switch (subscriptionActionMatch[2]) {
      case "cancel":
        if (body.mode === "immediately") {
          subscription.status = "canceled";
          subscription.canceledAt = new Date().toISOString();
          subscription.cancelAtPeriodEnd = false;
          subscription.cancelAt = null;
          if (!state.manualPlanUntil)
            state.lapse = {
              source: "subscription",
              lapsedAt: new Date().toISOString(),
            };
        } else {
          subscription.cancelAtPeriodEnd = true;
          subscription.cancelAt = subscription.currentPeriodEnd;
        }
        break;
      case "resume":
        subscription.cancelAtPeriodEnd = false;
        subscription.cancelAt = null;
        break;
      case "extend-trial": {
        if (subscription.status !== "trialing")
          throw new ApiRequestError(
            "Esta acción no aplica al estado actual de la suscripción. Actualiza e intenta de nuevo.",
            409,
            "BILLING_CONFLICT",
          );
        const end = new Date(subscription.trialEnd as string);
        end.setUTCDate(end.getUTCDate() + Number(body.days ?? 0));
        subscription.trialEnd = end.toISOString();
        break;
      }
      default:
        break;
    }
    return delay(clone(workspaceBilling(workspaceId)));
  }

  const refundMatch = /^\/v1\/staff\/billing\/invoices\/([^/]+)\/refund$/.exec(
    url.pathname,
  );
  if (refundMatch?.[1] && method === "POST") {
    for (const [workspaceId, state] of billingByWorkspace) {
      const invoice = state.invoices.find((item) => item.id === refundMatch[1]);
      if (!invoice) continue;
      const remaining =
        (invoice.amountPaid as number) - (invoice.amountRefunded as number);
      const amount = Math.min(Number(body.amount ?? remaining), remaining);
      invoice.amountRefunded = (invoice.amountRefunded as number) + amount;
      state.refunds.unshift({
        id: `re_Demo${Date.now()}`,
        invoiceId: invoice.id,
        amount,
        currency: "mxn",
        status: "succeeded",
        reason: body.reason ?? null,
        createdAt: new Date().toISOString(),
      });
      return delay(clone(workspaceBilling(workspaceId)));
    }
    throw new ApiRequestError(
      "No encontramos este elemento.",
      404,
      "STAFF_NOT_FOUND",
    );
  }

  if (url.pathname === "/v1/staff/billing/catalog/sync" && method === "POST")
    return delay(
      clone({
        prices: plans.reduce(
          (total, plan) => total + ((plan.prices as Obj[]) ?? []).length,
          0,
        ),
        mappedToPlans: plans.filter(
          (plan) => ((plan.prices as Obj[]) ?? []).length,
        ).length,
      }),
    );

  if (url.pathname === "/v1/staff/staff-members")
    return delay(clone(staffMembers));

  return delay(undefined as T);
}
