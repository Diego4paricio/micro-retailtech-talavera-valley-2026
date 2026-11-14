import type { BillingChangeResult, BillingInterval } from "@kardo/contracts";
import { useEffect, useState } from "react";
import { billingApi } from "../../api/billing.js";
import { Dialog } from "../../components/Dialog.js";
import { Notice } from "../../components/Notice.js";
import { useToast } from "../../components/Toast.js";
import { errorMessage } from "../../lib/api.js";
import { planChangeLine } from "./extras-model.js";

/**
 * The plan change of a subscription with extras (ADR 024): the Stripe portal
 * cannot change a subscription with several lines, so Kardo shows what it
 * costs today and changes it itself.
 */
export function PlanChangeDialog({
  open,
  workspaceId,
  planName,
  priceId,
  interval,
  onClose,
  onDone,
}: {
  open: boolean;
  workspaceId: string;
  planName: string;
  priceId: string;
  interval: BillingInterval;
  onClose: () => void;
  onDone: () => void;
}) {
  const { notify } = useToast();
  const [preview, setPreview] = useState<BillingChangeResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPreview(null);
    setError(null);
    billingApi
      .changePlan(workspaceId, priceId, false)
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch((failure) => {
        if (!cancelled) setError(errorMessage(failure));
      });
    return () => {
      cancelled = true;
    };
  }, [open, workspaceId, priceId]);

  const confirm = async () => {
    setSaving(true);
    setError(null);
    try {
      await billingApi.changePlan(workspaceId, priceId, true);
      notify(`Listo, ahora tienes ${planName}.`);
      onDone();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setSaving(false);
    }
  };

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
            disabled={saving || !preview}
            onClick={() => void confirm()}
            type="button"
          >
            Cambiar plan
          </button>
        </>
      }
      onClose={onClose}
      open={open}
      title={`Cambiar a ${planName}`}
    >
      {error ? (
        <Notice tone="danger">{error}</Notice>
      ) : (
        <p className="extras-line extras-line-flush">
          {preview ? planChangeLine(preview, interval) : "Calculando…"}
        </p>
      )}
    </Dialog>
  );
}
