import { type Static, type TSchema, Type } from "@sinclair/typebox";
import { CustomHtmlSchema } from "./custom-html.js";
import { PageDesignSchema } from "./design.js";
import { KitPanelGrantSchema, PieceModelSchema } from "./pieces.js";

export const ApiErrorSchema = Type.Object(
  {
    code: Type.String({ examples: ["AUTH_REQUIRED"] }),
    message: Type.String(),
    requestId: Type.String(),
    // Extra detail some errors carry; declared so response serialization
    // keeps it. PLAN_LIMIT (ADR 019): which limit, its value and usage.
    key: Type.Optional(Type.String({ maxLength: 128 })),
    limit: Type.Optional(
      Type.Unsafe<number | null>({ type: ["integer", "null"] }),
    ),
    usage: Type.Optional(
      Type.Unsafe<number | null>({ type: ["integer", "null"] }),
    ),
    planCode: Type.Optional(
      Type.Unsafe<string | null>({ type: ["string", "null"] }),
    ),
    /** CUSTOM_HTML_LIMIT: generations left today. */
    remainingToday: Type.Optional(Type.Integer({ minimum: 0 })),
    /** PLAN_REQUIRED (ADR 020 §4): `limited` or `paused`. */
    accessState: Type.Optional(Type.String({ maxLength: 16 })),
  },
  { $id: "ApiError" },
);

export type ApiError = Static<typeof ApiErrorSchema>;

export const HealthSchema = Type.Object(
  {
    service: Type.String(),
    status: Type.Literal("ok"),
    requestId: Type.String(),
  },
  { $id: "Health" },
);

export type Health = Static<typeof HealthSchema>;

export const CustomerSessionSchema = Type.Object(
  {
    subject: Type.String({ format: "uuid" }),
    email: Type.String({ format: "email" }),
  },
  { $id: "CustomerSession" },
);

export type CustomerSession = Static<typeof CustomerSessionSchema>;

export const StaffSessionSchema = Type.Object(
  {
    subject: Type.String({ format: "uuid" }),
    email: Type.String({ format: "email" }),
    displayName: Type.Union([Type.String({ maxLength: 120 }), Type.Null()]),
    permissions: Type.Array(Type.String({ minLength: 3, maxLength: 128 })),
  },
  { $id: "StaffSession" },
);

export type StaffSession = Static<typeof StaffSessionSchema>;

export const StaffDiagnosticsSchema = Type.Object(
  {
    touchpointsAwaitingAssignment: Type.Integer({ minimum: 0 }),
    pendingPublications: Type.Integer({ minimum: 0 }),
    failedPublicationsLast24Hours: Type.Integer({ minimum: 0 }),
  },
  { $id: "StaffDiagnostics" },
);

export type StaffDiagnostics = Static<typeof StaffDiagnosticsSchema>;

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const SafeTextSchema = Type.String({ minLength: 1, maxLength: 120 });
// `format: uri` alone accepts `javascript:` and `data:`; every customer-supplied
// public URL is HTTPS-only. Servers still normalize and re-validate the value.
const SafeUrlSchema = Type.String({
  format: "uri",
  maxLength: 2048,
  pattern: "^https://",
});
const ItemIdSchema = Type.String({ pattern: "^[a-zA-Z0-9_-]{1,64}$" });
const CurrencySchema = Type.String({ pattern: "^[A-Z]{3}$" });
const PriceSchema = Type.Number({ minimum: 0, maximum: 10_000_000 });
const DateTimeSchema = Type.String({ format: "date-time" });
const UuidSchema = Type.String({ format: "uuid" });

export const customerRoles = ["owner", "admin", "editor", "viewer"] as const;
export const CustomerRoleSchema = Type.Union([
  Type.Literal("owner"),
  Type.Literal("admin"),
  Type.Literal("editor"),
  Type.Literal("viewer"),
]);
export type CustomerRole = Static<typeof CustomerRoleSchema>;
/** Roles that can be granted through invitations or role changes. */
export const AssignableRoleSchema = Type.Union([
  Type.Literal("admin"),
  Type.Literal("editor"),
  Type.Literal("viewer"),
]);
export type AssignableRole = Static<typeof AssignableRoleSchema>;

// ---------------------------------------------------------------------------
// Workspaces, profile and organization
// ---------------------------------------------------------------------------

/** Personal o de negocio: la primera pregunta del alta (1-oct-2026). */
export const AccountTypeSchema = Type.Union([
  Type.Literal("personal"),
  Type.Literal("business"),
]);

export type AccountType = Static<typeof AccountTypeSchema>;

export const CustomerWorkspaceSchema = Type.Object(
  {
    id: UuidSchema,
    publicId: Type.String({ minLength: 16, maxLength: 32 }),
    name: Type.String({ minLength: 1, maxLength: 120 }),
    kind: Type.Union([Type.Literal("personal"), Type.Literal("organization")]),
    role: CustomerRoleSchema,
    /**
     * Espacio personal de quien entró por invitación y nunca hizo el alta
     * (relevo 20, T3): el panel lo esconde del selector y ofrece "Crear mi
     * propio negocio". Solo en la lista de espacios.
     */
    setupPending: Type.Optional(Type.Boolean()),
    /** Esa persona aún no usa su prueba de 15 días (una por persona). */
    trialAvailable: Type.Optional(Type.Boolean()),
    /**
     * Lo que la persona declaró en el alta: cuenta personal o de negocio.
     * Es de protocolo: las dos son organizaciones y pueden invitar. Null en
     * los espacios de antes de esa pregunta.
     */
    accountType: Type.Optional(Type.Union([AccountTypeSchema, Type.Null()])),
    /**
     * Dirección pública del negocio: kardo.com.mx/<slug> (rediseño de
     * Links, 2026-10-04). Null hasta que el dueño la elige (Primeros pasos,
     * paso 1, o su primer Link).
     */
    slug: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    /** Last time the address changed; the next change waits 7 days. Null
     * while it has not changed since it was first chosen. */
    slugChangedAt: Type.Optional(Type.Union([DateTimeSchema, Type.Null()])),
    /** The Link that kardo.com.mx/<slug> opens (the first one, by default). */
    mainLinkId: Type.Optional(Type.Union([UuidSchema, Type.Null()])),
  },
  { $id: "CustomerWorkspace" },
);

export type CustomerWorkspace = Static<typeof CustomerWorkspaceSchema>;

export const CustomerWorkspaceListSchema = Type.Array(CustomerWorkspaceSchema, {
  $id: "CustomerWorkspaceList",
});

export const CompleteCustomerOnboardingSchema = Type.Object(
  {
    workspaceName: Type.String({ minLength: 1, maxLength: 120 }),
    /**
     * Plan elegido en /precios/ para la prueba de 15 días (ADR 020). Sin él,
     * o si no está en venta, la prueba es del plan por defecto de la prueba.
     */
    plan: Type.Optional(Type.String({ pattern: "^[a-z0-9_-]{2,64}$" })),
    billingInterval: Type.Optional(
      Type.Union([Type.Literal("month"), Type.Literal("year")]),
    ),
    /** Personal o de negocio (la primera pregunta del alta). */
    accountType: Type.Optional(AccountTypeSchema),
    /**
     * La persona, no el negocio (dueño, 2026-10-04: «lo llamas como el
     * nombre del negocio»): su nombre completo y cómo le gusta que le
     * digan, para el saludo del panel y los correos. Mismos límites que
     * `PROFILE_LIMITS` (120 y 60).
     */
    displayName: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
    preferredName: Type.Optional(Type.String({ minLength: 1, maxLength: 60 })),
    /**
     * The giro chosen at sign up. It is the ORGANIZATION's (domain audit
     * A2-55): the server keeps it in the organization profile when that has
     * none yet, so templates, the AI and Primeros pasos see it. One of
     * `industries` (checked by the server; this list is declared below).
     */
    industry: Type.Optional(Type.String({ pattern: "^[a-z]{2,32}$" })),
  },
  { $id: "CompleteCustomerOnboarding", additionalProperties: false },
);

export type CompleteCustomerOnboarding = Static<
  typeof CompleteCustomerOnboardingSchema
>;

export const UpdateWorkspaceSchema = Type.Object(
  { name: Type.String({ minLength: 1, maxLength: 120 }) },
  { $id: "UpdateWorkspace", additionalProperties: false },
);
export type UpdateWorkspace = Static<typeof UpdateWorkspaceSchema>;

export const CreateOrganizationSchema = Type.Object(
  { name: Type.String({ minLength: 1, maxLength: 120 }) },
  { $id: "CreateOrganization", additionalProperties: false },
);
export type CreateOrganization = Static<typeof CreateOrganizationSchema>;

/** Versions of the public legal texts (Docs/legal) the panel asks to accept.
 * Bump them when a new version is published: every account sees the
 * acceptance gate again. */
export const legalVersions = { terms: "1.1", privacy: "1.1" } as const;

const LegalVersionSchema = Type.String({
  pattern: "^[0-9]{1,3}\\.[0-9]{1,3}$",
});

export const PROFILE_LIMITS = {
  displayName: 120,
  preferredName: 60,
  timeZone: 64,
} as const;

const HourCycleSchema = Type.Union([Type.Literal("h12"), Type.Literal("h23")]);
export type HourCycle = Static<typeof HourCycleSchema>;
const LocaleSchema = Type.Literal("es-MX");

export const CustomerProfileSchema = Type.Object(
  {
    subject: UuidSchema,
    email: Type.String({ format: "email" }),
    displayName: Type.Union([Type.String({ maxLength: 120 }), Type.Null()]),
    /** Clickwrap evidence: null until the Terms and Privacy Notice are accepted. */
    termsAcceptedAt: Type.Optional(
      Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    ),
    termsVersion: Type.Optional(Type.Union([LegalVersionSchema, Type.Null()])),
    privacyVersion: Type.Optional(
      Type.Union([LegalVersionSchema, Type.Null()]),
    ),
    /** Preferencias (ADR 023). How Kardo greets the person; null = the
     * first word of `displayName`. */
    preferredName: Type.Optional(
      Type.Union([
        Type.String({ maxLength: PROFILE_LIMITS.preferredName }),
        Type.Null(),
      ]),
    ),
    /** IANA zone; null = the browser's. */
    timeZone: Type.Optional(
      Type.Union([
        Type.String({ maxLength: PROFILE_LIMITS.timeZone }),
        Type.Null(),
      ]),
    ),
    /** h12 = 3:30 p. m., h23 = 15:30; null = the language's. */
    hourCycle: Type.Optional(Type.Union([HourCycleSchema, Type.Null()])),
    /** The interface exists only in Mexican Spanish today. */
    locale: Type.Optional(LocaleSchema),
    /** Permission to receive Kardo's news by email. Security and billing
     * emails never depend on it. */
    marketingEmails: Type.Optional(Type.Boolean()),
  },
  { $id: "CustomerProfile", additionalProperties: false },
);
export type CustomerProfile = Static<typeof CustomerProfileSchema>;

/** PATCH /v1/me/profile: any subset; `null` clears a preference. */
export const UpdateCustomerProfileSchema = Type.Object(
  {
    displayName: Type.Optional(
      Type.String({ minLength: 1, maxLength: PROFILE_LIMITS.displayName }),
    ),
    preferredName: Type.Optional(
      Type.Union([
        Type.String({ minLength: 1, maxLength: PROFILE_LIMITS.preferredName }),
        Type.Null(),
      ]),
    ),
    timeZone: Type.Optional(
      Type.Union([
        Type.String({ minLength: 1, maxLength: PROFILE_LIMITS.timeZone }),
        Type.Null(),
      ]),
    ),
    hourCycle: Type.Optional(Type.Union([HourCycleSchema, Type.Null()])),
    locale: Type.Optional(LocaleSchema),
    marketingEmails: Type.Optional(Type.Boolean()),
  },
  {
    $id: "UpdateCustomerProfile",
    additionalProperties: false,
    minProperties: 1,
  },
);
export type UpdateCustomerProfile = Static<typeof UpdateCustomerProfileSchema>;

/** POST /v1/me/terms-acceptance — the server stamps the time. */
export const AcceptLegalTermsSchema = Type.Object(
  { termsVersion: LegalVersionSchema, privacyVersion: LegalVersionSchema },
  { $id: "AcceptLegalTerms", additionalProperties: false },
);
export type AcceptLegalTerms = Static<typeof AcceptLegalTermsSchema>;

export const WorkspaceMemberSchema = Type.Object(
  {
    profileId: UuidSchema,
    displayName: Type.Union([Type.String({ maxLength: 120 }), Type.Null()]),
    email: Type.Union([Type.String({ maxLength: 320 }), Type.Null()]),
    role: CustomerRoleSchema,
    joinedAt: DateTimeSchema,
    isCurrentUser: Type.Boolean(),
  },
  { $id: "WorkspaceMember", additionalProperties: false },
);
export type WorkspaceMember = Static<typeof WorkspaceMemberSchema>;
export const WorkspaceMemberListSchema = Type.Array(WorkspaceMemberSchema, {
  $id: "WorkspaceMemberList",
});

export const UpdateMemberRoleSchema = Type.Object(
  { role: AssignableRoleSchema },
  { $id: "UpdateMemberRole", additionalProperties: false },
);
export type UpdateMemberRole = Static<typeof UpdateMemberRoleSchema>;

export const WorkspaceInvitationSchema = Type.Object(
  {
    id: UuidSchema,
    email: Type.String({ maxLength: 320 }),
    role: AssignableRoleSchema,
    status: Type.Union([
      Type.Literal("pending"),
      Type.Literal("accepted"),
      Type.Literal("revoked"),
      Type.Literal("expired"),
    ]),
    expiresAt: DateTimeSchema,
    createdAt: DateTimeSchema,
  },
  { $id: "WorkspaceInvitation", additionalProperties: false },
);
export type WorkspaceInvitation = Static<typeof WorkspaceInvitationSchema>;
export const WorkspaceInvitationListSchema = Type.Array(
  WorkspaceInvitationSchema,
  { $id: "WorkspaceInvitationList" },
);

export const CreateInvitationSchema = Type.Object(
  {
    email: Type.String({ format: "email", minLength: 3, maxLength: 320 }),
    role: AssignableRoleSchema,
  },
  { $id: "CreateInvitation", additionalProperties: false },
);
export type CreateInvitation = Static<typeof CreateInvitationSchema>;

/**
 * The plain token is returned exactly once, to the inviter, so it can be shared
 * while transactional email is not configured. Only its hash is stored.
 */
export const CreatedInvitationSchema = Type.Object(
  {
    invitation: WorkspaceInvitationSchema,
    token: Type.String({ pattern: "^[A-Za-z0-9_-]{32,128}$" }),
    /** True when Kardo emailed the invitation link to the invitee. */
    emailSent: Type.Optional(Type.Boolean()),
    /** The same link the email carries, so the one copied in the panel
     * never points to another origin (domain audit A2-17). */
    inviteUrl: Type.Optional(Type.String({ maxLength: 2048 })),
  },
  { $id: "CreatedInvitation", additionalProperties: false },
);
export type CreatedInvitation = Static<typeof CreatedInvitationSchema>;

/**
 * What an invitation link is, before accepting it (domain audit A2-17):
 * the organization, the role and who invited, and why it cannot be used
 * when it cannot. The token travels in the body, never in a URL.
 */
export const InvitationPreviewRequestSchema = Type.Object(
  { token: Type.String({ pattern: "^[A-Za-z0-9_-]{32,128}$" }) },
  { $id: "InvitationPreviewRequest", additionalProperties: false },
);
export const InvitationPreviewSchema = Type.Object(
  {
    workspaceName: Type.String({ maxLength: 120 }),
    role: AssignableRoleSchema,
    invitedBy: Type.Union([Type.String({ maxLength: 120 }), Type.Null()]),
    /** `wrong_email`: valid, but for another email than the signed-in one. */
    state: Type.Union([
      Type.Literal("valid"),
      Type.Literal("wrong_email"),
      Type.Literal("accepted"),
      Type.Literal("revoked"),
      Type.Literal("expired"),
    ]),
    /** The invited address with most of it hidden («an•••@gmail.com»). */
    emailHint: Type.String({ maxLength: 320 }),
  },
  { $id: "InvitationPreview", additionalProperties: false },
);
export type InvitationPreview = Static<typeof InvitationPreviewSchema>;

/** Requests an ownership transfer to another member (two-step, ADR 024,
 * security review 2026-10-12): the recipient must accept before anything
 * changes. The member must already be an Admin. */
export const TransferOwnershipSchema = Type.Object(
  { profileId: UuidSchema },
  { $id: "TransferOwnership", additionalProperties: false },
);
export type TransferOwnership = Static<typeof TransferOwnershipSchema>;

export const OwnershipTransferStatusSchema = Type.Union([
  Type.Literal("pending"),
  Type.Literal("accepted"),
  Type.Literal("declined"),
  Type.Literal("canceled"),
  Type.Literal("superseded"),
]);

/** A pending (or resolved) ownership transfer, as the sender and the
 * recipient see it. */
export const OwnershipTransferSchema = Type.Object(
  {
    id: UuidSchema,
    workspaceId: UuidSchema,
    workspaceName: Type.String({ maxLength: 120 }),
    fromProfileId: UuidSchema,
    fromName: Type.Union([Type.String({ maxLength: 120 }), Type.Null()]),
    toProfileId: UuidSchema,
    toName: Type.Union([Type.String({ maxLength: 120 }), Type.Null()]),
    status: OwnershipTransferStatusSchema,
    createdAt: DateTimeSchema,
    /** True for the person reading it, so the panel knows whom to prompt. */
    isRecipient: Type.Boolean(),
  },
  { $id: "OwnershipTransfer", additionalProperties: false },
);
export type OwnershipTransfer = Static<typeof OwnershipTransferSchema>;

export const OwnershipTransferListSchema = Type.Array(OwnershipTransferSchema, {
  $id: "OwnershipTransferList",
});

/** Null when the organization has no pending transfer. */
export const PendingOwnershipTransferSchema = Type.Union([
  OwnershipTransferSchema,
  Type.Null(),
]);

export const AcceptInvitationSchema = Type.Object(
  { token: Type.String({ pattern: "^[A-Za-z0-9_-]{32,128}$" }) },
  { $id: "AcceptInvitation", additionalProperties: false },
);
export type AcceptInvitation = Static<typeof AcceptInvitationSchema>;

// ---------------------------------------------------------------------------
// Touchpoints
// ---------------------------------------------------------------------------

export const RedirectExperienceContentSchema = Type.Object(
  {
    destinationUrl: SafeUrlSchema,
  },
  { $id: "RedirectExperienceContent", additionalProperties: false },
);

export type RedirectExperienceContent = Static<
  typeof RedirectExperienceContentSchema
>;

export const TouchpointPhysicalTypeSchema = Type.Union([
  Type.Literal("card"),
  Type.Literal("label"),
  Type.Literal("other"),
]);

/**
 * One Touchpoint is one physical format: an NFC tag, a printed QR code, or
 * another carrier. `link` is the separate shareable-link product (a Link
 * page with a handle URL); it never appears among physical Touchpoints.
 * `kardo` is a piece Kardo sells (ADR 026): one address that its printed QR
 * (`?src=qr`) and its chip (`?src=nfc`) both open. It is born in
 * Operations and only activated in the panel, never created there.
 */
export const touchpointKinds = ["nfc", "qr", "other", "link", "kardo"] as const;
export type TouchpointKind = (typeof touchpointKinds)[number];
export const TouchpointKindSchema = Type.Union([
  Type.Literal("nfc"),
  Type.Literal("qr"),
  Type.Literal("other"),
  Type.Literal("link"),
  Type.Literal("kardo"),
]);
const PhysicalKindSchema = Type.Union([
  Type.Literal("nfc"),
  Type.Literal("qr"),
  Type.Literal("other"),
]);
/** Link handle: `kardo…/@handle`. Lowercase letters, digits, dot, dash, underscore. */
export const HandleSchema = Type.String({
  minLength: 3,
  maxLength: 30,
  pattern: "^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])$",
});

export const TouchpointStatusSchema = Type.Union([
  Type.Literal("assigned"),
  Type.Literal("active"),
  Type.Literal("paused"),
  /** Permanently withdrawn by the customer. Its public ID is never reused. */
  Type.Literal("retired"),
]);

export const TouchpointLiveExperienceSchema = Type.Object(
  {
    experienceId: UuidSchema,
    experienceName: SafeTextSchema,
    experienceType: Type.String({ maxLength: 32 }),
    revision: Type.Integer({ minimum: 1 }),
    publishedAt: DateTimeSchema,
  },
  { additionalProperties: false },
);

/**
 * The physical object, apart from its page (relevo 36): «Sin grabar» or
 * «Sin imprimir» (`pending`), «Grabado» or «Impreso» (`ready`), «Colocado»
 * (`placed`), or a chip being replaced (`replacing`). Every step keeps the
 * time it was done, so a reload goes back to the same step.
 */
export const touchpointObjectStates = [
  "pending",
  "ready",
  "placed",
  "replacing",
] as const;
export type TouchpointObjectState = (typeof touchpointObjectStates)[number];

const NullableDateTime = Type.Union([DateTimeSchema, Type.Null()]);

export const TouchpointObjectSchema = Type.Object(
  {
    state: Type.Union(touchpointObjectStates.map((s) => Type.Literal(s))),
    /** NFC written, QR printed, «Otro» with its address in place. */
    preparedAt: NullableDateTime,
    /** It opened from a phone (marked by hand or by its first visit). */
    testedAt: NullableDateTime,
    /** NFC: its backup QR printed. */
    backupAt: NullableDateTime,
    placedAt: NullableDateTime,
    /** QR: last download from the Estudio QR. */
    downloadedAt: NullableDateTime,
    /** NFC: a new chip is being set up since then. */
    replacingAt: NullableDateTime,
    /** NFC replacement: the new card erased or formatted. */
    replaceReadyAt: NullableDateTime,
    /** NFC replacement: the new card written. */
    replacePreparedAt: NullableDateTime,
    /** NFC replacement: the new card tested. */
    replaceTestedAt: NullableDateTime,
  },
  { $id: "TouchpointObject", additionalProperties: false },
);
export type TouchpointObject = Static<typeof TouchpointObjectSchema>;

/** A step of «Conecta el objeto» or of «Reemplazar el chip». */
export const touchpointObjectSteps = [
  "prepared",
  "tested",
  "backup",
  "placed",
  "replace_ready",
  "replace_prepared",
  "replace_tested",
] as const;
export type TouchpointObjectStep = (typeof touchpointObjectSteps)[number];

export const UpdateTouchpointObjectSchema = Type.Object(
  {
    /** `done` and `undo` need `step`; the replacement actions do not. */
    action: Type.Union([
      Type.Literal("done"),
      Type.Literal("undo"),
      Type.Literal("start_replace"),
      Type.Literal("cancel_replace"),
    ]),
    step: Type.Optional(
      Type.Union(touchpointObjectSteps.map((s) => Type.Literal(s))),
    ),
  },
  { $id: "UpdateTouchpointObject", additionalProperties: false },
);
export type UpdateTouchpointObject = Static<
  typeof UpdateTouchpointObjectSchema
>;

export const TouchpointSchema = Type.Object(
  {
    id: UuidSchema,
    publicId: Type.String({ minLength: 16, maxLength: 32 }),
    operationalName: Type.String({ minLength: 1, maxLength: 120 }),
    /** Legacy form factor; the UI uses `kind`. */
    physicalType: TouchpointPhysicalTypeSchema,
    kind: Type.Optional(TouchpointKindSchema),
    /** Only for `kind: "kardo"`: which of the four pieces it is. */
    pieceModel: Type.Optional(Type.Union([PieceModelSchema, Type.Null()])),
    /** Only for `kind: "link"`. */
    handle: Type.Optional(Type.Union([HandleSchema, Type.Null()])),
    /** Links only: kardo.com.mx/<negocio>/<slug> (null until chosen). */
    slug: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    /** Links only: last time the address changed (7 days to the next). */
    slugChangedAt: Type.Optional(Type.Union([DateTimeSchema, Type.Null()])),
    status: TouchpointStatusSchema,
    /** Group (location, zone, set of tables) this Touchpoint belongs to. */
    groupId: Type.Optional(Type.Union([UuidSchema, Type.Null()])),
    createdAt: Type.Optional(DateTimeSchema),
    /** The publication currently served by the Resolver, if any. */
    live: Type.Optional(
      Type.Union([TouchpointLiveExperienceSchema, Type.Null()]),
    ),
    /** Suspended by Kardo (trust & safety). Only staff can lift it. */
    suspended: Type.Optional(Type.Boolean()),
    /** Left out of a smaller plan (ADR 023, downgrade option B): its page is
     * paused and it does not count for the limit until chosen again. */
    planExcluded: Type.Optional(Type.Boolean()),
    /** A publication for this Touchpoint is queued or in progress. */
    publishing: Type.Optional(Type.Boolean()),
    /** The physical object's own state (not on Links). */
    object: Type.Optional(TouchpointObjectSchema),
  },
  { $id: "Touchpoint" },
);

export type Touchpoint = Static<typeof TouchpointSchema>;

/** POST /v1/workspaces/:workspaceId/kardo-pieces/claim (ADR 026). */
export const KardoPieceClaimResultSchema = Type.Object(
  {
    touchpoints: Type.Array(TouchpointSchema, { maxItems: 100 }),
    /** What the kit's days did to the panel; null when this activation
     * applied none (loose pieces, or the kit's days were already used). */
    panel: Type.Union([KitPanelGrantSchema, Type.Null()]),
  },
  { $id: "KardoPieceClaimResult", additionalProperties: false },
);
export type KardoPieceClaimResult = Static<typeof KardoPieceClaimResultSchema>;

/**
 * «Pruébalo» counts only visits after the step was opened in the panel, so
 * an old visit never marks it (an undone test, a reload). The server keeps
 * it inside the step's own window.
 */
export const TouchpointObjectProbeRequestSchema = Type.Object(
  { since: Type.Optional(DateTimeSchema) },
  { $id: "TouchpointObjectProbeRequest", additionalProperties: false },
);
export type TouchpointObjectProbeRequest = Static<
  typeof TouchpointObjectProbeRequestSchema
>;

/**
 * «Pruébalo»: did the first visit through this object's channel arrive?
 * `unavailable` when analytics are not configured or did not answer: the
 * panel then only offers «Ya lo probé».
 */
export const TouchpointObjectProbeSchema = Type.Object(
  {
    touchpoint: TouchpointSchema,
    detected: Type.Boolean(),
    source: Type.Union([
      Type.Literal("analytics"),
      Type.Literal("unavailable"),
    ]),
  },
  { $id: "TouchpointObjectProbe", additionalProperties: false },
);
export type TouchpointObjectProbe = Static<typeof TouchpointObjectProbeSchema>;

export const TouchpointListSchema = Type.Array(TouchpointSchema, {
  $id: "TouchpointList",
});

export const CreateTouchpointSchema = Type.Object(
  {
    operationalName: Type.String({ minLength: 1, maxLength: 120 }),
    /** Legacy; derived from `kind` when omitted. */
    physicalType: Type.Optional(TouchpointPhysicalTypeSchema),
    /** Defaults to `qr`. A Link is created only with `POST …/links`, with
     * its address and the page it shows (domain audit A9-19). */
    kind: Type.Optional(PhysicalKindSchema),
    groupId: Type.Optional(UuidSchema),
    /** QR only: a library design (otherwise it follows its group's design). */
    qrTemplateId: Type.Optional(UuidSchema),
  },
  { $id: "CreateTouchpoint", additionalProperties: false },
);

export type CreateTouchpoint = Static<typeof CreateTouchpointSchema>;

export const UpdateTouchpointSchema = Type.Object(
  {
    operationalName: Type.String({ minLength: 1, maxLength: 120 }),
    /** Switch the physical format (nfc ↔ qr ↔ other). Links stay links.
     * `physicalType` (legacy) is only accepted when creating a Touchpoint;
     * editing one always derives it from `kind` (domain audit A9-16). */
    kind: Type.Optional(PhysicalKindSchema),
    /** `null` removes the Touchpoint from its group. */
    groupId: Type.Optional(Type.Union([UuidSchema, Type.Null()])),
  },
  { $id: "UpdateTouchpoint", additionalProperties: false },
);
export type UpdateTouchpoint = Static<typeof UpdateTouchpointSchema>;

export const UpdateTouchpointStatusSchema = Type.Object(
  { status: Type.Union([Type.Literal("active"), Type.Literal("paused")]) },
  { $id: "UpdateTouchpointStatus", additionalProperties: false },
);
export type UpdateTouchpointStatus = Static<
  typeof UpdateTouchpointStatusSchema
>;

/** Creates `count` Touchpoints named "<namePrefix> <n>" (n = start…). */
export const CreateTouchpointBatchSchema = Type.Object(
  {
    namePrefix: Type.String({ minLength: 1, maxLength: 100 }),
    start: Type.Integer({ minimum: 1, maximum: 9999 }),
    count: Type.Integer({ minimum: 1, maximum: 100 }),
    physicalType: Type.Optional(TouchpointPhysicalTypeSchema),
    kind: Type.Optional(PhysicalKindSchema),
    groupId: Type.Optional(UuidSchema),
    /** QR only: a library design (otherwise they follow the group's design). */
    qrTemplateId: Type.Optional(UuidSchema),
  },
  { $id: "CreateTouchpointBatch", additionalProperties: false },
);
export type CreateTouchpointBatch = Static<typeof CreateTouchpointBatchSchema>;

/**
 * Touchpoints created in (or moved into) a group automatically receive the
 * Experience that group currently serves; `propagatedPublications` counts
 * the publications queued for that.
 */
export const TouchpointBatchResultSchema = Type.Object(
  {
    touchpoints: Type.Array(TouchpointSchema, { maxItems: 100 }),
    propagatedPublications: Type.Integer({ minimum: 0 }),
  },
  { $id: "TouchpointBatchResult", additionalProperties: false },
);
export type TouchpointBatchResult = Static<typeof TouchpointBatchResultSchema>;

/**
 * Groups nest (ADR 021): a group may live inside another, up to
 * `TOUCHPOINT_GROUP_MAX_DEPTH` levels. "Local" (`location`) or "Grupo"
 * (`group`) only changes how it is shown; publishing works the same.
 */
export const TOUCHPOINT_GROUP_MAX_DEPTH = 4;
export const touchpointGroupKinds = ["location", "group"] as const;
export const TouchpointGroupKindSchema = Type.Union([
  Type.Literal("location"),
  Type.Literal("group"),
]);
export type TouchpointGroupKind = Static<typeof TouchpointGroupKindSchema>;

export const TouchpointGroupSchema = Type.Object(
  {
    id: UuidSchema,
    name: Type.String({ minLength: 1, maxLength: 120 }),
    description: Type.Union([Type.String({ maxLength: 300 }), Type.Null()]),
    /** Direct members only (not those in its subgroups). */
    touchpointCount: Type.Integer({ minimum: 0 }),
    /** Every Touchpoint in its tree (itself and all its subgroups). */
    totalTouchpointCount: Type.Optional(Type.Integer({ minimum: 0 })),
    /** The group it lives in; `null` for a top-level group. */
    parentId: Type.Optional(Type.Union([UuidSchema, Type.Null()])),
    kind: Type.Optional(TouchpointGroupKindSchema),
    /**
     * The Experience this group currently serves (what a Touchpoint joining
     * the group receives automatically), if any.
     */
    servedExperience: Type.Optional(
      Type.Union([
        Type.Object(
          { id: UuidSchema, name: SafeTextSchema },
          { additionalProperties: false },
        ),
        Type.Null(),
      ]),
    ),
    /** Library QR design its Touchpoints (current and future) inherit. */
    qrTemplateId: Type.Optional(Type.Union([UuidSchema, Type.Null()])),
    createdAt: Type.Optional(DateTimeSchema),
  },
  { $id: "TouchpointGroup", additionalProperties: false },
);
export type TouchpointGroup = Static<typeof TouchpointGroupSchema>;
export const TouchpointGroupListSchema = Type.Array(TouchpointGroupSchema, {
  $id: "TouchpointGroupList",
});

export const CreateTouchpointGroupSchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 120 }),
    description: Type.Optional(Type.String({ maxLength: 300 })),
    /** Create it inside this group. */
    parentId: Type.Optional(UuidSchema),
    kind: Type.Optional(TouchpointGroupKindSchema),
    /** Existing Touchpoints to move into the new group. */
    touchpointIds: Type.Optional(Type.Array(UuidSchema, { maxItems: 500 })),
  },
  { $id: "CreateTouchpointGroup", additionalProperties: false },
);
export type CreateTouchpointGroup = Static<typeof CreateTouchpointGroupSchema>;

export const UpdateTouchpointGroupSchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 120 }),
    description: Type.Optional(
      Type.Union([Type.String({ maxLength: 300 }), Type.Null()]),
    ),
    /** Move it (with its whole tree) inside another group; `null` = top level. */
    parentId: Type.Optional(Type.Union([UuidSchema, Type.Null()])),
    kind: Type.Optional(TouchpointGroupKindSchema),
  },
  { $id: "UpdateTouchpointGroup", additionalProperties: false },
);
export type UpdateTouchpointGroup = Static<typeof UpdateTouchpointGroupSchema>;

/** Replaces the group's membership with exactly these Touchpoints. */
export const SetGroupTouchpointsSchema = Type.Object(
  { touchpointIds: Type.Array(UuidSchema, { maxItems: 500 }) },
  { $id: "SetGroupTouchpoints", additionalProperties: false },
);
export type SetGroupTouchpoints = Static<typeof SetGroupTouchpointsSchema>;

/**
 * Moves some Touchpoints into a group (or out of their group with `null`)
 * without touching the group's other members. Those joining a group receive
 * what it serves; those leaving keep what they show until something else is
 * published to them.
 */
export const MoveTouchpointsSchema = Type.Object(
  {
    touchpointIds: Type.Array(UuidSchema, { minItems: 1, maxItems: 500 }),
    groupId: Type.Union([UuidSchema, Type.Null()]),
  },
  { $id: "MoveTouchpoints", additionalProperties: false },
);
export type MoveTouchpoints = Static<typeof MoveTouchpointsSchema>;

export const MoveTouchpointsResultSchema = Type.Object(
  {
    /** Touchpoints whose group actually changed. */
    moved: Type.Integer({ minimum: 0 }),
    propagatedPublications: Type.Integer({ minimum: 0 }),
  },
  { $id: "MoveTouchpointsResult", additionalProperties: false },
);
export type MoveTouchpointsResult = Static<typeof MoveTouchpointsResultSchema>;

// ---------------------------------------------------------------------------
// Experience content (bounded; the Resolver snapshot limit is 128 KiB)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Experience personalization (optional on every template)
// ---------------------------------------------------------------------------

const HexColorSchema = Type.String({ pattern: "^#[0-9a-fA-F]{6}$" });

/**
 * Visual theme of a public page. Every value is a closed choice or a
 * `#rrggbb` color, so the Resolver can render it without ever interpolating
 * free-form CSS. Image backgrounds reference a validated image asset.
 */
export const ExperienceThemeSchema = Type.Object(
  {
    background: Type.Object(
      {
        kind: Type.Union([
          Type.Literal("solid"),
          Type.Literal("gradient"),
          Type.Literal("image"),
        ]),
        color: HexColorSchema,
        /** Second stop for gradients. */
        colorTo: Type.Optional(HexColorSchema),
        angle: Type.Optional(Type.Integer({ minimum: 0, maximum: 360 })),
        imageAssetId: Type.Optional(UuidSchema),
        /** Darkens an image background for legibility (0–80 %). */
        overlay: Type.Optional(Type.Integer({ minimum: 0, maximum: 80 })),
      },
      { additionalProperties: false },
    ),
    /** Text/card contrast mode over the background. */
    surface: Type.Union([Type.Literal("light"), Type.Literal("dark")]),
    accent: HexColorSchema,
    buttonStyle: Type.Union([
      Type.Literal("pill"),
      Type.Literal("rounded"),
      Type.Literal("square"),
      Type.Literal("outline"),
    ]),
    font: Type.Union([
      Type.Literal("sans"),
      Type.Literal("serif"),
      Type.Literal("rounded"),
      Type.Literal("mono"),
    ]),
  },
  { additionalProperties: false },
);
export type ExperienceTheme = Static<typeof ExperienceThemeSchema>;
const OptionalThemeSchema = Type.Optional(ExperienceThemeSchema);

export const LinkItemSchema = Type.Object(
  {
    id: ItemIdSchema,
    label: SafeTextSchema,
    url: SafeUrlSchema,
  },
  { additionalProperties: false },
);
export type LinkItem = Static<typeof LinkItemSchema>;

/**
 * How many items each page content takes, in one place for the API schema
 * and the panel's early checks (domain audit A2-31: the panel did not check
 * them, so content from templates, the AI or a pasted list hit a generic
 * 400 instead of a Spanish message).
 */
export const CONTENT_LIMITS = {
  links: 12,
  profileLinks: 8,
  linkpageLinks: 20,
  linkpageSocials: 12,
  menuSections: 10,
  sectionItems: 30,
  catalogItems: 48,
} as const;

export const LinksExperienceContentSchema = Type.Object(
  {
    title: SafeTextSchema,
    description: Type.Optional(Type.String({ maxLength: 500 })),
    links: Type.Array(LinkItemSchema, {
      minItems: 1,
      maxItems: CONTENT_LIMITS.links,
    }),
    theme: OptionalThemeSchema,
    /** Estudio de Experiences (ADR 018); replaces `theme` when present. */
    design: Type.Optional(PageDesignSchema),
    /** Modo HTML del Estudio; when active it replaces `design` and `theme`. */
    customHtml: Type.Optional(CustomHtmlSchema),
  },
  { $id: "LinksExperienceContent", additionalProperties: false },
);

export const ProfileExperienceContentSchema = Type.Object(
  {
    displayName: SafeTextSchema,
    headline: Type.Optional(Type.String({ maxLength: 160 })),
    biography: Type.Optional(Type.String({ maxLength: 1_000 })),
    /** Optional validated PNG from the workspace library. */
    avatarAssetId: Type.Optional(UuidSchema),
    links: Type.Array(LinkItemSchema, {
      maxItems: CONTENT_LIMITS.profileLinks,
    }),
    theme: OptionalThemeSchema,
    /** Estudio de Experiences (ADR 018); replaces `theme` when present. */
    design: Type.Optional(PageDesignSchema),
    /** Modo HTML del Estudio; when active it replaces `design` and `theme`. */
    customHtml: Type.Optional(CustomHtmlSchema),
  },
  { $id: "ProfileExperienceContent", additionalProperties: false },
);

export const ImageExperienceContentSchema = Type.Object(
  {
    assetId: UuidSchema,
    alt: Type.String({ minLength: 1, maxLength: 250 }),
    theme: OptionalThemeSchema,
    /** Estudio de Experiences (ADR 018, addendum 3); replaces `theme`. */
    design: Type.Optional(PageDesignSchema),
  },
  { $id: "ImageExperienceContent", additionalProperties: false },
);

/** One page of a PDF drawn as an image by the panel (visor de PDF). */
export const DocumentPageSchema = Type.Object(
  {
    /** Image asset (PNG, JPEG or WebP) in the same workspace. */
    assetId: UuidSchema,
    /** Rendered size in px, so the page keeps its shape while it loads. */
    width: Type.Integer({ minimum: 1, maximum: 10_000 }),
    height: Type.Integer({ minimum: 1, maximum: 10_000 }),
  },
  { additionalProperties: false },
);
export type DocumentPage = Static<typeof DocumentPageSchema>;

/** Pages a visor de PDF may show. */
export const DOCUMENT_VIEWER_MAX_PAGES = 40;

export const DocumentExperienceContentSchema = Type.Object(
  {
    /** The PDF itself (a validated `application/pdf` asset). Required to
     * download it ("download", or "viewer" with `allowDownload`); a viewer
     * only shows `pages`, so it may go without it, e.g. when the Assets
     * Worker rejected the file for active content (forms, scripts). */
    assetId: Type.Optional(UuidSchema),
    title: SafeTextSchema,
    description: Type.Optional(Type.String({ maxLength: 500 })),
    theme: OptionalThemeSchema,
    /** "viewer" (Visor de PDF, addendum 3) shows the pages on the page;
     * absent or "download" shows a card with the download button. */
    display: Type.Optional(
      Type.Union([Type.Literal("download"), Type.Literal("viewer")]),
    ),
    /** The PDF's pages as images, in order; required by "viewer". */
    pages: Type.Optional(
      Type.Array(DocumentPageSchema, {
        maxItems: DOCUMENT_VIEWER_MAX_PAGES,
      }),
    ),
    /** Viewer only: also offer the PDF as a download (default false). */
    allowDownload: Type.Optional(Type.Boolean()),
    /** Estudio de Experiences (ADR 018, addendum 3); replaces `theme`. */
    design: Type.Optional(PageDesignSchema),
  },
  { $id: "DocumentExperienceContent", additionalProperties: false },
);

/** Most choices one dish offers («Elige tu guisado»). */
export const MENU_ITEM_CHOICES_MAX = 12;

/** One option inside a dish (relevo 37, D1): a guisado of a «comida
 * corrida». It has its own id so Disponibilidad sells it out on its own
 * (`kardo_core.item_availability` keys by item id); ids are unique across
 * every dish and choice of the menu. */
export const MenuChoiceSchema = Type.Object(
  {
    id: ItemIdSchema,
    name: SafeTextSchema,
  },
  { additionalProperties: false },
);
export type MenuChoice = Static<typeof MenuChoiceSchema>;

export const MenuItemSchema = Type.Object(
  {
    id: ItemIdSchema,
    name: SafeTextSchema,
    description: Type.Optional(Type.String({ maxLength: 200 })),
    price: Type.Optional(PriceSchema),
    /** Optional validated image from the workspace library (dish photo). */
    imageAssetId: Type.Optional(UuidSchema),
    /** «Menú del día» / «comida corrida» (relevo 37, D1): one price, what it
     * includes in `description`, and the dishes to choose from. Doña Rosa
     * could not sell out the mole on its own when it was one dish. */
    choices: Type.Optional(
      Type.Array(MenuChoiceSchema, {
        minItems: 1,
        maxItems: MENU_ITEM_CHOICES_MAX,
      }),
    ),
    /** The line above the choices; «A elegir» when absent. */
    choicesLabel: Type.Optional(Type.String({ minLength: 1, maxLength: 40 })),
  },
  { additionalProperties: false },
);
export type MenuItem = Static<typeof MenuItemSchema>;

export const MenuSectionSchema = Type.Object(
  {
    id: ItemIdSchema,
    name: SafeTextSchema,
    items: Type.Array(MenuItemSchema, {
      minItems: 1,
      maxItems: CONTENT_LIMITS.sectionItems,
    }),
  },
  { additionalProperties: false },
);
export type MenuSection = Static<typeof MenuSectionSchema>;

/** Servers additionally cap a menu at 150 items in total. */
export const MenuExperienceContentSchema = Type.Object(
  {
    title: SafeTextSchema,
    description: Type.Optional(Type.String({ maxLength: 500 })),
    currency: CurrencySchema,
    sections: Type.Array(MenuSectionSchema, {
      minItems: 1,
      maxItems: CONTENT_LIMITS.menuSections,
    }),
    theme: OptionalThemeSchema,
    /** Estudio de Experiences (ADR 018, addendum 3); replaces `theme`. */
    design: Type.Optional(PageDesignSchema),
  },
  { $id: "MenuExperienceContent", additionalProperties: false },
);

export const CatalogItemSchema = Type.Object(
  {
    id: ItemIdSchema,
    name: SafeTextSchema,
    description: Type.Optional(Type.String({ maxLength: 300 })),
    price: Type.Optional(PriceSchema),
    url: Type.Optional(SafeUrlSchema),
    /** Optional validated PNG from the workspace library. */
    imageAssetId: Type.Optional(UuidSchema),
  },
  { additionalProperties: false },
);
export type CatalogItem = Static<typeof CatalogItemSchema>;

export const CatalogExperienceContentSchema = Type.Object(
  {
    title: SafeTextSchema,
    description: Type.Optional(Type.String({ maxLength: 500 })),
    currency: CurrencySchema,
    items: Type.Array(CatalogItemSchema, {
      minItems: 1,
      maxItems: CONTENT_LIMITS.catalogItems,
    }),
    theme: OptionalThemeSchema,
    /** Estudio de Experiences (ADR 018, addendum 3); replaces `theme`. */
    design: Type.Optional(PageDesignSchema),
  },
  { $id: "CatalogExperienceContent", additionalProperties: false },
);

export const FormFieldSettingSchema = Type.Union([
  Type.Literal("hidden"),
  Type.Literal("optional"),
  Type.Literal("required"),
]);
export type FormFieldSetting = Static<typeof FormFieldSettingSchema>;

/** Email is always collected and required; consent is always explicit. */
export const FormExperienceContentSchema = Type.Object(
  {
    title: SafeTextSchema,
    description: Type.Optional(Type.String({ maxLength: 500 })),
    fields: Type.Object(
      {
        name: FormFieldSettingSchema,
        phone: FormFieldSettingSchema,
        message: FormFieldSettingSchema,
      },
      { additionalProperties: false },
    ),
    submitLabel: Type.String({ minLength: 1, maxLength: 40 }),
    successMessage: Type.String({ minLength: 1, maxLength: 200 }),
    consentText: Type.String({ minLength: 1, maxLength: 300 }),
    /** The business's own privacy notice (it is the data controller of its
     * leads; Kardo only processes them). Shown next to the consent box. */
    privacyNoticeUrl: Type.Optional(SafeUrlSchema),
    theme: OptionalThemeSchema,
    /** Estudio de Experiences (ADR 018, addendum 3); replaces `theme`. */
    design: Type.Optional(PageDesignSchema),
  },
  { $id: "FormExperienceContent", additionalProperties: false },
);

/** Social networks a link page can show as an icon row. */
export const socialNetworks = [
  "instagram",
  "facebook",
  "tiktok",
  "x",
  "youtube",
  "linkedin",
  "whatsapp",
  "threads",
  "pinterest",
  "spotify",
  "telegram",
  "website",
  "email",
  "phone",
] as const;
export type SocialNetwork = (typeof socialNetworks)[number];

/**
 * Icon networks must point to their own domain, so an Instagram icon can
 * never lead somewhere else; `website` takes any safe HTTPS URL. One table
 * for the API (the authority) and the panel (early feedback), domain audit
 * A2-29: they were two copies «kept in sync manually».
 */
export const socialNetworkDomains: Partial<
  Record<SocialNetwork, readonly string[]>
> = {
  instagram: ["instagram.com"],
  facebook: ["facebook.com", "fb.com", "fb.me"],
  tiktok: ["tiktok.com"],
  x: ["x.com", "twitter.com"],
  youtube: ["youtube.com", "youtu.be"],
  linkedin: ["linkedin.com"],
  whatsapp: ["wa.me", "whatsapp.com"],
  threads: ["threads.net", "threads.com"],
  pinterest: ["pinterest.com", "pinterest.com.mx", "pin.it"],
  spotify: ["spotify.com"],
  telegram: ["t.me", "telegram.me"],
};
/** An email address as the panel checks it before saving (the server's
 * schemas have the last word): one pattern for every form (A2-72). */
export const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
export const SOCIAL_EMAIL_PATTERN = EMAIL_PATTERN;
export const SOCIAL_PHONE_PATTERN = /^\+?[0-9]{6,15}$/;

/** True when `url`'s host is the network's domain or one of its subdomains
 * (always true for networks without a domain rule, false for a bad URL). */
export function socialUrlMatchesNetwork(
  network: SocialNetwork,
  url: string,
): boolean {
  const domains = socialNetworkDomains[network];
  if (!domains) return true;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return domains.some(
      (domain) => host === domain || host.endsWith(`.${domain}`),
    );
  } catch {
    return false;
  }
}

/**
 * `value` is an HTTPS URL, except `email` (an address) and `phone`
 * (E.164-like digits); servers validate it per network.
 */
export const SocialLinkSchema = Type.Object(
  {
    id: ItemIdSchema,
    network: Type.Union(socialNetworks.map((network) => Type.Literal(network))),
    value: Type.String({ minLength: 3, maxLength: 2048 }),
  },
  { additionalProperties: false },
);
export type SocialLink = Static<typeof SocialLinkSchema>;

export const LinkPageButtonSchema = Type.Object(
  {
    id: ItemIdSchema,
    label: SafeTextSchema,
    url: SafeUrlSchema,
    /** Visually emphasized (e.g. the main call to action). */
    highlight: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

/** Shareable link-in-bio page. Only for Links (never physical Touchpoints). */
export const LinkPageExperienceContentSchema = Type.Object(
  {
    displayName: SafeTextSchema,
    bio: Type.Optional(Type.String({ maxLength: 300 })),
    avatarAssetId: Type.Optional(UuidSchema),
    socials: Type.Array(SocialLinkSchema, {
      maxItems: CONTENT_LIMITS.linkpageSocials,
    }),
    links: Type.Array(LinkPageButtonSchema, {
      maxItems: CONTENT_LIMITS.linkpageLinks,
    }),
    theme: OptionalThemeSchema,
    /** Estudio de Experiences (ADR 018); replaces `theme` when present. */
    design: Type.Optional(PageDesignSchema),
    /** Modo HTML del Estudio; when active it replaces `design` and `theme`. */
    customHtml: Type.Optional(CustomHtmlSchema),
  },
  { $id: "LinkPageExperienceContent", additionalProperties: false },
);

/**
 * Where an Experience is published: explicit Touchpoints and/or whole groups.
 * Groups are resolved to their Touchpoints at publication time.
 */
export const ExperienceTargetsSchema = Type.Object(
  {
    touchpointIds: Type.Array(UuidSchema, { maxItems: 500 }),
    groupIds: Type.Array(UuidSchema, { maxItems: 50 }),
  },
  // No `$id`: this schema is embedded (via Type.Optional) in many route
  // schemas, and Fastify rejects the same `$id` resolving to several schemas.
  { additionalProperties: false },
);
export type ExperienceTargets = Static<typeof ExperienceTargetsSchema>;

export const experienceTypes = [
  "redirect",
  "links",
  "profile",
  "image",
  "document",
  "menu",
  "catalog",
  "form",
  "linkpage",
] as const;
export type ExperienceType = (typeof experienceTypes)[number];

/** The types whose content may carry a full-page `customHtml` (modo HTML
 * del Estudio). The one list for the panel, the API and the prompts
 * (domain audit A2-43). */
export const customHtmlExperienceTypes = [
  "links",
  "profile",
  "linkpage",
] as const satisfies readonly ExperienceType[];
export function supportsCustomHtml(type: string): boolean {
  return (customHtmlExperienceTypes as readonly string[]).includes(type);
}

/** Experience types a Touchpoint can show: every one. Since the Links
 * redesign (owner, 2026-10-04) a Link is one more Touchpoint and a link page
 * («Página de enlaces») a normal type that also fits a QR or an NFC. */
export const touchpointExperienceTypes: readonly ExperienceType[] =
  experienceTypes;

export const ExperienceTypeSchema = Type.Union([
  Type.Literal("redirect"),
  Type.Literal("links"),
  Type.Literal("profile"),
  Type.Literal("image"),
  Type.Literal("document"),
  Type.Literal("menu"),
  Type.Literal("catalog"),
  Type.Literal("form"),
  Type.Literal("linkpage"),
]);

/** Per-type content schema. Servers use it with `Value.Check` on update. */
export const experienceContentSchemas = {
  redirect: RedirectExperienceContentSchema,
  links: LinksExperienceContentSchema,
  profile: ProfileExperienceContentSchema,
  image: ImageExperienceContentSchema,
  document: DocumentExperienceContentSchema,
  menu: MenuExperienceContentSchema,
  catalog: CatalogExperienceContentSchema,
  form: FormExperienceContentSchema,
  linkpage: LinkPageExperienceContentSchema,
} as const;

export type ExperienceContentByType = {
  redirect: Static<typeof RedirectExperienceContentSchema>;
  links: Static<typeof LinksExperienceContentSchema>;
  profile: Static<typeof ProfileExperienceContentSchema>;
  image: Static<typeof ImageExperienceContentSchema>;
  document: Static<typeof DocumentExperienceContentSchema>;
  menu: Static<typeof MenuExperienceContentSchema>;
  catalog: Static<typeof CatalogExperienceContentSchema>;
  form: Static<typeof FormExperienceContentSchema>;
  linkpage: Static<typeof LinkPageExperienceContentSchema>;
};
export type ExperienceContent = ExperienceContentByType[ExperienceType];

function createExperienceVariant<
  TType extends ExperienceType,
  TContent extends (typeof experienceContentSchemas)[TType],
>(type: TType, content: TContent) {
  return Type.Object(
    {
      /** Legacy single target; prefer `targets`. At least one target is required. */
      touchpointId: Type.Optional(UuidSchema),
      targets: Type.Optional(ExperienceTargetsSchema),
      name: SafeTextSchema,
      type: Type.Literal(type),
      content,
    },
    { additionalProperties: false },
  );
}

export const CreateExperienceSchema = Type.Union(
  [
    createExperienceVariant("redirect", RedirectExperienceContentSchema),
    createExperienceVariant("links", LinksExperienceContentSchema),
    createExperienceVariant("profile", ProfileExperienceContentSchema),
    createExperienceVariant("image", ImageExperienceContentSchema),
    createExperienceVariant("document", DocumentExperienceContentSchema),
    createExperienceVariant("menu", MenuExperienceContentSchema),
    createExperienceVariant("catalog", CatalogExperienceContentSchema),
    createExperienceVariant("form", FormExperienceContentSchema),
    createExperienceVariant("linkpage", LinkPageExperienceContentSchema),
  ],
  { $id: "CreateExperience" },
);

export type CreateExperience = Static<typeof CreateExperienceSchema>;

/**
 * Draft update. The type cannot change; the server validates `content` against
 * `experienceContentSchemas[storedType]` before writing.
 */
export const UpdateExperienceSchema = Type.Object(
  {
    name: SafeTextSchema,
    /** Left out: only the name changes (renaming never rewrites content
     * another screen may have saved meanwhile; domain audit A2-22). */
    content: Type.Optional(Type.Object({}, { additionalProperties: true })),
    /** The `draftRevision` the screen loaded. When it no longer matches,
     * someone else saved in between: 409 `EXPERIENCE_CHANGED`, nothing is
     * written. Left out: last write wins (older clients). */
    expectedDraftRevision: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { $id: "UpdateExperience", additionalProperties: false },
);
export type UpdateExperience = {
  name: string;
  content?: ExperienceContent;
  expectedDraftRevision?: number;
};

export const PublicationStatusSchema = Type.Union([
  Type.Literal("draft"),
  Type.Literal("pending"),
  Type.Literal("processing"),
  Type.Literal("published"),
  Type.Literal("failed"),
  Type.Literal("superseded"),
]);
export type PublicationStatus = Static<typeof PublicationStatusSchema>;

/**
 * Only the publication-derived fields of each Experience (domain audit
 * A2-30): what the panel polls while something is publishing, instead of
 * downloading every page's whole design every few seconds.
 */
export const ExperiencePublicationStateSchema = Type.Object(
  {
    id: UuidSchema,
    publicationStatus: PublicationStatusSchema,
    hasUnpublishedChanges: Type.Optional(Type.Boolean()),
    liveRevision: Type.Optional(
      Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    ),
    liveTouchpointCount: Type.Optional(Type.Integer({ minimum: 0 })),
    draftRevision: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { $id: "ExperiencePublicationState", additionalProperties: false },
);
export type ExperiencePublicationState = Static<
  typeof ExperiencePublicationStateSchema
>;
export const ExperiencePublicationStateListSchema = Type.Array(
  ExperiencePublicationStateSchema,
  { $id: "ExperiencePublicationStateList", maxItems: 2000 },
);

// List serialization must tolerate each already-validated draft variant. The
// stricter discriminated schemas above remain the contract for writes.
export const ExperienceSummarySchema = Type.Object(
  {
    id: UuidSchema,
    /** First explicit Touchpoint target (legacy field); null for group-only targets. */
    touchpointId: Type.Union([UuidSchema, Type.Null()]),
    targets: Type.Optional(ExperienceTargetsSchema),
    name: SafeTextSchema,
    type: ExperienceTypeSchema,
    content: Type.Object({}, { additionalProperties: true }),
    /** Status of the most recent publication attempt of this Experience. */
    publicationStatus: PublicationStatusSchema,
    /** True when the draft differs from the version live on its
     * Touchpoints (the most recent version when nothing is live), or when
     * a target does not show the live version yet. */
    hasUnpublishedChanges: Type.Optional(Type.Boolean()),
    /** Goes up by one on every saved change of the draft's name or content;
     * send it back as `expectedDraftRevision` (domain audit A2-22). */
    draftRevision: Type.Optional(Type.Integer({ minimum: 1 })),
    /** Revision currently served for the Touchpoint when it is this Experience. */
    liveRevision: Type.Optional(
      Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    ),
    /** Touchpoints currently serving this Experience. */
    liveTouchpointCount: Type.Optional(Type.Integer({ minimum: 0 })),
    archivedAt: Type.Optional(Type.Union([DateTimeSchema, Type.Null()])),
    updatedAt: Type.Optional(DateTimeSchema),
  },
  { $id: "ExperienceSummary", additionalProperties: false },
);
export type ExperienceSummary = Omit<
  Static<typeof ExperienceSummarySchema>,
  "content"
> & { content: ExperienceContent };

export const ExperienceSchema = Type.Object(
  {
    id: UuidSchema,
    touchpointId: Type.Union([UuidSchema, Type.Null()]),
    targets: Type.Optional(ExperienceTargetsSchema),
    name: SafeTextSchema,
    type: ExperienceTypeSchema,
    content: Type.Union([
      RedirectExperienceContentSchema,
      LinksExperienceContentSchema,
      ProfileExperienceContentSchema,
      ImageExperienceContentSchema,
      DocumentExperienceContentSchema,
      MenuExperienceContentSchema,
      CatalogExperienceContentSchema,
      FormExperienceContentSchema,
      LinkPageExperienceContentSchema,
    ]),
    publicationStatus: PublicationStatusSchema,
    hasUnpublishedChanges: Type.Optional(Type.Boolean()),
    /** See `ExperienceSummary.draftRevision` (domain audit A2-22). */
    draftRevision: Type.Optional(Type.Integer({ minimum: 1 })),
    liveRevision: Type.Optional(
      Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    ),
    liveTouchpointCount: Type.Optional(Type.Integer({ minimum: 0 })),
    archivedAt: Type.Optional(Type.Union([DateTimeSchema, Type.Null()])),
    updatedAt: Type.Optional(DateTimeSchema),
  },
  { $id: "Experience", additionalProperties: false },
);

export type Experience = Static<typeof ExperienceSchema>;

export const ExperienceListSchema = Type.Array(ExperienceSummarySchema, {
  $id: "ExperienceList",
});

export const DuplicateExperienceSchema = Type.Object(
  { name: Type.Optional(SafeTextSchema) },
  { $id: "DuplicateExperience", additionalProperties: false },
);
export type DuplicateExperience = Static<typeof DuplicateExperienceSchema>;

/**
 * Archiving hides an Experience from the workspace. Touchpoints still serving
 * it fall back to the Experience their group serves (`fallbackPublications`
 * queued); archiving is refused with `EXPERIENCE_LIVE` when a Touchpoint
 * would be left serving an archived Experience with nothing to fall back to.
 */
export const ArchiveExperienceResultSchema = Type.Object(
  {
    experienceId: UuidSchema,
    archivedAt: DateTimeSchema,
    fallbackPublications: Type.Integer({ minimum: 0 }),
  },
  { $id: "ArchiveExperienceResult", additionalProperties: false },
);
export type ArchiveExperienceResult = Static<
  typeof ArchiveExperienceResultSchema
>;

export const ExperienceVersionPublicationSchema = Type.Object(
  {
    id: UuidSchema,
    revision: Type.Integer({ minimum: 1 }),
    status: Type.Union([
      Type.Literal("pending"),
      Type.Literal("processing"),
      Type.Literal("published"),
      Type.Literal("failed"),
      Type.Literal("superseded"),
    ]),
    createdAt: DateTimeSchema,
    publishedAt: Type.Union([DateTimeSchema, Type.Null()]),
    /** Sanitized, customer-safe failure reason. Never a raw stack or SQL text. */
    failureReason: Type.Union([Type.String({ maxLength: 200 }), Type.Null()]),
  },
  { additionalProperties: false },
);
export type ExperienceVersionPublication = Static<
  typeof ExperienceVersionPublicationSchema
>;

export const ExperienceVersionSchema = Type.Object(
  {
    id: UuidSchema,
    revision: Type.Integer({ minimum: 1 }),
    createdAt: DateTimeSchema,
    /** In the page's detail only the newest version and the ones live on a
     * Touchpoint carry their content (up to 256 KiB each); ask
     * `GET …/experiences/:id/versions/:versionId` for another one (domain
     * audit A2-30). That endpoint always includes it. */
    content: Type.Optional(Type.Object({}, { additionalProperties: true })),
    /** Most recent publication of this exact version, if it was ever published. */
    publication: Type.Union([ExperienceVersionPublicationSchema, Type.Null()]),
    /** Touchpoints serving this exact version right now (domain audit
     * A2-24: one version can be live on some targets and failed on
     * others). */
    liveTouchpointCount: Type.Optional(Type.Integer({ minimum: 0 })),
    /** Touchpoints whose latest attempt with this version failed. */
    failedTouchpointCount: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { $id: "ExperienceVersion", additionalProperties: false },
);
export type ExperienceVersion = Static<typeof ExperienceVersionSchema>;

export const ExperienceTargetStatusSchema = Type.Object(
  {
    touchpointId: UuidSchema,
    touchpointName: Type.String({ maxLength: 120 }),
    groupId: Type.Union([UuidSchema, Type.Null()]),
    /** Latest publication of this Experience on this Touchpoint. */
    status: PublicationStatusSchema,
    /** True when this Touchpoint currently serves this Experience. */
    isLive: Type.Boolean(),
    /** Another Experience currently served by this Touchpoint, if any. */
    liveExperienceName: Type.Union([
      Type.String({ maxLength: 120 }),
      Type.Null(),
    ]),
    /** How this Experience reaches the Touchpoint. A direct target wins. */
    via: Type.Optional(
      Type.Union([Type.Literal("touchpoint"), Type.Literal("group")]),
    ),
    /**
     * True when this Experience reaches the Touchpoint only through a group
     * while another Experience targets that Touchpoint directly and is live
     * there: publishing this one will skip it.
     */
    overridden: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
export type ExperienceTargetStatus = Static<
  typeof ExperienceTargetStatusSchema
>;

export const ExperienceDetailSchema = Type.Object(
  {
    experience: ExperienceSummarySchema,
    /** Targets resolved to Touchpoints (groups expanded), with status. */
    targets: Type.Optional(
      Type.Array(ExperienceTargetStatusSchema, { maxItems: 500 }),
    ),
    /** Newest first; bounded to the 50 most recent versions. */
    versions: Type.Array(ExperienceVersionSchema, { maxItems: 50 }),
    /** Every version this page has, also past the 50 listed. */
    versionCount: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { $id: "ExperienceDetail", additionalProperties: false },
);
export type ExperienceDetail = Static<typeof ExperienceDetailSchema>;

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

export const leadStatuses = ["new", "contacted", "closed"] as const;
export const LeadStatusSchema = Type.Union([
  Type.Literal("new"),
  Type.Literal("contacted"),
  Type.Literal("closed"),
]);
export type LeadStatus = Static<typeof LeadStatusSchema>;

export const LeadSchema = Type.Object(
  {
    id: UuidSchema,
    touchpointId: UuidSchema,
    touchpointName: Type.Union([Type.String({ maxLength: 120 }), Type.Null()]),
    email: Type.String({ maxLength: 320 }),
    name: Type.Union([Type.String({ maxLength: 120 }), Type.Null()]),
    phone: Type.Union([Type.String({ maxLength: 40 }), Type.Null()]),
    message: Type.Union([Type.String({ maxLength: 2000 }), Type.Null()]),
    revision: Type.Integer({ minimum: 1 }),
    status: Type.Optional(LeadStatusSchema),
    createdAt: DateTimeSchema,
    updatedAt: Type.Optional(DateTimeSchema),
  },
  { $id: "Lead", additionalProperties: false },
);
export type Lead = Static<typeof LeadSchema>;

export const UpdateLeadSchema = Type.Object(
  { status: LeadStatusSchema },
  { $id: "UpdateLead", additionalProperties: false },
);
export type UpdateLead = Static<typeof UpdateLeadSchema>;

/** Leads older than `days` are hidden and purged daily; null keeps them. */
export const leadRetentionOptions = [30, 90, 180, 365, 730] as const;
export const LeadRetentionSchema = Type.Object(
  {
    days: Type.Union([
      Type.Literal(30),
      Type.Literal(90),
      Type.Literal(180),
      Type.Literal(365),
      Type.Literal(730),
      Type.Null(),
    ]),
  },
  { $id: "LeadRetention", additionalProperties: false },
);
export type LeadRetention = Static<typeof LeadRetentionSchema>;

export const LeadPageSchema = Type.Object(
  {
    items: Type.Array(LeadSchema, { maxItems: 100 }),
    /** Opaque cursor for the next (older) page. */
    nextCursor: Type.Union([Type.String({ maxLength: 200 }), Type.Null()]),
  },
  { $id: "LeadPage", additionalProperties: false },
);
export type LeadPage = Static<typeof LeadPageSchema>;

// ---------------------------------------------------------------------------
// Analytics (aggregates only: no IP, user agent or visitor identifier)
// ---------------------------------------------------------------------------

export const ChannelCountsSchema = Type.Object(
  {
    nfc: Type.Integer({ minimum: 0 }),
    qr: Type.Integer({ minimum: 0 }),
    link: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);
export type ChannelCounts = Static<typeof ChannelCountsSchema>;

const KpiComparisonSchema = Type.Object(
  {
    value: Type.Number({ minimum: 0 }),
    /** Null when there is no previous period to compare against. */
    previous: Type.Union([Type.Number({ minimum: 0 }), Type.Null()]),
  },
  { additionalProperties: false },
);
const ChannelKeySchema = Type.Union([
  Type.Literal("nfc"),
  Type.Literal("qr"),
  Type.Literal("link"),
]);

/**
 * Resumen indicators, derived server-side from the same aggregates as the
 * rest of the summary. Rates are 0–1; `dailyAverage` is taps per day.
 */
export const AnalyticsKpisSchema = Type.Object(
  {
    taps: KpiComparisonSchema,
    clicks: KpiComparisonSchema,
    leads: KpiComparisonSchema,
    /** Leads ÷ taps. */
    conversionRate: KpiComparisonSchema,
    /** Clicks ÷ taps. */
    interactionRate: KpiComparisonSchema,
    dailyAverage: KpiComparisonSchema,
    /** Touchpoints in the filter, and how many of them are active. */
    touchpoints: Type.Object(
      {
        active: Type.Integer({ minimum: 0 }),
        total: Type.Integer({ minimum: 0 }),
      },
      { additionalProperties: false },
    ),
    /** Active Touchpoints with at least one tap in the period. */
    reachedTouchpoints: KpiComparisonSchema,
    /** Local hour (0–23) with the most taps and its share of the period. */
    peakHour: Type.Object(
      {
        hour: Type.Union([
          Type.Integer({ minimum: 0, maximum: 23 }),
          Type.Null(),
        ]),
        share: Type.Number({ minimum: 0, maximum: 1 }),
        previousHour: Type.Union([
          Type.Integer({ minimum: 0, maximum: 23 }),
          Type.Null(),
        ]),
      },
      { additionalProperties: false },
    ),
    /** Channel with the most taps and its share of the period. */
    topChannel: Type.Object(
      {
        channel: Type.Union([ChannelKeySchema, Type.Null()]),
        share: Type.Number({ minimum: 0, maximum: 1 }),
        previousChannel: Type.Union([ChannelKeySchema, Type.Null()]),
      },
      { additionalProperties: false },
    ),
    /** Local day with the most taps. */
    peakDay: Type.Object(
      {
        date: Type.Union([Type.String({ format: "date" }), Type.Null()]),
        taps: Type.Integer({ minimum: 0 }),
      },
      { additionalProperties: false },
    ),
  },
  { $id: "AnalyticsKpis", additionalProperties: false },
);
export type AnalyticsKpis = Static<typeof AnalyticsKpisSchema>;

export const AnalyticsSummarySchema = Type.Object(
  {
    /**
     * `analytics_engine`: live aggregates. `unavailable`: the server has no
     * query credential configured, so every count is zero by construction.
     */
    source: Type.Union([
      Type.Literal("analytics_engine"),
      Type.Literal("unavailable"),
    ]),
    days: Type.Integer({ minimum: 1, maximum: 90 }),
    generatedAt: DateTimeSchema,
    /** IANA time zone used for daily buckets and the weekday × hour matrix. */
    timezone: Type.Optional(Type.String({ maxLength: 64 })),
    /** Same metrics for the immediately preceding period of equal length. */
    previous: Type.Optional(
      Type.Object(
        {
          taps: Type.Integer({ minimum: 0 }),
          clicks: Type.Integer({ minimum: 0 }),
          leads: Type.Integer({ minimum: 0 }),
          channels: Type.Optional(ChannelCountsSchema),
        },
        { additionalProperties: false },
      ),
    ),
    /**
     * The previous period day by day, aligned with `daily` (same length and
     * order: `previousDaily[i]` is `days` days before `daily[i]`).
     */
    previousDaily: Type.Optional(
      Type.Array(
        Type.Object(
          {
            date: Type.String({ format: "date" }),
            taps: Type.Integer({ minimum: 0 }),
            clicks: Type.Integer({ minimum: 0 }),
            leads: Type.Integer({ minimum: 0 }),
          },
          { additionalProperties: false },
        ),
        { maxItems: 90 },
      ),
    ),
    /** Indicators computed by the server, each with its previous-period value. */
    kpis: Type.Optional(AnalyticsKpisSchema),
    /** 7 rows (Monday first) × 24 hours of taps, in `timezone`. */
    weekdayHour: Type.Optional(
      Type.Array(
        Type.Array(Type.Integer({ minimum: 0 }), {
          minItems: 24,
          maxItems: 24,
        }),
        { minItems: 7, maxItems: 7 },
      ),
    ),
    experiences: Type.Optional(
      Type.Array(
        Type.Object(
          {
            experienceId: UuidSchema,
            name: Type.String({ maxLength: 120 }),
            type: ExperienceTypeSchema,
            taps: Type.Integer({ minimum: 0 }),
            clicks: Type.Integer({ minimum: 0 }),
            leads: Type.Integer({ minimum: 0 }),
          },
          { additionalProperties: false },
        ),
        { maxItems: 200 },
      ),
    ),
    groups: Type.Optional(
      Type.Array(
        Type.Object(
          {
            groupId: UuidSchema,
            name: Type.String({ maxLength: 120 }),
            /** Tree depth (0 = top level), so the panel can indent without
             * recomputing the tree itself (A9-26). */
            depth: Type.Integer({ minimum: 0 }),
            taps: Type.Integer({ minimum: 0 }),
            clicks: Type.Integer({ minimum: 0 }),
            leads: Type.Integer({ minimum: 0 }),
          },
          { additionalProperties: false },
        ),
        // Every group, including those with zero visits (A9-26): the panel
        // no longer filters or recomputes this list.
        { maxItems: 200 },
      ),
    ),
    activeTouchpoints: Type.Integer({ minimum: 0 }),
    totals: Type.Object(
      {
        taps: Type.Integer({ minimum: 0 }),
        clicks: Type.Integer({ minimum: 0 }),
        leads: Type.Integer({ minimum: 0 }),
        channels: ChannelCountsSchema,
        /** Clicks by the channel the visit came from. */
        clickChannels: Type.Optional(ChannelCountsSchema),
      },
      { additionalProperties: false },
    ),
    daily: Type.Array(
      Type.Object(
        {
          date: Type.String({ format: "date" }),
          taps: Type.Integer({ minimum: 0 }),
          clicks: Type.Integer({ minimum: 0 }),
          /** Consented leads received that local day (Postgres-backed). */
          leads: Type.Optional(Type.Integer({ minimum: 0 })),
          channels: ChannelCountsSchema,
        },
        { additionalProperties: false },
      ),
      { maxItems: 90 },
    ),
    /** Last 24 hours, one bucket per UTC hour. */
    hourly: Type.Array(
      Type.Object(
        {
          hour: DateTimeSchema,
          taps: Type.Integer({ minimum: 0 }),
        },
        { additionalProperties: false },
      ),
      { maxItems: 48 },
    ),
    touchpoints: Type.Array(
      Type.Object(
        {
          touchpointId: UuidSchema,
          name: Type.String({ maxLength: 120 }),
          /** Physical format, or `link` (A9-24): this list is «Por QR,
           * etiqueta o link», not only physical Touchpoints. */
          kind: TouchpointKindSchema,
          /** A Kardo piece's model, to show its picture (ADR 026). */
          pieceModel: Type.Optional(
            Type.Union([PieceModelSchema, Type.Null()]),
          ),
          taps: Type.Integer({ minimum: 0 }),
          clicks: Type.Integer({ minimum: 0 }),
          leads: Type.Integer({ minimum: 0 }),
          channels: ChannelCountsSchema,
        },
        { additionalProperties: false },
      ),
      { maxItems: 1_000 },
    ),
    /**
     * How many of the workspace's QR, etiquetas and links were left out of
     * `touchpoints` because there were more than its cap (A9-23). The ones
     * shown are always the most-tapped, so an omitted one never outranks a
     * shown one.
     */
    touchpointsOmitted: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { $id: "AnalyticsSummary", additionalProperties: false },
);
export type AnalyticsSummary = Static<typeof AnalyticsSummarySchema>;

// ---------------------------------------------------------------------------
// Resumen dashboard layout (per member and workspace)
// ---------------------------------------------------------------------------

/** Grid columns of the Resumen dashboard on wide screens. */
export const DASHBOARD_COLUMNS = 12;
export const DASHBOARD_MAX_WIDGETS = 40;

export const DashboardWidgetSchema = Type.Object(
  {
    /** Client-generated, stable per widget instance. */
    id: Type.String({ pattern: "^[a-z0-9-]{1,40}$" }),
    /** Widget kind from the panel's catalog; unknown kinds are ignored. */
    type: Type.String({ pattern: "^[a-zA-Z0-9]{1,32}$" }),
    x: Type.Integer({ minimum: 0, maximum: DASHBOARD_COLUMNS - 1 }),
    y: Type.Integer({ minimum: 0, maximum: 400 }),
    w: Type.Integer({ minimum: 1, maximum: DASHBOARD_COLUMNS }),
    h: Type.Integer({ minimum: 1, maximum: 24 }),
    /** Per-widget options (metric, chart style, top N…): flat and small. */
    config: Type.Record(
      Type.String({ pattern: "^[a-zA-Z0-9]{1,32}$" }),
      Type.Union([
        Type.String({ maxLength: 60 }),
        Type.Number(),
        Type.Boolean(),
      ]),
      { maxProperties: 12 },
    ),
  },
  { additionalProperties: false },
);
export type DashboardWidget = Static<typeof DashboardWidgetSchema>;

export const DashboardLayoutSchema = Type.Object(
  {
    version: Type.Literal(1),
    widgets: Type.Array(DashboardWidgetSchema, {
      maxItems: DASHBOARD_MAX_WIDGETS,
    }),
  },
  { $id: "DashboardLayout", additionalProperties: false },
);
export type DashboardLayout = Static<typeof DashboardLayoutSchema>;

export const SaveDashboardLayoutSchema = Type.Object(
  { layout: DashboardLayoutSchema },
  { $id: "SaveDashboardLayout", additionalProperties: false },
);
export type SaveDashboardLayout = Static<typeof SaveDashboardLayoutSchema>;

export const DashboardLayoutStateSchema = Type.Object(
  {
    /** Null until the member saves a layout: the panel shows its default. */
    layout: Type.Union([DashboardLayoutSchema, Type.Null()]),
    updatedAt: Type.Union([DateTimeSchema, Type.Null()]),
  },
  { $id: "DashboardLayoutState", additionalProperties: false },
);
export type DashboardLayoutState = Static<typeof DashboardLayoutStateSchema>;

// ---------------------------------------------------------------------------
// Item availability (Disponibilidad)
//
// Live, operational state of the items of a Menu or Catalog: available, sold
// out or hidden, plus an optional count of units left. It is deliberately NOT
// part of the Experience content: changing it never creates a version and
// never goes through publishing. The Resolver applies it on top of the
// published snapshot the moment it changes.
// ---------------------------------------------------------------------------

/** Experience types whose items carry live availability. */
export const availabilityExperienceTypes = ["menu", "catalog"] as const;
export type AvailabilityExperienceType =
  (typeof availabilityExperienceTypes)[number];

export const itemAvailabilityStatuses = [
  "available",
  "sold_out",
  "hidden",
] as const;
export type ItemAvailabilityStatus = (typeof itemAvailabilityStatuses)[number];
export const ItemAvailabilityStatusSchema = Type.Union(
  itemAvailabilityStatuses.map((status) => Type.Literal(status)),
);

/** Highest count of units left an item can show. */
export const ITEM_QUANTITY_MAX = 9_999;

/**
 * Units left, shown publicly as "Quedan N". Null means the business does not
 * count units for this item. A count of 0 reads as sold out.
 *
 * Deliberately one `nullable` integer instead of a union: with Fastify's
 * `coerceTypes`, ajv tries the integer branch of an `anyOf` first and turns
 * `null` into `0` (sold out!) without undoing it. A single nullable type
 * only coerces when the value matches neither integer nor null.
 */
const ItemQuantitySchema = Type.Unsafe<number | null>({
  type: "integer",
  nullable: true,
  minimum: 0,
  maximum: ITEM_QUANTITY_MAX,
});

export const ItemAvailabilityChangeSchema = Type.Object(
  {
    itemId: ItemIdSchema,
    status: ItemAvailabilityStatusSchema,
    quantity: ItemQuantitySchema,
  },
  { additionalProperties: false },
);
export type ItemAvailabilityChange = Static<
  typeof ItemAvailabilityChangeSchema
>;

/** Only the listed items change; the rest keep their current state. */
export const SaveItemAvailabilitySchema = Type.Object(
  {
    items: Type.Array(ItemAvailabilityChangeSchema, {
      minItems: 1,
      maxItems: 150,
    }),
  },
  { $id: "SaveItemAvailability", additionalProperties: false },
);
export type SaveItemAvailability = Static<typeof SaveItemAvailabilitySchema>;

export const AvailabilityItemSchema = Type.Object(
  {
    id: ItemIdSchema,
    name: SafeTextSchema,
    /** A choice of a dish (relevo 37, D1): the dish's id. Choices come
     * right after their dish in the same section. */
    choiceOf: Type.Optional(ItemIdSchema),
    description: Type.Optional(Type.String({ maxLength: 300 })),
    price: Type.Optional(PriceSchema),
    imageAssetId: Type.Optional(UuidSchema),
    status: ItemAvailabilityStatusSchema,
    quantity: ItemQuantitySchema,
    /** Last availability change of this item; null while it was never set. */
    updatedAt: Type.Union([DateTimeSchema, Type.Null()]),
  },
  { additionalProperties: false },
);
export type AvailabilityItem = Static<typeof AvailabilityItemSchema>;

export const AvailabilitySectionSchema = Type.Object(
  {
    id: ItemIdSchema,
    /** Menu section name; null for a Catalog, which is a single list. */
    name: Type.Union([SafeTextSchema, Type.Null()]),
    /** Dishes and their choices (D1). */
    items: Type.Array(AvailabilityItemSchema, { maxItems: 300 }),
  },
  { additionalProperties: false },
);
export type AvailabilitySection = Static<typeof AvailabilitySectionSchema>;

export const AvailabilityExperienceSchema = Type.Object(
  {
    experienceId: UuidSchema,
    name: SafeTextSchema,
    type: Type.Union(
      availabilityExperienceTypes.map((type) => Type.Literal(type)),
    ),
    currency: CurrencySchema,
    /** Items come from the latest published version (what customers see),
     * or from the draft while the Experience was never published. */
    source: Type.Union([Type.Literal("published"), Type.Literal("draft")]),
    /** The draft differs from the latest published version. */
    hasUnpublishedChanges: Type.Boolean(),
    /** Touchpoints currently serving this Experience. */
    liveTouchpointCount: Type.Integer({ minimum: 0 }),
    sections: Type.Array(AvailabilitySectionSchema, { maxItems: 10 }),
    /** Most recent availability change of any of its items. */
    updatedAt: Type.Union([DateTimeSchema, Type.Null()]),
  },
  { $id: "AvailabilityExperience", additionalProperties: false },
);
export type AvailabilityExperience = Static<
  typeof AvailabilityExperienceSchema
>;

export const AvailabilityOverviewSchema = Type.Object(
  { experiences: Type.Array(AvailabilityExperienceSchema, { maxItems: 500 }) },
  { $id: "AvailabilityOverview", additionalProperties: false },
);
export type AvailabilityOverview = Static<typeof AvailabilityOverviewSchema>;

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

export const imageMediaTypes = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;
export type ImageMediaType = (typeof imageMediaTypes)[number];
export const assetMediaTypes = [...imageMediaTypes, "application/pdf"] as const;
/** The largest file Kardo takes (5 MB), for the API, the Worker's twin and
 * every upload in the panel (domain audit A2-46). */
export const ASSET_MAX_BYTES = 5_242_880;
export type AssetMediaType = (typeof assetMediaTypes)[number];
export function isImageMediaType(value: string): value is ImageMediaType {
  return (imageMediaTypes as readonly string[]).includes(value);
}
const AssetMediaTypeSchema = Type.Union([
  Type.Literal("image/png"),
  Type.Literal("image/jpeg"),
  Type.Literal("image/webp"),
  Type.Literal("application/pdf"),
]);

export const AssetUploadRequestSchema = Type.Object(
  {
    filename: Type.String({ minLength: 1, maxLength: 255 }),
    mediaType: AssetMediaTypeSchema,
    byteSize: Type.Integer({ minimum: 1, maximum: ASSET_MAX_BYTES }),
  },
  { $id: "AssetUploadRequest", additionalProperties: false },
);
export type AssetUploadRequest = Static<typeof AssetUploadRequestSchema>;

export const AssetUploadAuthorizationSchema = Type.Object(
  {
    assetId: UuidSchema,
    uploadUrl: Type.String({ format: "uri" }),
    expiresAt: DateTimeSchema,
  },
  { $id: "AssetUploadAuthorization", additionalProperties: false },
);
export type AssetUploadAuthorization = Static<
  typeof AssetUploadAuthorizationSchema
>;

export const AssetSchema = Type.Object(
  {
    id: UuidSchema,
    filename: Type.String({ minLength: 1, maxLength: 255 }),
    mediaType: AssetMediaTypeSchema,
    // Quarantined records have not been measured yet and report 0 bytes.
    byteSize: Type.Integer({ minimum: 0, maximum: ASSET_MAX_BYTES }),
    sha256: Type.String({ pattern: "^[a-f0-9]{64}$" }),
    status: Type.Union([
      Type.Literal("quarantined"),
      Type.Literal("validated"),
      Type.Literal("rejected"),
    ]),
    createdAt: Type.Optional(DateTimeSchema),
    /** Why the Assets Worker rejected the file (only when `rejected`), e.g.
     * "The PDF includes active content."; the panel explains it in Spanish. */
    rejectedReason: Type.Optional(Type.String({ maxLength: 300 })),
  },
  { $id: "Asset", additionalProperties: false },
);
export type Asset = Static<typeof AssetSchema>;

export const AssetListSchema = Type.Array(AssetSchema, { $id: "AssetList" });

/** GET /v1/workspaces/:workspaceId/assets/:assetId/usage: the Experiences
 * that keep a library file in use (an active draft, or a version live on a
 * Touchpoint), so the panel says where before anyone tries to delete it. */
export const AssetUsageSchema = Type.Object(
  {
    experiences: Type.Array(
      Type.Object(
        {
          id: UuidSchema,
          name: Type.String({ minLength: 1, maxLength: 120 }),
          /** A published version on a Touchpoint uses it right now. */
          live: Type.Boolean(),
        },
        { additionalProperties: false },
      ),
      { maxItems: 50 },
    ),
    /** Where the business profile uses it (domain audit A2-45): a file in
     * one of these cannot be deleted until it is changed in Configuración. */
    profile: Type.Optional(
      Type.Array(
        Type.Union([
          Type.Literal("logo"),
          Type.Literal("cover"),
          Type.Literal("background"),
        ]),
        { maxItems: 3 },
      ),
    ),
    /** QR designs that show it as their logo; deleting the file takes the
     * logo out of those designs (printed QR keep working). */
    qrLogoCount: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { $id: "AssetUsage", additionalProperties: false },
);
export type AssetUsage = Static<typeof AssetUsageSchema>;

/** PATCH /v1/workspaces/:workspaceId/assets/:assetId: renames a library
 * file (the name only helps the team find it; Experiences keep using it). */
export const RenameAssetSchema = Type.Object(
  {
    filename: Type.String({ minLength: 1, maxLength: 255, pattern: "\\S" }),
  },
  { $id: "RenameAsset", additionalProperties: false },
);
export type RenameAsset = Static<typeof RenameAssetSchema>;

// ---------------------------------------------------------------------------
// Publications
// ---------------------------------------------------------------------------

export const PublicationIntentSchema = Type.Object(
  {
    publicationId: UuidSchema,
    versionId: UuidSchema,
    revision: Type.Integer({ minimum: 1 }),
    status: Type.Literal("pending"),
  },
  { $id: "PublicationIntent" },
);

export type PublicationIntent = Static<typeof PublicationIntentSchema>;

/**
 * Publishing an Experience freezes one immutable version and queues one
 * publication per resolved Touchpoint target, atomically.
 */
export const PublicationBatchSchema = Type.Object(
  {
    versionId: UuidSchema,
    versionRevision: Type.Integer({ minimum: 1 }),
    publications: Type.Array(
      Type.Object(
        {
          touchpointId: UuidSchema,
          publicationId: UuidSchema,
          revision: Type.Integer({ minimum: 1 }),
          status: Type.Literal("pending"),
        },
        { additionalProperties: false },
      ),
      { minItems: 1, maxItems: 500 },
    ),
    /** Group members left untouched because a direct target takes precedence. */
    skipped: Type.Optional(
      Type.Array(
        Type.Object(
          {
            touchpointId: UuidSchema,
            touchpointName: Type.String({ maxLength: 120 }),
            /** Why the Touchpoint was left untouched:
             * - `DIRECT_TARGET_PRECEDENCE`: another Experience is assigned to
             *   it directly (or from a nearer group) and wins (ADR 021).
             * - `REPLACE_NOT_CONFIRMED`: it currently shows another Experience
             *   and the publish did not list it in `replaceTargets`, so it was
             *   kept rather than silently replaced (security review, round 4). */
            reason: Type.Union([
              Type.Literal("DIRECT_TARGET_PRECEDENCE"),
              Type.Literal("REPLACE_NOT_CONFIRMED"),
            ]),
            liveExperienceName: Type.Union([
              Type.String({ maxLength: 120 }),
              Type.Null(),
            ]),
          },
          { additionalProperties: false },
        ),
        { maxItems: 500 },
      ),
    ),
  },
  { $id: "PublicationBatch", additionalProperties: false },
);
export type PublicationBatch = Static<typeof PublicationBatchSchema>;

/**
 * Optional body of `POST …/publication-intents` (security review, round 4,
 * B1). Without a body, publishing keeps today's behavior and replaces whatever
 * each target shows. With a body, only the Touchpoints listed in
 * `replaceTargets` are taken over; any other target currently showing a
 * different Experience is left as it is and reported in `skipped`
 * (`REPLACE_NOT_CONFIRMED`). A brand-new Link sends `{ replaceTargets: [] }`
 * so it never replaces anything.
 */
export const PublishIntentOptionsSchema = Type.Object(
  {
    replaceTargets: Type.Optional(Type.Array(UuidSchema, { maxItems: 500 })),
  },
  { $id: "PublishIntentOptions", additionalProperties: false },
);
export type PublishIntentOptions = Static<typeof PublishIntentOptionsSchema>;

// ---------------------------------------------------------------------------
// Lead delivery (Kardo always stores the lead; these are optional copies)
// ---------------------------------------------------------------------------

export const LeadDeliverySettingsSchema = Type.Object(
  {
    notifyEmail: Type.Boolean(),
    notifyRecipients: Type.Array(
      Type.String({ format: "email", maxLength: 320 }),
      {
        maxItems: 5,
      },
    ),
    webhookUrl: Type.Union([SafeUrlSchema, Type.Null()]),
    /** Whether a signing secret exists (the secret itself is never returned again). */
    webhookConfigured: Type.Boolean(),
    /** Whether the server has an email provider configured. */
    emailAvailable: Type.Boolean(),
  },
  { $id: "LeadDeliverySettings", additionalProperties: false },
);
export type LeadDeliverySettings = Static<typeof LeadDeliverySettingsSchema>;

export const UpdateLeadDeliverySettingsSchema = Type.Object(
  {
    notifyEmail: Type.Boolean(),
    notifyRecipients: Type.Array(
      Type.String({ format: "email", maxLength: 320 }),
      {
        maxItems: 5,
      },
    ),
    webhookUrl: Type.Union([SafeUrlSchema, Type.Null()]),
    /** Generates a new webhook signing secret (returned once). */
    rotateWebhookSecret: Type.Optional(Type.Boolean()),
  },
  { $id: "UpdateLeadDeliverySettings", additionalProperties: false },
);
export type UpdateLeadDeliverySettings = Static<
  typeof UpdateLeadDeliverySettingsSchema
>;

/** Only a new webhook secret: nothing else of the delivery settings changes
 * (domain audit A2-50). Answers with `LeadDeliverySettingsResult`. */
export const RotateWebhookSecretSchema = Type.Object(
  {},
  { $id: "RotateWebhookSecret", additionalProperties: false },
);

export const LeadDeliverySettingsResultSchema = Type.Object(
  {
    settings: LeadDeliverySettingsSchema,
    /** Plain signing secret, present only right after creation or rotation. */
    webhookSecret: Type.Union([
      Type.String({ pattern: "^whsec_[A-Za-z0-9_-]{32,64}$" }),
      Type.Null(),
    ]),
  },
  { $id: "LeadDeliverySettingsResult", additionalProperties: false },
);
export type LeadDeliverySettingsResult = Static<
  typeof LeadDeliverySettingsResultSchema
>;

/** Maximum organizations a person can own (plans may raise it later). */
export const maxOwnedOrganizations = 3;
export * from "./staff.js";

// ---------------------------------------------------------------------------
// Organization profile and brand
// ---------------------------------------------------------------------------

export const industries = [
  "restaurante",
  "cafeteria",
  "bar",
  "hotel",
  "retail",
  "salud",
  "belleza",
  "servicios",
  "eventos",
  "educacion",
  "inmobiliaria",
  /** Relevo 37 (E4): they fell into «Tienda» or «Servicios», and a bakery
   * read as a café. */
  "floreria",
  "panaderia",
  "agencia",
  "papeleria",
  "otro",
] as const;
export type Industry = (typeof industries)[number];

/**
 * The one catalog of giros (domain audit 2026-10-13, A2-5): `label` is the
 * short name shown once chosen; `option` is how an owner would say it, for
 * every selector (a taquero did not know his taquería was a «Restaurante»,
 * 2026-10-03 study, finding 12). Listed most common first. Any table keyed
 * by giro (templates, AI recipes, first looks) is `Record<Industry, …>`, so
 * a giro added here cannot be forgotten there.
 */
export const industryCatalog: readonly {
  value: Industry;
  label: string;
  option: string;
}[] = [
  {
    value: "restaurante",
    label: "Restaurante",
    option: "Restaurante, fonda, taquería o cocina económica",
  },
  { value: "cafeteria", label: "Cafetería", option: "Cafetería" },
  {
    value: "panaderia",
    label: "Panadería",
    option: "Panadería o pastelería",
  },
  { value: "bar", label: "Bar", option: "Bar o cantina" },
  {
    value: "belleza",
    label: "Belleza",
    option: "Belleza: estética, uñas, barbería o spa",
  },
  { value: "retail", label: "Tienda", option: "Tienda o comercio" },
  { value: "floreria", label: "Florería", option: "Florería" },
  {
    value: "papeleria",
    label: "Papelería",
    option: "Papelería o regalos",
  },
  {
    value: "servicios",
    label: "Servicios profesionales",
    option: "Servicios profesionales: despacho, contador, abogado",
  },
  {
    value: "salud",
    label: "Salud",
    option: "Salud: consultorio, dentista o terapia",
  },
  {
    value: "educacion",
    label: "Escuela",
    option: "Escuela, cursos o academia",
  },
  {
    value: "eventos",
    label: "Eventos",
    option: "Eventos o salón de fiestas",
  },
  {
    value: "agencia",
    label: "Agencia",
    option: "Agencia: marketing, diseño o viajes",
  },
  { value: "inmobiliaria", label: "Inmobiliaria", option: "Inmobiliaria" },
  { value: "hotel", label: "Hotel", option: "Hotel u hospedaje" },
  { value: "otro", label: "Otro", option: "Otro" },
];

/** The short name of a giro; the raw value when it is not a known one. */
export function industryLabel(value: string | null | undefined): string {
  if (!value) return "";
  return (
    industryCatalog.find((industry) => industry.value === value)?.label ?? value
  );
}

export const WORKSPACE_PROFILE_ABOUT_MAX = 280;
/** Room for split shifts and a different day (relevo 37, C1a): «Lunes a
 * viernes, de 9:00 a 14:00 y de 16:00 a 20:00; sábado, de 9:00 a 14:00». */
export const WORKSPACE_PROFILE_HOURS_MAX = 200;

/** Organization profile and brand (Configuración → Organización / Marca). */
export const WorkspaceProfileSchema = Type.Object(
  {
    industry: Type.Optional(
      Type.Union(industries.map((industry) => Type.Literal(industry))),
    ),
    legalName: Type.Optional(Type.String({ maxLength: 160 })),
    website: Type.Optional(SafeUrlSchema),
    email: Type.Optional(Type.String({ format: "email", maxLength: 320 })),
    phone: Type.Optional(
      Type.String({ maxLength: 40, pattern: "^[+0-9 ()-]{6,40}$" }),
    ),
    city: Type.Optional(Type.String({ maxLength: 120 })),
    /** Street, number and neighborhood (relevo 36). Kept on the profile; no
     * page shows it yet. */
    address: Type.Optional(Type.String({ maxLength: 200 })),
    country: Type.Optional(Type.String({ pattern: "^[A-Z]{2}$" })),
    timezone: Type.Optional(Type.String({ maxLength: 64 })),
    /** "Sobre tu negocio": one or two sentences on what the business does
     * and for whom. Kardo's AI reads it as data on every generation, so the
     * customer does not retype it (2026-10-02). */
    about: Type.Optional(
      Type.String({ maxLength: WORKSPACE_PROFILE_ABOUT_MAX }),
    ),
    /** "Horario": when the business is open, in the owner's own short words
     * («Lun a sáb, 8:00 a 17:00»). Kardo's templates and AI use it instead
     * of an example schedule (2026-10-03 study, finding 13). */
    hours: Type.Optional(
      Type.String({ maxLength: WORKSPACE_PROFILE_HOURS_MAX }),
    ),
    logoAssetId: Type.Optional(UuidSchema),
    /** The organization's cover: a wide photo of the place or of what it
     * sells. The Estudio puts it at the top of new designs and Kardo's AI
     * receives it with the logo (2026-10-02). */
    coverAssetId: Type.Optional(UuidSchema),
    brand: Type.Optional(
      Type.Object(
        { primary: HexColorSchema, accent: HexColorSchema },
        { additionalProperties: false },
      ),
    ),
    /** Starting theme for new Experiences and Links. */
    defaultTheme: Type.Optional(ExperienceThemeSchema),
  },
  { $id: "WorkspaceProfile", additionalProperties: false },
);
export type WorkspaceProfile = Static<typeof WorkspaceProfileSchema>;

/**
 * Changes some fields of the organization profile and keeps the rest
 * (domain audit 2026-10-13, A2-1): seven screens wrote the whole profile
 * from the copy they had loaded, so one could erase what another saved. A
 * field left out stays as stored; `null` removes it. The server merges.
 */
const nullable = <T extends TSchema>(schema: T) =>
  Type.Optional(Type.Union([schema, Type.Null()]));
const profileField = WorkspaceProfileSchema.properties;
export const WorkspaceProfilePatchSchema = Type.Object(
  {
    industry: nullable(
      Type.Union(industries.map((industry) => Type.Literal(industry))),
    ),
    legalName: nullable(Type.String({ maxLength: 160 })),
    website: nullable(SafeUrlSchema),
    email: nullable(Type.String({ format: "email", maxLength: 320 })),
    phone: nullable(
      Type.String({ maxLength: 40, pattern: "^[+0-9 ()-]{6,40}$" }),
    ),
    city: nullable(Type.String({ maxLength: 120 })),
    address: nullable(Type.String({ maxLength: 200 })),
    country: nullable(Type.String({ pattern: "^[A-Z]{2}$" })),
    timezone: nullable(Type.String({ maxLength: 64 })),
    about: nullable(Type.String({ maxLength: WORKSPACE_PROFILE_ABOUT_MAX })),
    hours: nullable(Type.String({ maxLength: WORKSPACE_PROFILE_HOURS_MAX })),
    logoAssetId: nullable(UuidSchema),
    coverAssetId: nullable(UuidSchema),
    brand: nullable(
      Type.Object(
        { primary: HexColorSchema, accent: HexColorSchema },
        { additionalProperties: false },
      ),
    ),
    defaultTheme: nullable(ExperienceThemeSchema),
  },
  { $id: "WorkspaceProfilePatch", additionalProperties: false },
);
export type WorkspaceProfilePatch = {
  [Key in keyof typeof profileField]?: WorkspaceProfile[Key] | null;
};

/** The stored profile with `patch` applied: fields left out stay, `null`
 * removes. Pure, shared by the API and the panel's demo mode. */
export function applyWorkspaceProfilePatch(
  profile: WorkspaceProfile,
  patch: WorkspaceProfilePatch,
): WorkspaceProfile {
  const next: Record<string, unknown> = { ...profile };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (value === null) delete next[key];
    else next[key] = value;
  }
  return next as WorkspaceProfile;
}

// ---------------------------------------------------------------------------
// In-app help assistant
// ---------------------------------------------------------------------------

export const helpSections = [
  "general",
  "overview",
  "touchpoints",
  "qr-studio",
  "links",
  "experiences",
  "availability",
  "assets",
  "analytics",
  "leads",
  "team",
  "settings",
  /** Configuración, one guide per sub-section (ADR 023). */
  "account",
  "security",
  "brand",
  "plan",
] as const;
export type HelpSection = (typeof helpSections)[number];

export const AskHelpSchema = Type.Object(
  {
    section: Type.Union(helpSections.map((section) => Type.Literal(section))),
    question: Type.String({ minLength: 3, maxLength: 500 }),
    history: Type.Optional(
      Type.Array(
        Type.Object(
          {
            role: Type.Union([Type.Literal("user"), Type.Literal("assistant")]),
            text: Type.String({ minLength: 1, maxLength: 2000 }),
          },
          { additionalProperties: false },
        ),
        { maxItems: 6 },
      ),
    ),
  },
  { $id: "AskHelp", additionalProperties: false },
);
export type AskHelp = Static<typeof AskHelpSchema>;

export const HelpAnswerSchema = Type.Object(
  { answer: Type.String({ maxLength: 4000 }) },
  { $id: "HelpAnswer", additionalProperties: false },
);
export type HelpAnswer = Static<typeof HelpAnswerSchema>;
export * from "./account.js";
export * from "./billing.js";
export * from "./business-slug.js";
export * from "./custom-html.js";
export * from "./custom-html-prompt.js";
export * from "./design.js";
export * from "./design-directions.js";
export * from "./design-guide.js";
export * from "./design-prompt.js";
export * from "./notifications.js";
export * from "./organization-prompt.js";
export * from "./pieces.js";
export * from "./qr.js";
export * from "./status.js";
