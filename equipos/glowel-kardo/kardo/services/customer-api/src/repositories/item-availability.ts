import type {
  AvailabilityExperience,
  AvailabilityExperienceType,
  AvailabilityItem,
  AvailabilityOverview,
  AvailabilitySection,
  ItemAvailabilityChange,
  ItemAvailabilityStatus,
} from "@kardo/contracts";
import type { Sql } from "postgres";
import {
  ConflictError,
  ContentValidationError,
  NotFoundError,
  UnavailableError,
} from "../errors.js";
import type {
  ItemAvailabilityClient,
  ResolverItemAvailability,
} from "../resolver-clients/item-availability.js";
import {
  type CustomerIdentity,
  insertAuditEvent,
  requireMembership,
  requireMembershipWithPermission,
  withCustomerContext,
} from "./context.js";

/**
 * Disponibilidad: the live state of Menu and Catalog items (available, sold
 * out, hidden, units left). It lives outside the versioned content on
 * purpose: changing it never creates a version and never publishes. Postgres
 * is the source of truth; every change pushes the Experience's full state to
 * the Resolver, which applies it on top of the published snapshot.
 */
export type ItemAvailabilityRepository = {
  listAvailability(
    identity: CustomerIdentity,
    workspaceId: string,
  ): Promise<AvailabilityOverview>;
  saveAvailability(
    identity: CustomerIdentity,
    workspaceId: string,
    experienceId: string,
    changes: readonly ItemAvailabilityChange[],
  ): Promise<AvailabilityExperience>;
};

export class ItemAvailabilityRepositoryError extends Error {}

export function unavailableItemAvailabilityRepository(): ItemAvailabilityRepository {
  const unavailable = () =>
    Promise.reject(
      new ItemAvailabilityRepositoryError(
        "Item availability storage is not configured.",
      ),
    );
  return { listAvailability: unavailable, saveAvailability: unavailable };
}

type ExperienceRow = {
  id: string;
  name: string;
  type: string;
  draft_content: unknown;
  archived_at: string | Date | null;
  published_content: unknown;
  has_unpublished_changes: boolean;
  live_touchpoint_count: number;
  /** Every version currently served by some Touchpoint (save path only). */
  live_contents?: unknown;
};

type StateRow = {
  experience_id: string;
  item_id: string;
  status: ItemAvailabilityStatus;
  quantity: number | null;
  updated_at: string | Date;
};

/** One sellable item as the content describes it. */
type ContentItem = Omit<AvailabilityItem, "status" | "quantity" | "updatedAt">;
type ContentSection = { id: string; name: string | null; items: ContentItem[] };

const itemIdPattern = /^[a-zA-Z0-9_-]{1,64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAvailabilityType(type: string): type is AvailabilityExperienceType {
  return type === "menu" || type === "catalog";
}

function contentItem(value: unknown): ContentItem | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !itemIdPattern.test(value.id) ||
    typeof value.name !== "string" ||
    value.name.length === 0
  )
    return null;
  return {
    id: value.id,
    name: value.name.slice(0, 120),
    ...(typeof value.description === "string" && value.description
      ? { description: value.description.slice(0, 300) }
      : {}),
    ...(typeof value.price === "number" && Number.isFinite(value.price)
      ? { price: value.price }
      : {}),
    ...(typeof value.imageAssetId === "string"
      ? { imageAssetId: value.imageAssetId }
      : {}),
  };
}

/** A dish's choices (relevo 37, D1), each one sold out on its own. */
function contentChoices(dish: ContentItem, value: unknown): ContentItem[] {
  if (!isRecord(value) || !Array.isArray(value.choices)) return [];
  return value.choices.flatMap((choice) => {
    if (
      !isRecord(choice) ||
      typeof choice.id !== "string" ||
      !itemIdPattern.test(choice.id) ||
      typeof choice.name !== "string" ||
      choice.name.length === 0
    )
      return [];
    return [
      { id: choice.id, name: choice.name.slice(0, 120), choiceOf: dish.id },
    ];
  });
}

/** Dishes in order, each followed by its choices. */
function contentItems(value: unknown): ContentItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = contentItem(item);
    return parsed ? [parsed, ...contentChoices(parsed, item)] : [];
  });
}

/** The items of a Menu (by section) or a Catalog (one unnamed list), read
 * defensively: content comes back from Postgres and may predate a rule. */
export function availabilitySections(
  type: AvailabilityExperienceType,
  content: unknown,
): ContentSection[] {
  if (!isRecord(content)) return [];
  if (type === "catalog") {
    return [{ id: "catalog", name: null, items: contentItems(content.items) }];
  }
  if (!Array.isArray(content.sections)) return [];
  return content.sections.flatMap((section) => {
    if (
      !isRecord(section) ||
      typeof section.id !== "string" ||
      !itemIdPattern.test(section.id) ||
      typeof section.name !== "string" ||
      section.name.length === 0
    )
      return [];
    return [
      {
        id: section.id,
        name: section.name.slice(0, 120),
        items: contentItems(section.items),
      },
    ];
  });
}

/** Every item id a content lists. */
export function contentItemIds(
  type: AvailabilityExperienceType,
  content: unknown,
): string[] {
  return availabilitySections(type, content).flatMap((section) =>
    section.items.map((item) => item.id),
  );
}

function iso(value: string | Date): string {
  return new Date(value).toISOString();
}

/** Assembles what the panel shows: the items customers see now (the latest
 * published version, or the draft before the first publication) with their
 * live state. Items without a stored state are available and uncounted. */
export function buildAvailabilityExperience(
  row: ExperienceRow,
  states: readonly StateRow[],
): AvailabilityExperience {
  const type = row.type as AvailabilityExperienceType;
  const published = row.published_content ?? null;
  const content = published ?? row.draft_content;
  const byItem = new Map(states.map((state) => [state.item_id, state]));
  const sections: AvailabilitySection[] = availabilitySections(
    type,
    content,
  ).map((section) => ({
    id: section.id,
    name: section.name,
    items: section.items.map((item) => {
      const state = byItem.get(item.id);
      return {
        ...item,
        status: state?.status ?? "available",
        quantity: state?.quantity ?? null,
        updatedAt: state ? iso(state.updated_at) : null,
      };
    }),
  }));
  const latest = states.reduce<number | null>((max, state) => {
    const time = new Date(state.updated_at).getTime();
    return max === null || time > max ? time : max;
  }, null);
  const currency =
    isRecord(content) &&
    typeof content.currency === "string" &&
    /^[A-Z]{3}$/.test(content.currency)
      ? content.currency
      : "MXN";
  return {
    experienceId: row.id,
    name: row.name,
    type,
    currency,
    source: published === null ? "draft" : "published",
    hasUnpublishedChanges: published !== null && row.has_unpublished_changes,
    liveTouchpointCount: row.live_touchpoint_count,
    sections,
    updatedAt: latest === null ? null : new Date(latest).toISOString(),
  };
}

/** Item ids a change may target: the draft's, the latest version's and
 * those of every version a Touchpoint still serves (a rollback can leave an
 * older version live on some Touchpoints). */
export function knownItemIds(row: ExperienceRow): Set<string> {
  const type = row.type as AvailabilityExperienceType;
  const contents = [
    row.draft_content,
    row.published_content,
    ...(Array.isArray(row.live_contents) ? row.live_contents : []),
  ];
  return new Set(contents.flatMap((content) => contentItemIds(type, content)));
}

/** The last change for an item wins when a request repeats it. */
export function dedupeChanges(
  changes: readonly ItemAvailabilityChange[],
): ItemAvailabilityChange[] {
  const byItem = new Map<string, ItemAvailabilityChange>();
  for (const change of changes) byItem.set(change.itemId, change);
  return [...byItem.values()];
}

/** What the Resolver needs: only the entries that differ from the default
 * (available and uncounted). */
export function resolverItems(
  states: readonly Pick<StateRow, "item_id" | "status" | "quantity">[],
): ResolverItemAvailability[] {
  return states
    .filter((state) => state.status !== "available" || state.quantity !== null)
    .map((state) => ({
      id: state.item_id,
      status: state.status,
      quantity: state.quantity,
    }));
}

function experienceQuery(
  tx: Sql,
  workspaceId: string,
  options: { experienceId?: string; withLiveContents: boolean },
) {
  return tx<ExperienceRow[]>`
    select
      e.id, e.name, e.type::text as type, e.draft_content, e.archived_at,
      shown_version.content as published_content,
      (shown_version.content is not null
        and shown_version.content is distinct from e.draft_content) as has_unpublished_changes,
      coalesce(live_count.total, 0)::int as live_touchpoint_count
      ${options.withLiveContents ? tx`, live_versions.contents as live_contents` : tx``}
    from kardo_core.experiences e
    -- What customers see: the most recently published version still live
    -- (after a rollback that is an older version), else the latest version.
    left join lateral (
      select coalesce(
        (
          select ev.content
          from kardo_core.publications p
          join kardo_core.experience_versions ev on ev.id = p.experience_version_id
          where ev.experience_id = e.id
            and p.status = 'published' and p.superseded_at is null
          order by p.created_at desc
          limit 1
        ),
        (
          select ev.content
          from kardo_core.experience_versions ev
          where ev.experience_id = e.id
          order by ev.revision desc
          limit 1
        )
      ) as content
    ) shown_version on true
    left join lateral (
      select count(*)::int as total
      from kardo_core.publications p
      join kardo_core.experience_versions ev on ev.id = p.experience_version_id
      join kardo_core.touchpoints t on t.id = p.touchpoint_id and t.status <> 'retired'
      where ev.experience_id = e.id and p.status = 'published' and p.superseded_at is null
    ) live_count on true
    ${
      options.withLiveContents
        ? tx`
    left join lateral (
      select coalesce(jsonb_agg(ev.content), '[]'::jsonb) as contents
      from kardo_core.experience_versions ev
      where ev.experience_id = e.id
        and exists (
          select 1 from kardo_core.publications p
          where p.experience_version_id = ev.id
            and p.status = 'published' and p.superseded_at is null
        )
    ) live_versions on true`
        : tx``
    }
    where e.workspace_id = ${workspaceId}::uuid
      and e.type::text in ('menu', 'catalog')
      ${options.experienceId ? tx`and e.id = ${options.experienceId}::uuid` : tx`and e.archived_at is null`}
    order by (coalesce(live_count.total, 0) > 0) desc, e.name asc
  `;
}

function statesQuery(tx: Sql, experienceIds: readonly string[]) {
  return tx<StateRow[]>`
    select experience_id, item_id, status, quantity, updated_at
    from kardo_core.item_availability
    where experience_id = any(${experienceIds as string[]}::uuid[])
  `;
}

export function createPostgresItemAvailabilityRepository(
  sql: Sql,
  resolver: ItemAvailabilityClient | null,
): ItemAvailabilityRepository {
  return {
    async listAvailability(identity, workspaceId) {
      return withCustomerContext(sql, identity, async (tx) => {
        // Every member may look; only publishers may change it.
        await requireMembership(tx, identity, workspaceId);
        const experiences = await experienceQuery(tx, workspaceId, {
          withLiveContents: false,
        });
        const states =
          experiences.length > 0
            ? await statesQuery(
                tx,
                experiences.map((experience) => experience.id),
              )
            : [];
        return {
          experiences: experiences.map((experience) =>
            buildAvailabilityExperience(
              experience,
              states.filter((state) => state.experience_id === experience.id),
            ),
          ),
        };
      });
    },

    async saveAvailability(identity, workspaceId, experienceId, changes) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "experiences.publish",
        );
        // Serialize changes per Experience so the version order matches the
        // commit order: every push then carries the complete current state
        // and the Resolver can safely drop anything older.
        await tx`select pg_advisory_xact_lock(hashtextextended(${`item_availability:${experienceId}`}, 0))`;

        const experience = (
          await experienceQuery(tx, workspaceId, {
            experienceId,
            withLiveContents: true,
          })
        )[0];
        if (!experience) {
          const other = await tx<{ id: string }[]>`
            select id from kardo_core.experiences
            where id = ${experienceId}::uuid and workspace_id = ${workspaceId}::uuid
          `;
          if (other[0]) {
            throw new ConflictError(
              "AVAILABILITY_NOT_SUPPORTED",
              "Only Menu and Catalog Experiences have item availability.",
            );
          }
          throw new NotFoundError();
        }
        if (!isAvailabilityType(experience.type)) {
          throw new ConflictError(
            "AVAILABILITY_NOT_SUPPORTED",
            "Only Menu and Catalog Experiences have item availability.",
          );
        }
        if (experience.archived_at !== null) {
          throw new ConflictError(
            "EXPERIENCE_ARCHIVED",
            "Restore this Experience before changing its availability.",
          );
        }

        const known = knownItemIds(experience);
        const unique = dedupeChanges(changes);
        if (unique.some((change) => !known.has(change.itemId))) {
          throw new ContentValidationError(
            "UNKNOWN_AVAILABILITY_ITEM",
            "Some items are no longer part of this Experience.",
          );
        }

        const rows = unique.map((change) => ({
          item_id: change.itemId,
          status: change.status,
          quantity: change.quantity,
        }));
        const versionRows = await tx<{ version: string }[]>`
          with next_version as (
            select nextval('kardo_core.item_availability_version_seq') as version
          ),
          upserted as (
            insert into kardo_core.item_availability (
              experience_id, workspace_id, item_id, status, quantity, version, updated_by
            )
            select
              ${experienceId}::uuid, ${workspaceId}::uuid,
              change.item_id, change.status, change.quantity,
              next_version.version, ${identity.subject}::uuid
            from jsonb_to_recordset(${tx.json(rows)}) as change(item_id text, status text, quantity integer)
            cross join next_version
            on conflict (experience_id, item_id) do update set
              status = excluded.status,
              quantity = excluded.quantity,
              version = excluded.version,
              updated_at = now(),
              updated_by = excluded.updated_by
            returning 1
          ),
          pruned as (
            -- States of items no content lists anymore.
            delete from kardo_core.item_availability
            where experience_id = ${experienceId}::uuid
              and item_id <> all(${[...known]}::text[])
            returning 1
          )
          select version::text as version from next_version
        `;
        const version = Number(versionRows[0]?.version);
        if (!Number.isSafeInteger(version) || version < 1) {
          throw new ItemAvailabilityRepositoryError(
            "Item availability version was not allocated.",
          );
        }

        const states = await statesQuery(tx, [experienceId]);

        // Inside the still-open transaction, like pausing a Touchpoint: if the
        // Resolver cannot confirm, everything above rolls back and the panel
        // and the public page never disagree.
        if (!resolver) {
          throw new UnavailableError(
            "ITEM_AVAILABILITY_UNAVAILABLE",
            "Item availability is not configured.",
          );
        }
        try {
          await resolver.replace({
            experienceId,
            version,
            items: resolverItems(states),
          });
        } catch {
          throw new UnavailableError(
            "ITEM_AVAILABILITY_UNAVAILABLE",
            "The public availability service could not confirm this change.",
          );
        }

        await insertAuditEvent(tx, {
          workspaceId,
          actorSubject: identity.subject,
          action: "experience.availability_changed",
          targetType: "experience",
          targetId: experienceId,
          result: "succeeded",
          metadata: {
            items: unique.length,
            soldOut: unique.filter((change) => change.status === "sold_out")
              .length,
            hidden: unique.filter((change) => change.status === "hidden")
              .length,
            version,
          },
        });

        return buildAvailabilityExperience(experience, states);
      });
    },
  };
}
