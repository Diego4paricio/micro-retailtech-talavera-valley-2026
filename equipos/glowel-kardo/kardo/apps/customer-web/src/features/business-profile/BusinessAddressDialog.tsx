import { useEffect, useMemo, useState } from "react";
import { saveBusinessAddress } from "../../api/workspace-slug.js";
import { Dialog } from "../../components/Dialog.js";
import { useToast } from "../../components/Toast.js";
import { errorMessage } from "../../lib/api.js";
import {
  addressChangeDays,
  businessAddressLabel,
  dayAndMonth,
  nextAddressChange,
} from "../../lib/business-address.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import {
  BusinessAddressField,
  businessAddressReady,
} from "./BusinessAddressField.js";
import { useWorkspaceProfile } from "./profile-store.js";
import "./business-address.css";

/**
 * Choosing or changing «Tu link en Kardo» (Links redesign, relevo 34), from
 * Links or Configuración, never from «Nuevo link». Changing it moves every
 * link, so it is reviewed before it is confirmed, and it can change once
 * every 7 days: the dialog says the date.
 */
export function BusinessAddressDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { workspace, touchpoints, reloadWorkspaces } = useWorkspace();
  const profile = useWorkspaceProfile();
  const { notify } = useToast();
  const current = workspace.slug ?? null;
  const [slug, setSlug] = useState(current ?? "");
  const [ready, setReady] = useState(Boolean(current));
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const lockedUntil = current
    ? nextAddressChange(workspace.slugChangedAt)
    : null;
  const linkSlugs = useMemo(
    () =>
      (touchpoints.data ?? [])
        .filter(
          (item) =>
            item.kind === "link" && item.status !== "retired" && item.slug,
        )
        .map((item) => item.slug as string),
    [touchpoints.data],
  );

  useEffect(() => {
    if (!open) return;
    setSlug(current ?? "");
    setReady(Boolean(current));
    setReviewing(false);
    setError(null);
  }, [open, current]);

  const changed = slug !== (current ?? "");
  const canGo = ready && changed && businessAddressReady(slug) && !isSaving;

  async function save() {
    setIsSaving(true);
    setError(null);
    try {
      const saved = await saveBusinessAddress(workspace.id, slug);
      await reloadWorkspaces();
      notify(`Tu link en Kardo es ${businessAddressLabel(saved)}.`);
      onClose();
    } catch (requestError) {
      setError(errorMessage(requestError));
      setReviewing(false);
    } finally {
      setIsSaving(false);
    }
  }

  if (lockedUntil && current)
    return (
      <Dialog
        footer={
          <button
            className="button button-primary"
            onClick={onClose}
            type="button"
          >
            Entendido
          </button>
        }
        onClose={onClose}
        open={open}
        title="Cambia tu link en Kardo"
      >
        <div className="business-address">
          <div className="business-address-input is-locked">
            <span className="address-prefix">
              {businessAddressLabel(current)}
            </span>
          </div>
        </div>
        <p className="address-note">
          {workspace.slugChangedAt
            ? `La cambiaste el ${dayAndMonth(new Date(workspace.slugChangedAt))}. `
            : ""}
          Podrás cambiarla otra vez el {dayAndMonth(lockedUntil)}.
        </p>
      </Dialog>
    );

  if (reviewing && current)
    return (
      <Dialog
        footer={
          <>
            <button
              className="button button-secondary"
              disabled={isSaving}
              onClick={() => setReviewing(false)}
              type="button"
            >
              Atrás
            </button>
            <button
              aria-busy={isSaving || undefined}
              className="button button-primary"
              disabled={isSaving}
              onClick={() => void save()}
              type="button"
            >
              {isSaving ? "Cambiando…" : "Cambiar link"}
            </button>
          </>
        }
        onClose={onClose}
        open={open}
        title="Revisa el cambio"
      >
        <div className="address-review">
          <p className="address-review-row is-before">
            <span>Antes</span>
            <strong>{businessAddressLabel(current)}</strong>
          </p>
          <p className="address-review-row">
            <span>Ahora</span>
            <strong>{businessAddressLabel(slug)}</strong>
          </p>
          {linkSlugs.length ? (
            <ul className="address-review-links">
              {linkSlugs.map((linkSlug) => (
                <li key={linkSlug}>
                  {businessAddressLabel(slug)}/<strong>{linkSlug}</strong>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <p className="address-note">
          Podrás volver a cambiarla el{" "}
          {dayAndMonth(
            new Date(Date.now() + addressChangeDays * 24 * 60 * 60 * 1000),
          )}
          .
        </p>
      </Dialog>
    );

  return (
    <Dialog
      footer={
        <>
          <button
            className="button button-secondary"
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            aria-busy={isSaving || undefined}
            className="button button-primary"
            disabled={!canGo}
            onClick={() => (current ? setReviewing(true) : void save())}
            type="button"
          >
            {current ? "Revisar cambio" : isSaving ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
      onClose={onClose}
      open={open}
      title={current ? "Cambia tu link en Kardo" : "Elige tu link en Kardo"}
    >
      <BusinessAddressField
        city={profile.data?.city}
        error={error}
        industry={profile.data?.industry}
        label="Tu link en Kardo"
        name={workspace.name}
        onChange={(next) => {
          setError(null);
          setSlug(next);
        }}
        onReadyChange={setReady}
        savedSlug={current}
        value={slug}
        workspaceId={workspace.id}
      />
      <p className="address-note">
        {current
          ? "Tus links cambian con ella y las direcciones anteriores siguen abriendo."
          : "Es única y tus links van dentro de ella."}
      </p>
    </Dialog>
  );
}
