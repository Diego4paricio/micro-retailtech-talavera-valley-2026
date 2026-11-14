import type { BillingMyAccount } from "@kardo/contracts";
import { useEffect, useState } from "react";
import { Dialog } from "../../components/Dialog.js";
import { onPlanLimit } from "../../lib/plan-required.js";
import { useRouter } from "../../lib/router.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { type LimitOffer, limitOffer } from "./limit-offer-model.js";
import { loadMyBillingAccount } from "./my-account.js";

/** Presentational: the limit, with the extra that fits and the plan page. */
export function PlanLimitView({
  offer,
  onClose,
  onOpenPlan,
}: {
  offer: LimitOffer | null;
  onClose: () => void;
  onOpenPlan: () => void;
}) {
  return (
    <Dialog
      description="Puedes agregar un extra a tu suscripción o subir de plan. Nada se pierde."
      footer={
        <>
          <button
            className="button button-ghost"
            onClick={onClose}
            type="button"
          >
            Ahora no
          </button>
          <button
            className="button button-primary"
            onClick={onOpenPlan}
            type="button"
          >
            {offer?.extraLabel ?? "Ver mi plan"}
          </button>
        </>
      }
      onClose={onClose}
      open={offer !== null}
      title={offer?.title ?? "Llegaste al límite de tu plan"}
    >
      <p className="billing-muted">
        En Plan y facturación, sección Extras, puedes agregarlo; también puedes
        subir de plan.
      </p>
    </Dialog>
  );
}

/**
 * Mounted with the plan-required dialog: a `PLAN_LIMIT` on QR y etiquetas or
 * Links, for who manages the plan and has a paid one, opens the offer.
 */
export function PlanLimitDialog() {
  const { can } = useWorkspace();
  const { navigate } = useRouter();
  const [offer, setOffer] = useState<LimitOffer | null>(null);
  const allowed = can("billing.manage");

  useEffect(() => {
    if (!allowed) return;
    return onPlanLimit((notice) => {
      loadMyBillingAccount()
        .then((account: BillingMyAccount) =>
          setOffer(limitOffer(notice.key, account)),
        )
        .catch(() => setOffer(null));
    });
  }, [allowed]);

  return (
    <PlanLimitView
      offer={offer}
      onClose={() => setOffer(null)}
      onOpenPlan={() => {
        setOffer(null);
        navigate({ name: "settings", section: "plan" });
      }}
    />
  );
}
