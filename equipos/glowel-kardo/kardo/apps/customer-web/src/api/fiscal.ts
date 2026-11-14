import type {
  CfdiDocumentFormat,
  CfdiRequestResult,
  UpsertFiscalProfile,
  WorkspaceFiscal,
} from "@kardo/contracts";
import { apiRequest } from "../lib/api.js";
import { handleFiscalDemo } from "../lib/demo/billing.js";
import { isDemoMode } from "../lib/demo.js";

const base = (workspaceId: string) => `/v1/workspaces/${workspaceId}/billing`;

const demo = <T>(
  path: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<T> =>
  new Promise((resolve, reject) =>
    setTimeout(() => {
      try {
        resolve(handleFiscalDemo(path, method, body ?? {}) as T);
      } catch (error) {
        reject(error);
      }
    }, 120),
  );

/**
 * Datos de facturación y solicitud de CFDI (ADR 020 §6). Owner and Admin;
 * available in every access state. Errors: 400 `VALIDATION_FAILED` /
 * `INVALID_FISCAL_PROFILE`, 409 `BILLING_CONFLICT`.
 */
export const fiscalApi = {
  get: (workspaceId: string, signal?: AbortSignal) =>
    isDemoMode
      ? demo<WorkspaceFiscal>(`${base(workspaceId)}/fiscal`, "GET")
      : apiRequest<WorkspaceFiscal>(`${base(workspaceId)}/fiscal`, { signal }),
  save: (workspaceId: string, profile: UpsertFiscalProfile) =>
    isDemoMode
      ? demo<WorkspaceFiscal>(
          `${base(workspaceId)}/fiscal`,
          "PUT",
          profile as unknown as Record<string, unknown>,
        )
      : apiRequest<WorkspaceFiscal>(`${base(workspaceId)}/fiscal`, {
          method: "PUT",
          body: profile,
        }),
  remove: (workspaceId: string) =>
    isDemoMode
      ? demo<WorkspaceFiscal>(`${base(workspaceId)}/fiscal`, "DELETE")
      : apiRequest<WorkspaceFiscal>(`${base(workspaceId)}/fiscal`, {
          method: "DELETE",
        }),
  requestCfdi: (workspaceId: string, invoiceId: string) =>
    isDemoMode
      ? demo<CfdiRequestResult>(
          `${base(workspaceId)}/invoices/${invoiceId}/cfdi`,
          "POST",
        )
      : apiRequest<CfdiRequestResult>(
          `${base(workspaceId)}/invoices/${invoiceId}/cfdi`,
          { method: "POST" },
        ),
  /** PDF or XML of a CFDI issued with Facturapi (fetched on demand). */
  cfdiDocument: (
    workspaceId: string,
    requestId: string,
    format: CfdiDocumentFormat,
  ) =>
    apiRequest<Blob>(`${base(workspaceId)}/cfdi/${requestId}/${format}`, {
      responseType: "blob",
    }),
};
