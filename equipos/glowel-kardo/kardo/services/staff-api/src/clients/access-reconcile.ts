import type { AccessReconciler } from "@kardo/billing";

/**
 * Best-effort access reconciliation (ADR 020 §4): after a billing change
 * commits, pause or resume the organization's public pages in the Resolver
 * right away. A failure here (the Resolver is down, the state moved on) is
 * logged and swallowed: the change already happened and the hourly access
 * tick retries. Never call it inside an open database transaction.
 */
export type AccessReconcile = (workspaceId: string) => Promise<void>;

export type ReconcileLogger = {
  warn(payload: Record<string, unknown>, message: string): void;
};

export const noopAccessReconcile: AccessReconcile = async () => {};

export function createAccessReconcile(
  reconciler: Pick<AccessReconciler, "reconcileWorkspace"> | null,
  logger: () => ReconcileLogger | null,
): AccessReconcile {
  if (!reconciler) return noopAccessReconcile;
  return async (workspaceId) => {
    try {
      await reconciler.reconcileWorkspace(workspaceId);
    } catch (error) {
      logger()?.warn(
        {
          workspaceId,
          err: error instanceof Error ? error.message : String(error),
        },
        "Access reconciliation failed; the hourly tick will retry",
      );
    }
  };
}
