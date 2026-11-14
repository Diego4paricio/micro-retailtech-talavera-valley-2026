import {
  type CompleteCustomerOnboarding,
  type CreateOrganization,
  type CustomerWorkspace,
  industries,
  type UpdateWorkspace,
} from "@kardo/contracts";
import type { Sql } from "postgres";
import { ConflictError, NotFoundError } from "../errors.js";
import { randomPublicId } from "../ids.js";
import {
  type CustomerIdentity,
  insertAuditEvent,
  requireMembershipWithPermission,
  withCustomerContext,
} from "./context.js";
import { personalSuffix } from "./display-name.js";

export type CustomerWorkspaceRepository = {
  listForCustomer(
    identity: CustomerIdentity,
  ): Promise<readonly CustomerWorkspace[]>;
  completeOnboarding(
    identity: CustomerIdentity,
    workspaceId: string,
    input: CompleteCustomerOnboarding,
  ): Promise<CustomerWorkspace>;
  updateWorkspace(
    identity: CustomerIdentity,
    workspaceId: string,
    input: UpdateWorkspace,
  ): Promise<CustomerWorkspace>;
  createOrganization(
    identity: CustomerIdentity,
    input: CreateOrganization,
  ): Promise<CustomerWorkspace>;
};

export class CustomerWorkspaceRepositoryError extends Error {}

export function unavailableCustomerWorkspaceRepository(): CustomerWorkspaceRepository {
  const unavailable = () =>
    Promise.reject(
      new CustomerWorkspaceRepositoryError(
        "Customer workspace storage is not configured.",
      ),
    );
  return {
    listForCustomer: unavailable,
    completeOnboarding: unavailable,
    updateWorkspace: unavailable,
    createOrganization: unavailable,
  };
}

type WorkspaceRow = {
  id: string;
  public_id: string;
  name: string;
  kind: "personal" | "organization";
  role: "owner" | "admin" | "editor" | "viewer";
  /** Personal or business, as declared at sign up (null before that). */
  account_type?: "personal" | "business" | null;
  /** Public address, kardo.com.mx/<slug> (null until chosen). */
  slug?: string | null;
  /** Last change of the address (null until the first change). */
  slug_changed_at?: string | Date | null;
  /** The Link that kardo.com.mx/<slug> opens. */
  main_link_id?: string | null;
};

export type WorkspaceRepositoryOptions = {
  /** Kardo trial started by onboarding (ADR 020); null turns it off. */
  trial?: { days: number; defaultPlan: string } | null;
};

export function createPostgresCustomerWorkspaceRepository(
  sql: Sql,
  options: WorkspaceRepositoryOptions = {},
): CustomerWorkspaceRepository {
  return {
    async listForCustomer(identity) {
      const rows = await withCustomerContext(
        sql,
        identity,
        (tx) =>
          tx<
            (WorkspaceRow & {
              setup_pending: boolean;
              trial_available: boolean;
            })[]
          >`
          select workspace.id, workspace.public_id, workspace.name, workspace.kind, membership.role,
            workspace.account_type, workspace.slug, workspace.slug_changed_at, workspace.main_link_id,
            -- Relevo 20, T3: a personal space that never had a trial nor a
            -- plan (joined by invitation, skipped sign up).
            (
              workspace.kind = 'personal' and membership.role = 'owner'
              and access.state = 'limited' and access.source = 'none'
            ) as setup_pending,
            kardo_billing.customer_trial_available() as trial_available
          from kardo_core.workspace_memberships membership
          join kardo_core.workspaces workspace on workspace.id = membership.workspace_id
          left join lateral kardo_billing.workspace_access(workspace.id) access on true
          where membership.profile_id = ${identity.subject}::uuid
          order by workspace.created_at asc
        `,
      );
      return rows.map((row) => {
        const workspace = toCustomerWorkspace(row);
        return row.setup_pending
          ? {
              ...workspace,
              setupPending: true,
              trialAvailable: row.trial_available,
            }
          : workspace;
      });
    },
    async completeOnboarding(identity, workspaceId, input) {
      return withCustomerContext(sql, identity, async (tx) => {
        // Onboarding used to be reachable by any member, including a
        // read-only viewer added to someone else's organization workspace.
        // Renaming a workspace is a `workspace.manage` action like any other.
        // Finishing sign up is what starts the Kardo trial, so it is the one
        // write allowed without a plan (ADR 020).
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "workspace.manage",
          { allowWithoutPlan: true },
        );
        // The person's own name and how they like to be called (owner,
        // 2026-10-04: the panel and the emails called them by the business's
        // name). Without it (an older panel), the business name becomes the
        // display name only while the account still has its default one: a
        // person who joined a team by invitation keeps their name when they
        // create their own business.
        const displayName = input.displayName?.trim();
        if (displayName) {
          const preferredName = input.preferredName?.trim() || null;
          await tx`
            update kardo_core.profiles
            set display_name = ${displayName},
              preferred_name = ${preferredName}, updated_at = now()
            where id = ${identity.subject}::uuid
          `;
        } else {
          await tx`
            update kardo_core.profiles
            set display_name = ${input.workspaceName}, updated_at = now()
            where id = ${identity.subject}::uuid
              and right(display_name, char_length(${personalSuffix})) = ${personalSuffix}
          `;
        }
        // The space of the sign up is an organization (owner decision,
        // 2026-10-01): it can invite who helps and has a business profile
        // under the same plan. A trigger only allows personal -> organization.
        // Personal or business is what the person declared first: kept for
        // the record, it changes nothing about what the space can do.
        const rows = await tx<Omit<WorkspaceRow, "role">[]>`
          update kardo_core.workspaces
          set name = ${input.workspaceName}, kind = 'organization',
            account_type = coalesce(${input.accountType ?? null}, account_type),
            updated_at = now()
          where id = ${workspaceId}::uuid
          returning id, public_id, name, kind, account_type, slug
        `;
        const row = rows[0];
        if (!row) throw new NotFoundError("Workspace was not found.");
        // The giro of the sign up is the organization's (domain audit
        // A2-55): it used to live only in the person's account metadata,
        // so templates and the AI did not see it, and a second organization
        // inherited it. Never overwrites a giro already chosen.
        const industry =
          input.industry &&
          (industries as readonly string[]).includes(input.industry)
            ? input.industry
            : null;
        if (industry) {
          await tx`
            update kardo_core.workspaces
            set profile = jsonb_set(coalesce(profile, '{}'::jsonb), '{industry}', to_jsonb(${industry}::text))
            where id = ${workspaceId}::uuid
              and not (coalesce(profile, '{}'::jsonb) ? 'industry')
          `;
        }
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "workspace.onboarded",
          targetType: "workspace",
          targetId: workspaceId,
          result: "succeeded",
          metadata: { name: input.workspaceName },
        });
        const workspace = await withMembershipRole(tx, identity, row);
        // ADR 020: finishing sign up starts the 15-day Kardo trial of the
        // plan chosen on /precios/ (or the trial plan). Only the Owner, and
        // the database refuses a second trial for the same person.
        if (options.trial && workspace.role === "owner") {
          await tx`
            select kardo_private.start_workspace_trial(
              ${workspaceId}::uuid,
              ${input.plan ?? options.trial.defaultPlan},
              ${options.trial.defaultPlan},
              ${input.billingInterval ?? "month"},
              ${options.trial.days}
            )
          `;
        }
        return toCustomerWorkspace(workspace);
      });
    },
    async updateWorkspace(identity, workspaceId, input) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "workspace.manage",
        );
        const rows = await tx<Omit<WorkspaceRow, "role">[]>`
          update kardo_core.workspaces
          set name = ${input.name}, updated_at = now()
          where id = ${workspaceId}::uuid
          returning id, public_id, name, kind, account_type, slug
        `;
        const row = rows[0];
        if (!row) throw new NotFoundError("Workspace was not found.");
        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "workspace.renamed",
          targetType: "workspace",
          targetId: workspaceId,
          result: "succeeded",
          metadata: { name: input.name },
        });
        return toCustomerWorkspace(await withMembershipRole(tx, identity, row));
      });
    },
    async createOrganization(identity, input) {
      return withCustomerContext(sql, identity, async (tx) => {
        const publicId = randomPublicId(28);
        // `create_organization_workspace` already writes its own
        // `workspace.created` audit event (SECURITY DEFINER, same
        // transaction), so there is no second insert here. It also enforces
        // the 3-organization-owned limit and raises a plain `ORGANIZATION_LIMIT`
        // exception when exceeded.
        const created = await runCatchingOrganizationLimit(
          tx<{ id: string }[]>`
            select kardo_core.create_organization_workspace(
              ${identity.subject}::uuid, ${input.name}, ${publicId}
            ) as id
          `,
        );
        const workspaceId = created[0]?.id;
        if (!workspaceId) {
          throw new CustomerWorkspaceRepositoryError(
            "Organization workspace was not created.",
          );
        }
        // A business someone adds is a business (relevo 36, E11): without
        // this it stayed without a type in the panel and in Operations.
        await tx`
          update kardo_core.workspaces
          set account_type = 'business'
          where id = ${workspaceId}::uuid and account_type is null
        `;
        const rows = await tx<WorkspaceRow[]>`
          select workspace.id, workspace.public_id, workspace.name, workspace.kind, membership.role,
            workspace.slug, workspace.slug_changed_at, workspace.main_link_id
          from kardo_core.workspaces workspace
          join kardo_core.workspace_memberships membership
            on membership.workspace_id = workspace.id and membership.profile_id = ${identity.subject}::uuid
          where workspace.id = ${workspaceId}::uuid
        `;
        const row = rows[0];
        if (!row) {
          throw new CustomerWorkspaceRepositoryError(
            "Organization workspace was not created.",
          );
        }
        return toCustomerWorkspace(row);
      });
    },
  };
}

/** `kardo_core.create_organization_workspace` raises a plain exception
 * (message `ORGANIZATION_LIMIT`) once a subject already owns 3 organization
 * workspaces. postgres.js surfaces it as a `PostgresError` whose `message`
 * contains that raised text. */
async function runCatchingOrganizationLimit<T>(query: Promise<T>): Promise<T> {
  try {
    return await query;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("ORGANIZATION_LIMIT")
    ) {
      throw new ConflictError(
        "ORGANIZATION_LIMIT",
        "You already own the maximum number of organizations.",
      );
    }
    throw error;
  }
}

async function withMembershipRole(
  tx: Sql,
  identity: CustomerIdentity,
  row: Omit<WorkspaceRow, "role">,
): Promise<WorkspaceRow> {
  const rows = await tx<{ role: WorkspaceRow["role"] }[]>`
    select role from kardo_core.workspace_memberships
    where workspace_id = ${row.id}::uuid and profile_id = ${identity.subject}::uuid
  `;
  return { ...row, role: rows[0]?.role ?? "viewer" };
}

function toCustomerWorkspace(row: WorkspaceRow): CustomerWorkspace {
  return {
    id: row.id,
    publicId: row.public_id,
    name: row.name,
    kind: row.kind,
    role: row.role,
    ...(row.account_type !== undefined
      ? { accountType: row.account_type }
      : {}),
    ...(row.slug !== undefined ? { slug: row.slug } : {}),
    ...(row.slug_changed_at !== undefined
      ? {
          slugChangedAt: row.slug_changed_at
            ? new Date(row.slug_changed_at).toISOString()
            : null,
        }
      : {}),
    ...(row.main_link_id !== undefined ? { mainLinkId: row.main_link_id } : {}),
  };
}
