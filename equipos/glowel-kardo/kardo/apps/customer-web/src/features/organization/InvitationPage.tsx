import type { InvitationPreview } from "@kardo/contracts";
import { useEffect, useRef, useState } from "react";
import { membersApi } from "../../api/members.js";
import { Notice } from "../../components/Notice.js";
import { useToast } from "../../components/Toast.js";
import { ApiRequestError, errorMessage } from "../../lib/api.js";
import {
  clearPendingInvitation,
  invitationTokenFrom,
  readPendingInvitation,
} from "../../lib/pending-invitation.js";
import { useRouter } from "../../lib/router.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { invitationPreviewText } from "./team-model.js";

type ReadStatus = "reading" | "ready" | "invalid";

export function InvitationPage() {
  const { session, reloadWorkspaces, selectWorkspace } = useWorkspace();
  const { notify } = useToast();
  const { navigate } = useRouter();
  const consumedRef = useRef(false);
  const [status, setStatus] = useState<ReadStatus>("reading");
  const [token, setToken] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // What the link is, asked once the token is read (A2-17). `null` while it
  // loads or if it could not be read: accepting still works then.
  const [preview, setPreview] = useState<InvitationPreview | null>(null);

  // Reads the token from the URL fragment exactly once, then strips it from
  // history immediately so it never lingers in the back/forward stack. A
  // link opened before signing in left it in this tab's storage (T3).
  useEffect(() => {
    if (consumedRef.current) return;
    consumedRef.current = true;
    const raw = invitationTokenFrom(window.location) ?? readPendingInvitation();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
    if (raw) {
      setToken(raw);
      setStatus("ready");
    } else {
      clearPendingInvitation();
      setStatus("invalid");
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    membersApi
      .previewInvitation(token, controller.signal)
      .then(setPreview)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        // A token the server does not know is as good as an invalid link.
        if (
          cause instanceof ApiRequestError &&
          (cause.code === "INVITATION_INVALID" || cause.status === 404)
        ) {
          clearPendingInvitation();
          setStatus("invalid");
        }
      });
    return () => controller.abort();
  }, [token]);

  const text = preview
    ? invitationPreviewText(preview, session.user.email ?? "")
    : null;

  async function accept() {
    if (!token) return;
    setError(null);
    setIsAccepting(true);
    try {
      const workspace = await membersApi.acceptInvitation({ token });
      clearPendingInvitation();
      await reloadWorkspaces();
      selectWorkspace(workspace.id);
      notify(`Te uniste a ${workspace.name}.`);
      navigate({ name: "overview" });
    } catch (requestError) {
      // Used, expired or for another email: do not bring it back on reload.
      if (
        requestError instanceof ApiRequestError &&
        requestError.code === "INVITATION_INVALID"
      )
        clearPendingInvitation();
      setError(errorMessage(requestError));
    } finally {
      setIsAccepting(false);
    }
  }

  return (
    <div className="page page-narrow">
      <section aria-labelledby="invitation-heading" className="intent-card">
        <h1 id="invitation-heading">
          {text ? text.title : "Te invitaron a un espacio de Kardo."}
        </h1>

        {status === "reading" ? (
          <p className="muted">Comprobando tu invitación…</p>
        ) : null}

        {status === "invalid" ? (
          <Notice tone="danger">
            El enlace de invitación no es válido o ya fue usado. Pide a quien te
            invitó que comparta uno nuevo.
          </Notice>
        ) : null}

        {status === "ready" ? (
          <>
            {text ? (
              <p>{text.detail}</p>
            ) : (
              <p>
                Al aceptar, este correo (<strong>{session.user.email}</strong>)
                se unirá al espacio de trabajo con el rol que te asignaron.
              </p>
            )}
            {error ? (
              <Notice tone="danger">
                {error}
                <p className="form-note">Sesión actual: {session.user.email}</p>
              </Notice>
            ) : null}
            <div className="form-actions">
              <button
                className="button button-primary"
                disabled={isAccepting || text?.canAccept === false}
                onClick={() => void accept()}
                type="button"
              >
                {isAccepting ? "Aceptando…" : "Aceptar invitación"}
              </button>
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
