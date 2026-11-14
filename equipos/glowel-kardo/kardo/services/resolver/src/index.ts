import { DurableObject } from "cloudflare:workers";
import { timingSafeEqual } from "node:crypto";
import { isPiecePublicId } from "@kardo/contracts";
import { isAutomatedRequest } from "./bot-filter.js";
import {
  answerBusinessPath,
  applyBusinessRoutes,
  BusinessState,
  businessPathFromPath,
  parseBusinessCommand,
} from "./business.js";
import {
  type ItemAvailabilityCommandItem,
  type ItemAvailabilityOverlay,
  type ItemAvailabilityStatus,
  parseItemAvailabilityCommand,
} from "./item-availability.js";
import { parseLeadForm } from "./leads.js";
import { hashClientIp, isRateLimited } from "./ratelimit.js";
import { renderExperiencePage, renderNoticePage } from "./render.js";
import {
  allAssetRefs,
  findLinkableUrl,
  isPublicId,
  isRecord,
  type PublishedSnapshot,
  publishCommand,
  publishedSnapshot,
} from "./snapshot.js";
import { verifyTurnstile } from "./turnstile.js";

// Durable Object classes live in their own modules; the runtime finds them
// as exports of this entry point.
export { BusinessState };

// Raised from 128 KiB (131_072) to 256 KiB for "modo HTML" (ADR 018,
// extended 2026-09-29): a single `links`/`profile`/`linkpage` snapshot can
// now carry up to 60,000 chars of customer HTML plus 30,000 chars of CSS
// (CUSTOM_HTML_LIMITS in @kardo/contracts) on top of its usual content,
// design and asset list — 128 KiB was not enough headroom for that, once
// JSON-escaping overhead is counted.
const maxSnapshotBytes = 262_144;
const maxLeadBodyBytes = 4_096;
const leadIntakeUrl = "https://analytics.internal/v1/public/leads";

type ResolverEnv = Omit<Env, "TOUCHPOINT_STATE"> & {
  PUBLISH_COMMAND_KEY: string;
  // Deliberately absent from wrangler.jsonc, like PUBLISH_COMMAND_KEY: an
  // optional shared secret sent to analytics-worker's lead intake endpoint.
  // When unset, no header is sent (analytics-worker also treats it as
  // optional, so the integration keeps working either way).
  LEAD_INTAKE_KEY?: string;
  // A distinct secret from PUBLISH_COMMAND_KEY, authorizing only
  // /internal/suspension. The customer-facing publish key must never be able
  // to lift a staff suspension, so this is intentionally its own secret and,
  // like the others, is never written to wrangler.jsonc.
  SUSPENSION_COMMAND_KEY?: string;
  // A third distinct secret, authorizing only /internal/billing-pause (the
  // Customer API pausing/resuming public pages when an organization stops
  // paying). It can never touch a staff suspension and vice versa; like the
  // others it is never written to wrangler.jsonc. Unset = endpoint closed.
  BILLING_COMMAND_KEY?: string;
  // Public Turnstile site key. Unlike the two secrets above, this is safe to
  // expose to the browser, so it is a wrangler var, not a secret — but it is
  // still optional and unset by default: Turnstile only activates once both
  // this and TURNSTILE_SECRET_KEY are configured.
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  TOUCHPOINT_STATE: DurableObjectNamespace<TouchpointState>;
  /** One instance per handle (`getByName(handle)`), storing only the
   * publicId it currently points at — the entire state behind `GET
   * /@{handle}` and `POST /internal/alias`. */
  ALIAS_STATE: DurableObjectNamespace<AliasState>;
  /** One instance per Experience (`getByName(experienceId)`), storing live
   * Menu/Catalog item availability (sold out / hidden / quantity left).
   * Deliberately NOT part of a published snapshot: Postgres (owned by the
   * Customer API) is the source of truth, this is only a copy applied on top
   * of the immutable snapshot at render time — the entire state behind `GET
   * /t/{publicId}` (for menu/catalog snapshots carrying an `experienceId`)
   * and `POST /internal/item-availability`. */
  ITEM_AVAILABILITY_STATE: DurableObjectNamespace<ItemAvailabilityState>;
  /** One instance per business address key (Links, phase 3b): its links,
   * main link and former addresses — the state behind GET /<negocio>,
   * GET /<negocio>/<link> and POST /internal/business. */
  BUSINESS_STATE: DurableObjectNamespace<BusinessState>;
  /** Where the website lives (Cloudflare Pages) when this Worker sits in
   * front of kardo.com.mx: «/», the reserved words and anything that is not
   * a business go there. Unset (workers.dev, tests): they answer 404. */
  SITE_ORIGIN?: string;
  LEAD_RATE_LIMITER: RateLimit;
  INTERNAL_RATE_LIMITER: RateLimit;
  LEAD_INTAKE: Fetcher;
  /** Workers Static Assets binding for `packages/page-render/fonts/`, served
   * publicly at `/_fonts/*` (see `serveFontAsset` and `wrangler.jsonc`). */
  FONT_ASSETS: Fetcher;
};

type ActiveState = {
  revision: number;
  snapshotKey: string;
  sha256: string;
};

type StateRow = {
  revision: number;
  snapshot_key: string;
  sha256: string;
};

export type AvailabilityStatus = "active" | "paused" | "retired";
type LegacyAvailabilityRow = { status: "active" | "paused" };
type AvailabilityRow = { status: AvailabilityStatus };
type SuspensionRow = { suspended: number };
type BillingPauseRow = { paused: number };
type PieceClaimRow = { claimed: number };

export type TouchpointFullState = {
  status: AvailabilityStatus;
  suspended: boolean;
  /** Billing pause, independent of `suspended` and `status`. */
  billingPaused: boolean;
  /** Kardo pieces (ADR 026): the piece was activated by an organization.
   * Meaningless for any other Touchpoint. */
  pieceClaimed: boolean;
};

export class TouchpointState extends DurableObject<ResolverEnv> {
  constructor(ctx: DurableObjectState, env: ResolverEnv) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        create table if not exists active_snapshot (
          singleton integer primary key check (singleton = 1),
          revision integer not null check (revision > 0),
          snapshot_key text not null,
          sha256 text not null
        )
      `);
      // The original `availability` table's CHECK constraint only allows
      // ('active', 'paused'), and SQLite cannot alter a CHECK constraint in
      // place. `availability_v2` replaces it with room for 'retired'; any row
      // already sitting in the old table is copied over below so an existing
      // Touchpoint's paused/active state survives the upgrade.
      this.ctx.storage.sql.exec(`
        create table if not exists availability (
          singleton integer primary key check (singleton = 1),
          status text not null check (status in ('active', 'paused'))
        )
      `);
      this.ctx.storage.sql.exec(`
        create table if not exists availability_v2 (
          singleton integer primary key check (singleton = 1),
          status text not null check (status in ('active', 'paused', 'retired'))
        )
      `);
      this.ctx.storage.sql.exec(`
        create table if not exists suspension (
          singleton integer primary key check (singleton = 1),
          suspended integer not null
        )
      `);
      this.ctx.storage.sql.exec(`
        create table if not exists billing_pause (
          singleton integer primary key check (singleton = 1),
          paused integer not null
        )
      `);
      // Kardo pieces (ADR 026): an address born in Operations answers
      // «Esta pieza aún no está activada» until an organization activates
      // it. Phase 2 (modo básico) adds the business's fixed destination
      // next to it.
      this.ctx.storage.sql.exec(`
        create table if not exists piece_claim (
          singleton integer primary key check (singleton = 1),
          claimed integer not null
        )
      `);
      const migrated = this.ctx.storage.sql
        .exec<AvailabilityRow>(
          "select status from availability_v2 where singleton = 1",
        )
        .toArray()[0];
      if (!migrated) {
        const legacy = this.ctx.storage.sql
          .exec<LegacyAvailabilityRow>(
            "select status from availability where singleton = 1",
          )
          .toArray()[0];
        if (legacy) {
          this.ctx.storage.sql.exec(
            "insert into availability_v2 (singleton, status) values (1, ?) on conflict(singleton) do nothing",
            legacy.status,
          );
        }
      }
    });
  }

  async getActive(): Promise<ActiveState | null> {
    const row = this.ctx.storage.sql
      .exec<StateRow>(
        "select revision, snapshot_key, sha256 from active_snapshot where singleton = 1",
      )
      .toArray()[0];
    if (!row) return null;
    return {
      revision: row.revision,
      snapshotKey: row.snapshot_key,
      sha256: row.sha256,
    };
  }

  async activate(input: ActiveState): Promise<"activated" | "stale"> {
    const current = await this.getActive();
    if (current && current.revision > input.revision) return "stale";
    if (current && current.revision === input.revision) {
      return current.snapshotKey === input.snapshotKey &&
        current.sha256 === input.sha256
        ? "activated"
        : "stale";
    }

    this.ctx.storage.sql.exec(
      `
        insert into active_snapshot (singleton, revision, snapshot_key, sha256)
        values (1, ?, ?, ?)
        on conflict(singleton) do update set
          revision = excluded.revision,
          snapshot_key = excluded.snapshot_key,
          sha256 = excluded.sha256
      `,
      input.revision,
      input.snapshotKey,
      input.sha256,
    );
    return "activated";
  }

  /** Forgets the published snapshot (organization deleted, ADR 020 addendum
   * of 2026-10-01). Only after retirement, which already wins over content. */
  async clearActive(): Promise<void> {
    this.ctx.storage.sql.exec(
      "delete from active_snapshot where singleton = 1",
    );
  }

  private getAvailabilityStatus(): AvailabilityStatus {
    const row = this.ctx.storage.sql
      .exec<AvailabilityRow>(
        "select status from availability_v2 where singleton = 1",
      )
      .toArray()[0];
    return row?.status ?? "active";
  }

  /** Full serving state: the fetch handler picks the right public response
   * (content, paused/retired/unpublished page, or a generic suspended page)
   * from this alone. */
  async getState(): Promise<TouchpointFullState> {
    const suspensionRow = this.ctx.storage.sql
      .exec<SuspensionRow>(
        "select suspended from suspension where singleton = 1",
      )
      .toArray()[0];
    const billingRow = this.ctx.storage.sql
      .exec<BillingPauseRow>(
        "select paused from billing_pause where singleton = 1",
      )
      .toArray()[0];
    const pieceRow = this.ctx.storage.sql
      .exec<PieceClaimRow>(
        "select claimed from piece_claim where singleton = 1",
      )
      .toArray()[0];
    return {
      status: this.getAvailabilityStatus(),
      suspended: suspensionRow?.suspended === 1,
      billingPaused: billingRow?.paused === 1,
      pieceClaimed: pieceRow?.claimed === 1,
    };
  }

  /**
   * `retired` is terminal: once a Touchpoint is retired, a later
   * `active`/`paused` command is ignored (the caller gets `"retired"` back
   * so it can answer 409) rather than silently reviving it. Retiring an
   * already-retired Touchpoint, or retiring for the first time, both apply
   * normally.
   */
  async setAvailability(
    status: AvailabilityStatus,
  ): Promise<"applied" | "retired"> {
    if (this.getAvailabilityStatus() === "retired" && status !== "retired") {
      return "retired";
    }
    this.ctx.storage.sql.exec(
      "insert into availability_v2 (singleton, status) values (1, ?) on conflict(singleton) do update set status = excluded.status",
      status,
    );
    return "applied";
  }

  /** Independent of `status`: a staff suspension hides content regardless of
   * whether the Touchpoint is active, paused, or retired, and — unlike
   * `retired` — can be lifted again by staff. */
  async setSuspended(suspended: boolean): Promise<void> {
    this.ctx.storage.sql.exec(
      "insert into suspension (singleton, suspended) values (1, ?) on conflict(singleton) do update set suspended = excluded.suspended",
      suspended ? 1 : 0,
    );
  }

  /** Only ever written by /internal/pieces (ADR 026). */
  async setPieceClaimed(claimed: boolean): Promise<void> {
    this.ctx.storage.sql.exec(
      "insert into piece_claim (singleton, claimed) values (1, ?) on conflict(singleton) do update set claimed = excluded.claimed",
      claimed ? 1 : 0,
    );
  }

  /** Independent of `suspended` and `status`: only ever written by
   * /internal/billing-pause, and never touches the `suspension` table. */
  async setBillingPaused(paused: boolean): Promise<void> {
    this.ctx.storage.sql.exec(
      "insert into billing_pause (singleton, paused) values (1, ?) on conflict(singleton) do update set paused = excluded.paused",
      paused ? 1 : 0,
    );
  }
}

/**
 * One instance per Link handle. Maps a handle (`@handle`) to the publicId it
 * currently points at, or to nothing at all once removed. Deliberately a
 * separate Durable Object class from `TouchpointState`: a handle is a
 * many-to-one *pointer* onto a Touchpoint's publicId (renaming a handle, or
 * clearing it, never touches the Touchpoint or its publication history),
 * where `TouchpointState` is the Touchpoint's own serving state.
 */
export class AliasState extends DurableObject<ResolverEnv> {
  async getPublicId(): Promise<string | null> {
    return (await this.ctx.storage.get<string>("publicId")) ?? null;
  }

  async setPublicId(publicId: string | null): Promise<void> {
    if (publicId === null) {
      await this.ctx.storage.delete("publicId");
    } else {
      await this.ctx.storage.put("publicId", publicId);
    }
  }
}

type ItemAvailabilityMetaRow = { version: number };
type ItemAvailabilityItemRow = {
  item_id: string;
  status: ItemAvailabilityStatus;
  quantity: number | null;
};

/**
 * One instance per Experience (`getByName(experienceId)`). Holds live
 * Menu/Catalog item availability — deliberately not part of any published
 * snapshot (see item-availability.ts). `replace` is the only write path,
 * called from `POST /internal/item-availability`; it stores only the entries
 * that differ from the default ("available", no tracked quantity), the same
 * sparse-storage approach `TouchpointState` uses for its own tables.
 */
export class ItemAvailabilityState extends DurableObject<ResolverEnv> {
  constructor(ctx: DurableObjectState, env: ResolverEnv) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        create table if not exists meta (
          singleton integer primary key check (singleton = 1),
          version integer not null
        )
      `);
      this.ctx.storage.sql.exec(`
        create table if not exists items (
          item_id text primary key,
          status text not null check (status in ('sold_out', 'hidden', 'available')),
          quantity integer
        )
      `);
    });
  }

  private getVersion(): number {
    const row = this.ctx.storage.sql
      .exec<ItemAvailabilityMetaRow>(
        "select version from meta where singleton = 1",
      )
      .toArray()[0];
    return row?.version ?? 0;
  }

  /** Out-of-order/duplicate-delivery safe: a `version` at or below the one
   * already stored is rejected as `stale` (returning the current version)
   * instead of overwriting newer state with older state. On success, every
   * row is replaced atomically (no `await` between the delete and the
   * inserts below — this Durable Object, like `TouchpointState`, relies on
   * the runtime's single-threaded, synchronous-storage-call execution for
   * that atomicity, not an explicit transaction). */
  async replace(
    version: number,
    items: ItemAvailabilityCommandItem[],
  ): Promise<{ result: "applied" | "stale"; version: number }> {
    const current = this.getVersion();
    if (version <= current) return { result: "stale", version: current };

    this.ctx.storage.sql.exec("delete from items");
    for (const item of items) {
      if (item.status === "available" && item.quantity === null) continue;
      this.ctx.storage.sql.exec(
        "insert into items (item_id, status, quantity) values (?, ?, ?)",
        item.id,
        item.status,
        item.quantity,
      );
    }
    this.ctx.storage.sql.exec(
      `
        insert into meta (singleton, version) values (1, ?)
        on conflict(singleton) do update set version = excluded.version
      `,
      version,
    );
    return { result: "applied", version };
  }

  async get(): Promise<ItemAvailabilityOverlay> {
    const rows = this.ctx.storage.sql
      .exec<ItemAvailabilityItemRow>(
        "select item_id, status, quantity from items",
      )
      .toArray();
    const overlay: ItemAvailabilityOverlay = {};
    for (const row of rows) {
      overlay[row.item_id] = { status: row.status, quantity: row.quantity };
    }
    return overlay;
  }
}

const notFound = () =>
  new Response("This Kardo Touchpoint is unavailable.", {
    status: 404,
    headers: privateResponseHeaders(),
  });

const unavailable = () =>
  new Response("This Kardo Touchpoint is temporarily unavailable.", {
    status: 503,
    headers: { ...privateResponseHeaders(), "retry-after": "5" },
  });

const tooManyRequests = () =>
  new Response("Too many requests.", {
    status: 429,
    headers: { ...privateResponseHeaders(), "retry-after": "60" },
  });

export default {
  async fetch(
    request: Request,
    env: ResolverEnv,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    // Liveness for the status Worker (ADR 022). The real check is a test
    // QR; this only says the Worker answers.
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json(
        { service: "resolver", status: "ok" },
        { headers: privateResponseHeaders() },
      );
    }

    if (url.pathname.startsWith("/_fonts/")) {
      return serveFontAsset(request, env, url);
    }

    if (
      url.pathname === "/internal/publish" ||
      url.pathname === "/internal/availability" ||
      url.pathname === "/internal/suspension" ||
      url.pathname === "/internal/billing-pause" ||
      url.pathname === "/internal/alias" ||
      url.pathname === "/internal/business" ||
      url.pathname === "/internal/item-availability" ||
      url.pathname === "/internal/pieces"
    ) {
      // The Customer API still calls these over HTTPS today (it has not
      // migrated to a service binding yet), so they stay reachable — but
      // rate limited per caller IP as a hardening layer until that move
      // happens and public access to /internal/* can be removed outright.
      if (await isInternalRateLimited(request, env)) return tooManyRequests();
      if (url.pathname === "/internal/publish") return publish(request, env);
      if (url.pathname === "/internal/availability")
        return availability(request, env);
      if (url.pathname === "/internal/alias") return alias(request, env);
      if (url.pathname === "/internal/business")
        return businessCommand(request, env);
      if (url.pathname === "/internal/item-availability")
        return itemAvailabilityCommand(request, env);
      if (url.pathname === "/internal/billing-pause")
        return billingPause(request, env);
      if (url.pathname === "/internal/pieces")
        return piecesCommand(request, env);
      return suspension(request, env);
    }

    const publicId = publicIdFromPath(url.pathname);
    if (publicId) {
      const goItemId = goItemFromPath(url.pathname, publicId);
      if (goItemId) return handleGo(request, env, publicId, goItemId, url);

      if (isLeadsPath(url.pathname, publicId)) {
        if (request.method !== "POST") return notFound();
        return handleLeadSubmission(request, env, publicId, url);
      }

      const assetHash = assetHashFromPath(url.pathname, publicId);
      if (assetHash) return serveAssetResponse(assetHash, publicId, env);

      if (url.pathname !== `/t/${publicId}`) return notFound();
      return resolveTouchpointResponse(request, env, publicId, url);
    }

    const handle = handleFromPath(url.pathname);
    if (handle) {
      const aliasPublicId =
        await env.ALIAS_STATE.getByName(handle).getPublicId();
      if (!aliasPublicId) return touchpointStatusPage("unknownHandle", 404);
      return resolveTouchpointResponse(request, env, aliasPublicId, url);
    }

    const businessPath = businessPathFromPath(url.pathname);
    if (
      businessPath &&
      (request.method === "GET" || request.method === "HEAD")
    ) {
      try {
        const answer = await answerBusinessPath(
          env.BUSINESS_STATE,
          url.pathname,
          businessPath,
        );
        if (answer.kind === "serve")
          return resolveTouchpointResponse(request, env, answer.publicId, url);
        if (answer.kind === "redirect")
          return new Response(null, {
            // Temporary on purpose: a retired link frees its addresses,
            // and a browser must never keep a stale permanent redirect.
            status: 302,
            headers: {
              ...privateResponseHeaders(),
              location: `${answer.path}${url.search}`,
            },
          });
        if (answer.kind === "site") return siteOrNotFound(request, env, url);
        return touchpointStatusPage(answer.kind, 404);
      } catch (error) {
        console.error(
          JSON.stringify({
            message: "business lookup failed",
            path: url.pathname,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
        return unavailable();
      }
    }

    return siteOrNotFound(request, env, url);
  },
} satisfies ExportedHandler<ResolverEnv>;

// ---------------------------------------------------------------------------
// Shared rendering for GET/HEAD /t/{publicId} and its /@{handle} alias: same
// status pages, suspension handling, retirement, analytics channel, and bot
// filtering either way. Asset paths (/t/{publicId}/assets/*) are only ever
// reachable through the canonical /t/{publicId} form — see serveAssetResponse
// — and every rendered link/button always points back at the canonical
// /t/{publicId}/go/{itemId} route regardless of which path resolved the page
// (see `renderExperiencePage`'s use of `snapshot.publicId`), so there is no
// separate /@{handle}/go/{itemId} route to maintain.
// ---------------------------------------------------------------------------

async function resolveTouchpointResponse(
  request: Request,
  env: ResolverEnv,
  publicId: string,
  url: URL,
): Promise<Response> {
  try {
    const lookup = await loadActiveSnapshot(env, publicId);

    if (lookup.kind === "unavailable") return unavailable();
    if (lookup.kind === "unpublished")
      return touchpointStatusPage("unpublished", 404);
    if (lookup.kind === "paused") return touchpointStatusPage("paused", 404);
    if (lookup.kind === "retired") return touchpointStatusPage("retired", 410);
    if (lookup.kind === "notActivated")
      return touchpointStatusPage("notActivated", 404);
    if (lookup.kind === "suspended")
      return touchpointStatusPage("suspended", 404);
    if (lookup.kind === "billingPaused")
      return touchpointStatusPage("billingPaused", 404);
    const snapshot = lookup.snapshot;

    // Analytics Engine writes are non-blocking. Metrics must never alter
    // the public response path, including if its binding is temporarily
    // absent. Automated requests (bots, crawlers, link-preview fetchers)
    // are still served normally but never counted.
    if (!isAutomatedRequest(request) && !isPanelPreview(url)) {
      recordEvent(env, publicId, snapshot.revision, "tap", channel(url));
    }

    const redirectTarget =
      snapshot.experience?.type === "redirect"
        ? snapshot.experience.destinationUrl
        : snapshot.destinationUrl;
    if (redirectTarget) {
      return new Response(null, {
        status: 302,
        headers: {
          ...privateResponseHeaders(),
          location: redirectTarget,
          "referrer-policy": "no-referrer",
        },
      });
    }

    const isFormExperience = snapshot.experience?.type === "form";
    const turnstileSiteKey = isFormExperience
      ? turnstileKeys(env)?.siteKey
      : undefined;

    // Live Menu/Catalog item availability lives outside this immutable
    // snapshot (see item-availability.ts) — only looked up here, on the main
    // public page path, and only when the snapshot actually carries an
    // experienceId (older snapshots simply render with no overlay). This
    // lookup must never turn the page into an error: on any failure it is
    // logged and the page renders exactly as if nothing were sold
    // out/hidden (fail open).
    let itemAvailability: ItemAvailabilityOverlay | undefined;
    if (
      snapshot.experienceId &&
      (snapshot.experience?.type === "menu" ||
        snapshot.experience?.type === "catalog")
    ) {
      try {
        itemAvailability = await env.ITEM_AVAILABILITY_STATE.getByName(
          snapshot.experienceId,
        ).get();
      } catch (error) {
        console.error(
          JSON.stringify({
            message: "item availability lookup failed",
            publicId,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }

    const html = renderExperiencePage({
      snapshot,
      origin: url.origin,
      // A preview keeps its links and form uncounted too.
      channel: isPanelPreview(url) ? "preview" : channel(url),
      ...(turnstileSiteKey !== undefined ? { turnstileSiteKey } : {}),
      ...(itemAvailability !== undefined ? { itemAvailability } : {}),
    });
    return new Response(html, {
      status: 200,
      headers: publicHtmlHeaders({
        formAction: isFormExperience ? "self" : "none",
        turnstile: turnstileSiteKey !== undefined,
      }),
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "resolver lookup failed",
        path: url.pathname,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return unavailable();
  }
}

async function serveAssetResponse(
  assetHash: string,
  publicId: string,
  env: ResolverEnv,
): Promise<Response> {
  try {
    const lookup = await loadActiveSnapshot(env, publicId);
    if (lookup.kind === "unavailable") return unavailable();
    if (lookup.kind !== "ok") return notFound();
    return serveAsset(assetHash, lookup.snapshot, env);
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "resolver asset lookup failed",
        publicId,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return unavailable();
  }
}

// ---------------------------------------------------------------------------
// Shared snapshot lookup
// ---------------------------------------------------------------------------

type SnapshotLookup =
  | { kind: "ok"; snapshot: PublishedSnapshot }
  /** Status is active (or defaulted, as today) but no snapshot has ever been
   * published for this Touchpoint. */
  | { kind: "unpublished" }
  | { kind: "paused" }
  /** Terminal: set once a Touchpoint is retired and never reverts. */
  | { kind: "retired" }
  /** A Kardo piece nobody has activated yet (ADR 026): a neutral page that
   * says so, never an error. */
  | { kind: "notActivated" }
  /** Set by Kardo staff, independent of `status`; the public page never
   * reveals that this is the reason content is unavailable. */
  | { kind: "suspended" }
  /** Set by the billing flow (grace period over); neutral public page, never
   * mentions why. Outranked by suspension and retirement. */
  | { kind: "billingPaused" }
  | { kind: "unavailable" };

async function loadActiveSnapshot(
  env: ResolverEnv,
  publicId: string,
): Promise<SnapshotLookup> {
  const durableState = env.TOUCHPOINT_STATE.getByName(publicId);
  const touchpointState = await durableState.getState();
  // A staff suspension hides content regardless of status, and never reveals
  // itself as the reason (the public page is the same generic message as the
  // "retired"/"paused" checks below would otherwise never be reached for).
  if (touchpointState.suspended) return { kind: "suspended" };
  if (touchpointState.status === "retired") return { kind: "retired" };
  // A piece born in Operations is known by its address shape alone, so a
  // never-seen one needs no state: it is not activated until the Customer
  // API says so (ADR 026).
  if (isPiecePublicId(publicId) && !touchpointState.pieceClaimed)
    return { kind: "notActivated" };
  // Precedence: suspended > retired > not activated > billing pause >
  // customer pause > content.
  if (touchpointState.billingPaused) return { kind: "billingPaused" };
  if (touchpointState.status === "paused") return { kind: "paused" };

  const state = await durableState.getActive();
  if (!state) return { kind: "unpublished" };

  const object = await env.PUBLISHED_SNAPSHOTS.get(state.snapshotKey);
  if (!object || object.size > maxSnapshotBytes) return { kind: "unavailable" };
  const snapshot = publishedSnapshot(await object.json<unknown>());
  if (
    !snapshot ||
    snapshot.publicId !== publicId ||
    snapshot.revision !== state.revision ||
    object.customMetadata?.sha256 !== state.sha256
  ) {
    return { kind: "unavailable" };
  }
  return { kind: "ok", snapshot };
}

// ---------------------------------------------------------------------------
// Tracked click redirects: /t/{publicId}/go/{itemId}
// ---------------------------------------------------------------------------

async function handleGo(
  request: Request,
  env: ResolverEnv,
  publicId: string,
  itemId: string,
  url: URL,
): Promise<Response> {
  if (await isInternalRateLimited(request, env)) return tooManyRequests();
  try {
    const lookup = await loadActiveSnapshot(env, publicId);
    if (lookup.kind === "unavailable") return unavailable();
    // paused/retired/suspended/unpublished: no content leak here — the
    // branded status pages only ever render on the main /t/{publicId} page.
    if (lookup.kind !== "ok") return notFound();

    const target = findLinkableUrl(lookup.snapshot, itemId);
    if (!target) return notFound();

    if (!isAutomatedRequest(request) && !isPanelPreview(url)) {
      recordEvent(
        env,
        publicId,
        lookup.snapshot.revision,
        "click",
        channel(url),
      );
    }
    return new Response(null, {
      status: 302,
      headers: {
        ...privateResponseHeaders(),
        location: target,
        "referrer-policy": "no-referrer",
      },
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "tracked click failed",
        publicId,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return unavailable();
  }
}

// ---------------------------------------------------------------------------
// Lead submission: POST /t/{publicId}/leads
// ---------------------------------------------------------------------------

async function handleLeadSubmission(
  request: Request,
  env: ResolverEnv,
  publicId: string,
  url: URL,
): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (
    !Number.isFinite(contentLength) ||
    contentLength < 1 ||
    contentLength > maxLeadBodyBytes
  ) {
    return leadErrorPage(
      "No pudimos enviar tu mensaje. Inténtalo de nuevo.",
      400,
    );
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded")) {
    return leadErrorPage(
      "No pudimos enviar tu mensaje. Inténtalo de nuevo.",
      400,
    );
  }

  try {
    const lookup = await loadActiveSnapshot(env, publicId);
    if (lookup.kind === "unavailable") return unavailable();
    // paused/retired/suspended/unpublished: no content leak here — the
    // branded status pages only ever render on the main /t/{publicId} page.
    if (lookup.kind !== "ok") return notFound();
    const snapshot = lookup.snapshot;
    if (snapshot.experience?.type !== "form") return notFound();
    const form = snapshot.experience;

    const ipHash = await hashClientIp(clientIp(request));
    if (await isRateLimited(env.LEAD_RATE_LIMITER, `${publicId}:${ipHash}`)) {
      return leadErrorPage(
        "Demasiados intentos. Inténtalo de nuevo en un minuto.",
        429,
      );
    }

    const body = await readBoundedText(request, maxLeadBodyBytes);
    if (body === null)
      return leadErrorPage(
        "No pudimos enviar tu mensaje. Inténtalo de nuevo.",
        400,
      );

    const result = parseLeadForm(body, form.fields);
    if (result.kind === "honeypot") {
      return leadSuccessPage(form.successMessage);
    }
    if (result.kind === "error") {
      return leadErrorPage(result.message, 400);
    }

    if (leadTurnstileRefused(env)) {
      return leadErrorPage(
        "El envío de mensajes no está disponible en este momento.",
        503,
      );
    }
    const turnstile = turnstileKeys(env);
    if (turnstile) {
      const token =
        new URLSearchParams(body).get("cf-turnstile-response") ?? "";
      const verified = await verifyTurnstile({
        secretKey: turnstile.secretKey,
        token,
        remoteIp: clientIp(request),
      });
      if (!verified) {
        return leadErrorPage(
          "No pudimos verificar que no eres un robot. Inténtalo de nuevo.",
          400,
        );
      }
    }

    if (!env.LEAD_INTAKE)
      return leadErrorPage(
        "El envío de mensajes no está disponible en este momento.",
        503,
      );

    let intakeResponse: Response;
    try {
      intakeResponse = await env.LEAD_INTAKE.fetch(leadIntakeUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(env.LEAD_INTAKE_KEY
            ? { "x-kardo-lead-intake": env.LEAD_INTAKE_KEY }
            : {}),
        },
        body: JSON.stringify({ publicId, consent: true, ...result.lead }),
      });
    } catch (error) {
      console.error(
        JSON.stringify({
          message: "lead intake request failed",
          publicId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return leadErrorPage(
        "No pudimos enviar tu mensaje. Inténtalo más tarde.",
        503,
      );
    }
    if (!intakeResponse.ok) {
      return leadErrorPage(
        "No pudimos enviar tu mensaje. Inténtalo más tarde.",
        intakeResponse.status >= 400 && intakeResponse.status < 500 ? 400 : 503,
      );
    }

    if (!isPanelPreview(url))
      recordEvent(env, publicId, snapshot.revision, "lead", channel(url));
    return leadSuccessPage(form.successMessage);
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "lead submission failed",
        publicId,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return leadErrorPage(
      "No pudimos enviar tu mensaje. Inténtalo más tarde.",
      503,
    );
  }
}

function leadSuccessPage(successMessage: string): Response {
  return new Response(
    renderNoticePage({ title: "¡Listo!", message: successMessage }),
    { status: 200, headers: publicHtmlHeaders({ formAction: "none" }) },
  );
}
function leadErrorPage(message: string, status: number): Response {
  return new Response(
    renderNoticePage({ title: "No pudimos enviar tu mensaje", message }),
    { status, headers: publicHtmlHeaders({ formAction: "none" }) },
  );
}

/** Turnstile only activates once both the (public) site key and the secret
 * key are configured; otherwise every lead-form page and submission behaves
 * exactly as it did before Turnstile existed. */
function turnstileKeys(
  env: ResolverEnv,
): { siteKey: string; secretKey: string } | null {
  const { TURNSTILE_SITE_KEY: siteKey, TURNSTILE_SECRET_KEY: secretKey } = env;
  return siteKey && secretKey ? { siteKey, secretKey } : null;
}

/** In production a lead without Turnstile keys is refused (fails closed):
 * a missing secret must never leave every form open to bots, behind only
 * the per-IP limit. Elsewhere the keys stay optional (security review
 * 2026-10, V13). */
export function leadTurnstileRefused(env: {
  // The test wrangler.jsonc types it as the literal "test"; production
  // deploys set "production".
  KARDO_ENV?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
}): boolean {
  return (
    env.KARDO_ENV === "production" &&
    !(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY)
  );
}

// ---------------------------------------------------------------------------
// Branded status pages for GET/HEAD /t/{publicId}. Never used for /go/*,
// /leads, or asset paths — those keep the plain notFound()/unavailable() so
// an unavailable Touchpoint never leaks anything through a side channel.
// ---------------------------------------------------------------------------

const touchpointStatusCopy = {
  unpublished: {
    title: "Este Kardo aún no tiene contenido",
    message:
      "Quien administra este código todavía no ha publicado ninguna experiencia. Vuelve a intentarlo más tarde.",
  },
  paused: {
    title: "Temporalmente no disponible",
    message:
      "Este Kardo está pausado en este momento. Vuelve a intentarlo más tarde.",
  },
  retired: {
    title: "Este Kardo ya no está activo",
    message: "Este código ya no está en uso y no enlaza a ningún contenido.",
  },
  // Deliberately generic: a visitor must never be able to tell a suspension
  // apart from any other kind of unavailability.
  suspended: {
    title: "Este contenido no está disponible",
    message: "No podemos mostrar este contenido en este momento.",
  },
  // A Kardo piece before its owner activates it (ADR 026). Whoever scans
  // it learns only that, and how the owner turns it on.
  notActivated: {
    title: "Esta pieza aún no está activada",
    message:
      "Si es tuya, actívala en tu panel de Kardo con el código de activación que vino con ella.",
  },
  // Neutral on purpose: never mentions payments, plans or billing.
  billingPaused: {
    title: "Esta página no está disponible por ahora",
    message: "Vuelve a intentarlo más tarde.",
  },
  // Shown for GET/HEAD /@{handle} when no alias is registered for that
  // handle at all (never reached for /t/{publicId} — a publicId is never
  // "unknown", only unpublished/paused/retired/suspended).
  unknownHandle: {
    title: "Este enlace no existe",
    message:
      "El nombre de usuario que buscas no está en uso. Verifica el enlace e inténtalo de nuevo.",
  },
  // Links, phase 3b: kardo.com.mx/<negocio> and kardo.com.mx/<negocio>/<link>.
  unknownBusiness: {
    title: "Esta dirección no existe",
    message: "Revisa que esté bien escrita.",
  },
  noMainLink: {
    title: "Esta página todavía no está lista",
    message: "Vuelve a intentarlo más tarde.",
  },
  unknownLink: {
    title: "Este link no existe",
    message: "Revisa que esté bien escrito.",
  },
} as const;

function touchpointStatusPage(
  kind: keyof typeof touchpointStatusCopy,
  status: number,
): Response {
  const copy = touchpointStatusCopy[kind];
  return new Response(
    renderNoticePage({
      title: copy.title,
      message: copy.message,
      noindex: true,
    }),
    {
      status,
      headers: {
        ...publicHtmlHeaders({ formAction: "none" }),
        "x-robots-tag": "noindex",
      },
    },
  );
}

async function readBoundedText(
  request: Request,
  maxBytes: number,
): Promise<string | null> {
  const text = await request.text();
  return new TextEncoder().encode(text).byteLength > maxBytes ? null : text;
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

type ResolverAnalyticsEnv = {
  TAP_ANALYTICS: AnalyticsEngineDataset;
  KARDO_ENV: string;
};

function recordEvent(
  env: ResolverAnalyticsEnv,
  publicId: string,
  publicationRevision: number,
  type: "tap" | "click" | "lead",
  eventChannel: "nfc" | "qr" | "link",
): void {
  try {
    env.TAP_ANALYTICS.writeDataPoint({
      // The index keeps sampling stable per Touchpoint. Blob positions are
      // deliberately fixed: revision, type, channel, environment.
      indexes: [publicId],
      blobs: [String(publicationRevision), type, eventChannel, env.KARDO_ENV],
      doubles: [1],
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "analytics metric write failed",
        publicId,
        revision: publicationRevision,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

/** Kept for existing callers/tests: records a "tap" event. */
export function recordTap(
  env: ResolverAnalyticsEnv,
  publicId: string,
  publicationRevision: number,
  eventChannel: "nfc" | "qr" | "link",
): void {
  recordEvent(env, publicId, publicationRevision, "tap", eventChannel);
}

// ---------------------------------------------------------------------------
// Internal commands: /internal/publish, /internal/availability
// ---------------------------------------------------------------------------

async function isInternalRateLimited(
  request: Request,
  env: ResolverEnv,
): Promise<boolean> {
  const ipHash = await hashClientIp(clientIp(request));
  return isRateLimited(env.INTERNAL_RATE_LIMITER, ipHash);
}

function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "unknown";
}

/** Deletes every published snapshot of one Touchpoint from R2. The shared,
 * content-addressed `assets/{sha256}` objects are not touched here: the
 * assets Worker removes them only when no other upload uses them. */
async function purgeSnapshots(
  env: ResolverEnv,
  publicId: string,
): Promise<void> {
  const prefix = `snapshots/${publicId}/`;
  let cursor: string | undefined;
  do {
    const page = await env.PUBLISHED_SNAPSHOTS.list({
      prefix,
      limit: 1000,
      ...(cursor ? { cursor } : {}),
    });
    const keys = page.objects.map((object) => object.key);
    if (keys.length > 0) await env.PUBLISHED_SNAPSHOTS.delete(keys);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

async function availability(
  request: Request,
  env: ResolverEnv,
): Promise<Response> {
  if (request.method !== "POST" || !hasPublishAuthorization(request, env)) {
    return new Response("Unauthorized", {
      status: 401,
      headers: privateResponseHeaders(),
    });
  }
  try {
    const value = await request.json<unknown>();
    if (
      !isRecord(value) ||
      !isPublicId(value.publicId) ||
      (value.status !== "active" &&
        value.status !== "paused" &&
        value.status !== "retired") ||
      // `purge` (deleted organization) only goes with a retirement.
      (value.purge !== undefined &&
        (typeof value.purge !== "boolean" ||
          (value.purge && value.status !== "retired")))
    ) {
      return new Response("Invalid availability command", {
        status: 400,
        headers: privateResponseHeaders(),
      });
    }
    const touchpoint = env.TOUCHPOINT_STATE.getByName(value.publicId);
    const outcome = await touchpoint.setAvailability(value.status);
    if (value.purge === true) {
      await touchpoint.clearActive();
      await purgeSnapshots(env, value.publicId);
    }
    if (outcome === "retired") {
      // Retired is terminal: an active/paused command arriving after
      // retirement is ignored rather than reviving the Touchpoint.
      return Response.json(
        { result: "retired" },
        { status: 409, headers: privateResponseHeaders() },
      );
    }
    return Response.json(
      { result: value.status },
      { headers: privateResponseHeaders() },
    );
  } catch {
    return new Response("Invalid availability command", {
      status: 400,
      headers: privateResponseHeaders(),
    });
  }
}

// ---------------------------------------------------------------------------
// Internal command: POST /internal/alias. Authorized with the same
// PUBLISH_COMMAND_KEY as /internal/availability (the Customer API only ever
// creates/renames/removes a Link's handle alongside its own publicId, so no
// separate secret is warranted here). Points `handle` at `publicId`
// (`publicId: null` removes the alias), and — when the caller is renaming a
// handle — cleans up `previousHandle` if, and only if, it still points at
// the very same publicId (never clobbering a handle that was reassigned to
// someone else in the meantime).
// ---------------------------------------------------------------------------

const handlePattern = /^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])$/;

function isHandle(value: unknown): value is string {
  return typeof value === "string" && handlePattern.test(value);
}

async function alias(request: Request, env: ResolverEnv): Promise<Response> {
  if (request.method !== "POST" || !hasPublishAuthorization(request, env)) {
    return new Response("Unauthorized", {
      status: 401,
      headers: privateResponseHeaders(),
    });
  }
  try {
    const value = await request.json<unknown>();
    if (
      !isRecord(value) ||
      !isHandle(value.handle) ||
      (value.publicId !== null && !isPublicId(value.publicId)) ||
      (value.previousHandle !== null && !isHandle(value.previousHandle))
    ) {
      return new Response("Invalid alias command", {
        status: 400,
        headers: privateResponseHeaders(),
      });
    }
    const handle = value.handle;
    const publicId = value.publicId as string | null;
    const previousHandle = value.previousHandle as string | null;

    await env.ALIAS_STATE.getByName(handle).setPublicId(publicId);

    if (publicId !== null && previousHandle && previousHandle !== handle) {
      const previous = env.ALIAS_STATE.getByName(previousHandle);
      const previousPublicId = await previous.getPublicId();
      if (previousPublicId === publicId) await previous.setPublicId(null);
    }

    return Response.json(
      { result: "ok" },
      { headers: privateResponseHeaders() },
    );
  } catch {
    return new Response("Invalid alias command", {
      status: 400,
      headers: privateResponseHeaders(),
    });
  }
}

// ---------------------------------------------------------------------------
// Internal command: POST /internal/business (Links, phase 3b). Same key as
// /internal/alias. The Customer API sends the whole state of one business
// (kardo_core.business_link_routes) after every change to its address, its
// links or its main link; this replaces it and points every former address
// of the business at the current one.
// ---------------------------------------------------------------------------

async function businessCommand(
  request: Request,
  env: ResolverEnv,
): Promise<Response> {
  if (request.method !== "POST" || !hasPublishAuthorization(request, env)) {
    return new Response("Unauthorized", {
      status: 401,
      headers: privateResponseHeaders(),
    });
  }
  let routes: ReturnType<typeof parseBusinessCommand> = null;
  try {
    routes = parseBusinessCommand(await request.json<unknown>());
  } catch {
    routes = null;
  }
  if (!routes)
    return new Response("Invalid business command", {
      status: 400,
      headers: privateResponseHeaders(),
    });
  await applyBusinessRoutes(env.BUSINESS_STATE, routes);
  return Response.json({ result: "ok" }, { headers: privateResponseHeaders() });
}

/**
 * The website's address for a path, on the website's own origin — never
 * built from the path itself, so «//other.host/x» or «/\\other.host» stay
 * paths on the site and can never turn this Worker into an open proxy.
 * Null when there is no website behind this Worker.
 */
export function siteTarget(
  url: URL,
  siteOrigin: string | undefined,
): URL | null {
  if (!siteOrigin) return null;
  let site: URL;
  try {
    site = new URL(siteOrigin);
  } catch {
    return null;
  }
  if (site.protocol !== "https:" || site.username || site.password) return null;
  const target = new URL(site.origin);
  target.pathname = url.pathname;
  target.search = url.search;
  return target.origin === site.origin ? target : null;
}

/** In front of kardo.com.mx, what is not a business (the home page, the
 * site's pages and files) is the website's; elsewhere it does not exist. */
async function siteOrNotFound(
  request: Request,
  env: ResolverEnv,
  url: URL,
): Promise<Response> {
  const target = siteTarget(url, env.SITE_ORIGIN);
  if (!target) return notFound();
  return fetch(new Request(target, request));
}

// ---------------------------------------------------------------------------
// Internal command: POST /internal/item-availability. Authorized with the
// same PUBLISH_COMMAND_KEY as /internal/availability and /internal/alias
// (this is customer-facing operational state, not a staff suspension).
// Replaces the live overlay for one Experience; body parsing is delegated to
// the pure, independently-unit-tested `parseItemAvailabilityCommand`.
// ---------------------------------------------------------------------------

/** A Menu/Catalog can be live across several Touchpoints/versions, so the
 * union of item ids the Customer API sends in one command can be larger than
 * any single Experience's own item cap — bounded generously rather than at
 * the per-Experience 150-item limit. */
const maxItemAvailabilityBytes = 65_536;

async function itemAvailabilityCommand(
  request: Request,
  env: ResolverEnv,
): Promise<Response> {
  if (request.method !== "POST" || !hasPublishAuthorization(request, env)) {
    return new Response("Unauthorized", {
      status: 401,
      headers: privateResponseHeaders(),
    });
  }
  const length = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(length) || length > maxItemAvailabilityBytes) {
    return new Response("Invalid item availability command", {
      status: 400,
      headers: privateResponseHeaders(),
    });
  }
  try {
    const command = parseItemAvailabilityCommand(await request.json<unknown>());
    if (!command) {
      return new Response("Invalid item availability command", {
        status: 400,
        headers: privateResponseHeaders(),
      });
    }
    const outcome = await env.ITEM_AVAILABILITY_STATE.getByName(
      command.experienceId,
    ).replace(command.version, command.items);
    return Response.json(outcome, { headers: privateResponseHeaders() });
  } catch {
    return new Response("Invalid item availability command", {
      status: 400,
      headers: privateResponseHeaders(),
    });
  }
}

// ---------------------------------------------------------------------------
// Internal command: POST /internal/suspension. Authorized only with
// SUSPENSION_COMMAND_KEY — a distinct secret from PUBLISH_COMMAND_KEY, so the
// customer-facing publish key can never lift a staff suspension.
// ---------------------------------------------------------------------------

/** Exported for direct unit testing of the fail-closed-with-no-secret case,
 * which is otherwise impossible to exercise through SELF.fetch once the test
 * environment has SUSPENSION_COMMAND_KEY configured. */
export function hasSuspensionAuthorization(
  request: Request,
  env: ResolverEnv,
): boolean {
  const secret = env.SUSPENSION_COMMAND_KEY;
  // Fail closed: with no secret configured, no request can be authorized —
  // nor when it was misconfigured to equal the customer-facing command key,
  // which would let the Customer API lift a staff suspension.
  if (!secret || secret === env.PUBLISH_COMMAND_KEY) return false;
  const supplied = request.headers.get("authorization");
  const expected = `Bearer ${secret}`;
  if (!supplied || supplied.length !== expected.length) return false;
  return timingSafeEqual(
    new TextEncoder().encode(supplied),
    new TextEncoder().encode(expected),
  );
}

async function suspension(
  request: Request,
  env: ResolverEnv,
): Promise<Response> {
  if (request.method !== "POST" || !hasSuspensionAuthorization(request, env)) {
    return new Response("Unauthorized", {
      status: 401,
      headers: privateResponseHeaders(),
    });
  }
  try {
    const value = await request.json<unknown>();
    if (
      !isRecord(value) ||
      !isPublicId(value.publicId) ||
      typeof value.suspended !== "boolean"
    ) {
      return new Response("Invalid suspension command", {
        status: 400,
        headers: privateResponseHeaders(),
      });
    }
    await env.TOUCHPOINT_STATE.getByName(value.publicId).setSuspended(
      value.suspended,
    );
    return Response.json(
      { result: value.suspended ? "suspended" : "unsuspended" },
      { headers: privateResponseHeaders() },
    );
  } catch {
    return new Response("Invalid suspension command", {
      status: 400,
      headers: privateResponseHeaders(),
    });
  }
}

// ---------------------------------------------------------------------------
// Internal command: POST /internal/billing-pause. Contract:
//   auth:  `Authorization: Bearer ${BILLING_COMMAND_KEY}` only (fails closed
//          with 401 if unset or equal to PUBLISH_/SUSPENSION_COMMAND_KEY).
//   body:  { "publicIds": string[1..100] (valid, unique), "paused": boolean }
//   200:   { "result": "paused" | "resumed", "count": N }
//   400:   "Invalid billing pause command"
// Only writes `billing_pause`; never reads or writes a staff suspension.
// ---------------------------------------------------------------------------

const maxBillingPauseIds = 100;
const billingPauseConcurrency = 10;

/** Exported for direct unit testing (misconfigured/absent secret cases). */
export function hasBillingPauseAuthorization(
  request: Request,
  env: ResolverEnv,
): boolean {
  const secret = env.BILLING_COMMAND_KEY;
  if (
    !secret ||
    secret === env.PUBLISH_COMMAND_KEY ||
    secret === env.SUSPENSION_COMMAND_KEY
  ) {
    return false;
  }
  const supplied = request.headers.get("authorization");
  const expected = `Bearer ${secret}`;
  if (!supplied || supplied.length !== expected.length) return false;
  return timingSafeEqual(
    new TextEncoder().encode(supplied),
    new TextEncoder().encode(expected),
  );
}

async function billingPause(
  request: Request,
  env: ResolverEnv,
): Promise<Response> {
  if (
    request.method !== "POST" ||
    !hasBillingPauseAuthorization(request, env)
  ) {
    return new Response("Unauthorized", {
      status: 401,
      headers: privateResponseHeaders(),
    });
  }
  const invalid = () =>
    new Response("Invalid billing pause command", {
      status: 400,
      headers: privateResponseHeaders(),
    });
  try {
    const value = await request.json<unknown>();
    if (
      !isRecord(value) ||
      typeof value.paused !== "boolean" ||
      !Array.isArray(value.publicIds) ||
      value.publicIds.length < 1 ||
      value.publicIds.length > maxBillingPauseIds
    ) {
      return invalid();
    }
    const ids: string[] = [];
    for (const id of value.publicIds) {
      if (!isPublicId(id)) return invalid();
      ids.push(id);
    }
    if (new Set(ids).size !== ids.length) return invalid();
    const paused = value.paused;
    for (let i = 0; i < ids.length; i += billingPauseConcurrency) {
      await Promise.all(
        ids
          .slice(i, i + billingPauseConcurrency)
          .map((id) =>
            env.TOUCHPOINT_STATE.getByName(id).setBillingPaused(paused),
          ),
      );
    }
    return Response.json(
      { result: paused ? "paused" : "resumed", count: ids.length },
      { headers: privateResponseHeaders() },
    );
  } catch {
    return invalid();
  }
}

/** POST /internal/pieces (ADR 026): the Customer API marks pieces activated
 * when an organization activates them with their code. Same key as the
 * rest of its commands; only piece addresses are accepted. */
async function piecesCommand(
  request: Request,
  env: ResolverEnv,
): Promise<Response> {
  if (request.method !== "POST" || !hasPublishAuthorization(request, env)) {
    return new Response("Unauthorized", {
      status: 401,
      headers: privateResponseHeaders(),
    });
  }
  const invalid = () =>
    new Response("Invalid pieces command", {
      status: 400,
      headers: privateResponseHeaders(),
    });
  try {
    const value = await request.json<unknown>();
    if (
      !isRecord(value) ||
      typeof value.claimed !== "boolean" ||
      !Array.isArray(value.publicIds) ||
      value.publicIds.length < 1 ||
      value.publicIds.length > maxBillingPauseIds
    ) {
      return invalid();
    }
    const ids: string[] = [];
    for (const id of value.publicIds) {
      if (typeof id !== "string" || !isPiecePublicId(id)) return invalid();
      ids.push(id);
    }
    if (new Set(ids).size !== ids.length) return invalid();
    const claimed = value.claimed;
    for (let i = 0; i < ids.length; i += billingPauseConcurrency) {
      await Promise.all(
        ids
          .slice(i, i + billingPauseConcurrency)
          .map((id) =>
            env.TOUCHPOINT_STATE.getByName(id).setPieceClaimed(claimed),
          ),
      );
    }
    return Response.json(
      { result: claimed ? "claimed" : "unclaimed", count: ids.length },
      { headers: privateResponseHeaders() },
    );
  } catch {
    return invalid();
  }
}

/**
 * «Ver página» from the panel (relevo 36, E3): the owner looking at their own
 * page is not a visit. Before, it counted as a «link» visit and mixed with
 * real ones. Anyone can add it, and all it does is skip the count.
 */
export function isPanelPreview(url: URL): boolean {
  return url.searchParams.get("src") === "preview";
}

function channel(url: URL): "nfc" | "qr" | "link" {
  // `src` is the compact public-link convention used on NFC and QR objects.
  // Keep `channel` as a compatibility alias for already-issued test objects.
  const value = url.searchParams.get("src") ?? url.searchParams.get("channel");
  return value === "nfc" || value === "qr" || value === "link" ? value : "link";
}

async function publish(request: Request, env: ResolverEnv): Promise<Response> {
  if (request.method !== "POST" || !hasPublishAuthorization(request, env)) {
    return new Response("Unauthorized", {
      status: 401,
      headers: privateResponseHeaders(),
    });
  }
  const length = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(length) || length > maxSnapshotBytes) {
    return new Response("Invalid publication command", {
      status: 400,
      headers: privateResponseHeaders(),
    });
  }

  try {
    const command = publishCommand(await request.json<unknown>());
    if (!command) {
      return new Response("Invalid publication command", {
        status: 400,
        headers: privateResponseHeaders(),
      });
    }

    const snapshot: PublishedSnapshot = {
      schemaVersion: 1,
      status: "active",
      ...command,
    };
    const body = JSON.stringify(snapshot);
    const sha256 = await digest(body);
    const snapshotKey = `snapshots/${command.publicId}/${command.revision}.json`;
    await env.PUBLISHED_SNAPSHOTS.put(snapshotKey, body, {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
      customMetadata: { sha256 },
    });
    const stored = await env.PUBLISHED_SNAPSHOTS.head(snapshotKey);
    if (!stored || stored.customMetadata?.sha256 !== sha256) {
      throw new Error("Published snapshot verification failed.");
    }

    const result = await env.TOUCHPOINT_STATE.getByName(
      command.publicId,
    ).activate({
      revision: command.revision,
      snapshotKey,
      sha256,
    });
    console.log(
      JSON.stringify({
        message: "publication projection processed",
        publicId: command.publicId,
        revision: command.revision,
        result,
      }),
    );
    return Response.json(
      { result, revision: command.revision },
      { status: 200 },
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "publication projection failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return new Response("Publication projection failed", {
      status: 500,
      headers: privateResponseHeaders(),
    });
  }
}

// ---------------------------------------------------------------------------
// Path parsing (string-prefix based: no dynamic RegExp is ever built from a
// caller-controlled value).
// ---------------------------------------------------------------------------

function publicIdFromPath(pathname: string): string | null {
  const match = /^\/t\/([A-Za-z0-9_-]{16,32})(?:\/|$)/.exec(pathname);
  return match?.[1] ?? null;
}

function goItemFromPath(pathname: string, publicId: string): string | null {
  const prefix = `/t/${publicId}/go/`;
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  return /^[A-Za-z0-9_-]{1,64}$/.test(rest) ? rest : null;
}

function isLeadsPath(pathname: string, publicId: string): boolean {
  return pathname === `/t/${publicId}/leads`;
}

function assetHashFromPath(pathname: string, publicId: string): string | null {
  const prefix = `/t/${publicId}/assets/`;
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  return /^[a-f0-9]{64}$/.test(rest) ? rest : null;
}

/** `@` is a valid, unencoded path character (RFC 3986 pchar), so `/@handle`
 * arrives as one path segment with no percent-decoding involved. */
function handleFromPath(pathname: string): string | null {
  if (!pathname.startsWith("/@")) return null;
  const rest = pathname.slice(2);
  return handlePattern.test(rest) ? rest : null;
}

async function serveAsset(
  hash: string,
  snapshot: PublishedSnapshot,
  env: ResolverEnv,
): Promise<Response> {
  const ref = allAssetRefs(snapshot).find((asset) => asset.sha256 === hash);
  if (!ref) return notFound();
  const object = await env.PUBLISHED_SNAPSHOTS.get(`assets/${hash}`);
  if (!object || object.customMetadata?.sha256 !== hash) return unavailable();
  return new Response(object.body, {
    headers: {
      "cache-control": "no-store",
      "content-type": ref.mediaType,
      "content-disposition":
        ref.mediaType === "application/pdf"
          ? 'attachment; filename="documento.pdf"'
          : "inline",
      "x-content-type-options": "nosniff",
      "content-security-policy":
        "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      "strict-transport-security": "max-age=31536000; includeSubDomains",
      "x-frame-options": "DENY",
    },
  });
}

/**
 * Serves an Estudio de Experiences webfont (ADR 018) at `/_fonts/*` from the
 * `FONT_ASSETS` Workers Static Assets binding (`packages/page-render/fonts/`
 * via `wrangler.jsonc`). The public prefix is stripped before the lookup —
 * this binding indexes the directory's own layout (`/geist/Geist-400.woff2`),
 * never the public `/_fonts/...` path — and the request path is otherwise
 * only ever built from the incoming, already-`startsWith("/_fonts/")`-tested
 * URL, never from other request data. Content is immutable (woff2 files are
 * named by family/weight, never reused for different bytes) and unrelated to
 * any Touchpoint, so it is always safe to cache for a long time regardless of
 * a Touchpoint's own status.
 */
async function serveFontAsset(
  request: Request,
  env: ResolverEnv,
  url: URL,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", {
      status: 405,
      headers: privateResponseHeaders(),
    });
  }
  const assetUrl = new URL(url.pathname.slice("/_fonts".length), url.origin);
  const response = await env.FONT_ASSETS.fetch(
    new Request(assetUrl.toString(), request),
  );
  if (response.status !== 200) return notFound();
  const headers = new Headers(response.headers);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("x-content-type-options", "nosniff");
  headers.set(
    "content-security-policy",
    "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  );
  return new Response(response.body, { status: response.status, headers });
}

/** Exported so the Turnstile CSP-relaxation logic can be unit tested without
 * having to configure a real TURNSTILE_SITE_KEY/SECRET_KEY for the whole test
 * environment (which would also turn Turnstile on for every other test). */
export function publicHtmlHeaders(
  options: { formAction: "self" | "none"; turnstile?: boolean } = {
    formAction: "none",
  },
): HeadersInit {
  // CSP is relaxed only for a form page that actually renders the Turnstile
  // widget: script-src and frame-src are the two directives Cloudflare's own
  // Turnstile integration docs call out as required, and are added nowhere
  // else (every other page keeps the strict default-src 'none' baseline).
  const turnstileCsp = options.turnstile
    ? " script-src https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com;"
    : "";
  return {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    // font-src 'self': Estudio de Experiences (ADR 018) designed pages load
    // their webfonts from this same origin's /_fonts/* (serveFontAsset) —
    // every other directive stays exactly as before.
    "content-security-policy": `default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; font-src 'self';${turnstileCsp} base-uri 'none'; form-action '${options.formAction}'; frame-ancestors 'none'`,
    "referrer-policy": "no-referrer",
    "permissions-policy":
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "x-frame-options": "DENY",
  };
}

export function hasPublishAuthorization(
  request: Request,
  env: ResolverEnv,
): boolean {
  // Fails closed on purpose when the key is missing, like the suspension
  // and billing keys (security review 2026-10).
  if (!env.PUBLISH_COMMAND_KEY) return false;
  const supplied = request.headers.get("authorization");
  const expected = `Bearer ${env.PUBLISH_COMMAND_KEY}`;
  if (!supplied || supplied.length !== expected.length) return false;
  return timingSafeEqual(
    new TextEncoder().encode(supplied),
    new TextEncoder().encode(expected),
  );
}

async function digest(value: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function privateResponseHeaders(): HeadersInit {
  return {
    "cache-control": "no-store",
    "content-type": "text/plain; charset=utf-8",
    "x-content-type-options": "nosniff",
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "x-frame-options": "DENY",
  };
}
