import { planEntitlementKeys, type StaffPlan } from "@kardo/contracts";
import { useState } from "react";
import { billingApi } from "../../api/billing.js";
import { plansApi } from "../../api/plans.js";
import { EmptyState } from "../../components/EmptyState.js";
import { Icon } from "../../components/Icon.js";
import { Notice } from "../../components/Notice.js";
import { PageHeader } from "../../components/PageHeader.js";
import { Skeleton } from "../../components/Skeleton.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { useToast } from "../../components/Toast.js";
import { errorMessage } from "../../lib/api.js";
import { formatNumber } from "../../lib/format.js";
import { staffPermissions } from "../../lib/permissions.js";
import { useResource } from "../../lib/use-resource.js";
import { useStaff } from "../../shell/StaffContext.js";
import {
  entitlementLabel,
  formatPrice,
  intervalLabel,
  livemodeView,
} from "../billing/format.js";
import { PlanFormDialog } from "./PlanFormDialog.js";
import { displayEntitlement } from "./plan-form.js";

export function PlansPage() {
  const { can } = useStaff();
  const { notify } = useToast();
  const plans = useResource("plans", (signal) => plansApi.list(signal));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StaffPlan | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const canWrite = can(staffPermissions.plansWrite);
  const canSync = can(staffPermissions.plansWrite);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(plan: StaffPlan) {
    setEditing(plan);
    setDialogOpen(true);
  }
  function onSaved(plan: StaffPlan) {
    // Saving a default plan clears the flag on the others: reload the list.
    plans.setData((current) => {
      if (!current) return [plan];
      const index = current.findIndex((item) => item.id === plan.id);
      if (index === -1) return [...current, plan];
      const next = current.slice();
      next[index] = plan;
      return next;
    });
    if (plan.isDefault) void plans.reload();
  }

  async function syncPrices() {
    setIsSyncing(true);
    try {
      const result = await billingApi.syncCatalog();
      notify(
        `${formatNumber(result.prices)} ${result.prices === 1 ? "precio sincronizado" : "precios sincronizados"}, ${formatNumber(result.mappedToPlans)} vinculados a planes.`,
      );
      await plans.reload();
    } catch (requestError) {
      notify(errorMessage(requestError), "error");
    } finally {
      setIsSyncing(false);
    }
  }

  const sorted = [...(plans.data ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "es"),
  );

  return (
    <div className="page">
      <PageHeader
        actions={
          <>
            {canSync ? (
              <button
                className="button button-secondary"
                disabled={isSyncing}
                onClick={() => void syncPrices()}
                type="button"
              >
                <Icon name="refresh" size={15} />
                {isSyncing ? "Sincronizando…" : "Sincronizar precios de Stripe"}
              </button>
            ) : null}
            {canWrite ? (
              <button
                className="button button-primary"
                onClick={openCreate}
                type="button"
              >
                <Icon name="plus" /> Nuevo plan
              </button>
            ) : null}
          </>
        }
        description="Cada plan fija los límites y funciones de una organización. Kardo define los límites; Stripe define los precios y cobra."
        eyebrow="Kardo Operations"
        title="Planes"
      />

      <Notice title="Cómo se vinculan los precios">
        Los precios se crean en Stripe, no en Operations. Para que un precio
        pertenezca a un plan, agrégale la metadata <code>kardo_plan_code</code>{" "}
        con el código del plan (por ejemplo <code>pro</code>) y pulsa
        «Sincronizar precios de Stripe».
      </Notice>

      {plans.error ? (
        <Notice
          action={
            <button
              className="text-action"
              onClick={() => void plans.reload()}
              type="button"
            >
              Reintentar
            </button>
          }
          tone="error"
        >
          {plans.error}
        </Notice>
      ) : plans.isLoading && !plans.data ? (
        <Skeleton lines={6} />
      ) : sorted.length === 0 ? (
        <EmptyState icon="plans" title="Todavía no hay planes">
          Crea el primer plan para poder asignarlo a una organización.
        </EmptyState>
      ) : (
        <div className="plan-grid">
          {sorted.map((plan) => (
            <PlanCard
              canWrite={canWrite}
              key={plan.id}
              onEdit={() => openEdit(plan)}
              plan={plan}
            />
          ))}
        </div>
      )}

      {canWrite ? (
        <PlanFormDialog
          onClose={() => setDialogOpen(false)}
          onSaved={onSaved}
          open={dialogOpen}
          plan={editing}
        />
      ) : null}
    </div>
  );
}

function PlanCard({
  plan,
  canWrite,
  onEdit,
}: {
  plan: StaffPlan;
  canWrite: boolean;
  onEdit: () => void;
}) {
  return (
    <article className="plan-card">
      <div className="plan-card-head">
        <div>
          <h3>{plan.name}</h3>
          <div className="row-meta">{plan.code}</div>
          <div className="plan-card-badges">
            <StatusBadge tone={plan.isActive ? "success" : "neutral"}>
              {plan.isActive ? "Activo" : "Inactivo"}
            </StatusBadge>
            <StatusBadge tone={plan.isPublic ? "info" : "neutral"}>
              {plan.isPublic ? "Visible al cliente" : "Oculto"}
            </StatusBadge>
            {plan.isDefault ? (
              <StatusBadge tone="warning">Por defecto</StatusBadge>
            ) : null}
          </div>
        </div>
        <div className="row-meta">Orden {plan.sortOrder}</div>
      </div>

      <p className="plan-card-description">
        {plan.description ?? "Sin descripción."}
        {plan.trialDays ? ` Prueba de ${plan.trialDays} días.` : ""}
      </p>

      <div>
        <h4>Límites y funciones</h4>
        <ul className="plan-limits">
          {planEntitlementKeys.map((key) => (
            <li key={key}>
              <span>{entitlementLabel(key)}</span>
              <strong>{displayEntitlement(key, plan.entitlements[key])}</strong>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h4>Precios en Stripe</h4>
        {plan.prices.length === 0 ? (
          <p className="muted">
            Sin precios vinculados. Agrega la metadata kardo_plan_code en
            Stripe.
          </p>
        ) : (
          <ul className="plan-prices">
            {plan.prices.map((price) => {
              const mode = livemodeView(price.livemode);
              return (
                <li key={price.id}>
                  <span>
                    {intervalLabel(price.interval)}{" "}
                    <strong>
                      {formatPrice(price.unitAmount, price.currency, null)}
                    </strong>
                  </span>
                  <span className="plan-price-tags">
                    <StatusBadge tone={price.active ? "success" : "neutral"}>
                      {price.active ? "Activo" : "Archivado"}
                    </StatusBadge>
                    <StatusBadge tone={mode.tone}>{mode.label}</StatusBadge>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="plan-card-foot">
        <span className="muted">
          {formatNumber(plan.workspaces)}{" "}
          {plan.workspaces === 1 ? "organización" : "organizaciones"}
        </span>
        {canWrite ? (
          <button
            className="button button-secondary button-small"
            onClick={onEdit}
            type="button"
          >
            Editar
          </button>
        ) : null}
      </div>
    </article>
  );
}
