import { useEffect } from "react";
import { planSelectionApi } from "../../api/plan-selection.js";
import { Link } from "../../lib/router.js";
import { useResource } from "../../lib/use-resource.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { useAccess } from "./access-context.js";
import { bannerFor, selectionBannerHidden } from "./access-model.js";
import {
  PLAN_SELECTION_SAVED_EVENT,
  selectionHeadline,
  selectionStateOf,
} from "./plan-overage-model.js";
import "./access.css";

/**
 * Under the top bar while the 14 days to choose run (ADR 023, option B):
 * Owners and Admins see it on every screen, with the way to choose.
 */
export function PlanSelectionBanner() {
  const { workspace, can } = useWorkspace();
  const { access } = useAccess();
  const allowed = can("billing.read");
  const selection = useResource(
    allowed ? `plan-selection-banner:${workspace.id}` : null,
    (signal) => planSelectionApi.get(workspace.id, signal),
  );
  const { reload } = selection;
  useEffect(() => {
    const refresh = () => void reload();
    window.addEventListener(PLAN_SELECTION_SAVED_EVENT, refresh);
    return () =>
      window.removeEventListener(PLAN_SELECTION_SAVED_EVENT, refresh);
  }, [reload]);
  const state = selectionStateOf(selection.data);
  if (state.kind !== "choose") return null;
  if (selectionBannerHidden(bannerFor(access, { canExport: false })))
    return null;
  return (
    <div className="access-strip access-strip-warning" role="status">
      <p>{selectionHeadline(state)}</p>
      <div className="access-strip-actions">
        <Link
          className="button button-primary button-small"
          to={{ name: "settings", section: "plan" }}
        >
          Elegir
        </Link>
      </div>
    </div>
  );
}
