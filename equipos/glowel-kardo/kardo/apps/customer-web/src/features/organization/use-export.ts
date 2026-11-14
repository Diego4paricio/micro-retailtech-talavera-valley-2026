import { useCallback, useState } from "react";
import { accessApi } from "../../api/access.js";
import { errorMessage } from "../../lib/api.js";
import { downloadFile } from "../../lib/download.js";

/** File name of the export: `kardo-<organization>-<yyyy-mm-dd>.json`. */
export function exportFilename(name: string, now = new Date()): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 40);
  return `kardo-${slug || "organizacion"}-${now.toISOString().slice(0, 10)}.json`;
}

/**
 * Downloads the organization's data as a JSON file (domain audit 2026-10-13,
 * A2-64: it belongs to the organization, in Configuración → General, not to
 * billing). A failure is handed to `onError` with a customer-safe message.
 */
export function useOrganizationExport(
  workspace: { id: string; name: string },
  onError: (message: string) => void,
) {
  const [busy, setBusy] = useState(false);
  const { id, name } = workspace;

  const download = useCallback(async () => {
    setBusy(true);
    try {
      downloadFile(await accessApi.exportData(id), exportFilename(name));
    } catch (requestError) {
      onError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }, [id, name, onError]);

  return { busy, download };
}
