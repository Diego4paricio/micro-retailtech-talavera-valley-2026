import { type Static, Type } from "@sinclair/typebox";

// ---------------------------------------------------------------------------
// Suscripciones y límites por plan (ADR 019).
//
// Stripe es la fuente de verdad del cobro; Kardo, de los límites. Los montos
// van en centavos de la moneda (MXN) y con IVA incluido. Un límite ausente o
// `null` significa "sin límite".
// Only top-level schemas carry `$id` (see customer-api stripNestedSchemaIds).
// ---------------------------------------------------------------------------

const Uuid = Type.String({ format: "uuid" });
const DateTime = Type.String({ format: "date-time" });
const NullableDateTime = Type.Union([DateTime, Type.Null()]);
const Count = Type.Integer({ minimum: 0 });
const Cents = Type.Integer({ minimum: 0 });
const Currency = Type.String({ pattern: "^[a-z]{3}$" });
const PlanCode = Type.String({ pattern: "^[a-z0-9_-]{2,64}$" });
const StripePriceId = Type.String({ pattern: "^price_[A-Za-z0-9]{6,64}$" });
const StripeInvoiceId = Type.String({ pattern: "^in_[A-Za-z0-9]{6,64}$" });
const StripeSubscriptionId = Type.String({
  pattern: "^sub_[A-Za-z0-9]{6,64}$",
});
const HttpsUrl = Type.String({ format: "uri", pattern: "^https://" });
const Reason = Type.String({ minLength: 3, maxLength: 500 });

/**
 * Límites y funciones que un plan puede fijar. `limit` cuenta recursos
 * (null = sin límite); `feature` es un sí/no. `usage` indica si
 * `kardo_billing.workspace_usage` devuelve el consumo de esa clave.
 */
export const billingEntitlements = {
  /**
   * Organizaciones que cubre el plan de la persona (ADR 024): Esencial 1,
   * Profesional 3, Negocio 5; Corporativo a la medida. Las de otro Owner no
   * cuentan; cada extra «Organización» suma una.
   */
  "organizations.max": {
    kind: "limit",
    label: "Organizaciones",
    usage: true,
  },
  "touchpoints.max": {
    kind: "limit",
    label: "QR y etiquetas activos (QR, NFC y otros)",
    usage: true,
  },
  "links.max": { kind: "limit", label: "Links", usage: true },
  "members.max": {
    kind: "limit",
    label: "Miembros del equipo (con invitaciones pendientes)",
    usage: true,
  },
  "qr_designs.max": {
    kind: "limit",
    label: "Diseños guardados en Diseño del QR",
    usage: true,
  },
  "assets.storage_mb": {
    kind: "limit",
    label: "Almacenamiento de imágenes y documentos (MB)",
    usage: true,
  },
  "ai.generations_month": {
    kind: "limit",
    label: "Generaciones con IA al mes (todas tus organizaciones)",
    usage: true,
  },
  /**
   * Tope de gasto en IA al mes, en centavos de dólar (tabla D de la
   * investigación del 1-oct-2026). Desde el ADR 024 es de la cuenta: lo
   * comparten todas las organizaciones del plan (auditoría A2-63). Se suma
   * el costo de cada generación registrada; al llegar al tope ya no se
   * genera.
   */
  "ai.spend_cents_month": {
    kind: "limit",
    label: "Gasto en IA al mes, todas tus organizaciones (centavos de dólar)",
    usage: true,
  },
  "analytics.history_days": {
    kind: "limit",
    label: "Días de historial de analítica",
    usage: false,
  },
  "custom_html.enabled": {
    kind: "feature",
    label: "Modo HTML del Estudio",
    usage: false,
  },
  "leads.export": {
    kind: "feature",
    label: "Exportar solicitudes a CSV",
    usage: false,
  },
  "leads.webhook": {
    kind: "feature",
    label: "Enviar solicitudes por webhook",
    usage: false,
  },
} as const;
export type BillingEntitlementKey = keyof typeof billingEntitlements;

/**
 * Stripe subscription states that still give the plan (domain audit A2-62:
 * the list was written out in the API, the billing package and the panel).
 * SQL functions in `kardo_billing` use the same three, with a comment
 * pointing here.
 */
export const LIVE_SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
] as const;
export function isLiveSubscriptionStatus(status: string): boolean {
  return (LIVE_SUBSCRIPTION_STATUSES as readonly string[]).includes(status);
}

/** Days to choose what stays active after a smaller plan (ADR 023, option
 * B); `kardo_billing.refresh_account_overage` opens the same 14. */
export const PLAN_OVERAGE_WINDOW_DAYS = 14;
export const billingEntitlementKeys = Object.keys(
  billingEntitlements,
) as BillingEntitlementKey[];

/** Type array, not `anyOf`: see the note on `EntitlementValue` in staff.ts. */
const EntitlementValue = Type.Unsafe<number | boolean | null>({
  type: ["integer", "boolean", "null"],
  minimum: 0,
});
const Entitlements = Type.Record(
  Type.String({ pattern: "^[a-z0-9_.-]{2,128}$" }),
  EntitlementValue,
);
const Usage = Type.Record(
  Type.String({ pattern: "^[a-z0-9_.-]{2,128}$" }),
  Count,
);

export const billingIntervals = ["month", "year"] as const;
export type BillingInterval = (typeof billingIntervals)[number];
const Interval = Type.Union([Type.Literal("month"), Type.Literal("year")]);

export const subscriptionStatuses = [
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
] as const;
export type SubscriptionStatus = (typeof subscriptionStatuses)[number];
const Status = Type.Union(
  subscriptionStatuses.map((status) => Type.Literal(status)),
);

/** De dónde sale el plan que rige hoy al workspace. */
export const planSources = [
  "subscription",
  "manual",
  "trial",
  "default",
] as const;
export type PlanSource = (typeof planSources)[number];
const Source = Type.Union(planSources.map((source) => Type.Literal(source)));

// --- Catálogo (GET /v1/billing/plans) ---------------------------------------

export const BillingPriceSchema = Type.Object(
  {
    id: StripePriceId,
    interval: Interval,
    unitAmount: Cents,
    currency: Currency,
    taxInclusive: Type.Boolean(),
  },
  { additionalProperties: false },
);
export type BillingPrice = Static<typeof BillingPriceSchema>;

export const BillingPlanSchema = Type.Object(
  {
    code: PlanCode,
    name: Type.String({ maxLength: 120 }),
    description: Type.Union([Type.String({ maxLength: 500 }), Type.Null()]),
    isDefault: Type.Boolean(),
    trialDays: Type.Union([
      Type.Integer({ minimum: 1, maximum: 90 }),
      Type.Null(),
    ]),
    entitlements: Entitlements,
    prices: Type.Array(BillingPriceSchema, { maxItems: 4 }),
  },
  { additionalProperties: false },
);
export type BillingPlan = Static<typeof BillingPlanSchema>;

export const BillingPlanListSchema = Type.Object(
  {
    /** false cuando Stripe no está configurado: el panel solo informa. */
    checkoutAvailable: Type.Boolean(),
    plans: Type.Array(BillingPlanSchema, { maxItems: 20 }),
  },
  { $id: "BillingPlanList", additionalProperties: false },
);
export type BillingPlanList = Static<typeof BillingPlanListSchema>;

// --- Facturación del workspace (GET /v1/workspaces/:id/billing) -------------

export const BillingPaymentMethodSchema = Type.Object(
  {
    type: Type.String({ maxLength: 32 }),
    brand: Type.Union([Type.String({ maxLength: 32 }), Type.Null()]),
    last4: Type.Union([Type.String({ pattern: "^[0-9]{4}$" }), Type.Null()]),
    expMonth: Type.Union([
      Type.Integer({ minimum: 1, maximum: 12 }),
      Type.Null(),
    ]),
    expYear: Type.Union([Type.Integer({ minimum: 2000 }), Type.Null()]),
  },
  { additionalProperties: false },
);
export type BillingPaymentMethod = Static<typeof BillingPaymentMethodSchema>;

export const BillingSubscriptionSchema = Type.Object(
  {
    id: StripeSubscriptionId,
    status: Status,
    planCode: Type.Union([PlanCode, Type.Null()]),
    planName: Type.Union([Type.String({ maxLength: 120 }), Type.Null()]),
    interval: Type.Union([Interval, Type.Null()]),
    unitAmount: Type.Union([Cents, Type.Null()]),
    currency: Type.Union([Currency, Type.Null()]),
    currentPeriodEnd: NullableDateTime,
    trialEnd: NullableDateTime,
    cancelAtPeriodEnd: Type.Boolean(),
    cancelAt: NullableDateTime,
    canceledAt: NullableDateTime,
    paymentMethod: Type.Union([BillingPaymentMethodSchema, Type.Null()]),
    createdAt: DateTime,
  },
  { additionalProperties: false },
);
export type BillingSubscription = Static<typeof BillingSubscriptionSchema>;

export const BillingInvoiceSchema = Type.Object(
  {
    id: StripeInvoiceId,
    number: Type.Union([Type.String({ maxLength: 64 }), Type.Null()]),
    status: Type.Union([
      Type.Literal("draft"),
      Type.Literal("open"),
      Type.Literal("paid"),
      Type.Literal("uncollectible"),
      Type.Literal("void"),
      Type.Null(),
    ]),
    total: Type.Integer(),
    amountPaid: Cents,
    amountRefunded: Cents,
    currency: Currency,
    periodStart: NullableDateTime,
    periodEnd: NullableDateTime,
    paidAt: NullableDateTime,
    hostedInvoiceUrl: Type.Union([HttpsUrl, Type.Null()]),
    invoicePdf: Type.Union([HttpsUrl, Type.Null()]),
    createdAt: DateTime,
  },
  { additionalProperties: false },
);
export type BillingInvoice = Static<typeof BillingInvoiceSchema>;

export const BillingEffectivePlanSchema = Type.Object(
  {
    code: PlanCode,
    name: Type.String({ maxLength: 120 }),
    source: Source,
  },
  { additionalProperties: false },
);
export type BillingEffectivePlan = Static<typeof BillingEffectivePlanSchema>;

/**
 * Prueba de Kardo (ADR 020): 15 días sin tarjeta, una por persona. `active`
 * mientras no termina ni se contrata; `ended` al terminar sin contratar;
 * `converted` cuando la organización contrató.
 */
export const trialStatuses = ["active", "ended", "converted"] as const;
export type TrialStatus = (typeof trialStatuses)[number];

export const BillingTrialSchema = Type.Object(
  {
    planCode: PlanCode,
    planName: Type.String({ maxLength: 120 }),
    interval: Interval,
    startedAt: DateTime,
    endsAt: DateTime,
    /** Días naturales que faltan, redondeados hacia arriba; 0 al terminar. */
    daysLeft: Count,
    status: Type.Union(trialStatuses.map((status) => Type.Literal(status))),
  },
  { additionalProperties: false },
);
export type BillingTrial = Static<typeof BillingTrialSchema>;

// --- La cuenta de cobro de la persona (ADR 024) ------------------------------

/** Extras para no subir de plan: renglones de la misma suscripción. */
export const billingExtraCodes = [
  "organization",
  "touchpoints",
  "links",
] as const;
export type BillingExtraCode = (typeof billingExtraCodes)[number];
/** Most of each extra one account may add. */
export const billingExtraMax: Record<BillingExtraCode, number> = {
  organization: 20,
  touchpoints: 50,
  links: 50,
};
const ExtraCode = Type.Union(
  billingExtraCodes.map((code) => Type.Literal(code)),
);

export const BillingExtraSchema = Type.Object(
  {
    code: ExtraCode,
    name: Type.String({ maxLength: 80 }),
    /** What one adds: 1 organization, 10 QR y etiquetas, 5 links. */
    unitsPerQuantity: Count,
    entitlementKey: Type.String({ maxLength: 64 }),
    /** How many the account pays now. */
    quantity: Count,
    /** Its prices, one per interval (the plan's interval applies). */
    prices: Type.Array(BillingPriceSchema, { maxItems: 4 }),
  },
  { $id: "BillingExtra", additionalProperties: false },
);
export type BillingExtra = Static<typeof BillingExtraSchema>;

export const BillingAccountOrganizationSchema = Type.Object(
  {
    id: Uuid,
    name: Type.String({ maxLength: 120 }),
    /** Out of the plan after a downgrade: paused, nothing deleted. */
    excluded: Type.Boolean(),
    internal: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const BillingAccountSchema = Type.Object(
  {
    /** Whose plan covers this organization (the Owner). */
    holderName: Type.Union([Type.String({ maxLength: 320 }), Type.Null()]),
    /** The viewer is that person: only they change the plan and extras. */
    isHolder: Type.Boolean(),
    organizationsUsed: Count,
    /** Null: no cap. */
    organizationsLimit: Type.Union([Count, Type.Null()]),
    organizations: Type.Array(BillingAccountOrganizationSchema, {
      maxItems: 1000,
    }),
    extras: Type.Array(BillingExtraSchema, { maxItems: 10 }),
  },
  { $id: "BillingAccount", additionalProperties: false },
);
export type BillingAccount = Static<typeof BillingAccountSchema>;

/**
 * Add or remove extras (`confirm: false` only shows what it costs today).
 * Needs a paid plan; the extra goes on the plan's interval.
 */
export const ChangeBillingExtrasSchema = Type.Object(
  {
    quantities: Type.Object(
      {
        organization: Type.Optional(
          Type.Integer({ minimum: 0, maximum: billingExtraMax.organization }),
        ),
        touchpoints: Type.Optional(
          Type.Integer({ minimum: 0, maximum: billingExtraMax.touchpoints }),
        ),
        links: Type.Optional(
          Type.Integer({ minimum: 0, maximum: billingExtraMax.links }),
        ),
      },
      { additionalProperties: false },
    ),
    confirm: Type.Boolean(),
  },
  { $id: "ChangeBillingExtras", additionalProperties: false },
);
export type ChangeBillingExtras = Static<typeof ChangeBillingExtrasSchema>;

/**
 * The caller's own account (ADR 024), wherever they are in the panel: what
 * «Crear organización» says («Tu plan Profesional incluye 3: usas 2») and
 * offers at the cap (upgrade, or an extra organization).
 */
export const BillingMyAccountSchema = Type.Object(
  {
    plan: Type.Union([BillingEffectivePlanSchema, Type.Null()]),
    organizationsUsed: Count,
    /** Null: no cap. Without a plan, 1. */
    organizationsLimit: Type.Union([Count, Type.Null()]),
    /** A paid plan: extras can be added now. */
    canAddExtras: Type.Boolean(),
    /** Where Plan y facturación opens for this account (its oldest
     * organization); null before the person owns one. */
    homeWorkspaceId: Type.Union([Uuid, Type.Null()]),
    extras: Type.Array(BillingExtraSchema, { maxItems: 10 }),
  },
  { $id: "BillingMyAccount", additionalProperties: false },
);
export type BillingMyAccount = Static<typeof BillingMyAccountSchema>;

/** Change the plan of a subscription with extras (the portal cannot). */
export const ChangeBillingPlanSchema = Type.Object(
  { priceId: StripePriceId, confirm: Type.Boolean() },
  { $id: "ChangeBillingPlan", additionalProperties: false },
);
export type ChangeBillingPlan = Static<typeof ChangeBillingPlanSchema>;

export const BillingChangeResultSchema = Type.Object(
  {
    status: Type.Union([Type.Literal("preview"), Type.Literal("applied")]),
    /** Charged today for what is left of the period (prorated). */
    amountDueToday: Cents,
    /** What the next renewal charges with the change. */
    nextAmount: Type.Union([Cents, Type.Null()]),
    currency: Currency,
    nextChargeAt: NullableDateTime,
  },
  { $id: "BillingChangeResult", additionalProperties: false },
);
export type BillingChangeResult = Static<typeof BillingChangeResultSchema>;

export const WorkspaceBillingSchema = Type.Object(
  {
    /** Stripe configurado en este entorno. */
    checkoutAvailable: Type.Boolean(),
    /** El usuario puede contratar, cambiar o cancelar (Owner). */
    canManage: Type.Boolean(),
    /** Null: sin plan asignado (sin límites). */
    plan: Type.Union([BillingEffectivePlanSchema, Type.Null()]),
    entitlements: Entitlements,
    usage: Usage,
    subscription: Type.Union([BillingSubscriptionSchema, Type.Null()]),
    trialAvailable: Type.Boolean(),
    /** Prueba de Kardo de esta organización, si la tuvo. */
    trial: Type.Union([BillingTrialSchema, Type.Null()]),
    invoices: Type.Array(BillingInvoiceSchema, { maxItems: 24 }),
    /** ADR 024: the person's account that covers this organization; null
     * for an organization without an Owner. */
    account: Type.Union([BillingAccountSchema, Type.Null()]),
  },
  { $id: "WorkspaceBilling", additionalProperties: false },
);
export type WorkspaceBilling = Static<typeof WorkspaceBillingSchema>;

// --- Estado de acceso (GET /v1/workspaces/:id/access, ADR 020 §4) -----------

/**
 * Qué puede hacer hoy la organización:
 * - `internal`: cuenta interna o demo de Kardo; nunca se limita.
 * - `active`: suscripción viva (también `past_due` durante los reintentos) o
 *   cortesía de staff vigente.
 * - `trial`: prueba de Kardo vigente.
 * - `limited`: sin plan; el panel solo deja elegir plan, ver, exportar y ver
 *   facturas. Las páginas públicas siguen abiertas hasta `graceEndsAt`.
 * - `paused`: igual, y las páginas públicas muestran la página de estado.
 * - `legacy`: organización anterior al ADR 020 sin prueba ni plan; sin
 *   límites hasta que staff decida.
 * - `deleted`: se borró a los 90 días sin contratar (ADR 020, adenda del
 *   2026-10-01); solo queda lo que la ley conserva. `deleteAt` es cuándo.
 */
export const workspaceAccessStates = [
  "internal",
  "active",
  "trial",
  "limited",
  "paused",
  "legacy",
  "deleted",
] as const;
export type WorkspaceAccessState = (typeof workspaceAccessStates)[number];

/**
 * De dónde sale el estado. En `limited`/`paused`: lo que terminó (`trial`,
 * `subscription` o `manual`), o `none` si la organización nunca tuvo prueba
 * ni plan (por ejemplo, la segunda organización de alguien que ya usó su
 * prueba): debe contratar para empezar.
 */
export const workspaceAccessSources = [
  "internal",
  "subscription",
  "manual",
  "trial",
  "legacy",
  "none",
  /** ADR 024: la cuenta está al corriente, pero esta organización quedó fuera
   * de su plan en una bajada (estado `paused`; nada se borra). */
  "excluded",
] as const;
export type WorkspaceAccessSource = (typeof workspaceAccessSources)[number];

/** Días de gracia de las páginas públicas y días hasta el borrado. */
export const accessGraceDays = 7;
export const accessDeleteAfterDays = 90;
/** Aviso de borrado: esta cantidad de días antes. */
export const accessDeletionNoticeDays = 15;

/** Cupón de conversión (ADR 020 §1): se aplica solo en Checkout. */
export const BillingConversionOfferSchema = Type.Object(
  {
    percentOff: Type.Integer({ minimum: 1, maximum: 100 }),
    /** Cargos mensuales con descuento. */
    months: Type.Integer({ minimum: 1, maximum: 12 }),
    /** Solo en el precio mensual. */
    interval: Type.Literal("month"),
    validUntil: DateTime,
  },
  { additionalProperties: false },
);
export type BillingConversionOffer = Static<
  typeof BillingConversionOfferSchema
>;

export const WorkspaceAccessSchema = Type.Object(
  {
    state: Type.Union(
      workspaceAccessStates.map((state) => Type.Literal(state)),
    ),
    source: Type.Union(
      workspaceAccessSources.map((source) => Type.Literal(source)),
    ),
    /** Plan vigente, o el que terminó en `limited`/`paused`. */
    planCode: Type.Union([PlanCode, Type.Null()]),
    planName: Type.Union([Type.String({ maxLength: 120 }), Type.Null()]),
    /** Fin de la prueba o de la cortesía vigente. */
    endsAt: NullableDateTime,
    /** Días naturales hasta `endsAt`, redondeados hacia arriba. */
    daysLeft: Type.Union([Count, Type.Null()]),
    /** Cuándo terminó la prueba, la suscripción o la cortesía. */
    lapsedAt: NullableDateTime,
    /** Cuándo se pausan (o se pausaron) las páginas públicas. */
    graceEndsAt: NullableDateTime,
    /** Cuándo se borra la organización si no contrata (en `deleted`, cuándo
     * se borró). */
    deleteAt: NullableDateTime,
    /** Faltan 15 días o menos para `deleteAt`. */
    deletionSoon: Type.Boolean(),
    /** El usuario puede contratar (Owner). */
    canManage: Type.Boolean(),
    /** Cupón de conversión vigente para esta organización. */
    offer: Type.Union([BillingConversionOfferSchema, Type.Null()]),
  },
  { $id: "WorkspaceAccess", additionalProperties: false },
);
export type WorkspaceAccess = Static<typeof WorkspaceAccessSchema>;

/** Cuerpo extra de `403 PLAN_REQUIRED`. */
export type PlanRequiredDetails = {
  accessState: Extract<WorkspaceAccessState, "limited" | "paused">;
};

// --- Acciones del cliente ----------------------------------------------------

/** POST /v1/workspaces/:id/billing/checkout */
export const billingCheckoutModes = ["hosted", "embedded"] as const;
export type BillingCheckoutMode = (typeof billingCheckoutModes)[number];
export const CreateBillingCheckoutSchema = Type.Object(
  {
    priceId: StripePriceId,
    /**
     * `hosted` (por omisión): la página de Stripe. `embedded`: Checkout
     * dentro del panel; necesita la llave publicable en el panel.
     */
    mode: Type.Optional(
      Type.Union(billingCheckoutModes.map((mode) => Type.Literal(mode))),
    ),
  },
  { $id: "CreateBillingCheckout", additionalProperties: false },
);
export type CreateBillingCheckout = Static<typeof CreateBillingCheckoutSchema>;

const CheckoutSessionId = Type.String({
  pattern: "^cs_(test|live)_[A-Za-z0-9]{10,200}$",
});

/**
 * Respuesta de checkout. `hosted` trae `url` (el panel redirige); `embedded`
 * trae `clientSecret`, que Stripe.js monta dentro del panel.
 */
export const BillingCheckoutSchema = Type.Object(
  {
    mode: Type.Union(billingCheckoutModes.map((mode) => Type.Literal(mode))),
    sessionId: CheckoutSessionId,
    url: Type.Union([HttpsUrl, Type.Null()]),
    clientSecret: Type.Union([
      Type.String({ minLength: 10, maxLength: 500 }),
      Type.Null(),
    ]),
  },
  { $id: "BillingCheckout", additionalProperties: false },
);
export type BillingCheckout = Static<typeof BillingCheckoutSchema>;

/** GET /v1/workspaces/:id/billing/checkout/:sessionId (página de regreso). */
export const BillingCheckoutStatusSchema = Type.Object(
  {
    /** `open`: no pagó (o falló); se vuelve a montar Checkout. */
    status: Type.Union([
      Type.Literal("open"),
      Type.Literal("complete"),
      Type.Literal("expired"),
    ]),
    paymentStatus: Type.Union([
      Type.Literal("paid"),
      Type.Literal("unpaid"),
      Type.Literal("no_payment_required"),
    ]),
    /** La suscripción ya está en el espejo y viva (el acceso se reactivó). */
    subscriptionActive: Type.Boolean(),
  },
  { $id: "BillingCheckoutStatus", additionalProperties: false },
);
export type BillingCheckoutStatus = Static<typeof BillingCheckoutStatusSchema>;

/** POST /v1/workspaces/:id/billing/portal */
export const billingPortalFlows = [
  "default",
  "payment_method_update",
  "subscription_update",
  /** Cambio a `priceId` con el monto prorrateado a la vista (ADR 020 §2). */
  "subscription_update_confirm",
  "subscription_cancel",
] as const;
export type BillingPortalFlow = (typeof billingPortalFlows)[number];
export const CreateBillingPortalSchema = Type.Object(
  {
    flow: Type.Optional(
      Type.Union(billingPortalFlows.map((flow) => Type.Literal(flow))),
    ),
    /** Requerido por `subscription_update_confirm`: el precio destino. */
    priceId: Type.Optional(StripePriceId),
  },
  { $id: "CreateBillingPortal", additionalProperties: false },
);
export type CreateBillingPortal = Static<typeof CreateBillingPortalSchema>;

/** Respuesta de checkout y portal: el panel redirige a la página de Stripe. */
export const BillingRedirectSchema = Type.Object(
  { url: HttpsUrl },
  { $id: "BillingRedirect", additionalProperties: false },
);
export type BillingRedirect = Static<typeof BillingRedirectSchema>;

/** Cuerpo extra de `403 PLAN_LIMIT`. */
export type PlanLimitDetails = {
  key: string;
  limit: number | null;
  usage: number | null;
  planCode: string | null;
};

// --- Datos fiscales y CFDI (ADR 020 §6; fase 1 manual) -----------------------

/**
 * Claves de c_RegimenFiscal y c_UsoCFDI del catálogo del SAT para CFDI 4.0.
 * La guía fiscal (Docs/fiscal, §5) las marca como no verificadas hoy contra
 * el catálogo oficial: revisar antes de emitir en vivo.
 */
export const taxRegimes = [
  { code: "601", label: "General de Ley Personas Morales" },
  { code: "603", label: "Personas Morales con Fines no Lucrativos" },
  { code: "605", label: "Sueldos y Salarios e Ingresos Asimilados a Salarios" },
  { code: "606", label: "Arrendamiento" },
  { code: "607", label: "Enajenación o Adquisición de Bienes" },
  { code: "608", label: "Demás ingresos" },
  {
    code: "610",
    label:
      "Residentes en el Extranjero sin Establecimiento Permanente en México",
  },
  { code: "611", label: "Ingresos por Dividendos (socios y accionistas)" },
  {
    code: "612",
    label: "Personas Físicas con Actividades Empresariales y Profesionales",
  },
  { code: "614", label: "Ingresos por intereses" },
  { code: "615", label: "Ingresos por obtención de premios" },
  { code: "616", label: "Sin obligaciones fiscales" },
  {
    code: "620",
    label:
      "Sociedades Cooperativas de Producción que optan por diferir sus ingresos",
  },
  { code: "621", label: "Incorporación Fiscal" },
  {
    code: "622",
    label: "Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras",
  },
  { code: "623", label: "Opcional para Grupos de Sociedades" },
  { code: "624", label: "Coordinados" },
  {
    code: "625",
    label:
      "Actividades Empresariales con ingresos a través de Plataformas Tecnológicas",
  },
  { code: "626", label: "Régimen Simplificado de Confianza" },
] as const;
export type TaxRegimeCode = (typeof taxRegimes)[number]["code"];

/** Usos del CFDI; para una suscripción de software lo usual es G03. */
export const cfdiUses = [
  { code: "G01", label: "Adquisición de mercancías" },
  { code: "G02", label: "Devoluciones, descuentos o bonificaciones" },
  { code: "G03", label: "Gastos en general" },
  { code: "I01", label: "Construcciones" },
  { code: "I02", label: "Mobiliario y equipo de oficina por inversiones" },
  { code: "I03", label: "Equipo de transporte" },
  { code: "I04", label: "Equipo de cómputo y accesorios" },
  { code: "I05", label: "Dados, troqueles, moldes, matrices y herramental" },
  { code: "I06", label: "Comunicaciones telefónicas" },
  { code: "I07", label: "Comunicaciones satelitales" },
  { code: "I08", label: "Otra maquinaria y equipo" },
  { code: "D01", label: "Honorarios médicos, dentales y gastos hospitalarios" },
  { code: "D02", label: "Gastos médicos por incapacidad o discapacidad" },
  { code: "D03", label: "Gastos funerales" },
  { code: "D04", label: "Donativos" },
  {
    code: "D05",
    label:
      "Intereses reales pagados por créditos hipotecarios (casa habitación)",
  },
  { code: "D06", label: "Aportaciones voluntarias al SAR" },
  { code: "D07", label: "Primas por seguros de gastos médicos" },
  { code: "D08", label: "Gastos de transportación escolar obligatoria" },
  {
    code: "D09",
    label: "Depósitos en cuentas para el ahorro, primas de pensiones",
  },
  { code: "D10", label: "Pagos por servicios educativos (colegiaturas)" },
  { code: "S01", label: "Sin efectos fiscales" },
  { code: "CP01", label: "Pagos" },
  { code: "CN01", label: "Nómina" },
] as const;
export type CfdiUseCode = (typeof cfdiUses)[number]["code"];

/** RFC de 12 (moral) o 13 (física) caracteres; nunca los genéricos. */
export const RFC_PATTERN = "^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$";
const Rfc = Type.String({ pattern: RFC_PATTERN, minLength: 12, maxLength: 13 });
const TaxRegime = Type.Union(
  taxRegimes.map((regime) => Type.Literal(regime.code)),
);
const CfdiUse = Type.Union(cfdiUses.map((use) => Type.Literal(use.code)));
const PostalCode = Type.String({ pattern: "^[0-9]{5}$" });
const FiscalEmail = Type.String({ format: "email", maxLength: 320 });
const SatUuid = Type.String({
  pattern:
    "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
});

/** PUT /v1/workspaces/:id/billing/fiscal (Owner y Admin). */
export const UpsertFiscalProfileSchema = Type.Object(
  {
    rfc: Rfc,
    legalName: Type.String({ minLength: 1, maxLength: 300 }),
    taxRegime: TaxRegime,
    postalCode: PostalCode,
    cfdiUse: CfdiUse,
    email: FiscalEmail,
    invoiceEachPayment: Type.Boolean(),
  },
  { $id: "UpsertFiscalProfile", additionalProperties: false },
);
export type UpsertFiscalProfile = Static<typeof UpsertFiscalProfileSchema>;

export const FiscalProfileSchema = Type.Object(
  {
    ...UpsertFiscalProfileSchema.properties,
    updatedAt: DateTime,
  },
  { additionalProperties: false },
);
export type FiscalProfile = Static<typeof FiscalProfileSchema>;

export const cfdiRequestStatuses = [
  "pending",
  "issued",
  "rejected",
  "canceled",
] as const;
export type CfdiRequestStatus = (typeof cfdiRequestStatuses)[number];
const CfdiStatus = Type.Union(
  cfdiRequestStatuses.map((status) => Type.Literal(status)),
);

export const CfdiRequestSchema = Type.Object(
  {
    id: Uuid,
    invoiceId: StripeInvoiceId,
    status: CfdiStatus,
    requestedAt: DateTime,
    issuedAt: NullableDateTime,
    /** Folio fiscal del SAT cuando está emitida. */
    satUuid: Type.Union([SatUuid, Type.Null()]),
    /** Motivo de rechazo o cancelación. */
    notes: Type.Union([Type.String({ maxLength: 500 }), Type.Null()]),
    /** La pidió "factura de cada pago", no una persona. */
    automatic: Type.Boolean(),
    /**
     * CFDI emitido con Facturapi: el PDF y el XML se descargan desde Kardo.
     * `test`: de prueba, sin validez fiscal (no se timbró ante el SAT).
     */
    document: Type.Union([
      Type.Object(
        { provider: Type.Literal("facturapi"), test: Type.Boolean() },
        { additionalProperties: false },
      ),
      Type.Null(),
    ]),
  },
  { additionalProperties: false },
);
export type CfdiRequest = Static<typeof CfdiRequestSchema>;
export const cfdiDocumentFormats = ["pdf", "xml"] as const;
export type CfdiDocumentFormat = (typeof cfdiDocumentFormats)[number];

/** GET /v1/workspaces/:id/billing/fiscal (Owner y Admin). */
export const WorkspaceFiscalSchema = Type.Object(
  {
    profile: Type.Union([FiscalProfileSchema, Type.Null()]),
    requests: Type.Array(CfdiRequestSchema, { maxItems: 50 }),
    /** Pagos del mes en curso que aún pueden pedir factura. */
    requestableInvoiceIds: Type.Array(StripeInvoiceId, { maxItems: 24 }),
  },
  { $id: "WorkspaceFiscal", additionalProperties: false },
);
export type WorkspaceFiscal = Static<typeof WorkspaceFiscalSchema>;

/** POST /v1/workspaces/:id/billing/invoices/:invoiceId/cfdi */
export const CfdiRequestResultSchema = Type.Object(
  { request: CfdiRequestSchema },
  { $id: "CfdiRequestResult", additionalProperties: false },
);
export type CfdiRequestResult = Static<typeof CfdiRequestResultSchema>;

// --- Operations (Staff API) ---------------------------------------------------

export const StaffBillingOverviewSchema = Type.Object(
  {
    currency: Currency,
    /** Ingreso recurrente mensual normalizado (anuales / 12), en centavos. */
    mrr: Cents,
    active: Count,
    trialing: Count,
    pastDue: Count,
    canceledLast30Days: Count,
    trialsEndingNext7Days: Count,
    failedWebhookEvents: Count,
    /** Estado de acceso (ADR 020 §4 y §8); sin cuentas internas en MRR. */
    access: Type.Object(
      {
        kardoTrials: Count,
        limited: Count,
        paused: Count,
        /** Borrado en 15 días o menos, o ya vencido. */
        pendingDeletion: Count,
        internal: Count,
        /** Ya borradas (ADR 020, adenda del 2026-10-01). */
        deleted: Count,
        /** BILLING_DELETE_ENABLED: apagado, ensayo (solo cuenta) o activo. */
        deletionMode: Type.Union([
          Type.Literal("off"),
          Type.Literal("dry-run"),
          Type.Literal("on"),
        ]),
      },
      { additionalProperties: false },
    ),
    byPlan: Type.Array(
      Type.Object(
        {
          planCode: Type.Union([PlanCode, Type.Null()]),
          planName: Type.Union([Type.String({ maxLength: 120 }), Type.Null()]),
          subscriptions: Count,
          mrr: Cents,
        },
        { additionalProperties: false },
      ),
      { maxItems: 50 },
    ),
  },
  { $id: "StaffBillingOverview", additionalProperties: false },
);
export type StaffBillingOverview = Static<typeof StaffBillingOverviewSchema>;

export const StaffBillingSubscriptionSchema = Type.Object(
  {
    ...BillingSubscriptionSchema.properties,
    workspaceId: Uuid,
    workspaceName: Type.String({ maxLength: 120 }),
    ownerEmail: Type.Union([Type.String({ maxLength: 320 }), Type.Null()]),
    stripeCustomerId: Type.String({ maxLength: 100 }),
    livemode: Type.Boolean(),
  },
  { additionalProperties: false },
);
export type StaffBillingSubscription = Static<
  typeof StaffBillingSubscriptionSchema
>;

export const StaffBillingSubscriptionPageSchema = Type.Object(
  {
    items: Type.Array(StaffBillingSubscriptionSchema, { maxItems: 100 }),
    nextCursor: Type.Union([Type.String({ maxLength: 200 }), Type.Null()]),
  },
  { $id: "StaffBillingSubscriptionPage", additionalProperties: false },
);
export type StaffBillingSubscriptionPage = Static<
  typeof StaffBillingSubscriptionPageSchema
>;

export const StaffBillingRefundSchema = Type.Object(
  {
    id: Type.String({ maxLength: 100 }),
    invoiceId: Type.Union([StripeInvoiceId, Type.Null()]),
    amount: Cents,
    currency: Currency,
    status: Type.String({ maxLength: 32 }),
    reason: Type.Union([Type.String({ maxLength: 500 }), Type.Null()]),
    createdAt: DateTime,
  },
  { additionalProperties: false },
);
export type StaffBillingRefund = Static<typeof StaffBillingRefundSchema>;

export const StaffBillingEventSchema = Type.Object(
  {
    id: Type.String({ maxLength: 100 }),
    type: Type.String({ maxLength: 100 }),
    status: Type.Union([
      Type.Literal("received"),
      Type.Literal("processed"),
      Type.Literal("ignored"),
      Type.Literal("failed"),
    ]),
    attempts: Count,
    lastError: Type.Union([Type.String({ maxLength: 500 }), Type.Null()]),
    workspaceId: Type.Union([Uuid, Type.Null()]),
    receivedAt: DateTime,
  },
  { additionalProperties: false },
);
export type StaffBillingEvent = Static<typeof StaffBillingEventSchema>;

export const StaffBillingEventListSchema = Type.Array(StaffBillingEventSchema, {
  $id: "StaffBillingEventList",
  maxItems: 100,
});
export type StaffBillingEventList = Static<typeof StaffBillingEventListSchema>;

/** Every customer notice kind (`kardo_billing.notices.kind`). */
export const billingNoticeKinds = [
  "subscription_started",
  "renewal_upcoming",
  "trial_ending",
  "cancellation_confirmed",
  "trial_started",
  "trial_reminder",
  "trial_ended",
  /** Terminó una suscripción o una cortesía sin contratar (ADR 020 §4). */
  "plan_ended",
  /** Las páginas públicas se pausan en unos días (3 y 6 días después). */
  "pause_upcoming",
  /** Las páginas públicas quedaron en pausa (fin de la gracia). */
  "pages_paused",
  /** La organización se borra en 15 días. */
  "deletion_upcoming",
  /** La cortesía de staff vence en 7 días o mañana (ADR 020 §8). */
  "courtesy_ending",
  /** Staff marcó emitido el CFDI de un pago (ADR 020 §6). */
  "cfdi_issued",
] as const;
export type BillingNoticeKind = (typeof billingNoticeKinds)[number];

/** Customer notices (contract, renewal, trial, access, cancellation). */
export const StaffBillingNoticeSchema = Type.Object(
  {
    id: Uuid,
    kind: Type.Union(billingNoticeKinds.map((kind) => Type.Literal(kind))),
    status: Type.Union([
      Type.Literal("pending"),
      Type.Literal("sent"),
      Type.Literal("failed"),
      Type.Literal("skipped"),
    ]),
    subscriptionId: Type.Union([StripeSubscriptionId, Type.Null()]),
    folio: Type.Union([Type.String({ maxLength: 20 }), Type.Null()]),
    sentTo: Type.Union([Type.String({ maxLength: 320 }), Type.Null()]),
    attempts: Count,
    createdAt: DateTime,
    sentAt: NullableDateTime,
  },
  { additionalProperties: false },
);
export type StaffBillingNotice = Static<typeof StaffBillingNoticeSchema>;

/**
 * Borrado de una organización (ADR 020, adenda del 2026-10-01): qué se
 * borró, cuándo, y si ya terminó la limpieza fuera de la base (R2 y
 * Resolver). Las facturas, avisos y CFDI se conservan.
 */
export const StaffWorkspaceDeletionSchema = Type.Object(
  {
    deletedAt: DateTime,
    reason: Type.String({ maxLength: 200 }),
    /** Conteos de lo borrado y de lo conservado (`invoicesKept`, `cfdiKept`). */
    counts: Type.Record(Type.String({ pattern: "^[A-Za-z]{1,40}$" }), Count),
    /** Objetos por limpiar todavía; la tarea horaria los reintenta. */
    cleanupPending: Count,
    cleanupCompletedAt: NullableDateTime,
    lastCleanupError: Type.Union([
      Type.String({ maxLength: 500 }),
      Type.Null(),
    ]),
  },
  { additionalProperties: false },
);
export type StaffWorkspaceDeletion = Static<
  typeof StaffWorkspaceDeletionSchema
>;

/** Estado de acceso visto desde Operations (ADR 020 §4 y §8). */
export const StaffWorkspaceAccessSchema = Type.Object(
  {
    state: WorkspaceAccessSchema.properties.state,
    source: WorkspaceAccessSchema.properties.source,
    lapsedAt: NullableDateTime,
    graceEndsAt: NullableDateTime,
    deleteAt: NullableDateTime,
    /** Cuándo la tarea horaria pausó las páginas públicas (null: no están en pausa). */
    pagesPausedAt: NullableDateTime,
    /** Marca de cuenta interna o demo, si la tiene. */
    internal: Type.Union([
      Type.Object(
        {
          reason: Type.String({ maxLength: 500 }),
          setAt: DateTime,
          setByName: Type.Union([Type.String({ maxLength: 320 }), Type.Null()]),
        },
        { additionalProperties: false },
      ),
      Type.Null(),
    ]),
    /** Solo en `deleted`. */
    deletion: Type.Union([StaffWorkspaceDeletionSchema, Type.Null()]),
  },
  { additionalProperties: false },
);
export type StaffWorkspaceAccess = Static<typeof StaffWorkspaceAccessSchema>;

/** ADR 024: the person's billing account an organization is in, for
 * Operations: whose plan, its organizations, extras and monthly charge. */
export const StaffBillingAccountSchema = Type.Object(
  {
    accountId: Uuid,
    holderName: Type.Union([Type.String({ maxLength: 320 }), Type.Null()]),
    holderEmail: Type.Union([Type.String({ maxLength: 320 }), Type.Null()]),
    organizationsUsed: Count,
    organizationsLimit: Type.Union([Count, Type.Null()]),
    organizations: Type.Array(BillingAccountOrganizationSchema, {
      maxItems: 1000,
    }),
    extras: Type.Array(
      Type.Object(
        {
          code: ExtraCode,
          name: Type.String({ maxLength: 80 }),
          quantity: Count,
        },
        { additionalProperties: false },
      ),
      { maxItems: 10 },
    ),
    /** Plan plus extras, per month (an annual one divided by 12). Cents. */
    monthlyAmount: Type.Union([Cents, Type.Null()]),
  },
  { $id: "StaffBillingAccount", additionalProperties: false },
);
export type StaffBillingAccount = Static<typeof StaffBillingAccountSchema>;

export const StaffWorkspaceBillingSchema = Type.Object(
  {
    workspaceId: Uuid,
    workspaceName: Type.String({ maxLength: 120 }),
    /** Cuenta personal o de negocio, como la declaró en el alta (null antes). */
    accountType: Type.Optional(
      Type.Union([
        Type.Literal("personal"),
        Type.Literal("business"),
        Type.Null(),
      ]),
    ),
    stripeCustomerId: Type.Union([
      Type.String({ maxLength: 100 }),
      Type.Null(),
    ]),
    /** Enlace al cliente en el dashboard de Stripe (modo prueba o vivo). */
    stripeDashboardUrl: Type.Union([HttpsUrl, Type.Null()]),
    trialConsumedAt: NullableDateTime,
    /** Prueba de Kardo (ADR 020), si la tuvo. */
    trial: Type.Union([BillingTrialSchema, Type.Null()]),
    /** Estado de acceso: activa, prueba, limitada, en pausa, interna. */
    access: StaffWorkspaceAccessSchema,
    plan: Type.Union([BillingEffectivePlanSchema, Type.Null()]),
    manualPlanUntil: NullableDateTime,
    entitlements: Entitlements,
    usage: Usage,
    subscriptions: Type.Array(BillingSubscriptionSchema, { maxItems: 20 }),
    invoices: Type.Array(BillingInvoiceSchema, { maxItems: 50 }),
    refunds: Type.Array(StaffBillingRefundSchema, { maxItems: 50 }),
    events: Type.Array(StaffBillingEventSchema, { maxItems: 50 }),
    notices: Type.Array(StaffBillingNoticeSchema, { maxItems: 50 }),
    /** ADR 024: the person's account (null without an Owner). */
    account: Type.Optional(
      Type.Union([StaffBillingAccountSchema, Type.Null()]),
    ),
  },
  { $id: "StaffWorkspaceBilling", additionalProperties: false },
);
export type StaffWorkspaceBilling = Static<typeof StaffWorkspaceBillingSchema>;

/** POST /v1/staff/billing/subscriptions/:subscriptionId/cancel */
export const StaffBillingCancelSchema = Type.Object(
  {
    /** `period_end`: sigue activa hasta el final del periodo pagado. */
    mode: Type.Union([Type.Literal("period_end"), Type.Literal("immediately")]),
    reason: Reason,
  },
  { $id: "StaffBillingCancel", additionalProperties: false },
);
export type StaffBillingCancel = Static<typeof StaffBillingCancelSchema>;

/** POST .../resume (quita una cancelación programada) y .../resync */
export const StaffBillingReasonSchema = Type.Object(
  { reason: Reason },
  { $id: "StaffBillingReason", additionalProperties: false },
);
export type StaffBillingReason = Static<typeof StaffBillingReasonSchema>;

/** POST .../extend-trial */
export const StaffBillingExtendTrialSchema = Type.Object(
  { days: Type.Integer({ minimum: 1, maximum: 60 }), reason: Reason },
  { $id: "StaffBillingExtendTrial", additionalProperties: false },
);
export type StaffBillingExtendTrial = Static<
  typeof StaffBillingExtendTrialSchema
>;

/** POST /v1/staff/billing/invoices/:invoiceId/refund. Sin `amount`: total. */
export const StaffBillingRefundRequestSchema = Type.Object(
  { amount: Type.Optional(Type.Integer({ minimum: 1 })), reason: Reason },
  { $id: "StaffBillingRefundRequest", additionalProperties: false },
);
export type StaffBillingRefundRequest = Static<
  typeof StaffBillingRefundRequestSchema
>;

/** PUT /v1/staff/workspaces/:workspaceId/internal (ADR 020 §8). */
export const StaffSetWorkspaceInternalSchema = Type.Object(
  { internal: Type.Boolean(), reason: Reason },
  { $id: "StaffSetWorkspaceInternal", additionalProperties: false },
);
export type StaffSetWorkspaceInternal = Static<
  typeof StaffSetWorkspaceInternalSchema
>;

/**
 * POST /v1/staff/workspaces/:workspaceId/kardo-trial/extend: mueve el fin
 * de la prueba de Kardo `days` días desde hoy o desde su fin, lo que sea
 * más tarde. Sirve también para reabrir una prueba terminada.
 */
export const StaffExtendKardoTrialSchema = Type.Object(
  { days: Type.Integer({ minimum: 1, maximum: 60 }), reason: Reason },
  { $id: "StaffExtendKardoTrial", additionalProperties: false },
);
export type StaffExtendKardoTrial = Static<typeof StaffExtendKardoTrialSchema>;

/** GET /v1/staff/billing/access?state=… : organizaciones por estado. */
export const staffAccessFilters = [
  "trial",
  "limited",
  "paused",
  "deletion",
  "internal",
  "deleted",
] as const;
export type StaffAccessFilter = (typeof staffAccessFilters)[number];

export const StaffAccessWorkspaceSchema = Type.Object(
  {
    workspaceId: Uuid,
    workspaceName: Type.String({ maxLength: 120 }),
    ownerEmail: Type.Union([Type.String({ maxLength: 320 }), Type.Null()]),
    ...StaffWorkspaceAccessSchema.properties,
    planName: Type.Union([Type.String({ maxLength: 120 }), Type.Null()]),
    /** Fin de la prueba o de la cortesía vigente. */
    endsAt: NullableDateTime,
  },
  { additionalProperties: false },
);
export type StaffAccessWorkspace = Static<typeof StaffAccessWorkspaceSchema>;

export const StaffAccessWorkspaceListSchema = Type.Array(
  StaffAccessWorkspaceSchema,
  { $id: "StaffAccessWorkspaceList", maxItems: 200 },
);
export type StaffAccessWorkspaceList = Static<
  typeof StaffAccessWorkspaceListSchema
>;

/** GET /v1/staff/billing/cfdi?status=… : cola "Facturas por emitir". */
export const StaffCfdiRequestSchema = Type.Object(
  {
    ...CfdiRequestSchema.properties,
    workspaceId: Uuid,
    workspaceName: Type.String({ maxLength: 120 }),
    invoiceNumber: Type.Union([Type.String({ maxLength: 64 }), Type.Null()]),
    amountPaid: Cents,
    /** IVA incluido en el pago, en centavos (null si Stripe no lo separó). */
    tax: Type.Union([Type.Integer(), Type.Null()]),
    currency: Currency,
    paidAt: NullableDateTime,
    /** Datos fiscales con los que se pidió. */
    fiscal: Type.Object(
      {
        rfc: Type.String({ maxLength: 13 }),
        legalName: Type.String({ maxLength: 300 }),
        taxRegime: Type.String({ maxLength: 3 }),
        postalCode: Type.String({ maxLength: 5 }),
        cfdiUse: Type.String({ maxLength: 4 }),
        email: Type.String({ maxLength: 320 }),
      },
      { additionalProperties: false },
    ),
    /** Enlace al pago en el dashboard de Stripe (forma de pago real). */
    stripeInvoiceUrl: Type.Union([HttpsUrl, Type.Null()]),
    handledAt: NullableDateTime,
    /** Facturapi configurado en el Staff API (modo de su llave), o null:
     * solo emisión manual en el portal del SAT. */
    facturapi: Type.Union([
      Type.Literal("test"),
      Type.Literal("live"),
      Type.Null(),
    ]),
  },
  { additionalProperties: false },
);
export type StaffCfdiRequest = Static<typeof StaffCfdiRequestSchema>;

export const StaffCfdiRequestListSchema = Type.Array(StaffCfdiRequestSchema, {
  $id: "StaffCfdiRequestList",
  maxItems: 200,
});
export type StaffCfdiRequestList = Static<typeof StaffCfdiRequestListSchema>;

/** POST /v1/staff/billing/cfdi/:requestId/resolve */
export const StaffResolveCfdiSchema = Type.Object(
  {
    status: Type.Union([
      Type.Literal("issued"),
      Type.Literal("rejected"),
      Type.Literal("canceled"),
    ]),
    /** Requerido al marcar emitida. */
    satUuid: Type.Optional(SatUuid),
    /** Requerido al rechazar o cancelar (3 a 500). */
    notes: Type.Optional(Type.String({ maxLength: 500 })),
  },
  { $id: "StaffResolveCfdi", additionalProperties: false },
);
export type StaffResolveCfdi = Static<typeof StaffResolveCfdiSchema>;

/**
 * GET /v1/staff/billing/global-invoice?month=YYYY-MM: pagos del mes (hora de
 * México) sin CFDI pendiente ni emitido, para la factura global a público en
 * general (regla 2.7.1.21).
 */
export const StaffGlobalInvoiceSchema = Type.Object(
  {
    month: Type.String({ pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$" }),
    currency: Currency,
    total: Cents,
    tax: Type.Integer(),
    items: Type.Array(
      Type.Object(
        {
          invoiceId: StripeInvoiceId,
          number: Type.Union([Type.String({ maxLength: 64 }), Type.Null()]),
          workspaceName: Type.String({ maxLength: 120 }),
          paidAt: DateTime,
          total: Cents,
          tax: Type.Union([Type.Integer(), Type.Null()]),
        },
        { additionalProperties: false },
      ),
      { maxItems: 2000 },
    ),
  },
  { $id: "StaffGlobalInvoice", additionalProperties: false },
);
export type StaffGlobalInvoice = Static<typeof StaffGlobalInvoiceSchema>;

/**
 * The month for the accountant (Docs/fiscal/2026-10-separacion-cfdi.md):
 * every paid payment falls in exactly one path, with its IVA broken out,
 * plus refunds and, when Stripe answers, its reconciliation (charges,
 * refunds and fees with their IVA). Amounts in cents, IVA included.
 */
export const accountingPaths = [
  "individual",
  "individual_pending",
  "global",
  "internal",
] as const;
export type AccountingPath = (typeof accountingPaths)[number];

export const accountingWarningKinds = [
  "cfdi_pending",
  "cfdi_requested_late",
  "cfdi_canceled",
  "cfdi_test",
  "internal_payment",
  "balance_applied",
  "tax_mismatch",
  "refund",
  "stripe_unmatched",
  "kardo_unmatched_payment",
  "stripe_unavailable",
  "truncated",
] as const;
export type AccountingWarningKind = (typeof accountingWarningKinds)[number];

const AccountingAmounts = Type.Object(
  { count: Count, total: Cents, base: Cents, iva: Cents },
  { additionalProperties: false },
);
const StripeChargeId = Type.String({ pattern: "^(ch|py)_[A-Za-z0-9]{6,64}$" });

export const StaffAccountingMonthSchema = Type.Object(
  {
    month: Type.String({ pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$" }),
    currency: Currency,
    livemode: Type.Boolean(),
    generatedAt: DateTime,
    payments: Type.Array(
      Type.Object(
        {
          invoiceId: StripeInvoiceId,
          number: Type.Union([Type.String({ maxLength: 64 }), Type.Null()]),
          workspaceName: Type.String({ maxLength: 120 }),
          paidAt: DateTime,
          total: Cents,
          base: Cents,
          iva: Cents,
          refunded: Cents,
          path: Type.Union(accountingPaths.map((path) => Type.Literal(path))),
          satUuid: Type.Union([Type.String({ maxLength: 64 }), Type.Null()]),
          /** True for a Facturapi test CFDI (no fiscal validity). */
          cfdiTest: Type.Boolean(),
          stripeChargeId: Type.Union([StripeChargeId, Type.Null()]),
          /** Stripe's fee for this charge, without its IVA; null if unknown. */
          stripeFee: Type.Union([Cents, Type.Null()]),
          stripeFeeIva: Type.Union([Cents, Type.Null()]),
        },
        { additionalProperties: false },
      ),
      { maxItems: 5000 },
    ),
    refunds: Type.Array(
      Type.Object(
        {
          refundId: Type.String({ pattern: "^re_[A-Za-z0-9]{6,64}$" }),
          invoiceId: Type.Union([StripeInvoiceId, Type.Null()]),
          number: Type.Union([Type.String({ maxLength: 64 }), Type.Null()]),
          workspaceName: Type.String({ maxLength: 120 }),
          createdAt: DateTime,
          status: Type.String({ maxLength: 32 }),
          amount: Cents,
          base: Cents,
          iva: Cents,
          /** Path of the original payment; null if it is not in the mirror. */
          originalPath: Type.Union([
            ...accountingPaths.map((path) => Type.Literal(path)),
            Type.Null(),
          ]),
          originalSatUuid: Type.Union([
            Type.String({ maxLength: 64 }),
            Type.Null(),
          ]),
          originalMonth: Type.Union([
            Type.String({ pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$" }),
            Type.Null(),
          ]),
        },
        { additionalProperties: false },
      ),
      { maxItems: 5000 },
    ),
    totals: Type.Object(
      {
        individual: AccountingAmounts,
        individual_pending: AccountingAmounts,
        global: AccountingAmounts,
        internal: AccountingAmounts,
        all: AccountingAmounts,
        /** Succeeded refunds of the month. */
        refunds: AccountingAmounts,
      },
      { additionalProperties: false },
    ),
    /** Null when Stripe is not configured or did not answer. */
    stripe: Type.Union([
      Type.Object(
        {
          charges: Type.Object(
            { count: Count, amount: Cents },
            { additionalProperties: false },
          ),
          refunds: Type.Object(
            { count: Count, amount: Cents },
            { additionalProperties: false },
          ),
          /** Stripe fees of the month: without IVA, its IVA, and both. */
          fees: Type.Object(
            { amount: Cents, iva: Cents, total: Cents },
            { additionalProperties: false },
          ),
          /** What Stripe keeps for Kardo: charges − refunds − fees. */
          net: Type.Integer(),
          matchedCharges: Count,
        },
        { additionalProperties: false },
      ),
      Type.Null(),
    ]),
    warnings: Type.Array(
      Type.Object(
        {
          kind: Type.Union(
            accountingWarningKinds.map((kind) => Type.Literal(kind)),
          ),
          reference: Type.Union([Type.String({ maxLength: 80 }), Type.Null()]),
          message: Type.String({ maxLength: 400 }),
        },
        { additionalProperties: false },
      ),
      { maxItems: 500 },
    ),
  },
  { $id: "StaffAccountingMonth", additionalProperties: false },
);
export type StaffAccountingMonth = Static<typeof StaffAccountingMonthSchema>;

/** POST /v1/staff/billing/catalog/sync */
export const StaffBillingCatalogSyncSchema = Type.Object(
  { prices: Count, mappedToPlans: Count },
  { $id: "StaffBillingCatalogSync", additionalProperties: false },
);
export type StaffBillingCatalogSync = Static<
  typeof StaffBillingCatalogSyncSchema
>;

// ---------------------------------------------------------------------------
// Bajada de plan, opción B (ADR 023): elegir qué sigue activo.
// ---------------------------------------------------------------------------

/** Days the customer has to choose after moving to a smaller plan. */
export const PLAN_SELECTION_DAYS = 14;

export const PlanSelectionCandidateSchema = Type.Object(
  {
    id: Uuid,
    publicId: Type.String({ maxLength: 32 }),
    /** QR, NFC and others count as Touchpoints; Links have their own limit;
     * an organization of the account (ADR 024) is chosen first. */
    kind: Type.Union([
      Type.Literal("organization"),
      Type.Literal("touchpoint"),
      Type.Literal("link"),
    ]),
    /** The organization it belongs to (itself, for an organization). */
    workspaceId: Uuid,
    format: Type.String({ maxLength: 16 }),
    name: Type.Union([Type.String({ maxLength: 200 }), Type.Null()]),
    excluded: Type.Boolean(),
    /** Visits in the last 30 days; null without analytics. */
    visits: Type.Union([Count, Type.Null()]),
  },
  { $id: "PlanSelectionCandidate", additionalProperties: false },
);
export type PlanSelectionCandidate = Static<
  typeof PlanSelectionCandidateSchema
>;

export const PlanSelectionSchema = Type.Object(
  {
    /** The open window, or the last one; null when nothing was ever over. */
    overage: Type.Union([
      Type.Object(
        {
          planCode: Type.String({ maxLength: 64 }),
          planName: Type.String({ maxLength: 120 }),
          chooseBy: DateTime,
          chosenAt: NullableDateTime,
          appliedAt: NullableDateTime,
          resolved: Type.Boolean(),
        },
        { additionalProperties: false },
      ),
      Type.Null(),
    ]),
    limits: Type.Object(
      {
        organizations: Type.Union([Count, Type.Null()]),
        touchpoints: Type.Union([Count, Type.Null()]),
        links: Type.Union([Count, Type.Null()]),
      },
      { additionalProperties: false },
    ),
    candidates: Type.Array(PlanSelectionCandidateSchema, { maxItems: 5000 }),
    /** What Kardo keeps by itself if nobody chooses before `chooseBy`: the
     * same rule the server applies (the most visited first, up to each
     * limit). The chooser starts with these ticked, so the rule lives in
     * one place (domain audit A2-62). */
    suggestedKeep: Type.Optional(
      Type.Array(Uuid, { maxItems: 5000, uniqueItems: true }),
    ),
  },
  { $id: "PlanSelection", additionalProperties: false },
);
export type PlanSelection = Static<typeof PlanSelectionSchema>;

export const SavePlanSelectionSchema = Type.Object(
  { keep: Type.Array(Uuid, { maxItems: 5000, uniqueItems: true }) },
  { $id: "SavePlanSelection", additionalProperties: false },
);
export type SavePlanSelection = Static<typeof SavePlanSelectionSchema>;

export const SavedPlanSelectionSchema = Type.Object(
  { excluded: Count, included: Count },
  { $id: "SavedPlanSelection", additionalProperties: false },
);
export type SavedPlanSelection = Static<typeof SavedPlanSelectionSchema>;
