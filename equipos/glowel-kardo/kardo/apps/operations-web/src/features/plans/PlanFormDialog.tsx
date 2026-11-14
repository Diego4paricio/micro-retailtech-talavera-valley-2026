import { planEntitlementKeys, type StaffPlan } from "@kardo/contracts";
import { type FormEvent, useEffect, useState } from "react";
import { plansApi } from "../../api/plans.js";
import { Dialog } from "../../components/Dialog.js";
import { Field } from "../../components/Field.js";
import { Notice } from "../../components/Notice.js";
import { errorMessage } from "../../lib/api.js";
import { entitlementLabel } from "../billing/format.js";
import {
  type EntitlementForm,
  fromEntitlementForm,
  parseSortOrder,
  parseTrialDays,
  toEntitlementForm,
} from "./plan-form.js";

const descriptionMax = 500;

export function PlanFormDialog({
  open,
  plan,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** null creates a new plan; otherwise edits the given one. */
  plan: StaffPlan | null;
  onClose: () => void;
  onSaved: (plan: StaffPlan) => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isPublic, setIsPublic] = useState(true);
  const [isDefault, setIsDefault] = useState(false);
  const [sortOrder, setSortOrder] = useState("0");
  const [trialDays, setTrialDays] = useState("");
  const [entitlements, setEntitlements] = useState<EntitlementForm>({});
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCode(plan?.code ?? "");
    setName(plan?.name ?? "");
    setDescription(plan?.description ?? "");
    setIsActive(plan?.isActive ?? true);
    setIsPublic(plan?.isPublic ?? true);
    setIsDefault(plan?.isDefault ?? false);
    setSortOrder(String(plan?.sortOrder ?? 0));
    setTrialDays(plan?.trialDays ? String(plan.trialDays) : "");
    setEntitlements(toEntitlementForm(plan?.entitlements));
    setError(null);
  }, [open, plan]);

  const trial = parseTrialDays(trialDays);
  const order = parseSortOrder(sortOrder);

  function patch(key: string, next: Partial<EntitlementForm[string]>) {
    setEntitlements((current) => {
      const existing = current[key];
      if (!existing) return current;
      return { ...current, [key]: { ...existing, ...next } as typeof existing };
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trial.ok || !order.ok) return;
    const limits = fromEntitlementForm(entitlements);
    if (!limits.ok) {
      setError(
        `Revisa el límite «${entitlementLabel(limits.key)}»: escribe un número entero o marca «Sin límite».`,
      );
      return;
    }
    setIsSaving(true);
    setError(null);
    const body = {
      code: code.trim(),
      name: name.trim(),
      isActive,
      entitlements: limits.entitlements,
      description: description.trim() === "" ? null : description.trim(),
      isPublic,
      isDefault,
      sortOrder: order.value,
      trialDays: trial.value,
    };
    try {
      const saved = plan
        ? await plansApi.update(plan.id, body)
        : await plansApi.create(body);
      onSaved(saved);
      onClose();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog
      description="Los límites se aplican a cada organización según su plan efectivo. Los precios se crean en Stripe, no aquí."
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
            className="button button-primary"
            disabled={
              isSaving || !code.trim() || !name.trim() || !trial.ok || !order.ok
            }
            form="plan-form"
            type="submit"
          >
            {isSaving ? "Guardando…" : "Guardar plan"}
          </button>
        </>
      }
      onClose={onClose}
      open={open}
      size="large"
      title={plan ? "Editar plan" : "Nuevo plan"}
    >
      <form className="form-grid" id="plan-form" onSubmit={submit}>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <div className="form-grid-2">
          <Field id="plan-code" label="Código">
            <input
              disabled={Boolean(plan)}
              id="plan-code"
              onChange={(event) => setCode(event.target.value)}
              pattern="[a-z0-9_-]{2,64}"
              required
              value={code}
            />
          </Field>
          <Field id="plan-name" label="Nombre">
            <input
              id="plan-name"
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </Field>
        </div>
        <Field
          counter={{ value: description.length, max: descriptionMax }}
          hint="Se muestra en el catálogo de planes del panel del cliente."
          id="plan-description"
          label="Descripción"
          optional
        >
          <textarea
            id="plan-description"
            maxLength={descriptionMax}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
            value={description}
          />
        </Field>
        <div className="form-grid-2">
          <Field
            error={order.ok ? null : "Usa un número entero entre 0 y 1000."}
            hint="Los planes se ordenan de menor a mayor."
            id="plan-order"
            label="Orden"
          >
            <input
              id="plan-order"
              inputMode="numeric"
              max={1000}
              min={0}
              onChange={(event) => setSortOrder(event.target.value)}
              type="number"
              value={sortOrder}
            />
          </Field>
          <Field
            error={trial.ok ? null : "Usa un número entero entre 1 y 90."}
            hint="Vacío significa que el plan no tiene prueba gratuita."
            id="plan-trial"
            label="Días de prueba"
            optional
          >
            <input
              id="plan-trial"
              inputMode="numeric"
              max={90}
              min={1}
              onChange={(event) => setTrialDays(event.target.value)}
              placeholder="Sin prueba"
              type="number"
              value={trialDays}
            />
          </Field>
        </div>
        <label className="checkbox-row">
          <input
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
            type="checkbox"
          />
          Plan activo (disponible para asignar y contratar)
        </label>
        <label className="checkbox-row">
          <input
            checked={isPublic}
            onChange={(event) => setIsPublic(event.target.checked)}
            type="checkbox"
          />
          Visible en el panel del cliente
        </label>
        <label className="checkbox-row">
          <input
            checked={isDefault}
            onChange={(event) => setIsDefault(event.target.checked)}
            type="checkbox"
          />
          <span>
            Plan por defecto
            <br />
            <small className="muted">
              Rige cuando una suscripción termina o una organización no tiene
              plan. Solo puede haber uno; al marcarlo se quita a los demás.
            </small>
          </span>
        </label>
        <fieldset>
          <legend>Límites y funciones</legend>
          <div className="form-grid">
            {planEntitlementKeys.map((key) => {
              const field = entitlements[key];
              if (!field) return null;
              if (field.kind === "feature") {
                return (
                  <label className="checkbox-row" key={key}>
                    <input
                      checked={field.enabled}
                      onChange={(event) =>
                        patch(key, { enabled: event.target.checked })
                      }
                      type="checkbox"
                    />
                    {entitlementLabel(key)}
                  </label>
                );
              }
              return (
                <div className="plan-form-limit" key={key}>
                  <Field
                    id={`entitlement-${key}`}
                    label={entitlementLabel(key)}
                  >
                    <input
                      disabled={field.unlimited}
                      id={`entitlement-${key}`}
                      inputMode="numeric"
                      min={0}
                      onChange={(event) =>
                        patch(key, { value: event.target.value })
                      }
                      placeholder={field.unlimited ? "Sin límite" : "0"}
                      type="number"
                      value={field.unlimited ? "" : field.value}
                    />
                  </Field>
                  <label className="checkbox-row">
                    <input
                      checked={field.unlimited}
                      onChange={(event) =>
                        patch(key, { unlimited: event.target.checked })
                      }
                      type="checkbox"
                    />
                    Sin límite
                  </label>
                </div>
              );
            })}
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
