import { cfdiUses, type FiscalProfile, taxRegimes } from "@kardo/contracts";
import { useState } from "react";
import { Dialog } from "../../components/Dialog.js";
import { Field } from "../../components/Field.js";
import { Notice } from "../../components/Notice.js";
import { SettingsGroup, SettingsRow } from "../../components/SettingsBlocks.js";
import { useToast } from "../../components/Toast.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import {
  emptyFiscalForm,
  type FiscalForm,
  formFromProfile,
  hasErrors,
  normalizeRfc,
  validateFiscalForm,
} from "./fiscal-model.js";
import type { FiscalController } from "./use-fiscal.js";

const regimeLabel = (code: string) =>
  taxRegimes.find((item) => item.code === code)?.label ?? code;
const useLabel = (code: string) =>
  cfdiUses.find((item) => item.code === code)?.label ?? code;

/** Connects the section to the workspace and the toasts. */
export function FiscalSection({ fiscal }: { fiscal: FiscalController }) {
  const { workspace } = useWorkspace();
  const { notify } = useToast();
  return (
    <FiscalSectionView
      defaultEmail=""
      fiscal={fiscal}
      key={workspace.id}
      onNotify={(message) => notify(message, "success")}
    />
  );
}

/**
 * Datos de facturación: optional, for whoever wants a CFDI (ADR 020 §6).
 * Read-only rows; the form opens in a dialog.
 */
export function FiscalSectionView({
  fiscal,
  defaultEmail,
  onNotify,
  initialConfirming = false,
}: {
  fiscal: FiscalController;
  defaultEmail: string;
  onNotify?: (message: string) => void;
  initialConfirming?: boolean;
}) {
  const { profile } = fiscal.fiscal;
  const [confirming, setConfirming] = useState(initialConfirming);
  const closeForm = () => {
    fiscal.setFormOpen(false);
    fiscal.clearError();
  };

  return (
    <>
      <SettingsGroup
        actions={
          profile ? (
            <button
              className="button button-secondary button-small"
              onClick={() => fiscal.setFormOpen(true)}
              type="button"
            >
              Editar
            </button>
          ) : (
            <button
              className="button button-secondary button-small"
              onClick={() => fiscal.setFormOpen(true)}
              type="button"
            >
              Agregar datos de facturación
            </button>
          )
        }
        description="Son opcionales. Solo los necesitas si quieres factura (CFDI)."
        footer={
          profile ? (
            <button
              className="text-action"
              onClick={() => setConfirming(true)}
              type="button"
            >
              Borrar mis datos fiscales
            </button>
          ) : undefined
        }
        id="billing-fiscal-heading"
        title="Datos de facturación"
      >
        {fiscal.error && !fiscal.formOpen ? (
          <div className="billing-group-notice">
            <Notice onDismiss={fiscal.clearError} tone="danger">
              {fiscal.error}
            </Notice>
          </div>
        ) : null}
        {profile ? (
          <SavedProfile profile={profile} />
        ) : (
          <SettingsRow
            label="Sin datos"
            value={
              <span className="billing-row-note">
                ¿Necesitas factura (CFDI)? Agrega tus datos fiscales. Si no la
                pides, tu pago entra en la factura global del mes.
              </span>
            }
          />
        )}
      </SettingsGroup>

      <Dialog
        onClose={closeForm}
        open={fiscal.formOpen}
        title={profile ? "Editar datos de facturación" : "Datos de facturación"}
      >
        {fiscal.error ? (
          <Notice onDismiss={fiscal.clearError} tone="danger">
            {fiscal.error}
          </Notice>
        ) : null}
        <FiscalFormView
          busy={fiscal.busy === "save"}
          initial={
            profile ? formFromProfile(profile) : emptyFiscalForm(defaultEmail)
          }
          onCancel={closeForm}
          onSave={async (form) => {
            if (await fiscal.save(form)) {
              fiscal.setFormOpen(false);
              onNotify?.("Guardamos tus datos de facturación.");
            }
          }}
        />
      </Dialog>

      <Dialog
        description="Borraremos tu RFC y demás datos fiscales. Las facturas que ya pediste se conservan, y los próximos pagos entrarán en la factura global del mes."
        footer={
          <>
            <button
              className="button button-ghost"
              disabled={fiscal.busy === "remove"}
              onClick={() => setConfirming(false)}
              type="button"
            >
              Cancelar
            </button>
            <button
              aria-busy={fiscal.busy === "remove" || undefined}
              className="button button-danger"
              disabled={fiscal.busy === "remove"}
              onClick={async () => {
                if (await fiscal.remove()) {
                  setConfirming(false);
                  onNotify?.("Borramos tus datos de facturación.");
                }
              }}
              type="button"
            >
              Borrar mis datos fiscales
            </button>
          </>
        }
        onClose={() => setConfirming(false)}
        open={confirming}
        title="¿Borrar tus datos fiscales?"
        tone="danger"
      />
    </>
  );
}

function SavedProfile({ profile }: { profile: FiscalProfile }) {
  return (
    <>
      <SettingsRow label="RFC" value={profile.rfc} />
      <SettingsRow label="Nombre o razón social" value={profile.legalName} />
      <SettingsRow
        label="Régimen fiscal"
        value={`${profile.taxRegime} · ${regimeLabel(profile.taxRegime)}`}
      />
      <SettingsRow label="Código postal" value={profile.postalCode} />
      <SettingsRow
        label="Uso del CFDI"
        value={`${profile.cfdiUse} · ${useLabel(profile.cfdiUse)}`}
      />
      <SettingsRow label="Correo de la factura" value={profile.email} />
      <SettingsRow
        label="Factura de cada pago"
        value={profile.invoiceEachPayment ? "Sí" : "No"}
      />
    </>
  );
}

export function FiscalFormView({
  initial,
  busy,
  onSave,
  onCancel,
  submitLabel = "Guardar",
  hideEachPayment = false,
}: {
  initial: FiscalForm;
  busy: boolean;
  onSave: (form: FiscalForm) => void;
  onCancel: () => void;
  /** "Guardar y continuar a pago" when it is part of contracting a plan. */
  submitLabel?: string;
  /** Contracting with "Necesito factura" already means every payment. */
  hideEachPayment?: boolean;
}) {
  const [form, setForm] = useState(initial);
  const [touched, setTouched] = useState<Set<keyof FiscalForm>>(new Set());
  const errors = validateFiscalForm(form);
  const invalid = hasErrors(errors);
  const set = <K extends keyof FiscalForm>(key: K, value: FiscalForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const touch = (key: keyof FiscalForm) =>
    setTouched((current) => new Set(current).add(key));
  const shown = (key: keyof FiscalForm) =>
    touched.has(key) ? (errors[key] ?? null) : null;

  return (
    <form
      className="billing-fiscal-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!invalid) onSave(form);
      }}
    >
      <Field error={shown("rfc")} id="fiscal-rfc" label="RFC">
        <input
          autoCapitalize="characters"
          autoComplete="off"
          className="input"
          id="fiscal-rfc"
          maxLength={13}
          onBlur={() => touch("rfc")}
          onChange={(event) => set("rfc", normalizeRfc(event.target.value))}
          spellCheck={false}
          type="text"
          value={form.rfc}
        />
      </Field>
      <Field
        error={shown("legalName")}
        id="fiscal-name"
        label="Nombre o razón social (como aparece en tu Constancia)"
      >
        <input
          autoComplete="organization"
          className="input"
          id="fiscal-name"
          maxLength={300}
          onBlur={() => touch("legalName")}
          onChange={(event) => set("legalName", event.target.value)}
          type="text"
          value={form.legalName}
        />
      </Field>
      <Field
        error={shown("taxRegime")}
        id="fiscal-regime"
        label="Régimen fiscal"
      >
        <select
          className="input"
          id="fiscal-regime"
          onBlur={() => touch("taxRegime")}
          onChange={(event) => set("taxRegime", event.target.value)}
          value={form.taxRegime}
        >
          <option value="">Elige tu régimen</option>
          {taxRegimes.map((item) => (
            <option key={item.code} value={item.code}>
              {item.code} · {item.label}
            </option>
          ))}
        </select>
      </Field>
      <Field
        error={shown("postalCode")}
        id="fiscal-postal"
        label="Código postal del domicilio fiscal"
      >
        <input
          autoComplete="postal-code"
          className="input"
          id="fiscal-postal"
          inputMode="numeric"
          maxLength={5}
          onBlur={() => touch("postalCode")}
          onChange={(event) =>
            set("postalCode", event.target.value.replace(/\D/g, ""))
          }
          type="text"
          value={form.postalCode}
        />
      </Field>
      <Field error={shown("cfdiUse")} id="fiscal-use" label="Uso del CFDI">
        <select
          className="input"
          id="fiscal-use"
          onBlur={() => touch("cfdiUse")}
          onChange={(event) => set("cfdiUse", event.target.value)}
          value={form.cfdiUse}
        >
          {cfdiUses.map((item) => (
            <option key={item.code} value={item.code}>
              {item.code} · {item.label}
            </option>
          ))}
        </select>
      </Field>
      <Field
        error={shown("email")}
        id="fiscal-email"
        label="Correo para recibir la factura"
      >
        <input
          autoComplete="email"
          className="input"
          id="fiscal-email"
          onBlur={() => touch("email")}
          onChange={(event) => set("email", event.target.value)}
          type="email"
          value={form.email}
        />
      </Field>
      {hideEachPayment ? null : (
        <label className="billing-fiscal-check" htmlFor="fiscal-each">
          <input
            checked={form.invoiceEachPayment}
            id="fiscal-each"
            onChange={(event) =>
              set("invoiceEachPayment", event.target.checked)
            }
            type="checkbox"
          />
          <span>
            <strong>Quiero factura de cada pago</strong>
            <span className="billing-muted">
              Pediremos tu factura automáticamente cada vez que se cobre tu
              plan.
            </span>
          </span>
        </label>
      )}
      <p className="billing-muted">
        Solo pedimos los datos; no necesitas subir tu Constancia.
      </p>
      <div className="billing-actions">
        <button
          aria-busy={busy || undefined}
          className="button button-primary"
          disabled={invalid || busy}
          type="submit"
        >
          {submitLabel}
        </button>
        <button
          className="button button-ghost"
          disabled={busy}
          onClick={onCancel}
          type="button"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
