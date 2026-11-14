import type { CustomerWorkspace } from "@kardo/contracts";
import { type FormEvent, useState } from "react";
import { workspacesApi } from "../../api/workspaces.js";
import { Notice } from "../../components/Notice.js";
import { errorMessage } from "../../lib/api.js";
import { useRouter } from "../../lib/router.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";

/**
 * "Crear mi propio negocio" (relevo 20, T3): the sign-up step a person who
 * joined by invitation skipped. Their personal space becomes their business
 * organization and, if they never used it, starts their 15-day trial (one
 * per person; the database enforces it).
 */
export function CreateBusinessForm({
  workspace,
  trialAvailable,
  invited,
  onCreated,
  onCancel,
}: {
  workspace: CustomerWorkspace;
  trialAvailable: boolean;
  /** The person already works in an organization that invited them. */
  invited: boolean;
  onCreated: (workspace: CustomerWorkspace) => void;
  onCancel?: (() => void) | undefined;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const workspaceName = name.trim();
    if (!workspaceName) return;
    setBusy(true);
    setError(null);
    try {
      onCreated(
        // Opened from "Crear mi propio negocio": a business account.
        await workspacesApi.completeOnboarding(workspace.id, {
          workspaceName,
          accountType: "business",
        }),
      );
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="create-business-heading"
      className="onboarding-card"
    >
      <h1 id="create-business-heading">
        {invited
          ? "Crea tu propio negocio en Kardo."
          : "Crea tu negocio en Kardo."}
      </h1>
      <p className="auth-intro">
        {invited
          ? "Es un espacio aparte de la organización que te invitó, con sus propias páginas, códigos QR y contactos."
          : "Tus páginas, códigos QR y contactos en un solo lugar. Podrás cambiar el nombre después."}{" "}
        {trialAvailable
          ? "Empiezas con 15 días gratis de Profesional, sin tarjeta."
          : "Ya usaste tu prueba gratis: para crear y editar en tu negocio, elige un plan."}
      </p>
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        <label htmlFor="create-business-name">Nombre de tu negocio</label>
        <input
          autoComplete="organization"
          id="create-business-name"
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          placeholder="Por ejemplo, Florería Lila"
          required
          value={name}
        />
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <button
          aria-busy={busy || undefined}
          className="button button-primary"
          disabled={busy || !name.trim()}
          type="submit"
        >
          {trialAvailable
            ? "Crear mi negocio y empezar 15 días gratis"
            : "Crear mi negocio"}
        </button>
        {onCancel ? (
          <button
            className="mode-switch mode-switch-secondary"
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            Cancelar
          </button>
        ) : null}
      </form>
    </section>
  );
}

/** The route `/crear-negocio`, opened from the sidebar. */
export function CreateBusinessPage() {
  const { pendingSetup, reloadWorkspaces, selectWorkspace } = useWorkspace();
  const { navigate } = useRouter();
  if (!pendingSetup)
    return (
      <div className="page page-narrow">
        <Notice tone="info">Tu negocio ya está creado.</Notice>
      </div>
    );
  return (
    <div className="page page-narrow">
      <CreateBusinessForm
        invited
        onCancel={() => navigate({ name: "overview" })}
        onCreated={(created) => {
          void reloadWorkspaces().then(() => {
            selectWorkspace(created.id);
            navigate({ name: "overview" });
          });
        }}
        trialAvailable={pendingSetup.trialAvailable ?? false}
        workspace={pendingSetup}
      />
    </div>
  );
}
