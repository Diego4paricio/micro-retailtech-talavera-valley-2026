import {
  type BillingChangeResult,
  type BillingExtra,
  type BillingInterval,
  billingExtraMax,
  type WorkspaceBilling,
} from "@kardo/contracts";
import { useEffect, useState } from "react";
import { billingApi } from "../../api/billing.js";
import { Dialog } from "../../components/Dialog.js";
import { Notice } from "../../components/Notice.js";
import { SettingsGroup, SettingsRow } from "../../components/SettingsBlocks.js";
import { useToast } from "../../components/Toast.js";
import { errorMessage } from "../../lib/api.js";
import {
  canAddExtras,
  extraActionLabel,
  extraPrice,
  extraPriceText,
  extraRowValue,
  extrasChangeLine,
  isAccountHolder,
} from "./extras-model.js";
import { formatMoney } from "./format.js";

/**
 * «Extras» (ADR 024): organizations, QR y etiquetas and links added to the
 * subscription as lines with a quantity. Rows with a price and one action;
 * the dialog shows what it costs today before anything is charged.
 */
export function ExtrasSection({
  billing,
  workspaceId,
  pricingHref,
  onChanged,
}: {
  billing: WorkspaceBilling;
  workspaceId: string;
  pricingHref: string;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<BillingExtra | null>(null);
  const { account, subscription } = billing;
  if (!account || !isAccountHolder(billing) || account.extras.length === 0)
    return null;
  const enabled = canAddExtras(billing);
  const interval = enabled ? (subscription?.interval ?? null) : null;
  return (
    <SettingsGroup
      actions={
        enabled ? null : (
          <a className="button button-primary button-small" href={pricingHref}>
            Elegir plan
          </a>
        )
      }
      description={
        enabled
          ? "Se suman a tu suscripción. Hoy pagas solo lo que falta del periodo, y puedes quitarlos."
          : "Elige un plan para agregar extras."
      }
      id="billing-extras-heading"
      title="Extras"
    >
      {account.extras.map((extra) => (
        <SettingsRow
          action={
            <button
              className="button button-secondary button-small"
              disabled={!enabled}
              onClick={() => setEditing(extra)}
              type="button"
            >
              {extraActionLabel(extra)}
            </button>
          }
          key={extra.code}
          label={extra.name}
          value={extraRowValue(extra, interval)}
        />
      ))}
      {editing ? (
        <ExtrasDialog
          extra={editing}
          interval={subscription?.interval ?? "month"}
          onChanged={onChanged}
          onClose={() => setEditing(null)}
          workspaceId={workspaceId}
        />
      ) : null}
    </SettingsGroup>
  );
}

export function ExtrasDialog({
  extra,
  interval,
  workspaceId,
  onClose,
  onChanged,
}: {
  extra: BillingExtra;
  interval: BillingInterval;
  workspaceId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { notify } = useToast();
  const [quantity, setQuantity] = useState(
    extra.quantity > 0 ? extra.quantity : 1,
  );
  const [preview, setPreview] = useState<BillingChangeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const code = extra.code;
  const current = extra.quantity;

  // The live preview: what it costs today, a moment after the last click.
  useEffect(() => {
    if (quantity === current) {
      setPreview(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      billingApi
        .changeExtras(workspaceId, {
          quantities: { [code]: quantity },
          confirm: false,
        })
        .then((result) => {
          if (cancelled) return;
          setPreview(result);
          setLoading(false);
        })
        .catch((failure) => {
          if (cancelled) return;
          setPreview(null);
          setError(errorMessage(failure));
          setLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [code, quantity, current, workspaceId]);

  const confirm = async () => {
    setSaving(true);
    setError(null);
    try {
      await billingApi.changeExtras(workspaceId, {
        quantities: { [code]: quantity },
        confirm: true,
      });
      notify("Listo, actualizamos tus extras.");
      onChanged();
      onClose();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setSaving(false);
    }
  };

  const max = billingExtraMax[code];
  const unit = extraPrice(extra, interval);
  const adding = current === 0;
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
            aria-busy={saving || undefined}
            className="button button-primary"
            disabled={saving || loading || !preview || quantity === current}
            onClick={() => void confirm()}
            type="button"
          >
            {adding ? "Agregar" : "Guardar"}
          </button>
        </>
      }
      onClose={onClose}
      open
      title={adding ? "Agregar extras" : "Cambiar extras"}
    >
      {extra ? (
        <>
          <div className="extras-qty-row">
            <div>
              <strong>{extra.name}</strong>
              <small>
                {unit
                  ? `${formatMoney(unit.unitAmount, unit.currency)} ${interval === "month" ? "al mes" : "al año"}`
                  : extraPriceText(extra, interval)}
              </small>
            </div>
            <div className="extras-stepper">
              <button
                aria-label="Menos"
                disabled={quantity <= 0 || saving}
                onClick={() => setQuantity((value) => Math.max(0, value - 1))}
                type="button"
              >
                −
              </button>
              <span aria-live="polite">{quantity}</span>
              <button
                aria-label="Más"
                disabled={quantity >= max || saving}
                onClick={() => setQuantity((value) => Math.min(max, value + 1))}
                type="button"
              >
                +
              </button>
            </div>
          </div>
          {error ? (
            <Notice tone="danger">{error}</Notice>
          ) : (
            <p className="extras-line">
              {loading
                ? "Calculando…"
                : preview
                  ? extrasChangeLine(preview, interval)
                  : "Sin cambios."}
            </p>
          )}
        </>
      ) : null}
    </Dialog>
  );
}
