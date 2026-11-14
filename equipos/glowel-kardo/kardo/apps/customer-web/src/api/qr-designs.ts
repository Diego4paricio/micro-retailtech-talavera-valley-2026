import type {
  ApplyQrTemplate,
  ApplyQrTemplateResult,
  CreateQrTemplate,
  QrDesign,
  QrDesignOverview,
  QrTemplate,
  QrTemplateDetail,
  RecordQrExports,
  TouchpointQrDesign,
  UpdateQrTemplate,
} from "@kardo/contracts";
import { apiRequest } from "../lib/api.js";

const touchpointBase = (workspaceId: string, touchpointId: string) =>
  `/v1/workspaces/${workspaceId}/touchpoints/${touchpointId}/qr-design`;
const templatesBase = (workspaceId: string) =>
  `/v1/workspaces/${workspaceId}/qr-templates`;

/**
 * Estudio QR: the design in effect for each QR Touchpoint and where it comes
 * from (its own design, a library design, its group's design or Kardo's
 * default). Changing a design never invalidates a printed code: every QR
 * encodes the Touchpoint's permanent address.
 */
export const qrDesignsApi = {
  /** Every active QR Touchpoint with its design source and last print. */
  overview: (workspaceId: string, signal?: AbortSignal) =>
    apiRequest<QrDesignOverview>(`/v1/workspaces/${workspaceId}/qr-designs`, {
      signal,
    }),
  get: (workspaceId: string, touchpointId: string, signal?: AbortSignal) =>
    apiRequest<TouchpointQrDesign>(touchpointBase(workspaceId, touchpointId), {
      signal,
    }),
  /** Customizes this Touchpoint only (detaches it from any shared design). */
  save: (workspaceId: string, touchpointId: string, design: QrDesign) =>
    apiRequest<TouchpointQrDesign>(touchpointBase(workspaceId, touchpointId), {
      method: "PUT",
      body: { design },
    }),
  /** Applies a library design to this Touchpoint. */
  applyTemplate: (
    workspaceId: string,
    touchpointId: string,
    templateId: string,
  ) =>
    apiRequest<TouchpointQrDesign>(touchpointBase(workspaceId, touchpointId), {
      method: "PUT",
      body: { templateId },
    }),
  /** Back to the group's design (or Kardo's default without a group). */
  inherit: (workspaceId: string, touchpointId: string) =>
    apiRequest<TouchpointQrDesign>(touchpointBase(workspaceId, touchpointId), {
      method: "PUT",
      body: { inherit: true },
    }),
};

/** The organization's design library (up to 50 designs). */
export const qrTemplatesApi = {
  list: (workspaceId: string, signal?: AbortSignal) =>
    apiRequest<QrTemplate[]>(templatesBase(workspaceId), { signal }),
  /** The design plus the Touchpoints and groups using it. */
  get: (workspaceId: string, templateId: string, signal?: AbortSignal) =>
    apiRequest<QrTemplateDetail>(
      `${templatesBase(workspaceId)}/${templateId}`,
      {
        signal,
      },
    ),
  /** 409 `QR_TEMPLATE_LIMIT` past 50 designs. */
  create: (workspaceId: string, body: CreateQrTemplate) =>
    apiRequest<QrTemplate>(templatesBase(workspaceId), {
      method: "POST",
      body,
    }),
  /** Updates every Touchpoint and group that uses the design. */
  update: (workspaceId: string, templateId: string, body: UpdateQrTemplate) =>
    apiRequest<QrTemplate>(`${templatesBase(workspaceId)}/${templateId}`, {
      method: "PATCH",
      body,
    }),
  /** 409 `QR_TEMPLATE_IN_USE` while a Touchpoint or group still uses it. */
  remove: (workspaceId: string, templateId: string) =>
    apiRequest<void>(`${templatesBase(workspaceId)}/${templateId}`, {
      method: "DELETE",
    }),
  /**
   * Applies the design to these Touchpoints (dropping their own design) and
   * makes it the default of these groups (their future Touchpoints too).
   */
  apply: (workspaceId: string, templateId: string, body: ApplyQrTemplate) =>
    apiRequest<ApplyQrTemplateResult>(
      `${templatesBase(workspaceId)}/${templateId}/applications`,
      { method: "POST", body },
    ),
};

export const groupQrDesignApi = {
  /** `null` removes the group's default design. */
  setTemplate: (
    workspaceId: string,
    groupId: string,
    templateId: string | null,
  ) =>
    apiRequest<void>(
      `/v1/workspaces/${workspaceId}/touchpoint-groups/${groupId}/qr-design`,
      { method: "PUT", body: { templateId } },
    ),
};

/** Print tracking: which design each exported code was printed with. */
export const qrExportsApi = {
  record: (workspaceId: string, body: RecordQrExports) =>
    apiRequest<void>(`/v1/workspaces/${workspaceId}/qr-exports`, {
      method: "POST",
      body,
    }),
};

// `assetReadApi` lives with the other Assets endpoints (domain audit A2-48);
// re-exported so existing imports keep working.
export { assetReadApi } from "./assets.js";
