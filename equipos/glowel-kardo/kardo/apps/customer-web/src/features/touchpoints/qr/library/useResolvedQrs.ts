import type { QrTemplate } from "@kardo/contracts";
import { useMemo } from "react";
import { qrDesignsApi, qrTemplatesApi } from "../../../../api/qr-designs.js";
import { useResource } from "../../../../lib/use-resource.js";
import { useWorkspace } from "../../../../workspace/WorkspaceContext.js";
import { defaultQrDesign } from "../qr-design.js";
import { type ResolvedQr, resolveOverview } from "./model.js";

export type ResolvedQrs = {
  /** The design in effect for each active QR Touchpoint. */
  byTouchpoint: ReadonlyMap<string, ResolvedQr>;
  templates: readonly QrTemplate[];
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

/**
 * Loads where every QR Touchpoint's design comes from plus the library, and
 * resolves the design a new print would use. `enabled: false` loads nothing
 * (a closed dialog).
 */
export function useResolvedQrs(enabled = true): ResolvedQrs {
  const { workspace } = useWorkspace();
  const overview = useResource(
    enabled ? `qr-overview:${workspace.id}` : null,
    (signal) => qrDesignsApi.overview(workspace.id, signal),
  );
  const templates = useResource(
    enabled ? `qr-templates:${workspace.id}` : null,
    (signal) => qrTemplatesApi.list(workspace.id, signal),
  );
  const byTouchpoint = useMemo(
    () =>
      resolveOverview(
        overview.data ?? [],
        templates.data ?? [],
        defaultQrDesign,
      ),
    [overview.data, templates.data],
  );
  const { reload: reloadOverview } = overview;
  const { reload: reloadTemplates } = templates;
  return {
    byTouchpoint,
    templates: templates.data ?? [],
    isLoading:
      enabled &&
      ((overview.isLoading && !overview.data) ||
        (templates.isLoading && !templates.data)),
    error: overview.error ?? templates.error,
    reload: async () => {
      await Promise.all([reloadOverview(), reloadTemplates()]);
    },
  };
}
