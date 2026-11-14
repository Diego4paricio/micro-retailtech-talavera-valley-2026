import type {
  CfdiDocumentFormat,
  CfdiRequestStatus,
  StaffAccessFilter,
  StaffAccessWorkspaceList,
  StaffAccountingMonth,
  StaffBillingCancel,
  StaffBillingCatalogSync,
  StaffBillingEventList,
  StaffBillingExtendTrial,
  StaffBillingOverview,
  StaffBillingReason,
  StaffBillingRefundRequest,
  StaffBillingSubscriptionPage,
  StaffCfdiRequest,
  StaffCfdiRequestList,
  StaffExtendKardoTrial,
  StaffGlobalInvoice,
  StaffSetWorkspaceInternal,
  StaffWorkspaceBilling,
  SubscriptionStatus,
} from "@kardo/contracts";
import { apiRequest } from "../lib/api.js";
import { buildQuery } from "../lib/pagination.js";

export type BillingSubscriptionQuery = {
  status?: SubscriptionStatus;
  plan?: string;
  q?: string;
  cursor?: string | null;
};

export type BillingEventFilter = "failed" | "all";

const base = "/v1/staff/billing";

export const billingApi = {
  overview: (signal?: AbortSignal) =>
    apiRequest<StaffBillingOverview>(`${base}/overview`, { signal }),
  subscriptions: (params: BillingSubscriptionQuery, signal?: AbortSignal) =>
    apiRequest<StaffBillingSubscriptionPage>(
      `${base}/subscriptions${buildQuery(params)}`,
      { signal },
    ),
  events: (status: BillingEventFilter, signal?: AbortSignal) =>
    apiRequest<StaffBillingEventList>(
      `${base}/events${buildQuery({ status })}`,
      { signal },
    ),
  workspace: (workspaceId: string, signal?: AbortSignal) =>
    apiRequest<StaffWorkspaceBilling>(
      `/v1/staff/workspaces/${workspaceId}/billing`,
      { signal },
    ),
  accessList: (state: StaffAccessFilter, signal?: AbortSignal) =>
    apiRequest<StaffAccessWorkspaceList>(
      `${base}/access${buildQuery({ state })}`,
      { signal },
    ),
  setInternal: (workspaceId: string, body: StaffSetWorkspaceInternal) =>
    apiRequest<StaffWorkspaceBilling>(
      `/v1/staff/workspaces/${workspaceId}/internal`,
      { method: "PUT", body },
    ),
  extendKardoTrial: (workspaceId: string, body: StaffExtendKardoTrial) =>
    apiRequest<StaffWorkspaceBilling>(
      `/v1/staff/workspaces/${workspaceId}/kardo-trial/extend`,
      { method: "POST", body },
    ),
  cancel: (subscriptionId: string, body: StaffBillingCancel) =>
    apiRequest<StaffWorkspaceBilling>(
      `${base}/subscriptions/${subscriptionId}/cancel`,
      { method: "POST", body },
    ),
  resume: (subscriptionId: string, body: StaffBillingReason) =>
    apiRequest<StaffWorkspaceBilling>(
      `${base}/subscriptions/${subscriptionId}/resume`,
      { method: "POST", body },
    ),
  extendTrial: (subscriptionId: string, body: StaffBillingExtendTrial) =>
    apiRequest<StaffWorkspaceBilling>(
      `${base}/subscriptions/${subscriptionId}/extend-trial`,
      { method: "POST", body },
    ),
  resync: (subscriptionId: string, body: StaffBillingReason) =>
    apiRequest<StaffWorkspaceBilling>(
      `${base}/subscriptions/${subscriptionId}/resync`,
      { method: "POST", body },
    ),
  refund: (invoiceId: string, body: StaffBillingRefundRequest) =>
    apiRequest<StaffWorkspaceBilling>(`${base}/invoices/${invoiceId}/refund`, {
      method: "POST",
      body,
    }),
  syncCatalog: () =>
    apiRequest<StaffBillingCatalogSync>(`${base}/catalog/sync`, {
      method: "POST",
      body: {},
    }),
};

export type CfdiResolution =
  | { status: "issued"; satUuid: string }
  | { status: "rejected" | "canceled"; notes: string };

export const cfdiApi = {
  list: (status: CfdiRequestStatus, signal?: AbortSignal) =>
    apiRequest<StaffCfdiRequestList>(`${base}/cfdi${buildQuery({ status })}`, {
      signal,
    }),
  resolve: (requestId: string, body: CfdiResolution) =>
    apiRequest<StaffCfdiRequest>(`${base}/cfdi/${requestId}/resolve`, {
      method: "POST",
      body,
    }),
  /** ADR 020 §6, phase 2: issues the CFDI with Facturapi. */
  issueWithFacturapi: (requestId: string, paymentForm: "04" | "28") =>
    apiRequest<StaffCfdiRequest>(`${base}/cfdi/${requestId}/facturapi`, {
      method: "POST",
      body: { paymentForm },
      serverMessage: true,
    }),
  document: (requestId: string, format: CfdiDocumentFormat) =>
    apiRequest<Blob>(`${base}/cfdi/${requestId}/${format}`, {
      responseType: "blob",
    }),
  globalInvoice: (month: string, signal?: AbortSignal) =>
    apiRequest<StaffGlobalInvoice>(
      `${base}/global-invoice${buildQuery({ month })}`,
      { signal },
    ),
  /** The month for the accountant (individual vs global, IVA, Stripe). */
  accounting: (month: string, signal?: AbortSignal) =>
    apiRequest<StaffAccountingMonth>(
      `${base}/accounting${buildQuery({ month })}`,
      { signal },
    ),
};
