import type { OwnershipTransfer } from "@kardo/contracts";
import { useCallback, useEffect, useState } from "react";
import { membersApi } from "../../api/members.js";
import { Notice } from "../../components/Notice.js";
import { useToast } from "../../components/Toast.js";
import { ApiRequestError, errorMessage } from "../../lib/api.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import {
  canAcceptTransfer,
  cannotAcceptTransferText,
  transferGoneText,
} from "./team-model.js";

/**
 * The consent side of an ownership transfer (ADR 024, security review
 * 2026-10-12): the Owner who requested one sees it is pending and can cancel
 * it; the member it is offered to accepts or declines. Nothing changed until
 * they accept. Self-contained so `PeopleGroup` only renders it.
 */
export function OwnershipTransferCards({
  refreshToken,
}: {
  /** Bumped by the parent after requesting a transfer, to re-fetch. */
  refreshToken: number;
}) {
  const { workspace, reloadWorkspaces } = useWorkspace();
  const { notify } = useToast();
  const [incoming, setIncoming] = useState<OwnershipTransfer | null>(null);
  const [pending, setPending] = useState<OwnershipTransfer | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    (signal?: AbortSignal) => {
      void membersApi
        .incomingTransfers(signal)
        .then((list) =>
          setIncoming(
            list.find((item) => item.workspaceId === workspace.id) ?? null,
          ),
        )
        .catch(() => undefined);
      // The Owner's own pending request (the recipient sees it through
      // `incoming`, so only show the sender card to a non-recipient Owner).
      void membersApi
        .pendingTransfer(workspace.id, signal)
        .then((transfer) =>
          setPending(
            transfer && !transfer.isRecipient && workspace.role === "owner"
              ? transfer
              : null,
          ),
        )
        .catch(() => undefined);
    },
    [workspace.id, workspace.role],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshToken is an intentional trigger — the parent bumps it to re-fetch after requesting a transfer.
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load, refreshToken]);

  async function respond(
    action: "accept" | "decline",
    transfer: OwnershipTransfer,
  ) {
    setBusy(true);
    try {
      if (action === "accept") {
        await membersApi.acceptTransfer(transfer.id);
        notify(`Ahora eres el Owner de ${transfer.workspaceName}.`);
        // The current person's role just changed (to Owner): refresh it.
        await reloadWorkspaces();
      } else {
        await membersApi.declineTransfer(transfer.id);
        notify("Rechazaste la transferencia.");
      }
      setIncoming(null);
    } catch (error) {
      // The server cancels a transfer whose recipient is no longer an Admin
      // (A2-10): say it to her, and drop the card that no longer stands.
      if (
        action === "accept" &&
        error instanceof ApiRequestError &&
        (error.status === 404 || error.status === 409)
      ) {
        notify(transferGoneText, "error");
        setIncoming(null);
      } else notify(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  async function cancel(transfer: OwnershipTransfer) {
    setBusy(true);
    try {
      await membersApi.cancelTransfer(workspace.id, transfer.id);
      notify("Cancelaste la transferencia.");
      setPending(null);
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  }

  const mayAccept = canAcceptTransfer(workspace.role);
  if (!incoming && !pending) return null;
  return (
    <div className="ownership-transfer-cards">
      {incoming ? (
        <Notice tone="info">
          <p>
            <strong>{incoming.fromName ?? "Un Owner"}</strong> quiere pasarte la
            propiedad de <strong>{incoming.workspaceName}</strong>. Si aceptas,
            serás el Owner y la organización entra a tu plan (y sale del de
            quien te la pasa).
          </p>
          {mayAccept ? null : (
            <p className="field-hint">{cannotAcceptTransferText}</p>
          )}
          <div className="ownership-transfer-actions">
            {mayAccept ? (
              <button
                className="button button-primary button-small"
                disabled={busy}
                onClick={() => void respond("accept", incoming)}
                type="button"
              >
                Aceptar la propiedad
              </button>
            ) : null}
            <button
              className="button button-secondary button-small"
              disabled={busy}
              onClick={() => void respond("decline", incoming)}
              type="button"
            >
              Rechazar
            </button>
          </div>
        </Notice>
      ) : null}
      {pending ? (
        <Notice tone="info">
          <p>
            Le enviamos la solicitud a{" "}
            <strong>{pending.toName ?? "esa persona"}</strong>. La propiedad
            cambia cuando la acepte; mientras tanto sigues siendo el Owner.
          </p>
          <div className="ownership-transfer-actions">
            <button
              className="button button-secondary button-small"
              disabled={busy}
              onClick={() => void cancel(pending)}
              type="button"
            >
              Cancelar la solicitud
            </button>
          </div>
        </Notice>
      ) : null}
    </div>
  );
}
