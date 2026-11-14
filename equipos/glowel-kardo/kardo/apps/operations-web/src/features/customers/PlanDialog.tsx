import type { StaffPlan, StaffWorkspaceDetail } from "@kardo/contracts";
import { type FormEvent, useEffect, useState } from "react";
import { plansApi } from "../../api/plans.js";
import { workspacesApi } from "../../api/workspaces.js";
import { Dialog } from "../../components/Dialog.js";
import { Field } from "../../components/Field.js";
import { Notice } from "../../components/Notice.js";
import { useToast } from "../../components/Toast.js";
import { errorMessage } from "../../lib/api.js";
import {
  endOfDayIso,
  isCorporatePlanCode,
  parseOrganizationsMax,
  todayInputValue,
} from "../billing/format.js";

export function PlanDialog({
  open,
  workspace,
  onClose,
  onUpdated,
}: {
  open: boolean;
  workspace: StaffWorkspaceDetail["workspace"];
  onClose: () => void;
  onUpdated: (detail: StaffWorkspaceDetail) => void;
}) {
  const { notify } = useToast();
  const [plans, setPlans] = useState<StaffPlan[]>([]);
  const [planId, setPlanId] = useState("");
  const [reason, setReason] = useState("");
  const [until, setUntil] = useState("");
  const [organizations, setOrganizations] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setReason("");
    setUntil("");
    setOrganizations("");
    void plansApi
      .list()
      .then((list) => {
        setPlans(list);
        const current = list.find((plan) => plan.code === workspace.planCode);
        setPlanId(current?.id ?? list[0]?.id ?? "");
      })
      .catch((requestError: unknown) => setError(errorMessage(requestError)));
  }, [open, workspace.planCode]);

  const untilIso = until ? endOfDayIso(until) : null;
  const untilInvalid =
    until !== "" && (untilIso === null || until < todayInputValue());

  const isCorporate = isCorporatePlanCode(
    plans.find((plan) => plan.id === planId)?.code,
  );
  const parsedOrganizations = parseOrganizationsMax(organizations);
  const organizationsInvalid = isCorporate && !parsedOrganizations.ok;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !planId ||
      reason.trim().length < 3 ||
      untilInvalid ||
      organizationsInvalid
    )
      return;
    setIsSaving(true);
    setError(null);
    try {
      const detail = await workspacesApi.assignPlan(workspace.id, {
        planId,
        reason: reason.trim(),
        ...(untilIso ? { until: untilIso } : {}),
        ...(isCorporate &&
        parsedOrganizations.ok &&
        parsedOrganizations.value !== null
          ? { organizationsMax: parsedOrganizations.value }
          : {}),
      });
      onUpdated(detail);
      notify("Plan actualizado.");
      onClose();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog
      description="El cambio se aplica de inmediato y queda en auditoría. Es un plan asignado por Kardo: una suscripción de Stripe activa lo puede reemplazar."
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
              isSaving ||
              !planId ||
              reason.trim().length < 3 ||
              untilInvalid ||
              organizationsInvalid
            }
            form="plan-dialog-form"
            type="submit"
          >
            {isSaving ? "Guardando…" : "Guardar plan"}
          </button>
        </>
      }
      onClose={onClose}
      open={open}
      title="Cambiar plan"
    >
      <form className="form-grid" id="plan-dialog-form" onSubmit={submit}>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Field id="plan-select" label="Plan">
          <select
            id="plan-select"
            onChange={(event) => setPlanId(event.target.value)}
            required
            value={planId}
          >
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} ({plan.code})
              </option>
            ))}
          </select>
        </Field>
        {isCorporate ? (
          <Field
            error={
              organizationsInvalid ? "Escribe un número de 0 a 1,000." : null
            }
            hint="Vacío usa el número del plan."
            id="plan-organizations"
            label="Organizaciones"
            optional
          >
            <input
              id="plan-organizations"
              inputMode="numeric"
              onChange={(event) => setOrganizations(event.target.value)}
              type="text"
              value={organizations}
            />
          </Field>
        ) : null}
        <Field
          error={untilInvalid ? "Elige una fecha de hoy o posterior." : null}
          hint="Para una cortesía con vencimiento. Después de esa fecha rige la suscripción o el plan por defecto. Vacío significa sin vencimiento."
          id="plan-until"
          label="Válido hasta"
          optional
        >
          <input
            id="plan-until"
            min={todayInputValue()}
            onChange={(event) => setUntil(event.target.value)}
            type="date"
            value={until}
          />
        </Field>
        <p className="muted">
          El plan manual cubre todas las organizaciones de esa persona.
        </p>
        <Field
          hint="Explica por qué cambias el plan de este cliente (mínimo 3 caracteres)."
          id="plan-reason"
          label="Motivo"
        >
          <textarea
            id="plan-reason"
            minLength={3}
            onChange={(event) => setReason(event.target.value)}
            required
            value={reason}
          />
        </Field>
      </form>
    </Dialog>
  );
}
