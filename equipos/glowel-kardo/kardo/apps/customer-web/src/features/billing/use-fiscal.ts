import type { CfdiDocumentFormat, WorkspaceFiscal } from "@kardo/contracts";
import { useCallback, useEffect, useState } from "react";
import { fiscalApi } from "../../api/fiscal.js";
import { errorMessage, isAbortError } from "../../lib/api.js";
import { downloadFile } from "../../lib/download.js";
import type { FiscalForm } from "./fiscal-model.js";
import { toUpsert } from "./fiscal-model.js";

/** What the billing screen needs to show and change the fiscal data. */
export type FiscalController = {
  fiscal: WorkspaceFiscal;
  /** Invoice being requested, or "save" / "remove" while those run. */
  busy: string | null;
  error: string | null;
  clearError: () => void;
  save: (form: FiscalForm) => Promise<boolean>;
  remove: () => Promise<boolean>;
  requestCfdi: (invoiceId: string) => Promise<boolean>;
  /** Downloads the PDF or XML of a CFDI issued with Facturapi. */
  downloadCfdi: (
    requestId: string,
    format: CfdiDocumentFormat,
  ) => Promise<boolean>;
  /** Asks the section to open its form (the "Pedir factura" shortcut). */
  openForm: () => void;
  formOpen: boolean;
  setFormOpen: (open: boolean) => void;
};

export const cfdiFilename = (requestId: string, format: CfdiDocumentFormat) =>
  `factura-kardo-${requestId.slice(0, 8)}.${format}`;

/**
 * Loads the fiscal data for Owner and Admin. A failed load returns null so the
 * rest of the billing screen keeps working without this optional section.
 */
export function useFiscal(
  workspaceId: string,
  enabled: boolean,
): FiscalController | null {
  const [fiscal, setFiscal] = useState<WorkspaceFiscal | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fiscalApi
      .get(workspaceId, controller.signal)
      .then(setFiscal)
      .catch((failure: unknown) => {
        if (!isAbortError(failure)) setFiscal(null);
      });
    return () => controller.abort();
  }, [workspaceId, enabled]);

  const run = useCallback(
    async (key: string, action: () => Promise<WorkspaceFiscal | null>) => {
      setBusy(key);
      setError(null);
      try {
        const next = await action();
        if (next) setFiscal(next);
        return true;
      } catch (failure) {
        setError(errorMessage(failure));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  if (!enabled || !fiscal) return null;
  return {
    fiscal,
    busy,
    error,
    clearError: () => setError(null),
    save: (form) =>
      run("save", () => fiscalApi.save(workspaceId, toUpsert(form))),
    remove: () => run("remove", () => fiscalApi.remove(workspaceId)),
    requestCfdi: (invoiceId) =>
      run(invoiceId, async () => {
        const { request } = await fiscalApi.requestCfdi(workspaceId, invoiceId);
        return {
          ...fiscal,
          requests: [request, ...fiscal.requests],
          requestableInvoiceIds: fiscal.requestableInvoiceIds.filter(
            (id) => id !== invoiceId,
          ),
        };
      }),
    downloadCfdi: (requestId, format) =>
      run(`${requestId}:${format}`, async () => {
        const file = await fiscalApi.cfdiDocument(
          workspaceId,
          requestId,
          format,
        );
        downloadFile(file, cfdiFilename(requestId, format));
        return null;
      }),
    openForm: () => setFormOpen(true),
    formOpen,
    setFormOpen,
  };
}
