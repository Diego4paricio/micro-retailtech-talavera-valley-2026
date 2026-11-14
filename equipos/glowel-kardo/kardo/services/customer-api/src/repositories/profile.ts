import type {
  AcceptLegalTerms,
  CustomerProfile,
  UpdateCustomerProfile,
} from "@kardo/contracts";
import type { Sql } from "postgres";
import type { CustomerIdentity } from "./context.js";
import { withCustomerContext } from "./context.js";

export type ProfileRepository = {
  getProfile(identity: CustomerIdentity): Promise<CustomerProfile>;
  updateProfile(
    identity: CustomerIdentity,
    input: UpdateCustomerProfile,
  ): Promise<CustomerProfile>;
  /** Clickwrap: records the accepted versions with the server's time and an
   * audit event (kardo_private.accept_legal_terms). */
  acceptLegalTerms(
    identity: CustomerIdentity,
    input: AcceptLegalTerms,
  ): Promise<CustomerProfile>;
};

export class ProfileRepositoryError extends Error {}

type ProfileRow = {
  display_name: string | null;
  terms_accepted_at?: Date | null;
  terms_version?: string | null;
  privacy_version?: string | null;
  preferred_name?: string | null;
  time_zone?: string | null;
  hour_cycle?: string | null;
  locale?: string | null;
  marketing_emails?: boolean | null;
};

const profileColumns = [
  "display_name",
  "terms_accepted_at",
  "terms_version",
  "privacy_version",
  "preferred_name",
  "time_zone",
  "hour_cycle",
  "locale",
  "marketing_emails",
] as const;

/** Only what the request sent; `null` clears a preference (ADR 023). */
function profileChanges(input: UpdateCustomerProfile): Record<string, unknown> {
  const changes: Record<string, unknown> = {};
  if (input.displayName !== undefined)
    changes.display_name = input.displayName.trim();
  if (input.preferredName !== undefined)
    changes.preferred_name = input.preferredName?.trim() || null;
  if (input.timeZone !== undefined) changes.time_zone = input.timeZone;
  if (input.hourCycle !== undefined) changes.hour_cycle = input.hourCycle;
  if (input.locale !== undefined) changes.locale = input.locale;
  if (input.marketingEmails !== undefined) {
    // When the permission was given or withdrawn, as consent evidence.
    changes.marketing_emails = input.marketingEmails;
    changes.marketing_emails_at = new Date();
  }
  return changes;
}

export function createPostgresProfileRepository(sql: Sql): ProfileRepository {
  return {
    async getProfile(identity) {
      const rows = await withCustomerContext(
        sql,
        identity,
        (tx) =>
          tx<ProfileRow[]>`
          select ${tx(profileColumns)}
          from kardo_core.profiles
          where id = ${identity.subject}::uuid
        `,
      );
      return toCustomerProfile(identity, rows[0] ?? { display_name: null });
    },
    async updateProfile(identity, input) {
      const changes = profileChanges(input);
      const rows = await withCustomerContext(
        sql,
        identity,
        (tx) =>
          tx<ProfileRow[]>`
          update kardo_core.profiles
          set ${tx(changes)}, updated_at = now()
          where id = ${identity.subject}::uuid
          returning ${tx(profileColumns)}
        `,
      );
      const row = rows[0];
      if (!row) throw new ProfileRepositoryError("Profile was not updated.");
      return toCustomerProfile(identity, row);
    },
    async acceptLegalTerms(identity, input) {
      const rows = await withCustomerContext(sql, identity, async (tx) => {
        await tx`
          select kardo_private.accept_legal_terms(${input.termsVersion}, ${input.privacyVersion})
        `;
        return tx<ProfileRow[]>`
          select ${tx(profileColumns)}
          from kardo_core.profiles
          where id = ${identity.subject}::uuid
        `;
      });
      const row = rows[0];
      if (!row) throw new ProfileRepositoryError("Profile was not found.");
      return toCustomerProfile(identity, row);
    },
  };
}

function toCustomerProfile(
  identity: CustomerIdentity,
  row: ProfileRow,
): CustomerProfile {
  return {
    subject: identity.subject,
    email: identity.email,
    displayName: row.display_name,
    termsAcceptedAt: row.terms_accepted_at
      ? new Date(row.terms_accepted_at).toISOString()
      : null,
    termsVersion: row.terms_version ?? null,
    privacyVersion: row.privacy_version ?? null,
    preferredName: row.preferred_name ?? null,
    timeZone: row.time_zone ?? null,
    hourCycle:
      row.hour_cycle === "h12" || row.hour_cycle === "h23"
        ? row.hour_cycle
        : null,
    locale: "es-MX",
    marketingEmails: row.marketing_emails === true,
  };
}
