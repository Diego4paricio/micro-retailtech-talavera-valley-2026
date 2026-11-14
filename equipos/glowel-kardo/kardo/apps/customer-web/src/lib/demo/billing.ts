import type {
  BillingAccount,
  BillingChangeResult,
  BillingExtra,
  BillingMyAccount,
  BillingPlanList,
  BillingRedirect,
  CfdiRequest,
  CfdiRequestResult,
  FiscalProfile,
  UpsertFiscalProfile,
  WorkspaceAccess,
  WorkspaceBilling,
  WorkspaceFiscal,
} from "@kardo/contracts";
import catalog from "../../../../../Docs/engineering/config/billing-catalog.json" with {
  type: "json",
};
import { ApiRequestError } from "../api.js";

/**
 * Demo-mode data for billing (VITE_DEMO_MODE). `api/billing.ts` routes here
 * directly, so `lib/demo.ts` stays untouched. Choosing a plan "buys" it
 * locally and returns to the same screen with `?checkout=success`.
 */

type CatalogPrice = { interval: "month" | "year"; amount: number };

// Domain audit A2-66: the demo reads the approved catalog, the same file
// scripts/stripe/setup-billing.mts applies to Stripe and the database and
// the website reads for /precios/, so its plans and prices never drift.
const demoPriceId = (key: string, interval: CatalogPrice["interval"]) =>
  `price_demo${key}${interval === "month" ? "Mes" : "Anio"}`;

const pricesFrom = (key: string, prices: readonly CatalogPrice[]) =>
  prices.map((price) => ({
    id: demoPriceId(key, price.interval),
    interval: price.interval,
    unitAmount: Math.round(price.amount * 100),
    currency: catalog.currency,
    taxInclusive: true,
  }));

const titleKey = (code: string) => code.charAt(0).toUpperCase() + code.slice(1);

const plans: BillingPlanList = {
  checkoutAvailable: true,
  plans: catalog.plans
    .filter((plan) => plan.isPublic)
    .map((plan) => ({
      code: plan.code,
      name: plan.name,
      description: plan.description,
      isDefault: plan.isDefault,
      trialDays: plan.trialDays,
      entitlements: { ...plan.entitlements },
      prices: pricesFrom(titleKey(plan.code), plan.prices as CatalogPrice[]),
    })),
};

const iso = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString();

const storageKey = "kardo.demo.billing.v3";

function loadState(): WorkspaceBilling | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as WorkspaceBilling) : null;
  } catch {
    return null;
  }
}

function saveState() {
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // The demo still works for this page view without persistence.
  }
}

const trialPlan = plans.plans.find(
  (plan) => plan.code === catalog.trial.defaultPlan,
);

// --- The person's account (ADR 024) -------------------------------------------

const demoOrganizations = [
  {
    id: "5b0d7c1e-3f6a-4c52-9a1e-7d2f8b3c4a01",
    name: "Local Centro",
    excluded: false,
    internal: false,
  },
  {
    id: "5b0d7c1e-3f6a-4c52-9a1e-7d2f8b3c4a02",
    name: "Terraza",
    excluded: false,
    internal: false,
  },
];

// What each extra adds lives in kardo_billing.extras (migration
// 20261009100000_billing_accounts.sql), not in the catalog file.
const extraUnits: Record<
  BillingExtra["code"],
  { key: string; units: number; entitlementKey: string }
> = {
  organization: {
    key: "ExtraOrg",
    units: 1,
    entitlementKey: "organizations.max",
  },
  touchpoints: { key: "ExtraQr", units: 10, entitlementKey: "touchpoints.max" },
  links: { key: "ExtraLinks", units: 5, entitlementKey: "links.max" },
};

const extrasCatalog = (): BillingExtra[] =>
  catalog.extras.flatMap((extra) => {
    const code = extra.code as BillingExtra["code"];
    const units = extraUnits[code];
    return units
      ? [
          {
            code,
            name: extra.name,
            unitsPerQuantity: units.units,
            entitlementKey: units.entitlementKey,
            quantity: 0,
            prices: pricesFrom(units.key, extra.prices as CatalogPrice[]),
          },
        ]
      : [];
  });

function demoAccount(): BillingAccount {
  return {
    holderName: "Mariana Ríos",
    isHolder: true,
    organizationsUsed: demoOrganizations.length,
    organizationsLimit: 3,
    organizations: structuredClone(demoOrganizations),
    extras: extrasCatalog(),
  };
}

const trialCode = trialPlan?.code ?? catalog.trial.defaultPlan;
const trialName = trialPlan?.name ?? titleKey(trialCode);
const trialDaysLeft = catalog.trial.days - 4;

// A new account is on day 4 of its trial (ADR 020).
let state: WorkspaceBilling = loadState() ?? {
  checkoutAvailable: true,
  canManage: true,
  plan: { code: trialCode, name: trialName, source: "trial" },
  entitlements: structuredClone(trialPlan?.entitlements ?? {}),
  usage: {
    "organizations.max": 2,
    "touchpoints.max": 7,
    "links.max": 1,
    "members.max": 2,
    "qr_designs.max": 4,
    "assets.storage_mb": 120,
    "ai.generations_month": 12,
  },
  subscription: null,
  trialAvailable: false,
  trial: {
    planCode: trialCode,
    planName: trialName,
    interval: "month",
    startedAt: iso(-4),
    endsAt: iso(trialDaysLeft),
    daysLeft: trialDaysLeft,
    status: "active",
  },
  invoices: [],
  account: demoAccount(),
};

function subscribe(priceId: string) {
  for (const plan of plans.plans) {
    const price = plan.prices.find((item) => item.id === priceId);
    if (!price) continue;
    // With 5 or more trial days left the first charge waits for the end of
    // the trial (ADR 020); otherwise it is charged today.
    const keepDays =
      state.trial?.status === "active" && state.trial.daysLeft >= 5
        ? state.trial.daysLeft
        : null;
    state = {
      ...state,
      plan: { code: plan.code, name: plan.name, source: "subscription" },
      entitlements: structuredClone(plan.entitlements),
      trialAvailable: false,
      trial: state.trial
        ? { ...state.trial, status: "converted", daysLeft: 0 }
        : null,
      subscription: {
        id: "sub_demoSubscription1",
        status: keepDays ? "trialing" : "active",
        planCode: plan.code,
        planName: plan.name,
        interval: price.interval,
        unitAmount: price.unitAmount,
        currency: price.currency,
        currentPeriodEnd: iso(
          keepDays ?? (price.interval === "year" ? 365 : 30),
        ),
        trialEnd: keepDays ? iso(keepDays) : null,
        cancelAtPeriodEnd: false,
        cancelAt: null,
        canceledAt: null,
        paymentMethod: {
          type: "card",
          brand: "visa",
          last4: "4242",
          expMonth: 12,
          expYear: 2028,
        },
        createdAt: new Date().toISOString(),
      },
      invoices: keepDays
        ? []
        : [
            {
              id: "in_demoInvoice0001",
              number: "KARDO-0001",
              status: "paid",
              total: price.unitAmount,
              amountPaid: price.unitAmount,
              amountRefunded: 0,
              currency: price.currency,
              periodStart: iso(0),
              periodEnd: iso(30),
              paidAt: iso(0),
              hostedInvoiceUrl: "https://invoice.stripe.com/i/demo",
              invoicePdf: "https://pay.stripe.com/invoice/demo/pdf",
              createdAt: iso(0),
            },
          ],
    };
    applyLimits();
    saveState();
  }
}

/** The limits the plan gives plus what each extra adds (one shared pool). */
function applyLimits() {
  const plan = plans.plans.find((item) => item.code === state.plan?.code);
  if (!plan || !state.account) return;
  const entitlements = structuredClone(plan.entitlements);
  for (const extra of state.account.extras) {
    const base = entitlements[extra.entitlementKey];
    if (typeof base === "number")
      entitlements[extra.entitlementKey] =
        base + extra.quantity * extra.unitsPerQuantity;
  }
  state = {
    ...state,
    entitlements,
    account: {
      ...state.account,
      organizationsLimit:
        typeof entitlements["organizations.max"] === "number"
          ? entitlements["organizations.max"]
          : null,
    },
  };
}

const holderKey = "kardo.demo.holder";

/**
 * Lets a reviewer see the page as an Admin of someone else's organization:
 * open the panel with `?cuenta=admin` (kept for the session; `?cuenta=`
 * clears it).
 */
function demoSeenAsAdmin(): boolean {
  try {
    const asked = new URLSearchParams(window.location.search).get("cuenta");
    if (asked !== null) {
      if (asked === "") window.sessionStorage.removeItem(holderKey);
      else window.sessionStorage.setItem(holderKey, asked);
    }
    return window.sessionStorage.getItem(holderKey) === "admin";
  } catch {
    return false;
  }
}

function billingView(): WorkspaceBilling {
  const view = structuredClone(state);
  if (!demoSeenAsAdmin() || !view.account) return view;
  return {
    ...view,
    canManage: false,
    subscription: null,
    invoices: [],
    account: { ...view.account, isHolder: false, holderName: "Luis Pérez" },
  };
}

/** Share of the current period still to run, 0 to 1. */
function periodLeft(): number {
  const sub = state.subscription;
  if (!sub?.currentPeriodEnd) return 1;
  const days = sub.interval === "year" ? 365 : 30;
  const left =
    (new Date(sub.currentPeriodEnd).getTime() - Date.now()) / 86_400_000;
  return Math.min(1, Math.max(0, left / days));
}

const priceOf = (extra: BillingExtra, interval: "month" | "year") =>
  extra.prices.find((price) => price.interval === interval)?.unitAmount ?? 0;

function changeExtras(
  body: Record<string, unknown>,
): Promise<BillingChangeResult> {
  const sub = state.subscription;
  if (!state.account || !sub?.interval || !sub.currentPeriodEnd)
    return Promise.reject(
      new ApiRequestError(
        "Elige un plan para agregar extras.",
        409,
        "EXTRAS_NEED_PLAN",
      ),
    );
  const interval = sub.interval;
  const asked = (body.quantities ?? {}) as Record<string, number | undefined>;
  const next = state.account.extras.map((extra) => ({
    ...extra,
    quantity: asked[extra.code] ?? extra.quantity,
  }));
  let added = 0;
  let extrasNext = 0;
  next.forEach((extra, index) => {
    const before = state.account?.extras[index]?.quantity ?? 0;
    added += priceOf(extra, interval) * Math.max(0, extra.quantity - before);
    extrasNext += priceOf(extra, interval) * extra.quantity;
  });
  if (body.confirm === true) {
    state = { ...state, account: { ...state.account, extras: next } };
    applyLimits();
    saveState();
  }
  return Promise.resolve({
    status: body.confirm === true ? "applied" : "preview",
    amountDueToday: Math.round(added * periodLeft()),
    nextAmount: (sub.unitAmount ?? 0) + extrasNext,
    currency: "mxn",
    nextChargeAt: sub.currentPeriodEnd,
  });
}

function changePlan(
  body: Record<string, unknown>,
): Promise<BillingChangeResult> {
  const sub = state.subscription;
  const priceId = String(body.priceId);
  const target = plans.plans
    .flatMap((plan) => plan.prices.map((price) => ({ plan, price })))
    .find((item) => item.price.id === priceId);
  if (!sub || !target || !state.account)
    return Promise.reject(
      new ApiRequestError(
        "No pudimos cambiar tu plan.",
        409,
        "BILLING_CONFLICT",
      ),
    );
  const interval = target.price.interval;
  const extrasNext = state.account.extras.reduce(
    (sum, extra) => sum + priceOf(extra, interval) * extra.quantity,
    0,
  );
  const result: BillingChangeResult = {
    status: body.confirm === true ? "applied" : "preview",
    amountDueToday: Math.round(
      Math.max(0, target.price.unitAmount - (sub.unitAmount ?? 0)) *
        periodLeft(),
    ),
    nextAmount: target.price.unitAmount + extrasNext,
    currency: "mxn",
    nextChargeAt: sub.currentPeriodEnd,
  };
  if (body.confirm === true && state.subscription) {
    state = {
      ...state,
      plan: {
        code: target.plan.code,
        name: target.plan.name,
        source: "subscription",
      },
      subscription: {
        ...state.subscription,
        planCode: target.plan.code,
        planName: target.plan.name,
        interval,
        unitAmount: target.price.unitAmount,
      },
    };
    applyLimits();
    saveState();
  }
  return Promise.resolve(result);
}

export function handleBillingDemo(
  path: string,
  method: string,
  body: Record<string, unknown>,
):
  | BillingPlanList
  | WorkspaceBilling
  | BillingRedirect
  | BillingMyAccount
  | Promise<BillingChangeResult> {
  if (path === "/v1/billing/plans") return structuredClone(plans);
  if (path === "/v1/billing/account") return myAccount();
  if (path.endsWith("/billing/extras") && method === "PUT")
    return changeExtras(body);
  if (path.endsWith("/billing/plan-change") && method === "POST")
    return changePlan(body);
  if (path.endsWith("/billing/checkout") && method === "POST") {
    if (typeof body.priceId === "string") subscribe(body.priceId);
    return {
      url: `${window.location.origin}${window.location.pathname}?checkout=success&workspace=${String(body.workspaceId)}`,
    };
  }
  if (path.endsWith("/billing/portal") && method === "POST") {
    if (
      body.flow === "subscription_update_confirm" &&
      typeof body.priceId === "string"
    ) {
      subscribe(body.priceId);
      return {
        url: `${window.location.origin}${window.location.pathname}?checkout=success&workspace=${String(body.workspaceId)}`,
      };
    }
    if (body.flow === "subscription_cancel" && state.subscription)
      state = {
        ...state,
        subscription: {
          ...state.subscription,
          cancelAtPeriodEnd: true,
          cancelAt: state.subscription.currentPeriodEnd,
        },
      };
    saveState();
    return {
      url: `${window.location.origin}${window.location.pathname}`,
    };
  }
  return billingView();
}

function myAccount(): BillingMyAccount {
  const open =
    !!state.subscription &&
    ["trialing", "active", "past_due"].includes(state.subscription.status);
  return structuredClone({
    plan: state.plan,
    organizationsUsed: state.account?.organizationsUsed ?? 0,
    organizationsLimit: state.account?.organizationsLimit ?? 1,
    canAddExtras: open,
    homeWorkspaceId: demoOrganizations[0]?.id ?? null,
    extras: state.account?.extras ?? [],
  });
}

// --- Access state and export (ADR 020) ---------------------------------------

const accessKey = "kardo.demo.access";
const demoAccessModes = ["terminada", "pausada", "borrado", "fuera"] as const;

/**
 * Lets a reviewer see the lapsed states without an API: open the panel with
 * `?acceso=terminada|pausada|borrado` (kept for the session; `?acceso=` clears
 * it). Without it the access follows the demo billing state.
 */
function demoAccessMode(): (typeof demoAccessModes)[number] | null {
  try {
    const asked = new URLSearchParams(window.location.search).get("acceso");
    if (asked !== null) {
      if (asked === "") window.sessionStorage.removeItem(accessKey);
      else window.sessionStorage.setItem(accessKey, asked);
    }
    const value = window.sessionStorage.getItem(accessKey);
    return (demoAccessModes as readonly string[]).includes(value ?? "")
      ? (value as (typeof demoAccessModes)[number])
      : null;
  } catch {
    return null;
  }
}

const daysUntil = (value: string) =>
  Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000));

const noDates = {
  endsAt: null,
  daysLeft: null,
  lapsedAt: null,
  graceEndsAt: null,
  deleteAt: null,
  deletionSoon: false,
} as const;

export function handleAccessDemo(): WorkspaceAccess {
  const plan = state.plan;
  const base = {
    planCode: plan?.code ?? null,
    planName: plan?.name ?? null,
    canManage: true,
    offer: null,
  };
  const mode = demoAccessMode();
  if (mode === "fuera")
    return {
      ...base,
      state: "paused",
      source: "excluded",
      ...noDates,
    };
  if (mode) {
    const lapsedDays = mode === "terminada" ? 2 : mode === "pausada" ? 9 : 80;
    const lapsedAt = iso(-lapsedDays);
    return {
      ...base,
      state: mode === "terminada" ? "limited" : "paused",
      source: "trial",
      endsAt: null,
      daysLeft: null,
      lapsedAt,
      graceEndsAt: iso(7 - lapsedDays),
      deleteAt: iso(90 - lapsedDays),
      deletionSoon: mode === "borrado",
      offer: {
        percentOff: 20,
        months: 3,
        interval: "month",
        validUntil: iso(12),
      },
    };
  }
  const open =
    state.subscription &&
    ["trialing", "active", "past_due"].includes(state.subscription.status);
  if (state.subscription && open) {
    const end = state.subscription.currentPeriodEnd;
    return {
      ...base,
      state: "active",
      source: "subscription",
      ...noDates,
      endsAt: end,
      daysLeft: end ? daysUntil(end) : null,
    };
  }
  if (state.trial?.status === "active")
    return {
      ...base,
      state: "trial",
      source: "trial",
      ...noDates,
      endsAt: state.trial.endsAt,
      daysLeft: daysUntil(state.trial.endsAt),
    };
  return { ...base, state: "limited", source: "none", ...noDates };
}

export function handleExportDemo(workspaceId: string): Blob {
  const payload = {
    exportedAt: new Date().toISOString(),
    workspaceId,
    touchpoints: [],
    experiences: [],
    groups: [],
    leads: [],
  };
  return new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
}

// --- Datos de facturación y CFDI (ADR 020 §6) ---------------------------------

const fiscalKey = `${storageKey}.fiscal`;

type DemoFiscal = { profile: FiscalProfile | null; requests: CfdiRequest[] };

function loadFiscal(): DemoFiscal {
  try {
    const raw = window.sessionStorage.getItem(fiscalKey);
    if (raw) return JSON.parse(raw) as DemoFiscal;
  } catch {
    // Falls back to an empty state.
  }
  return { profile: null, requests: [] };
}

let fiscal: DemoFiscal = loadFiscal();

function saveFiscal() {
  try {
    window.sessionStorage.setItem(fiscalKey, JSON.stringify(fiscal));
  } catch {
    // The demo still works for this page view without persistence.
  }
}

const sameMonth = (value: string) => {
  const date = new Date(value);
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  );
};

function fiscalView(): WorkspaceFiscal {
  const requested = new Set(fiscal.requests.map((item) => item.invoiceId));
  return structuredClone({
    profile: fiscal.profile,
    requests: fiscal.requests,
    requestableInvoiceIds: state.invoices
      .filter(
        (invoice) =>
          invoice.status === "paid" &&
          sameMonth(invoice.paidAt ?? invoice.createdAt) &&
          !requested.has(invoice.id),
      )
      .map((invoice) => invoice.id),
  });
}

const demoUuid = () => crypto.randomUUID();

export function handleFiscalDemo(
  path: string,
  method: string,
  body: Record<string, unknown>,
): WorkspaceFiscal | CfdiRequestResult {
  const cfdi = /\/invoices\/([^/]+)\/cfdi$/.exec(path);
  if (cfdi && method === "POST") {
    const invoiceId = cfdi[1] ?? "";
    if (
      !fiscal.profile ||
      !fiscalView().requestableInvoiceIds.includes(invoiceId)
    )
      throw new ApiRequestError(
        "No pudimos registrar tu solicitud de factura.",
        409,
        "BILLING_CONFLICT",
      );
    const request: CfdiRequest = {
      id: demoUuid(),
      invoiceId,
      status: "pending",
      requestedAt: new Date().toISOString(),
      issuedAt: null,
      satUuid: null,
      notes: null,
      automatic: false,
      document: null,
    };
    fiscal = { ...fiscal, requests: [request, ...fiscal.requests] };
    saveFiscal();
    return { request: structuredClone(request) };
  }
  if (method === "PUT") {
    fiscal = {
      ...fiscal,
      profile: {
        ...(body as unknown as UpsertFiscalProfile),
        updatedAt: new Date().toISOString(),
      },
    };
    saveFiscal();
  } else if (method === "DELETE") {
    fiscal = { ...fiscal, profile: null };
    saveFiscal();
  }
  return fiscalView();
}
