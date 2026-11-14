import { type Static, Type } from "@sinclair/typebox";

// ---------------------------------------------------------------------------
// Tu cuenta (ADR 023): sesiones activas e historial de inicios de sesión.
// Siempre son de la persona que pregunta, nunca de su organización.
// ---------------------------------------------------------------------------

const Uuid = Type.String({ format: "uuid" });
const DateTime = Type.String({ format: "date-time" });
const Nullable = <T extends ReturnType<typeof Type.String>>(schema: T) =>
  Type.Union([schema, Type.Null()]);

/** How many days the sign-in history keeps (pg_cron purges the rest). */
export const SIGN_IN_HISTORY_DAYS = 90;

export const AccountSessionSchema = Type.Object(
  {
    id: Uuid,
    createdAt: DateTime,
    lastActiveAt: DateTime,
    /** Raw User-Agent (≤ 512); the panel turns it into «Chrome en macOS». */
    userAgent: Nullable(Type.String({ maxLength: 512 })),
    ip: Nullable(Type.String({ maxLength: 64 })),
    /** The session making this request. */
    current: Type.Boolean(),
    /** The second factor was verified in this session (aal2). */
    secondFactor: Type.Boolean(),
  },
  { $id: "AccountSession", additionalProperties: false },
);
export type AccountSession = Static<typeof AccountSessionSchema>;

export const AccountSessionListSchema = Type.Object(
  { items: Type.Array(AccountSessionSchema, { maxItems: 50 }) },
  { $id: "AccountSessionList", additionalProperties: false },
);
export type AccountSessionList = Static<typeof AccountSessionListSchema>;

export const AccountSignInSchema = Type.Object(
  {
    id: Uuid,
    signedInAt: DateTime,
    userAgent: Nullable(Type.String({ maxLength: 512 })),
    ip: Nullable(Type.String({ maxLength: 64 })),
  },
  { $id: "AccountSignIn", additionalProperties: false },
);
export type AccountSignIn = Static<typeof AccountSignInSchema>;

export const AccountSignInListSchema = Type.Object(
  {
    items: Type.Array(AccountSignInSchema, { maxItems: 200 }),
    days: Type.Integer({ minimum: 1 }),
  },
  { $id: "AccountSignInList", additionalProperties: false },
);
export type AccountSignInList = Static<typeof AccountSignInListSchema>;

export const ClosedSessionsSchema = Type.Object(
  { closed: Type.Integer({ minimum: 0 }) },
  { $id: "ClosedSessions", additionalProperties: false },
);
export type ClosedSessions = Static<typeof ClosedSessionsSchema>;

// ---------------------------------------------------------------------------
// Tus datos (ADR 023): exportar mis datos y borrar mi cuenta.
// ---------------------------------------------------------------------------

/** Minutes a sign in (or an authenticator code) counts as recent. */
export const ACCOUNT_REAUTH_MINUTES = 10;
/** What the person types to confirm the deletion. */
export const ACCOUNT_DELETION_PHRASE = "BORRAR MI CUENTA";

export const AccountDeletionCheckSchema = Type.Object(
  {
    recentSignIn: Type.Boolean(),
    /** Each one has to be solved before the account can go. */
    blockers: Type.Array(
      Type.Object(
        {
          kind: Type.Union([
            Type.Literal("owner_with_team"),
            Type.Literal("open_subscription"),
            Type.Literal("internal"),
            Type.Literal("staff"),
          ]),
          workspaceId: Type.Union([Uuid, Type.Null()]),
          name: Type.Union([Type.String({ maxLength: 120 }), Type.Null()]),
        },
        { additionalProperties: false },
      ),
      { maxItems: 200 },
    ),
    /** Spaces where the person is alone: they are deleted with the account. */
    erase: Type.Array(
      Type.Object(
        {
          workspaceId: Uuid,
          name: Type.String({ maxLength: 120 }),
          kind: Type.Union([
            Type.Literal("personal"),
            Type.Literal("organization"),
          ]),
        },
        { additionalProperties: false },
      ),
      { maxItems: 200 },
    ),
  },
  { $id: "AccountDeletionCheck", additionalProperties: false },
);
export type AccountDeletionCheck = Static<typeof AccountDeletionCheckSchema>;

export const DeleteAccountSchema = Type.Object(
  { confirm: Type.Literal(ACCOUNT_DELETION_PHRASE) },
  { $id: "DeleteAccount", additionalProperties: false },
);
export type DeleteAccount = Static<typeof DeleteAccountSchema>;

export const AccountDeletedSchema = Type.Object(
  {
    deleted: Type.Literal(true),
    erasedWorkspaces: Type.Integer({ minimum: 0 }),
  },
  { $id: "AccountDeleted", additionalProperties: false },
);
export type AccountDeleted = Static<typeof AccountDeletedSchema>;

/** GET /v1/me/export: the person's own data (not the organizations'). */
export const AccountExportSchema = Type.Object(
  {
    exportedAt: DateTime,
    profile: Type.Object(
      {
        email: Type.String({ maxLength: 320 }),
        displayName: Type.Union([Type.String({ maxLength: 120 }), Type.Null()]),
        preferredName: Type.Union([
          Type.String({ maxLength: 60 }),
          Type.Null(),
        ]),
        timeZone: Type.Union([Type.String({ maxLength: 64 }), Type.Null()]),
        hourCycle: Type.Union([Type.String({ maxLength: 8 }), Type.Null()]),
        locale: Type.String({ maxLength: 16 }),
        marketingEmails: Type.Boolean(),
        createdAt: DateTime,
        termsVersion: Type.Union([Type.String({ maxLength: 16 }), Type.Null()]),
        privacyVersion: Type.Union([
          Type.String({ maxLength: 16 }),
          Type.Null(),
        ]),
        termsAcceptedAt: Type.Union([DateTime, Type.Null()]),
      },
      { additionalProperties: false },
    ),
    organizations: Type.Array(
      Type.Object(
        {
          name: Type.String({ maxLength: 120 }),
          kind: Type.String({ maxLength: 16 }),
          role: Type.String({ maxLength: 16 }),
          joinedAt: DateTime,
        },
        { additionalProperties: false },
      ),
      { maxItems: 500 },
    ),
    verificationMethods: Type.Array(
      Type.Object(
        {
          name: Type.Union([Type.String({ maxLength: 120 }), Type.Null()]),
          type: Type.String({ maxLength: 16 }),
          status: Type.String({ maxLength: 16 }),
          addedAt: DateTime,
        },
        { additionalProperties: false },
      ),
      { maxItems: 20 },
    ),
    sessions: Type.Array(
      Type.Object(
        {
          startedAt: DateTime,
          lastActiveAt: DateTime,
          userAgent: Type.Union([Type.String({ maxLength: 512 }), Type.Null()]),
          ip: Type.Union([Type.String({ maxLength: 64 }), Type.Null()]),
        },
        { additionalProperties: false },
      ),
      { maxItems: 50 },
    ),
    signIns: Type.Array(
      Type.Object(
        {
          signedInAt: DateTime,
          userAgent: Type.Union([Type.String({ maxLength: 512 }), Type.Null()]),
          ip: Type.Union([Type.String({ maxLength: 64 }), Type.Null()]),
        },
        { additionalProperties: false },
      ),
      { maxItems: 200 },
    ),
  },
  { $id: "AccountExport", additionalProperties: false },
);
export type AccountExport = Static<typeof AccountExportSchema>;
