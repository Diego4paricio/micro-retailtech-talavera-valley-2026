import {
  type AccountDeletionCheck,
  type AccountExport,
  type AccountSession,
  type AccountSignIn,
  SIGN_IN_HISTORY_DAYS,
} from "@kardo/contracts";
import type { Sql } from "postgres";
import type { CustomerIdentity } from "./context.js";
import { withCustomerContext } from "./context.js";

/**
 * Tu cuenta → Seguridad (ADR 023): the person's own Supabase sessions and
 * sign-in history. Sessions are read and closed only through
 * `kardo_private` functions bound to `kardo.subject`, so a request can never
 * see or close someone else's.
 */
export type AccountRepository = {
  listSessions(identity: CustomerIdentity): Promise<AccountSession[]>;
  /** How many it closed: 0 when it was not the person's or was gone. */
  closeSession(identity: CustomerIdentity, sessionId: string): Promise<number>;
  /** Closes every session but the one making the request. */
  closeOtherSessions(identity: CustomerIdentity): Promise<string[]>;
  listSignIns(identity: CustomerIdentity): Promise<AccountSignIn[]>;
  /** What deleting the account needs and takes with it (ADR 023). */
  deletionCheck(identity: CustomerIdentity): Promise<AccountDeletionCheck>;
  /** Deletes the account and the spaces where the person is alone. */
  deleteAccount(
    identity: CustomerIdentity,
  ): Promise<
    | { status: "deleted"; erased: string[] }
    | { status: "reauthenticate" }
    | { status: "blocked"; check: AccountDeletionCheck }
  >;
  exportData(identity: CustomerIdentity): Promise<AccountExport>;
};

type SessionRow = {
  id: string;
  created_at: Date;
  last_active_at: Date;
  user_agent: string | null;
  ip: string | null;
  aal: string | null;
};

type SignInRow = {
  id: string;
  signed_in_at: Date;
  user_agent: string | null;
  ip: string | null;
};

export function createPostgresAccountRepository(sql: Sql): AccountRepository {
  async function readDeletionCheck(
    identity: CustomerIdentity,
  ): Promise<AccountDeletionCheck> {
    const [row] = await withCustomerContext(
      sql,
      identity,
      (tx) => tx<{ check: AccountDeletionCheck }[]>`
        select kardo_private.customer_account_deletion_check(${identity.sessionId ?? null}::uuid) as check
      `,
    );
    return row?.check ?? { recentSignIn: false, blockers: [], erase: [] };
  }

  return {
    async listSessions(identity) {
      const rows = await withCustomerContext(
        sql,
        identity,
        (tx) => tx<SessionRow[]>`
          select id, created_at, last_active_at, user_agent, ip, aal
          from kardo_private.customer_sessions()
        `,
      );
      return rows.map((row) => ({
        id: row.id,
        createdAt: new Date(row.created_at).toISOString(),
        lastActiveAt: new Date(row.last_active_at).toISOString(),
        userAgent: row.user_agent,
        ip: row.ip,
        current: row.id === identity.sessionId,
        secondFactor: row.aal === "aal2",
      }));
    },
    async closeSession(identity, sessionId) {
      const [row] = await withCustomerContext(
        sql,
        identity,
        (tx) => tx<{ closed: number }[]>`
          select kardo_private.customer_revoke_session(${sessionId}::uuid) as closed
        `,
      );
      return row?.closed ?? 0;
    },
    async closeOtherSessions(identity) {
      const keep = identity.sessionId;
      if (!keep) return [];
      return withCustomerContext(sql, identity, async (tx) => {
        const others = await tx<{ id: string }[]>`
          select id from kardo_private.customer_sessions() where id <> ${keep}::uuid
        `;
        await tx`select kardo_private.customer_revoke_other_sessions(${keep}::uuid)`;
        return others.map((row) => row.id);
      });
    },
    deletionCheck: readDeletionCheck,
    async deleteAccount(identity) {
      const [row] = await withCustomerContext(
        sql,
        identity,
        (tx) => tx<
          {
            result: {
              status: "deleted" | "reauthenticate" | "blocked";
              erased?: string[];
            };
          }[]
        >`
          select kardo_private.delete_customer_account(${identity.sessionId ?? null}::uuid) as result
        `,
      );
      const result = row?.result;
      if (result?.status === "deleted")
        return { status: "deleted", erased: result.erased ?? [] };
      if (result?.status === "blocked")
        return { status: "blocked", check: await readDeletionCheck(identity) };
      return { status: "reauthenticate" };
    },
    async exportData(identity) {
      return withCustomerContext(sql, identity, async (tx) => {
        const [profile] = await tx<ProfileExportRow[]>`
          select email, display_name, preferred_name, time_zone, hour_cycle, locale,
            marketing_emails, created_at, terms_version, privacy_version, terms_accepted_at
          from kardo_core.profiles where id = ${identity.subject}::uuid
        `;
        const organizations = await tx<
          { name: string; kind: string; role: string; joined_at: Date }[]
        >`
          select w.name, w.kind::text as kind, m.role::text as role, m.created_at as joined_at
          from kardo_core.workspace_memberships m
          join kardo_core.workspaces w on w.id = m.workspace_id
          where m.profile_id = ${identity.subject}::uuid and w.deleted_at is null
          order by m.created_at
        `;
        const factors = await tx<
          {
            friendly_name: string | null;
            factor_type: string;
            status: string;
            created_at: Date;
          }[]
        >`select friendly_name, factor_type, status, created_at from kardo_private.customer_factors()`;
        const sessions = await tx<SessionRow[]>`
          select id, created_at, last_active_at, user_agent, ip, aal
          from kardo_private.customer_sessions()
        `;
        const signIns = await tx<SignInRow[]>`
          select id, signed_in_at, user_agent, host(ip) as ip
          from kardo_core.account_sign_ins
          where profile_id = ${identity.subject}::uuid
          order by signed_in_at desc
          limit 200
        `;
        return {
          exportedAt: new Date().toISOString(),
          profile: {
            email: profile?.email ?? identity.email,
            displayName: profile?.display_name ?? null,
            preferredName: profile?.preferred_name ?? null,
            timeZone: profile?.time_zone ?? null,
            hourCycle: profile?.hour_cycle ?? null,
            locale: profile?.locale ?? "es-MX",
            marketingEmails: profile?.marketing_emails === true,
            createdAt: iso(profile?.created_at ?? new Date()),
            termsVersion: profile?.terms_version ?? null,
            privacyVersion: profile?.privacy_version ?? null,
            termsAcceptedAt: profile?.terms_accepted_at
              ? iso(profile.terms_accepted_at)
              : null,
          },
          organizations: organizations.map((row) => ({
            name: row.name,
            kind: row.kind,
            role: row.role,
            joinedAt: iso(row.joined_at),
          })),
          verificationMethods: factors.map((row) => ({
            name: row.friendly_name,
            type: row.factor_type,
            status: row.status,
            addedAt: iso(row.created_at),
          })),
          sessions: sessions.map((row) => ({
            startedAt: iso(row.created_at),
            lastActiveAt: iso(row.last_active_at),
            userAgent: row.user_agent,
            ip: row.ip,
          })),
          signIns: signIns.map((row) => ({
            signedInAt: iso(row.signed_in_at),
            userAgent: row.user_agent,
            ip: row.ip,
          })),
        };
      });
    },
    async listSignIns(identity) {
      const rows = await withCustomerContext(
        sql,
        identity,
        (tx) => tx<SignInRow[]>`
          select id, signed_in_at, user_agent, host(ip) as ip
          from kardo_core.account_sign_ins
          where profile_id = ${identity.subject}::uuid
            and signed_in_at > now() - make_interval(days => ${SIGN_IN_HISTORY_DAYS})
          order by signed_in_at desc
          limit 200
        `,
      );
      return rows.map((row) => ({
        id: row.id,
        signedInAt: new Date(row.signed_in_at).toISOString(),
        userAgent: row.user_agent,
        ip: row.ip,
      }));
    },
  };
}

type ProfileExportRow = {
  email: string | null;
  display_name: string | null;
  preferred_name: string | null;
  time_zone: string | null;
  hour_cycle: string | null;
  locale: string;
  marketing_emails: boolean;
  created_at: Date;
  terms_version: string | null;
  privacy_version: string | null;
  terms_accepted_at: Date | null;
};

const iso = (value: Date | string) => new Date(value).toISOString();

export function unavailableAccountRepository(): AccountRepository {
  const fail = () =>
    Promise.reject(new Error("Account storage is not configured."));
  return {
    listSessions: fail,
    closeSession: fail,
    closeOtherSessions: fail,
    listSignIns: fail,
    deletionCheck: fail,
    deleteAccount: fail,
    exportData: fail,
  };
}
