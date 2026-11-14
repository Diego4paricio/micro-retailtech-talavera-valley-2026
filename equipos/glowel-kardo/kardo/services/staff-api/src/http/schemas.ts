/**
 * Path-parameter schemas for the Staff API's routes. Plain JSON Schema
 * literals (not TypeBox) on purpose: `@sinclair/typebox` is a dependency of
 * `@kardo/contracts`, not of this service, and this service must not add new
 * dependencies. Fastify/AJV accepts a plain JSON Schema object exactly the
 * same way it accepts a TypeBox-compiled one.
 */

export type WorkspaceParams = { workspaceId: string };
export const workspaceParamsSchema = {
  type: "object",
  properties: { workspaceId: { type: "string", format: "uuid" } },
  required: ["workspaceId"],
  additionalProperties: false,
} as const;

export type TouchpointParams = { touchpointId: string };
export const touchpointParamsSchema = {
  type: "object",
  properties: { touchpointId: { type: "string", format: "uuid" } },
  required: ["touchpointId"],
  additionalProperties: false,
} as const;

export type PieceBatchParams = { batchId: string };
export const pieceBatchParamsSchema = {
  type: "object",
  properties: { batchId: { type: "string", format: "uuid" } },
  required: ["batchId"],
  additionalProperties: false,
} as const;

export type PublicationParams = { publicationId: string };
export const publicationParamsSchema = {
  type: "object",
  properties: { publicationId: { type: "string", format: "uuid" } },
  required: ["publicationId"],
  additionalProperties: false,
} as const;

export type PlanParams = { planId: string };
export const planParamsSchema = {
  type: "object",
  properties: { planId: { type: "string", format: "uuid" } },
  required: ["planId"],
  additionalProperties: false,
} as const;

export type NotificationParams = { notificationId: string };
export const notificationParamsSchema = {
  type: "object",
  properties: { notificationId: { type: "string", format: "uuid" } },
  required: ["notificationId"],
  additionalProperties: false,
} as const;

export type StatusIncidentParams = { incidentId: string };
export const statusIncidentParamsSchema = {
  type: "object",
  properties: { incidentId: { type: "string", format: "uuid" } },
  required: ["incidentId"],
  additionalProperties: false,
} as const;
