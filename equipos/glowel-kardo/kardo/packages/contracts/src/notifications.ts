import { type Static, Type } from "@sinclair/typebox";

// ---------------------------------------------------------------------------
// Notificaciones de Kardo (ADR 022). El staff las escribe en Operations y
// cada persona las lee en la campana del panel. Solo en la campana: no hay
// correo. La audiencia se evalúa al leer.
// ---------------------------------------------------------------------------

const Uuid = Type.String({ format: "uuid" });
const DateTime = Type.String({ format: "date-time" });
const Count = Type.Integer({ minimum: 0 });
const Cursor = Type.Union([Type.String({ maxLength: 200 }), Type.Null()]);

export const NOTIFICATION_LIMITS = {
  title: 120,
  body: 4000,
  actionLabel: 40,
  actionUrl: 500,
  planCodes: 20,
} as const;

export const notificationCategories = [
  "news",
  "maintenance",
  "account",
  "tip",
] as const;
export type NotificationCategory = (typeof notificationCategories)[number];

export const NotificationCategorySchema = Type.Union([
  Type.Literal("news"),
  Type.Literal("maintenance"),
  Type.Literal("account"),
  Type.Literal("tip"),
]);

/** Lo que ve el panel: las categorías del staff y «lead», el aviso de cada
 * solicitud nueva. «lead» solo lo escribe la base (un trigger en
 * kardo_core.leads, relevo 37 C3c), nunca Operations. */
export const customerNotificationCategories = [
  ...notificationCategories,
  "lead",
] as const;
export type CustomerNotificationCategory =
  (typeof customerNotificationCategories)[number];

export const CustomerNotificationCategorySchema = Type.Union([
  ...NotificationCategorySchema.anyOf,
  Type.Literal("lead"),
]);

/** Ruta del panel ("/billing", "/touchpoints?x=1") o una dirección https. */
export const NotificationActionSchema = Type.Object(
  {
    label: Type.String({
      minLength: 1,
      maxLength: NOTIFICATION_LIMITS.actionLabel,
    }),
    url: Type.String({
      minLength: 1,
      maxLength: NOTIFICATION_LIMITS.actionUrl,
    }),
  },
  { additionalProperties: false },
);
export type NotificationAction = Static<typeof NotificationActionSchema>;

// ---------------------------------------------------------------------------
// Panel del cliente
// ---------------------------------------------------------------------------

export const NotificationSchema = Type.Object(
  {
    id: Uuid,
    category: CustomerNotificationCategorySchema,
    title: Type.String({ maxLength: NOTIFICATION_LIMITS.title }),
    body: Type.String({ maxLength: NOTIFICATION_LIMITS.body }),
    action: Type.Union([NotificationActionSchema, Type.Null()]),
    pinned: Type.Boolean(),
    publishedAt: DateTime,
    editedAt: Type.Union([DateTime, Type.Null()]),
    expiresAt: Type.Union([DateTime, Type.Null()]),
    readAt: Type.Union([DateTime, Type.Null()]),
    /** Solo cuando va dirigida a una organización. */
    workspace: Type.Union([
      Type.Object(
        { id: Uuid, name: Type.String({ maxLength: 120 }) },
        { additionalProperties: false },
      ),
      Type.Null(),
    ]),
  },
  { $id: "Notification", additionalProperties: false },
);
export type Notification = Static<typeof NotificationSchema>;

export const NotificationInboxSchema = Type.Object(
  {
    items: Type.Array(NotificationSchema, { maxItems: 100 }),
    unreadCount: Count,
    /** Hay no leídas publicadas después de la última vez que se abrió la
     * campana: el panel se abre solo, una vez. */
    autoOpen: Type.Boolean(),
    nextCursor: Cursor,
  },
  { $id: "NotificationInbox", additionalProperties: false },
);
export type NotificationInbox = Static<typeof NotificationInboxSchema>;

export const NotificationInboxQuerySchema = Type.Object(
  {
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
    cursor: Type.Optional(Type.String({ maxLength: 200 })),
    unread: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
export type NotificationInboxQuery = Static<
  typeof NotificationInboxQuerySchema
>;

// ---------------------------------------------------------------------------
// Operations (staff)
// ---------------------------------------------------------------------------

export const notificationBillingStates = [
  "trial",
  "subscribed",
  "manual",
  "none",
] as const;
export type NotificationBillingState =
  (typeof notificationBillingStates)[number];

const MembershipRoleSchema = Type.Union([
  Type.Literal("owner"),
  Type.Literal("admin"),
  Type.Literal("editor"),
  Type.Literal("viewer"),
]);

const PlanCodesSchema = Type.Array(
  Type.String({ pattern: "^[a-z0-9_-]{2,64}$" }),
  { minItems: 1, maxItems: NOTIFICATION_LIMITS.planCodes, uniqueItems: true },
);
const BillingStatesSchema = Type.Array(
  Type.Union([
    Type.Literal("trial"),
    Type.Literal("subscribed"),
    Type.Literal("manual"),
    Type.Literal("none"),
  ]),
  { minItems: 1, maxItems: 4, uniqueItems: true },
);
const AccountTypesSchema = Type.Array(
  Type.Union([Type.Literal("personal"), Type.Literal("business")]),
  { minItems: 1, maxItems: 2, uniqueItems: true },
);
const RolesSchema = Type.Array(MembershipRoleSchema, {
  minItems: 1,
  maxItems: 4,
  uniqueItems: true,
});

/**
 * A quién llega. Un solo objeto (no una unión): Fastify quita por defecto las
 * propiedades desconocidas y, con una unión de objetos, las borraría al
 * probar cada rama. La forma exacta la revisa `checkNotificationAudience`.
 *
 * - `all`: todos; `roles` opcional.
 * - `segment`: al menos uno de `planCodes`, `billingStates`, `accountTypes`;
 *   `roles` opcional.
 * - `workspace`: `workspaceId`; `roles` opcional.
 * - `profile`: `profileId`; sin filtros.
 */
export const NotificationAudienceSchema = Type.Object(
  {
    kind: Type.Union([
      Type.Literal("all"),
      Type.Literal("segment"),
      Type.Literal("workspace"),
      Type.Literal("profile"),
    ]),
    workspaceId: Type.Optional(Uuid),
    profileId: Type.Optional(Uuid),
    planCodes: Type.Optional(PlanCodesSchema),
    billingStates: Type.Optional(BillingStatesSchema),
    accountTypes: Type.Optional(AccountTypesSchema),
    roles: Type.Optional(RolesSchema),
  },
  { $id: "NotificationAudience", additionalProperties: false },
);
export type NotificationAudience = Static<typeof NotificationAudienceSchema>;

/** `null` si la audiencia es válida; si no, el motivo (código estable). */
export function checkNotificationAudience(
  audience: NotificationAudience,
): "AUDIENCE_INVALID" | null {
  const hasSegmentFilter =
    Boolean(audience.planCodes?.length) ||
    Boolean(audience.billingStates?.length) ||
    Boolean(audience.accountTypes?.length);
  const hasWorkspace = audience.workspaceId !== undefined;
  const hasProfile = audience.profileId !== undefined;
  switch (audience.kind) {
    case "all":
      return hasSegmentFilter || hasWorkspace || hasProfile
        ? "AUDIENCE_INVALID"
        : null;
    case "segment":
      return !hasSegmentFilter || hasWorkspace || hasProfile
        ? "AUDIENCE_INVALID"
        : null;
    case "workspace":
      return !hasWorkspace || hasProfile || hasSegmentFilter
        ? "AUDIENCE_INVALID"
        : null;
    case "profile":
      return !hasProfile ||
        hasWorkspace ||
        hasSegmentFilter ||
        audience.roles !== undefined
        ? "AUDIENCE_INVALID"
        : null;
  }
}

/** Mandar a todos o a un segmento exige `notifications.broadcast`. */
export function isBroadcastAudience(audience: NotificationAudience): boolean {
  return audience.kind === "all" || audience.kind === "segment";
}

export const CreateStaffNotificationSchema = Type.Object(
  {
    category: NotificationCategorySchema,
    title: Type.String({ minLength: 1, maxLength: NOTIFICATION_LIMITS.title }),
    body: Type.String({ minLength: 1, maxLength: NOTIFICATION_LIMITS.body }),
    action: Type.Optional(Type.Union([NotificationActionSchema, Type.Null()])),
    audience: NotificationAudienceSchema,
    pinned: Type.Optional(Type.Boolean()),
    /** Sin fecha: se publica al guardar. */
    publishAt: Type.Optional(Type.Union([DateTime, Type.Null()])),
    expiresAt: Type.Optional(Type.Union([DateTime, Type.Null()])),
  },
  { $id: "CreateStaffNotification", additionalProperties: false },
);
export type CreateStaffNotification = Static<
  typeof CreateStaffNotificationSchema
>;

/** La audiencia no se edita: para cambiarla se retira y se crea otra. */
export const UpdateStaffNotificationSchema = Type.Object(
  {
    category: Type.Optional(NotificationCategorySchema),
    title: Type.Optional(
      Type.String({ minLength: 1, maxLength: NOTIFICATION_LIMITS.title }),
    ),
    body: Type.Optional(
      Type.String({ minLength: 1, maxLength: NOTIFICATION_LIMITS.body }),
    ),
    action: Type.Optional(Type.Union([NotificationActionSchema, Type.Null()])),
    pinned: Type.Optional(Type.Boolean()),
    publishAt: Type.Optional(DateTime),
    expiresAt: Type.Optional(Type.Union([DateTime, Type.Null()])),
  },
  {
    $id: "UpdateStaffNotification",
    additionalProperties: false,
    minProperties: 1,
  },
);
export type UpdateStaffNotification = Static<
  typeof UpdateStaffNotificationSchema
>;

export const StaffNotificationStateSchema = Type.Union([
  Type.Literal("scheduled"),
  Type.Literal("active"),
  Type.Literal("expired"),
  Type.Literal("retired"),
]);
export type StaffNotificationState = Static<
  typeof StaffNotificationStateSchema
>;

export const StaffNotificationSchema = Type.Object(
  {
    id: Uuid,
    category: NotificationCategorySchema,
    title: Type.String({ maxLength: NOTIFICATION_LIMITS.title }),
    body: Type.String({ maxLength: NOTIFICATION_LIMITS.body }),
    action: Type.Union([NotificationActionSchema, Type.Null()]),
    audience: NotificationAudienceSchema,
    /** Para mostrar la audiencia sin otra consulta. */
    audienceLabel: Type.Object(
      {
        workspaceName: Type.Union([Type.String(), Type.Null()]),
        profileEmail: Type.Union([Type.String(), Type.Null()]),
      },
      { additionalProperties: false },
    ),
    pinned: Type.Boolean(),
    state: StaffNotificationStateSchema,
    publishAt: DateTime,
    expiresAt: Type.Union([DateTime, Type.Null()]),
    editedAt: Type.Union([DateTime, Type.Null()]),
    retiredAt: Type.Union([DateTime, Type.Null()]),
    createdAt: DateTime,
    createdBy: Type.Union([Type.String({ maxLength: 120 }), Type.Null()]),
    /** Cuántas personas la leyeron (nunca quiénes). */
    reads: Count,
  },
  { $id: "StaffNotification", additionalProperties: false },
);
export type StaffNotification = Static<typeof StaffNotificationSchema>;

export const StaffNotificationPageSchema = Type.Object(
  {
    items: Type.Array(StaffNotificationSchema),
    nextCursor: Cursor,
  },
  { $id: "StaffNotificationPage", additionalProperties: false },
);
export type StaffNotificationPage = Static<typeof StaffNotificationPageSchema>;

export const StaffNotificationQuerySchema = Type.Object(
  {
    state: Type.Optional(StaffNotificationStateSchema),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
    cursor: Type.Optional(Type.String({ maxLength: 200 })),
  },
  { additionalProperties: false },
);
export type StaffNotificationQuery = Static<
  typeof StaffNotificationQuerySchema
>;

export const NotificationAudienceEstimateSchema = Type.Object(
  { profiles: Count, workspaces: Count },
  { $id: "NotificationAudienceEstimate", additionalProperties: false },
);
export type NotificationAudienceEstimate = Static<
  typeof NotificationAudienceEstimateSchema
>;

export const StaffProfileLookupSchema = Type.Object(
  {
    items: Type.Array(
      Type.Object(
        {
          id: Uuid,
          email: Type.String({ maxLength: 320 }),
          displayName: Type.Union([
            Type.String({ maxLength: 120 }),
            Type.Null(),
          ]),
          workspaces: Count,
        },
        { additionalProperties: false },
      ),
      { maxItems: 10 },
    ),
  },
  { $id: "StaffProfileLookup", additionalProperties: false },
);
export type StaffProfileLookup = Static<typeof StaffProfileLookupSchema>;

const panelPathPattern = /^\/[A-Za-z0-9/_-]*(\?[A-Za-z0-9=&_-]*)?$/;

/**
 * Normaliza el destino del botón de una notificación: una ruta del panel
 * ("/billing") tal cual, o una dirección https sin credenciales. Cualquier
 * otra cosa (`javascript:`, `http:`, `//otro.sitio`) es `null`. La misma
 * regla vive en el CHECK de `kardo_core.notifications.action_url`.
 */
export function normalizeNotificationActionUrl(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > NOTIFICATION_LIMITS.actionUrl) {
    return null;
  }
  if (trimmed.startsWith("/")) {
    return panelPathPattern.test(trimmed) && !trimmed.startsWith("//")
      ? trimmed
      : null;
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  if (!url.hostname.includes(".")) return null;
  const normalized = url.toString();
  return normalized.length <= NOTIFICATION_LIMITS.actionUrl &&
    !/[\s<>"]/.test(normalized)
    ? normalized
    : null;
}

/** `true` si el destino es una ruta del panel (se abre en la misma pestaña). */
export function isPanelActionUrl(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//");
}
