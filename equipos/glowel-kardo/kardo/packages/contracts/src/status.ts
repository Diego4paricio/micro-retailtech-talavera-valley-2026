import { type Static, Type } from "@sinclair/typebox";

// ---------------------------------------------------------------------------
// Estado del servicio (ADR 022). Lo calcula el Worker de estado
// (services/status-worker) y lo leen el panel, Operations y, después, una
// página pública. La parte pública nunca lleva nada técnico: ni direcciones,
// ni latencias, ni errores.
// ---------------------------------------------------------------------------

const Uuid = Type.String({ format: "uuid" });
const DateTime = Type.String({ format: "date-time" });

/** Áreas que ve el cliente, en el orden en que se muestran. */
export const statusComponentIds = [
  "pages",
  "panel",
  "publishing",
  "files",
  "analytics",
  "ai",
] as const;
export type StatusComponentId = (typeof statusComponentIds)[number];

export const StatusComponentIdSchema = Type.Union([
  Type.Literal("pages"),
  Type.Literal("panel"),
  Type.Literal("publishing"),
  Type.Literal("files"),
  Type.Literal("analytics"),
  Type.Literal("ai"),
]);

/** Nombres en palabras de cliente (panel, Operations y página pública). */
export const statusComponentLabels: Record<StatusComponentId, string> = {
  pages: "Páginas públicas (QR, NFC y Links)",
  panel: "Panel e inicio de sesión",
  publishing: "Publicar cambios",
  files: "Imágenes y archivos",
  analytics: "Visitas y formularios",
  ai: "IA de Kardo",
};

export const statusLevels = [
  "operational",
  "maintenance",
  "degraded",
  "partial_outage",
  "major_outage",
] as const;
export type StatusLevel = (typeof statusLevels)[number];

export const StatusLevelSchema = Type.Union([
  Type.Literal("operational"),
  Type.Literal("maintenance"),
  Type.Literal("degraded"),
  Type.Literal("partial_outage"),
  Type.Literal("major_outage"),
]);

/** Gravedad para comparar niveles: el general es el peor de las áreas. */
export const statusLevelRank: Record<StatusLevel, number> = {
  operational: 0,
  maintenance: 1,
  degraded: 2,
  partial_outage: 3,
  major_outage: 4,
};

export function worstStatusLevel(levels: readonly StatusLevel[]): StatusLevel {
  let worst: StatusLevel = "operational";
  for (const level of levels) {
    if (statusLevelRank[level] > statusLevelRank[worst]) worst = level;
  }
  return worst;
}

export const StatusIncidentKindSchema = Type.Union([
  Type.Literal("incident"),
  Type.Literal("maintenance"),
]);
export type StatusIncidentKind = Static<typeof StatusIncidentKindSchema>;

export const StatusIncidentImpactSchema = Type.Union([
  Type.Literal("degraded"),
  Type.Literal("partial_outage"),
  Type.Literal("major_outage"),
  Type.Literal("maintenance"),
]);
export type StatusIncidentImpact = Static<typeof StatusIncidentImpactSchema>;

/** Incidente: investigating → identified → monitoring → resolved.
 * Mantenimiento: scheduled → in_progress → completed. */
export const StatusUpdateKindSchema = Type.Union([
  Type.Literal("investigating"),
  Type.Literal("identified"),
  Type.Literal("monitoring"),
  Type.Literal("resolved"),
  Type.Literal("scheduled"),
  Type.Literal("in_progress"),
  Type.Literal("completed"),
]);
export type StatusUpdateKind = Static<typeof StatusUpdateKindSchema>;

export const STATUS_LIMITS = { title: 120, message: 1000 } as const;

export const PublicStatusIncidentSchema = Type.Object(
  {
    id: Uuid,
    kind: StatusIncidentKindSchema,
    title: Type.String({ maxLength: STATUS_LIMITS.title }),
    impact: StatusIncidentImpactSchema,
    components: Type.Array(StatusComponentIdSchema, {
      minItems: 1,
      maxItems: 6,
    }),
    startsAt: DateTime,
    endsAt: Type.Union([DateTime, Type.Null()]),
    resolvedAt: Type.Union([DateTime, Type.Null()]),
    updates: Type.Array(
      Type.Object(
        {
          status: StatusUpdateKindSchema,
          message: Type.String({ maxLength: STATUS_LIMITS.message }),
          at: DateTime,
        },
        { additionalProperties: false },
      ),
      { maxItems: 50 },
    ),
  },
  { additionalProperties: false },
);
export type PublicStatusIncident = Static<typeof PublicStatusIncidentSchema>;

export const ServiceStatusSchema = Type.Object(
  {
    overall: StatusLevelSchema,
    /** Última vez que corrieron las pruebas; `null` antes de la primera. */
    checkedAt: Type.Union([DateTime, Type.Null()]),
    components: Type.Array(
      Type.Object(
        {
          id: StatusComponentIdSchema,
          level: StatusLevelSchema,
          /** La falla viene de un proveedor (sin nombrarlo). */
          provider: Type.Boolean(),
          /** `false`: ninguna prueba de Kardo está configurada para esta
           * área y nadie reporta nada; el panel dice «Sin datos», nunca
           * «Funciona» (auditoría de dominios A2-69). */
          measured: Type.Optional(Type.Boolean()),
        },
        { additionalProperties: false },
      ),
    ),
    /** Incidentes abiertos y mantenimientos en curso. */
    incidents: Type.Array(PublicStatusIncidentSchema),
    /** Mantenimientos que todavía no empiezan. */
    upcoming: Type.Array(PublicStatusIncidentSchema),
  },
  { $id: "ServiceStatus", additionalProperties: false },
);
export type ServiceStatus = Static<typeof ServiceStatusSchema>;

// ---------------------------------------------------------------------------
// Detalle técnico para Operations (GET /internal/status del Worker)
// ---------------------------------------------------------------------------

export const StatusProbeDetailSchema = Type.Object(
  {
    id: Type.String({ maxLength: 40 }),
    component: StatusComponentIdSchema,
    configured: Type.Boolean(),
    ok: Type.Union([Type.Boolean(), Type.Null()]),
    slow: Type.Boolean(),
    latencyMs: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
    httpStatus: Type.Union([Type.Integer(), Type.Null()]),
    error: Type.Union([Type.String({ maxLength: 300 }), Type.Null()]),
    detail: Type.Union([Type.String({ maxLength: 300 }), Type.Null()]),
    consecutiveFailures: Type.Integer({ minimum: 0 }),
    consecutiveSuccesses: Type.Integer({ minimum: 0 }),
    checkedAt: Type.Union([DateTime, Type.Null()]),
  },
  { additionalProperties: false },
);
export type StatusProbeDetail = Static<typeof StatusProbeDetailSchema>;

export const StatusProviderDetailSchema = Type.Object(
  {
    provider: Type.Union([
      Type.Literal("cloudflare"),
      Type.Literal("supabase"),
      Type.Literal("google-cloud"),
      Type.Literal("anthropic"),
    ]),
    ok: Type.Boolean(),
    checkedAt: Type.Union([DateTime, Type.Null()]),
    error: Type.Union([Type.String({ maxLength: 300 }), Type.Null()]),
    /** Solo los componentes que Kardo usa y que no están operando bien. */
    issues: Type.Array(
      Type.Object(
        {
          name: Type.String({ maxLength: 200 }),
          level: StatusLevelSchema,
          components: Type.Array(StatusComponentIdSchema),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);
export type StatusProviderDetail = Static<typeof StatusProviderDetailSchema>;

export const StaffServiceStatusSchema = Type.Object(
  {
    status: ServiceStatusSchema,
    probes: Type.Array(StatusProbeDetailSchema),
    providers: Type.Array(StatusProviderDetailSchema),
    incidentsVersion: Type.Integer({ minimum: 0 }),
  },
  { $id: "StaffServiceStatus", additionalProperties: false },
);
export type StaffServiceStatus = Static<typeof StaffServiceStatusSchema>;

/** Lo que la Staff API envía al Worker (conjunto completo y versionado). */
export const StatusIncidentSetSchema = Type.Object(
  {
    version: Type.Integer({ minimum: 1 }),
    incidents: Type.Array(PublicStatusIncidentSchema, { maxItems: 100 }),
  },
  { $id: "StatusIncidentSet", additionalProperties: false },
);
export type StatusIncidentSet = Static<typeof StatusIncidentSetSchema>;

// ---------------------------------------------------------------------------
// Operations: incidentes y mantenimientos
// ---------------------------------------------------------------------------

export const StaffStatusIncidentSchema = Type.Object(
  {
    ...PublicStatusIncidentSchema.properties,
    createdBy: Type.Union([Type.String({ maxLength: 120 }), Type.Null()]),
    createdAt: DateTime,
  },
  { additionalProperties: false },
);
export type StaffStatusIncident = Static<typeof StaffStatusIncidentSchema>;

export const StaffStatusIncidentListSchema = Type.Object(
  {
    open: Type.Array(StaffStatusIncidentSchema),
    recent: Type.Array(StaffStatusIncidentSchema),
  },
  { $id: "StaffStatusIncidentList", additionalProperties: false },
);
export type StaffStatusIncidentList = Static<
  typeof StaffStatusIncidentListSchema
>;

export const CreateStatusIncidentSchema = Type.Object(
  {
    kind: StatusIncidentKindSchema,
    title: Type.String({ minLength: 1, maxLength: STATUS_LIMITS.title }),
    /** Un mantenimiento siempre es `maintenance`. */
    impact: StatusIncidentImpactSchema,
    components: Type.Array(StatusComponentIdSchema, {
      minItems: 1,
      maxItems: 6,
      uniqueItems: true,
    }),
    message: Type.String({ minLength: 1, maxLength: STATUS_LIMITS.message }),
    /** Mantenimiento: inicio y fin previstos (obligatorio el fin). */
    startsAt: Type.Optional(DateTime),
    endsAt: Type.Optional(Type.Union([DateTime, Type.Null()])),
  },
  { $id: "CreateStatusIncident", additionalProperties: false },
);
export type CreateStatusIncident = Static<typeof CreateStatusIncidentSchema>;

export const AddStatusUpdateSchema = Type.Object(
  {
    status: StatusUpdateKindSchema,
    message: Type.String({ minLength: 1, maxLength: STATUS_LIMITS.message }),
    /** Cambiar el impacto con la actualización (solo incidentes). */
    impact: Type.Optional(StatusIncidentImpactSchema),
  },
  { $id: "AddStatusUpdate", additionalProperties: false },
);
export type AddStatusUpdate = Static<typeof AddStatusUpdateSchema>;

const incidentFlow: readonly StatusUpdateKind[] = [
  "investigating",
  "identified",
  "monitoring",
  "resolved",
];
const maintenanceFlow: readonly StatusUpdateKind[] = [
  "scheduled",
  "in_progress",
  "completed",
];

/** Qué actualizaciones admite cada tipo. */
export function statusUpdateKindsFor(
  kind: StatusIncidentKind,
): readonly StatusUpdateKind[] {
  return kind === "incident" ? incidentFlow : maintenanceFlow;
}

/** La actualización que cierra cada tipo. */
export function closingStatusUpdate(
  kind: StatusIncidentKind,
): StatusUpdateKind {
  return kind === "incident" ? "resolved" : "completed";
}

// ---------------------------------------------------------------------------
// GET /health/ready del Customer API (solo con STATUS_PROBE_KEY)
// ---------------------------------------------------------------------------

export const HealthReadySchema = Type.Object(
  {
    service: Type.String({ maxLength: 40 }),
    /** `degraded`: responde, pero la base está lenta o hay muchos 5xx. */
    status: Type.Union([
      Type.Literal("ok"),
      Type.Literal("degraded"),
      Type.Literal("error"),
    ]),
    database: Type.Object(
      {
        ok: Type.Boolean(),
        latencyMs: Type.Integer({ minimum: 0 }),
      },
      { additionalProperties: false },
    ),
    /** `null` si la base no respondió. */
    publishQueue: Type.Union([
      Type.Object(
        {
          oldestPendingSeconds: Type.Integer({ minimum: 0 }),
          pendingJobs: Type.Integer({ minimum: 0 }),
        },
        { additionalProperties: false },
      ),
      Type.Null(),
    ]),
    /** Solo esta instancia (en Cloud Run cada una lleva su cuenta). */
    errors: Type.Object(
      {
        windowSeconds: Type.Integer({ minimum: 1 }),
        requests: Type.Integer({ minimum: 0 }),
        serverErrors: Type.Integer({ minimum: 0 }),
      },
      { additionalProperties: false },
    ),
  },
  { $id: "HealthReady", additionalProperties: false },
);
export type HealthReady = Static<typeof HealthReadySchema>;
