import { legalVersions } from "@kardo/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { profileApi } from "../../api/workspaces.js";
import { NativeDialog } from "../../components/NativeDialog.js";
import { Notice } from "../../components/Notice.js";
import { errorMessage } from "../../lib/api.js";
import { supabase } from "../../supabase.js";
import { legalLinks } from "./legal-links.js";
import {
  clearPendingMark,
  needsTermsAcceptance,
  readPendingMark,
  termsGateTitle,
} from "./terms-model.js";
import "./legal.css";

/**
 * Single gate for the Terms and Privacy Notice. Signed-up people who ticked the
 * box on this device are accepted silently; everyone else (older accounts, new
 * versions) gets a blocking dialog.
 */
export function TermsGate() {
  const [title, setTitle] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const accept = useCallback(async () => {
    await profileApi.acceptTerms({
      termsVersion: legalVersions.terms,
      privacyVersion: legalVersions.privacy,
    });
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const profile = await profileApi.get();
        if (!needsTermsAcceptance(profile)) return;
        if (readPendingMark()) {
          try {
            await accept();
            clearPendingMark();
            return;
          } catch {
            // Fall through to the dialog so the person can retry.
          }
        }
        setTitle(termsGateTitle(profile));
      } catch {
        // The workspace shows its own connection errors; do not block on this.
      }
    })();
  }, [accept]);

  if (!title) return null;
  const links = legalLinks();

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await accept();
      clearPendingMark();
      setTitle(null);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    // A gate: no `onClose`, so neither Escape nor the backdrop dismiss it.
    <NativeDialog
      aria-labelledby="terms-gate-title"
      className="terms-gate"
      exitMs={0}
      open
    >
      <div className="terms-gate-panel">
        <h2 id="terms-gate-title">{title}</h2>
        <ul className="terms-gate-list">
          <li>
            Kardo es la plataforma para crear y administrar tus códigos QR y NFC
            y las páginas a las que llevan. Tienes 15 días de prueba sin
            tarjeta; para seguir después eliges un plan de pago.
          </li>
          <li>
            Los planes se renuevan automáticamente. Te avisamos al menos 7 días
            antes de cada cargo y puedes cancelar desde Configuración, Plan.
          </li>
          <li>
            Si terminas tu prueba o tu plan sin contratar, tus páginas siguen
            abiertas 7 días y después se pausan. Si en 90 días no contratas,
            borramos esa organización; antes te avisamos y puedes descargar tu
            información.
          </li>
          <li>
            Tus datos y los de tus visitantes se tratan según el Aviso de
            Privacidad, y tú eres responsable de los datos de tus solicitudes.
          </li>
        </ul>
        <p className="terms-gate-links">
          <a href={links.terms} rel="noopener noreferrer" target="_blank">
            Términos y Condiciones
          </a>
          <a href={links.privacy} rel="noopener noreferrer" target="_blank">
            Aviso de Privacidad
          </a>
          <a
            href={links.cancellation}
            rel="noopener noreferrer"
            target="_blank"
          >
            Cancelación y reembolsos
          </a>
        </p>
        <label className="legal-check">
          <input
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
            type="checkbox"
          />
          <span>
            Acepto los Términos y Condiciones y el Aviso de Privacidad de Kardo.
          </span>
        </label>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div className="terms-gate-actions">
          <button
            className="button button-secondary"
            disabled={busy}
            onClick={() => void supabase?.auth.signOut()}
            type="button"
          >
            Cerrar sesión
          </button>
          <button
            className="button button-primary"
            disabled={!checked || busy}
            onClick={() => void submit()}
            type="button"
          >
            {busy ? "Guardando…" : "Aceptar y continuar"}
          </button>
        </div>
      </div>
    </NativeDialog>
  );
}
