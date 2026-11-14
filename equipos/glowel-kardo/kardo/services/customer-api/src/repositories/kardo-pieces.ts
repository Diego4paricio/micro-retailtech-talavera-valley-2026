import type {
  ClaimKardoPieces,
  KardoPieceClaimPreview,
  KardoPieceClaimResult,
  KardoPieceToClaim,
  KitPanelGrant,
} from "@kardo/contracts";
import type { Sql } from "postgres";
import {
  assertWithinLimit,
  readEffectivePlan,
  readWorkspaceUsage,
} from "../billing/entitlements.js";
import {
  ApiError,
  ConflictError,
  NotFoundError,
  PlanLimitError,
  UnavailableError,
  WorkspaceAccessError,
} from "../errors.js";
import type { TouchpointAvailabilityClient } from "../resolver-clients/touchpoint-availability.js";
import {
  assertWorkspaceHasPlan,
  type CustomerIdentity,
  requireMembershipWithPermission,
  withCustomerContext,
} from "./context.js";
import { propagateGroupExperience } from "./propagation.js";
import { fetchTouchpointsByIds } from "./touchpoints.js";

/*
 * Piezas de Kardo (ADR 026). The codes, the pieces they open and the kit's
 * 30 days live in SQL (`kardo_private.preview_piece_claim`,
 * `claim_kardo_pieces`, migration 20261013600000); this layer adds what
 * only the API knows: the plan's limit (one pool per person, ADR 024), the
 * plan requirement and the Resolver.
 */

/** A code that opens nothing here, or one already used here. The SQL
 * functions record the attempt, so these come back after the commit. */
type ClaimRefusal = { refused: "invalid" | "used" };

export type KardoPieceRepository = {
  previewClaim(
    identity: CustomerIdentity,
    workspaceId: string,
    code: string,
    client: string,
  ): Promise<KardoPieceClaimPreview>;
  claim(
    identity: CustomerIdentity,
    workspaceId: string,
    input: ClaimKardoPieces,
    client: string,
  ): Promise<KardoPieceClaimResult & { propagatedPublications: number }>;
};

export class KardoPieceRepositoryError extends Error {}

export function unavailableKardoPieceRepository(): KardoPieceRepository {
  const unavailable = () => Promise.reject(new KardoPieceRepositoryError());
  return { previewClaim: unavailable, claim: unavailable };
}

export const pieceMessages = {
  PIECE_CODE_INVALID:
    "Ese código no abre ninguna pieza. Revísalo letra por letra: viene en la tarjeta de activación de tu pedido o atrás de la pieza.",
  PIECE_CODE_USED:
    "Ya activaste las piezas de este código. Las encuentras en QR y etiquetas.",
  PIECE_CODE_RATE_LIMITED:
    "Probaste muchos códigos seguidos. Espera una hora y vuelve a intentarlo, o escríbenos.",
  PIECE_NOT_CLAIMABLE:
    "Alguna de esas piezas ya se activó. Vuelve a escribir el código para ver las que quedan.",
} as const;

function refusalError(refusal: ClaimRefusal): ApiError {
  return refusal.refused === "used"
    ? new ConflictError("PIECE_CODE_USED", pieceMessages.PIECE_CODE_USED)
    : new ApiError("PIECE_CODE_INVALID", 400, pieceMessages.PIECE_CODE_INVALID);
}

/** `claim_kardo_pieces` and its helpers raise plain codes. */
function mapPieceSqlError(error: unknown): never {
  const message = error instanceof Error ? error.message : "";
  if (message === "FORBIDDEN") throw new WorkspaceAccessError();
  if (message === "PIECE_CODE_RATE_LIMITED")
    throw new ApiError(
      "PIECE_CODE_RATE_LIMITED",
      429,
      pieceMessages.PIECE_CODE_RATE_LIMITED,
    );
  if (message === "PIECE_NOT_CLAIMABLE")
    throw new ConflictError(
      "PIECE_NOT_CLAIMABLE",
      pieceMessages.PIECE_NOT_CLAIMABLE,
    );
  if (message === "GROUP_NOT_FOUND")
    throw new NotFoundError("Group was not found.");
  throw error;
}

type PreviewRow = {
  status: "ok" | "invalid" | "used";
  scope?: "kit" | "piece";
  pieces?: KardoPieceToClaim[];
  alreadyActive?: number;
  kit?: KardoPieceClaimPreview["kit"];
};

type ClaimRow = {
  status: "claimed" | "invalid" | "used";
  touchpointIds?: string[];
  publicIds?: string[];
  panel?: KitPanelGrant | null;
};

/** Thrown inside the dry run to roll its savepoint back. */
class DryRun extends Error {}

type SavepointSql = Sql & {
  savepoint<T>(callback: (sql: Sql) => Promise<T>): Promise<T>;
};

export function createPostgresKardoPieceRepository(
  sql: Sql,
  options: {
    resolver: TouchpointAvailabilityClient | null;
    /** After a kit's days apply: resume paused pages now (best effort,
     * outside the transaction; the hourly tick retries). */
    reconcile?: (workspaceId: string) => Promise<void>;
  },
): KardoPieceRepository {
  return {
    async previewClaim(identity, workspaceId, code, client) {
      const outcome = await withCustomerContext(sql, identity, async (tx) => {
        // A kit gives a plan: an organization without one may still
        // activate (whether it ends with one is part of the answer).
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "touchpoints.manage",
          { allowWithoutPlan: true },
        );
        const [row] = await tx<{ result: PreviewRow }[]>`
          select kardo_private.preview_piece_claim(${workspaceId}::uuid, ${code}, ${client}) as result
        `.catch(mapPieceSqlError);
        const found = row?.result;
        if (!found || found.status !== "ok" || !found.pieces?.length)
          return {
            refused: found?.status === "used" ? "used" : "invalid",
          } satisfies ClaimRefusal;
        const pieces = found.pieces;
        const usage =
          (await readWorkspaceUsage(tx, workspaceId))["touchpoints.max"] ?? 0;
        // What the activation would leave: the same function, every piece,
        // in a savepoint that is always rolled back.
        let limit: number | null = null;
        let planRequired = false;
        try {
          await (tx as SavepointSql).savepoint(async (dry) => {
            await dry`
              select kardo_private.claim_kardo_pieces(
                ${workspaceId}::uuid, ${code}, ${client},
                ${dry.json(pieces.map((piece) => ({ touchpointId: piece.touchpointId, name: "Pieza" })))},
                null
              )
            `;
            const after = await readEffectivePlan(dry, workspaceId);
            const value = after.entitlements["touchpoints.max"];
            limit = typeof value === "number" ? value : null;
            const [access] = await dry<{ state: string }[]>`
              select state from kardo_billing.workspace_access(${workspaceId}::uuid)
            `;
            planRequired =
              access?.state === "limited" || access?.state === "paused";
            throw new DryRun();
          });
        } catch (error) {
          if (!(error instanceof DryRun)) mapPieceSqlError(error);
        }
        const fits =
          limit === null
            ? pieces.length
            : Math.max(0, Math.min(pieces.length, limit - usage));
        return {
          scope: found.scope ?? "kit",
          pieces,
          alreadyActive: found.alreadyActive ?? 0,
          kit: found.kit ?? null,
          limit: { limit, usage, fits },
          planRequired,
        } satisfies KardoPieceClaimPreview;
      });
      if (outcome.refused) throw refusalError({ refused: outcome.refused });
      return outcome;
    },

    async claim(identity, workspaceId, input, client) {
      const resolver = options.resolver;
      if (!resolver?.setPieces)
        throw new UnavailableError(
          "TOUCHPOINT_AVAILABILITY_UNAVAILABLE",
          "The Resolver is not configured.",
        );
      const outcome = await withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "touchpoints.manage",
          { allowWithoutPlan: true },
        );
        const pieces = input.pieces.map((piece) => ({
          touchpointId: piece.touchpointId,
          name: piece.name.trim(),
        }));
        const [row] = await tx<{ result: ClaimRow }[]>`
          select kardo_private.claim_kardo_pieces(
            ${workspaceId}::uuid, ${input.code}, ${client},
            ${tx.json(pieces)}, ${input.groupId ?? null}::uuid
          ) as result
        `.catch(mapPieceSqlError);
        const claimed = row?.result;
        if (!claimed || claimed.status !== "claimed")
          return {
            refused: claimed?.status === "used" ? "used" : "invalid",
          } satisfies ClaimRefusal;
        const ids = claimed.touchpointIds ?? [];
        // All or nothing (ADR 026 §6): after the kit's days, the plan must
        // exist and hold every piece; otherwise the whole activation rolls
        // back, the kit's days with it.
        await assertWorkspaceHasPlan(tx, workspaceId);
        try {
          await assertWithinLimit(tx, workspaceId, "touchpoints.max", 0);
        } catch (error) {
          if (error instanceof PlanLimitError)
            throw new PlanLimitError({
              ...error.details,
              usage: Math.max(0, (error.details.usage ?? 0) - ids.length),
            });
          throw error;
        }
        const propagatedPublications = input.groupId
          ? await propagateGroupExperience(tx, {
              workspaceId,
              touchpointIds: ids,
              createdBy: identity.subject,
            })
          : 0;
        // The Resolver stops showing «Esta pieza aún no está activada».
        // Inside the transaction: if it cannot hear it, nothing is activated.
        try {
          await resolver.setPieces?.({
            publicIds: claimed.publicIds ?? [],
            claimed: true,
          });
        } catch {
          throw new UnavailableError(
            "TOUCHPOINT_AVAILABILITY_UNAVAILABLE",
            "The Resolver could not activate the pieces.",
          );
        }
        return {
          touchpoints: await fetchTouchpointsByIds(tx, ids),
          panel: claimed.panel ?? null,
          propagatedPublications,
        };
      });
      if (outcome.refused) throw refusalError({ refused: outcome.refused });
      if (
        outcome.panel?.outcome === "trial" ||
        outcome.panel?.outcome === "courtesy"
      )
        await options.reconcile?.(workspaceId).catch(() => undefined);
      return outcome;
    },
  };
}
