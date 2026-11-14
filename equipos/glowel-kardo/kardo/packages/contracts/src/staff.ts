import { type Static, Type } from "@sinclair/typebox";

// ---------------------------------------------------------------------------
// Kardo Operations (internal staff panel). Every endpoint requires an AAL2
// Supabase session of an active staff profile plus the listed permission, and
// never returns lead personal data (only counts).
// ---------------------------------------------------------------------------

const Uuid = Type.String({ format: "uuid" });
const DateTime = Type.String({ format: "date-time" });
const Count = Type.Integer({ minimum: 0 });
const Name = Type.String({ maxLength: 120 });
const NullableName = Type.Union([Name, Type.Null()]);
const Email = Type.Union([Type.String({ maxLength: 320 }), Type.Null()]);
const Cursor = Type.Union([Type.String({ maxLength: 200 }), Type.Null()]);

/** Permission catalog (kardo_staff.permissions). */
export const staffPermissions = {
  diagnosticsRead: "operations.diagnostics.read",
  metricsRead: "operations.metrics.read",
  customersRead: "customers.read",
  touchpointsRead: "touchpoints.operations.read",
  touchpointsWrite: "touchpoints.operations.write",
  touchpointsSuspend: "touchpoints.suspend.write",
  publicationsRetry: "publications.retry",
  auditRead: "audit.read",
  plansRead: "commercial.catalog.read",
  plansWrite: "commercial.catalog.write",
  staffManage: "staff.roles.manage",
  /** Suscripciones (ADR 019). */
  billingRead: "billing.read",
  billingWrite: "billing.write",
  billingRefund: "billing.refund",
  /** Notificaciones y estado del servicio (ADR 022). */
  notificationsRead: "notifications.read",
  notificationsSend: "notifications.send",
  notificationsBroadcast: "notifications.broadcast",
  statusRead: "status.read",
  statusWrite: "status.write",
  /** Piezas de Kardo: lotes, códigos y archivo del taller (ADR 026). */
  piecesRead: "pieces.read",
  piecesWrite: "pieces.write",
} as const;
export type StaffPermission =
  (typeof staffPermissions)[keyof typeof staffPermissions];

export const StaffWorkspaceKindSchema = Type.Union([
  Type.Literal("personal"),
  Type.Literal("organization"),
]);
export const StaffTouchpointStatusSchema = Type.Union([
  Type.Literal("prepared"),
  Type.Literal("available"),
  Type.Literal("assigned"),
  Type.Literal("active"),
  Type.Literal("paused"),
  Type.Literal("lost"),
  Type.Literal("replaced"),
  Type.Literal("retired"),
]);
export const StaffPublicationStatusSchema = Type.Union([
  Type.Literal("pending"),
  Type.Literal("processing"),
  Type.Literal("published"),
  Type.Literal("failed"),
  Type.Literal("superseded"),
]);
export const StaffChannelCountsSchema = Type.Object(
  { nfc: Count, qr: Count, link: Count },
  { additionalProperties: false },
);

// --- Metrics overview (GET /v1/staff/metrics/overview?days=7|30|90) --------

export const StaffMetricsQuerySchema = Type.Object(
  {
    days: Type.Optional(
      Type.Union([Type.Literal(7), Type.Literal(30), Type.Literal(90)]),
    ),
  },
  { additionalProperties: false },
);
export type StaffMetricsQuery = Static<typeof StaffMetricsQuerySchema>;

export const StaffMetricsOverviewSchema = Type.Object(
  {
    days: Type.Integer({ minimum: 1, maximum: 90 }),
    generatedAt: DateTime,
    totals: Type.Object(
      {
        customers: Count,
        workspaces: Count,
        organizations: Count,
        touchpoints: Count,
        activeTouchpoints: Count,
        suspendedTouchpoints: Count,
        experiences: Count,
        liveExperiences: Count,
        leads: Count,
        pendingPublications: Count,
        failedPublicationsLast24Hours: Count,
      },
      { additionalProperties: false },
    ),
    /** Same counters for the period, compared with the previous period. */
    period: Type.Object(
      {
        newCustomers: Count,
        newWorkspaces: Count,
        newTouchpoints: Count,
        publications: Count,
        leads: Count,
        previousNewCustomers: Count,
        previousNewTouchpoints: Count,
        previousPublications: Count,
        previousLeads: Count,
      },
      { additionalProperties: false },
    ),
    /** One row per day (UTC), oldest first, covering `days`. */
    daily: Type.Array(
      Type.Object(
        {
          date: Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
          newCustomers: Count,
          newTouchpoints: Count,
          publications: Count,
          failedPublications: Count,
          leads: Count,
        },
        { additionalProperties: false },
      ),
      { maxItems: 90 },
    ),
    /** Public traffic from Analytics Engine; null when not configured. */
    taps: Type.Union([
      Type.Object(
        {
          total: Count,
          previousTotal: Count,
          byChannel: StaffChannelCountsSchema,
          daily: Type.Array(
            Type.Object(
              {
                date: Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
                nfc: Count,
                qr: Count,
                link: Count,
              },
              { additionalProperties: false },
            ),
            { maxItems: 90 },
          ),
          clicks: Count,
        },
        { additionalProperties: false },
      ),
      Type.Null(),
    ]),
    experienceTypes: Type.Array(
      Type.Object(
        { type: Type.String({ maxLength: 32 }), total: Count, live: Count },
        { additionalProperties: false },
      ),
      { maxItems: 20 },
    ),
    touchpointStatuses: Type.Array(
      Type.Object(
        { status: StaffTouchpointStatusSchema, total: Count },
        { additionalProperties: false },
      ),
      { maxItems: 20 },
    ),
    plans: Type.Array(
      Type.Object(
        {
          planCode: Type.String({ maxLength: 64 }),
          name: Name,
          workspaces: Count,
        },
        { additionalProperties: false },
      ),
      { maxItems: 50 },
    ),
    /** Top workspaces by taps in the period (or by Touchpoints when taps are unavailable). */
    topWorkspaces: Type.Array(
      Type.Object(
        {
          workspaceId: Uuid,
          name: Name,
          kind: StaffWorkspaceKindSchema,
          taps: Count,
          touchpoints: Count,
          leads: Count,
        },
        { additionalProperties: false },
      ),
      { maxItems: 10 },
    ),
    publicationHealth: Type.Object(
      {
        succeeded: Count,
        failed: Count,
        pending: Count,
        /** 0–1 over finished jobs in the period; null without data. */
        successRate: Type.Union([
          Type.Number({ minimum: 0, maximum: 1 }),
          Type.Null(),
        ]),
        /** Median seconds from queued to published in the period. */
        medianSeconds: Type.Union([Type.Number({ minimum: 0 }), Type.Null()]),
      },
      { additionalProperties: false },
    ),
  },
  { $id: "StaffMetricsOverview", additionalProperties: false },
);
export type StaffMetricsOverview = Static<typeof StaffMetricsOverviewSchema>;

// --- Workspaces (customers) ------------------------------------------------

export const StaffWorkspaceQuerySchema = Type.Object(
  {
    /** Matches workspace name, public ID, member email or Touchpoint public ID. */
    query: Type.Optional(Type.String({ maxLength: 120 })),
    kind: Type.Optional(StaffWorkspaceKindSchema),
    cursor: Type.Optional(Type.String({ maxLength: 200 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  },
  { additionalProperties: false },
);
export type StaffWorkspaceQuery = Static<typeof StaffWorkspaceQuerySchema>;

export const StaffWorkspaceRowSchema = Type.Object(
  {
    id: Uuid,
    publicId: Type.String({ maxLength: 32 }),
    name: Name,
    kind: StaffWorkspaceKindSchema,
    createdAt: DateTime,
    ownerEmail: Email,
    members: Count,
    touchpoints: Count,
    activeTouchpoints: Count,
    suspendedTouchpoints: Count,
    experiences: Count,
    leads: Count,
    planCode: Type.Union([Type.String({ maxLength: 64 }), Type.Null()]),
    lastActivityAt: Type.Union([DateTime, Type.Null()]),
  },
  { additionalProperties: false },
);
export type StaffWorkspaceRow = Static<typeof StaffWorkspaceRowSchema>;

export const StaffWorkspacePageSchema = Type.Object(
  {
    items: Type.Array(StaffWorkspaceRowSchema, { maxItems: 100 }),
    nextCursor: Cursor,
  },
  { $id: "StaffWorkspacePage", additionalProperties: false },
);
export type StaffWorkspacePage = Static<typeof StaffWorkspacePageSchema>;

export const StaffTouchpointRowSchema = Type.Object(
  {
    id: Uuid,
    publicId: Type.String({ maxLength: 32 }),
    workspaceId: Type.Union([Uuid, Type.Null()]),
    workspaceName: NullableName,
    operationalName: NullableName,
    physicalType: Type.String({ maxLength: 16 }),
    status: StaffTouchpointStatusSchema,
    suspended: Type.Boolean(),
    groupName: NullableName,
    liveExperienceName: NullableName,
    liveExperienceType: Type.Union([
      Type.String({ maxLength: 32 }),
      Type.Null(),
    ]),
    lastPublicationStatus: Type.Union([
      StaffPublicationStatusSchema,
      Type.Null(),
    ]),
    createdAt: DateTime,
  },
  { additionalProperties: false },
);
export type StaffTouchpointRow = Static<typeof StaffTouchpointRowSchema>;

export const StaffAuditEventSchema = Type.Object(
  {
    id: Uuid,
    occurredAt: DateTime,
    workspaceId: Type.Union([Uuid, Type.Null()]),
    workspaceName: NullableName,
    actorType: Type.String({ maxLength: 32 }),
    actorSubject: Type.Union([Uuid, Type.Null()]),
    actorEmail: Email,
    action: Type.String({ maxLength: 128 }),
    targetType: Type.Union([Type.String({ maxLength: 64 }), Type.Null()]),
    targetId: Type.Union([Type.String({ maxLength: 128 }), Type.Null()]),
    result: Type.String({ maxLength: 32 }),
    metadata: Type.Object({}, { additionalProperties: true }),
  },
  { additionalProperties: false },
);
export type StaffAuditEvent = Static<typeof StaffAuditEventSchema>;

export const StaffWorkspaceDetailSchema = Type.Object(
  {
    workspace: StaffWorkspaceRowSchema,
    members: Type.Array(
      Type.Object(
        {
          profileId: Uuid,
          displayName: NullableName,
          email: Email,
          role: Type.Union([
            Type.Literal("owner"),
            Type.Literal("admin"),
            Type.Literal("editor"),
            Type.Literal("viewer"),
          ]),
          joinedAt: DateTime,
        },
        { additionalProperties: false },
      ),
      { maxItems: 200 },
    ),
    touchpoints: Type.Array(StaffTouchpointRowSchema, { maxItems: 500 }),
    experiences: Type.Array(
      Type.Object(
        {
          id: Uuid,
          name: Name,
          type: Type.String({ maxLength: 32 }),
          archived: Type.Boolean(),
          liveTouchpoints: Count,
          versions: Count,
          updatedAt: DateTime,
        },
        { additionalProperties: false },
      ),
      { maxItems: 500 },
    ),
    plan: Type.Union([
      Type.Object(
        {
          planId: Uuid,
          code: Type.String({ maxLength: 64 }),
          name: Name,
          assignedAt: DateTime,
        },
        { additionalProperties: false },
      ),
      Type.Null(),
    ]),
    /** Lead counts only; staff never reads visitor personal data here. */
    leads: Type.Object(
      { total: Count, last30Days: Count },
      { additionalProperties: false },
    ),
    taps30Days: Type.Union([Count, Type.Null()]),
    recentAudit: Type.Array(StaffAuditEventSchema, { maxItems: 25 }),
  },
  { $id: "StaffWorkspaceDetail", additionalProperties: false },
);
export type StaffWorkspaceDetail = Static<typeof StaffWorkspaceDetailSchema>;

// --- Touchpoints -----------------------------------------------------------

export const StaffTouchpointQuerySchema = Type.Object(
  {
    /** Public ID (exact or prefix ≥ 6 chars) or operational name. */
    query: Type.Optional(Type.String({ maxLength: 120 })),
    status: Type.Optional(StaffTouchpointStatusSchema),
    suspended: Type.Optional(Type.Boolean()),
    cursor: Type.Optional(Type.String({ maxLength: 200 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  },
  { additionalProperties: false },
);
export type StaffTouchpointQuery = Static<typeof StaffTouchpointQuerySchema>;

export const StaffTouchpointPageSchema = Type.Object(
  {
    items: Type.Array(StaffTouchpointRowSchema, { maxItems: 100 }),
    nextCursor: Cursor,
  },
  { $id: "StaffTouchpointPage", additionalProperties: false },
);
export type StaffTouchpointPage = Static<typeof StaffTouchpointPageSchema>;

export const StaffPublicationRowSchema = Type.Object(
  {
    id: Uuid,
    touchpointId: Uuid,
    touchpointPublicId: Type.String({ maxLength: 32 }),
    touchpointName: NullableName,
    workspaceId: Type.Union([Uuid, Type.Null()]),
    workspaceName: NullableName,
    experienceId: Uuid,
    experienceName: Name,
    experienceType: Type.String({ maxLength: 32 }),
    versionRevision: Type.Integer({ minimum: 1 }),
    status: StaffPublicationStatusSchema,
    jobStatus: Type.Union([
      Type.Literal("pending"),
      Type.Literal("running"),
      Type.Literal("succeeded"),
      Type.Literal("failed"),
      Type.Null(),
    ]),
    attempts: Count,
    lastError: Type.Union([Type.String({ maxLength: 500 }), Type.Null()]),
    createdAt: DateTime,
    publishedAt: Type.Union([DateTime, Type.Null()]),
  },
  { additionalProperties: false },
);
export type StaffPublicationRow = Static<typeof StaffPublicationRowSchema>;

export const StaffTouchpointDetailSchema = Type.Object(
  {
    touchpoint: StaffTouchpointRowSchema,
    urls: Type.Object(
      {
        link: Type.String({ maxLength: 512 }),
        nfc: Type.String({ maxLength: 512 }),
        qr: Type.String({ maxLength: 512 }),
      },
      { additionalProperties: false },
    ),
    suspension: Type.Union([
      Type.Object(
        {
          suspendedAt: DateTime,
          reason: Type.String({ maxLength: 500 }),
          suspendedByEmail: Email,
        },
        { additionalProperties: false },
      ),
      Type.Null(),
    ]),
    publications: Type.Array(StaffPublicationRowSchema, { maxItems: 20 }),
    taps30Days: Type.Union([Count, Type.Null()]),
  },
  { $id: "StaffTouchpointDetail", additionalProperties: false },
);
export type StaffTouchpointDetail = Static<typeof StaffTouchpointDetailSchema>;

/** POST /v1/staff/touchpoints/:id/suspension (DELETE lifts it). */
export const StaffSuspendTouchpointSchema = Type.Object(
  { reason: Type.String({ minLength: 5, maxLength: 500 }) },
  { $id: "StaffSuspendTouchpoint", additionalProperties: false },
);
export type StaffSuspendTouchpoint = Static<
  typeof StaffSuspendTouchpointSchema
>;

// --- Publications ------------------------------------------------------------

export const StaffPublicationQuerySchema = Type.Object(
  {
    status: Type.Optional(
      Type.Union([
        Type.Literal("failed"),
        Type.Literal("pending"),
        Type.Literal("processing"),
        Type.Literal("published"),
      ]),
    ),
    workspaceId: Type.Optional(Uuid),
    cursor: Type.Optional(Type.String({ maxLength: 200 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  },
  { additionalProperties: false },
);
export type StaffPublicationQuery = Static<typeof StaffPublicationQuerySchema>;

export const StaffPublicationPageSchema = Type.Object(
  {
    items: Type.Array(StaffPublicationRowSchema, { maxItems: 100 }),
    nextCursor: Cursor,
  },
  { $id: "StaffPublicationPage", additionalProperties: false },
);
export type StaffPublicationPage = Static<typeof StaffPublicationPageSchema>;

// --- Audit -------------------------------------------------------------------

export const StaffAuditQuerySchema = Type.Object(
  {
    workspaceId: Type.Optional(Uuid),
    actorType: Type.Optional(
      Type.Union([
        Type.Literal("customer"),
        Type.Literal("staff"),
        Type.Literal("service"),
      ]),
    ),
    /** Prefix match, e.g. `touchpoint.` or `staff.`. */
    action: Type.Optional(
      Type.String({ maxLength: 128, pattern: "^[a-z0-9_.-]*$" }),
    ),
    cursor: Type.Optional(Type.String({ maxLength: 200 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  },
  { additionalProperties: false },
);
export type StaffAuditQuery = Static<typeof StaffAuditQuerySchema>;

export const StaffAuditPageSchema = Type.Object(
  {
    items: Type.Array(StaffAuditEventSchema, { maxItems: 100 }),
    nextCursor: Cursor,
  },
  { $id: "StaffAuditPage", additionalProperties: false },
);
export type StaffAuditPage = Static<typeof StaffAuditPageSchema>;

// --- Plans (limits; prices live in Stripe, see billing.ts) -------------------

/**
 * Nullable values as JSON Schema type arrays, never `anyOf` unions: with
 * Fastify's `coerceTypes`, ajv tries the integer branch of an `anyOf` first
 * and turns `null` ("no limit") into `0` and `false` into `0` without undoing
 * it. A type array only coerces when the value matches none of the types.
 */
const EntitlementValue = Type.Unsafe<number | boolean | null>({
  type: ["integer", "boolean", "null"],
  minimum: 0,
});
const PlanEntitlements = Type.Record(
  Type.String({ pattern: "^[a-z0-9_.-]{2,128}$" }),
  EntitlementValue,
);

/** Well-known entitlement keys (see `billingEntitlements` in billing.ts for
 * labels). Limits are integers, features booleans; null means unlimited. */
export const planEntitlementKeys = [
  "touchpoints.max",
  "links.max",
  "members.max",
  "qr_designs.max",
  "assets.storage_mb",
  "ai.generations_month",
  "ai.spend_cents_month",
  "analytics.history_days",
  "custom_html.enabled",
  "leads.export",
  "leads.webhook",
] as const;

const PlanCatalogFields = {
  description: Type.Unsafe<string | null>({
    type: ["string", "null"],
    maxLength: 500,
  }),
  /** Shown in the customer panel's plan catalog. */
  isPublic: Type.Boolean(),
  /** Fallback plan when a subscription ends (at most one). */
  isDefault: Type.Boolean(),
  sortOrder: Type.Integer({ minimum: 0, maximum: 1000 }),
  trialDays: Type.Unsafe<number | null>({
    type: ["integer", "null"],
    minimum: 1,
    maximum: 90,
  }),
};

export const StaffPlanSchema = Type.Object(
  {
    id: Uuid,
    code: Type.String({ pattern: "^[a-z0-9_-]{2,64}$" }),
    name: Name,
    isActive: Type.Boolean(),
    entitlements: PlanEntitlements,
    ...PlanCatalogFields,
    workspaces: Count,
    /** Stripe Prices mapped to this plan (`metadata.kardo_plan_code`). */
    prices: Type.Array(
      Type.Object(
        {
          id: Type.String({ maxLength: 100 }),
          interval: Type.Union([Type.String({ maxLength: 16 }), Type.Null()]),
          unitAmount: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
          currency: Type.String({ maxLength: 3 }),
          active: Type.Boolean(),
          livemode: Type.Boolean(),
        },
        { additionalProperties: false },
      ),
      { maxItems: 20 },
    ),
    createdAt: DateTime,
  },
  { additionalProperties: false },
);
export type StaffPlan = Static<typeof StaffPlanSchema>;

export const StaffPlanListSchema = Type.Array(StaffPlanSchema, {
  $id: "StaffPlanList",
  maxItems: 50,
});
export type StaffPlanList = Static<typeof StaffPlanListSchema>;

export const StaffUpsertPlanSchema = Type.Object(
  {
    code: Type.String({ pattern: "^[a-z0-9_-]{2,64}$" }),
    name: Type.String({ minLength: 1, maxLength: 120 }),
    isActive: Type.Boolean(),
    entitlements: PlanEntitlements,
    description: Type.Optional(PlanCatalogFields.description),
    isPublic: Type.Optional(PlanCatalogFields.isPublic),
    isDefault: Type.Optional(PlanCatalogFields.isDefault),
    sortOrder: Type.Optional(PlanCatalogFields.sortOrder),
    trialDays: Type.Optional(PlanCatalogFields.trialDays),
  },
  { $id: "StaffUpsertPlan", additionalProperties: false },
);
export type StaffUpsertPlan = Static<typeof StaffUpsertPlanSchema>;

/** PUT /v1/staff/workspaces/:id/plan */
export const StaffAssignPlanSchema = Type.Object(
  {
    planId: Uuid,
    reason: Type.String({ minLength: 3, maxLength: 500 }),
    /** Optional end of a courtesy plan; after it the subscription or the
     * default plan governs again. */
    until: Type.Optional(
      Type.Unsafe<string | null>({
        type: ["string", "null"],
        format: "date-time",
      }),
    ),
    /** ADR 024: organizations of a custom plan (Corporativo «a la medida»);
     * null or absent: the plan's own number. The plan goes to the person's
     * billing account (an internal organization keeps its own). */
    organizationsMax: Type.Optional(
      Type.Unsafe<number | null>({
        type: ["integer", "null"],
        minimum: 0,
        maximum: 1000,
      }),
    ),
  },
  { $id: "StaffAssignPlan", additionalProperties: false },
);
export type StaffAssignPlan = Static<typeof StaffAssignPlanSchema>;

// --- Staff directory (read-only; role changes need step-up, later) ------------

export const StaffMemberListSchema = Type.Array(
  Type.Object(
    {
      id: Uuid,
      email: Email,
      displayName: NullableName,
      status: Type.Union([
        Type.Literal("invited"),
        Type.Literal("active"),
        Type.Literal("suspended"),
        Type.Literal("revoked"),
      ]),
      roles: Type.Array(Type.String({ maxLength: 64 }), { maxItems: 10 }),
      createdAt: DateTime,
    },
    { additionalProperties: false },
  ),
  { $id: "StaffMemberList", maxItems: 200 },
);
export type StaffMemberList = Static<typeof StaffMemberListSchema>;
