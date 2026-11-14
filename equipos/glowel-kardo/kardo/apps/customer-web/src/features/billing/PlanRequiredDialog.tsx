import { useEffect, useState } from "react";
import { Dialog } from "../../components/Dialog.js";
import { useToast } from "../../components/Toast.js";
import { onPlanRequired } from "../../lib/plan-required.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { useOrganizationExport } from "../organization/use-export.js";
import { useAccess } from "./access-context.js";
import { askOwnerText, pricingUrl } from "./access-model.js";
import { PlanLimitDialog } from "./PlanLimitDialog.js";

/** Presentational dialog shown when an action answers `PLAN_REQUIRED`. */
export function PlanRequiredView({
  open,
  canManage,
  canExport,
  pricingHref,
  exporting = false,
  onClose,
  onDownload,
}: {
  open: boolean;
  canManage: boolean;
  canExport: boolean;
  pricingHref: string;
  exporting?: boolean;
  onClose: () => void;
  onDownload?: () => void;
}) {
  return (
    <Dialog
      description="Esta organización no tiene un plan, así que por ahora no puedes hacer cambios. Puedes seguir viendo y descargando tu información."
      footer={
        <>
          <button
            className="button button-ghost"
            onClick={onClose}
            type="button"
          >
            Cerrar
          </button>
          {canExport ? (
            <button
              aria-busy={exporting || undefined}
              className="button button-secondary"
              disabled={exporting}
              onClick={onDownload}
              type="button"
            >
              Descargar mi información
            </button>
          ) : null}
          {canManage ? (
            <a className="button button-primary" href={pricingHref}>
              Ver planes
            </a>
          ) : null}
        </>
      }
      onClose={onClose}
      open={open}
      title="Elige un plan para seguir editando"
    >
      {canManage ? null : <p className="billing-muted">{askOwnerText}.</p>}
    </Dialog>
  );
}

/**
 * Mounted once in the shell: any screen whose action is refused with
 * `PLAN_REQUIRED` opens this dialog through the global event.
 */
export function PlanRequiredDialog() {
  const { workspace, can } = useWorkspace();
  const { access } = useAccess();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const exporter = useOrganizationExport(workspace, (message) =>
    notify(message, "error"),
  );

  useEffect(() => onPlanRequired(() => setOpen(true)), []);

  return (
    <>
      <PlanLimitDialog />
      <PlanRequiredView
        canExport={can("workspace.manage")}
        canManage={access?.canManage ?? workspace.role === "owner"}
        exporting={exporter.busy}
        onClose={() => setOpen(false)}
        onDownload={() => void exporter.download()}
        open={open}
        pricingHref={pricingUrl(workspace.id)}
      />
    </>
  );
}
