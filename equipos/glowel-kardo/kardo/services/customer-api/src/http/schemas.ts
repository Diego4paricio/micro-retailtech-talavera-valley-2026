export type WorkspaceParams = { workspaceId: string };
export type WorkspaceTouchpointParams = WorkspaceParams & {
  touchpointId: string;
};
export type WorkspaceExperienceParams = WorkspaceParams & {
  experienceId: string;
};
export type WorkspaceExperienceVersionParams = WorkspaceExperienceParams & {
  versionId: string;
};
export type WorkspaceAssetParams = WorkspaceParams & { assetId: string };
export type WorkspaceQrTemplateParams = WorkspaceParams & {
  templateId: string;
};
export type WorkspaceGroupParams = WorkspaceParams & { groupId: string };
export type WorkspaceMemberParams = WorkspaceParams & { profileId: string };
export type WorkspaceInvitationParams = WorkspaceParams & {
  invitationId: string;
};
export type WorkspaceTransferParams = WorkspaceParams & { transferId: string };
export type TransferParams = { transferId: string };

export const workspaceParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["workspaceId"],
  properties: { workspaceId: { type: "string", format: "uuid" } },
} as const;

export const workspaceTransferParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["workspaceId", "transferId"],
  properties: {
    workspaceId: { type: "string", format: "uuid" },
    transferId: { type: "string", format: "uuid" },
  },
} as const;

export const transferParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["transferId"],
  properties: { transferId: { type: "string", format: "uuid" } },
} as const;

export const workspaceTouchpointParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["workspaceId", "touchpointId"],
  properties: {
    workspaceId: { type: "string", format: "uuid" },
    touchpointId: { type: "string", format: "uuid" },
  },
} as const;

export const workspaceExperienceParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["workspaceId", "experienceId"],
  properties: {
    workspaceId: { type: "string", format: "uuid" },
    experienceId: { type: "string", format: "uuid" },
  },
} as const;

export const workspaceExperienceVersionParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["workspaceId", "experienceId", "versionId"],
  properties: {
    workspaceId: { type: "string", format: "uuid" },
    experienceId: { type: "string", format: "uuid" },
    versionId: { type: "string", format: "uuid" },
  },
} as const;

export const workspaceAssetParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["workspaceId", "assetId"],
  properties: {
    workspaceId: { type: "string", format: "uuid" },
    assetId: { type: "string", format: "uuid" },
  },
} as const;

export const workspaceMemberParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["workspaceId", "profileId"],
  properties: {
    workspaceId: { type: "string", format: "uuid" },
    profileId: { type: "string", format: "uuid" },
  },
} as const;

export const workspaceInvitationParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["workspaceId", "invitationId"],
  properties: {
    workspaceId: { type: "string", format: "uuid" },
    invitationId: { type: "string", format: "uuid" },
  },
} as const;

export const idempotencyHeadersSchema = {
  type: "object",
  required: ["idempotency-key"],
  properties: { "idempotency-key": { type: "string", format: "uuid" } },
} as const;

export const workspaceQrTemplateParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["workspaceId", "templateId"],
  properties: {
    workspaceId: { type: "string", format: "uuid" },
    templateId: { type: "string", format: "uuid" },
  },
} as const;

export const workspaceGroupParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["workspaceId", "groupId"],
  properties: {
    workspaceId: { type: "string", format: "uuid" },
    groupId: { type: "string", format: "uuid" },
  },
} as const;
