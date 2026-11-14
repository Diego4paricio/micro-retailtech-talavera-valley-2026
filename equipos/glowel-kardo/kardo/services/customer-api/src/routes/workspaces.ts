import {
  ApiErrorSchema,
  type CompleteCustomerOnboarding,
  CompleteCustomerOnboardingSchema,
  type CreateOrganization,
  CreateOrganizationSchema,
  CustomerWorkspaceListSchema,
  CustomerWorkspaceSchema,
  type UpdateWorkspace,
  UpdateWorkspaceSchema,
  type WorkspaceProfile,
  type WorkspaceProfilePatch,
  WorkspaceProfilePatchSchema,
  WorkspaceProfileSchema,
} from "@kardo/contracts";
import type { FastifyInstance } from "fastify";
import type { AppDependencies } from "../http/dependencies.js";
import {
  type WorkspaceParams,
  workspaceParamsSchema,
} from "../http/schemas.js";
import { requireSession } from "../http/session.js";

export function registerWorkspaceRoutes(
  app: FastifyInstance,
  deps: AppDependencies,
): void {
  app.get(
    "/v1/workspaces",
    {
      schema: {
        tags: ["workspaces"],
        summary: "List workspaces available to the current customer",
        response: {
          200: CustomerWorkspaceListSchema,
          401: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      return deps.workspaceRepository.listForCustomer(identity);
    },
  );

  app.patch(
    "/v1/workspaces/:workspaceId/onboarding",
    {
      schema: {
        tags: ["workspaces"],
        summary: "Save protected first-time workspace configuration",
        params: workspaceParamsSchema,
        body: CompleteCustomerOnboardingSchema,
        response: {
          200: CustomerWorkspaceListSchema.items,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      return deps.workspaceRepository.completeOnboarding(
        identity,
        params.workspaceId,
        request.body as CompleteCustomerOnboarding,
      );
    },
  );

  app.patch(
    "/v1/workspaces/:workspaceId",
    {
      schema: {
        tags: ["workspaces"],
        summary: "Rename a workspace",
        params: workspaceParamsSchema,
        body: UpdateWorkspaceSchema,
        response: {
          200: CustomerWorkspaceSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      return deps.workspaceRepository.updateWorkspace(
        identity,
        params.workspaceId,
        request.body as UpdateWorkspace,
      );
    },
  );

  app.post(
    "/v1/organizations",
    {
      schema: {
        tags: ["workspaces"],
        summary: "Create a new organization workspace",
        body: CreateOrganizationSchema,
        response: {
          201: CustomerWorkspaceSchema,
          401: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const workspace = await deps.workspaceRepository.createOrganization(
        identity,
        request.body as CreateOrganization,
      );
      return reply.code(201).send(workspace);
    },
  );

  app.get(
    "/v1/workspaces/:workspaceId/profile",
    {
      schema: {
        tags: ["workspaces"],
        summary: "Read the organization profile and brand",
        params: workspaceParamsSchema,
        response: {
          200: WorkspaceProfileSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      return deps.workspaceProfileRepository.getProfile(
        identity,
        params.workspaceId,
      );
    },
  );

  app.put(
    "/v1/workspaces/:workspaceId/profile",
    {
      schema: {
        tags: ["workspaces"],
        summary: "Replace the organization profile and brand (Owner/Admin)",
        params: workspaceParamsSchema,
        body: WorkspaceProfileSchema,
        response: {
          200: WorkspaceProfileSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      return deps.workspaceProfileRepository.updateProfile(
        identity,
        params.workspaceId,
        request.body as WorkspaceProfile,
      );
    },
  );

  // «Descargar los datos de la organización» (LFPDPPP): one JSON file, in
  // every access state. It is the organization's, not its plan's (domain
  // audit A2-64), so it lives here and no longer in billing.
  app.get(
    "/v1/workspaces/:workspaceId/export",
    {
      schema: {
        tags: ["workspaces"],
        summary: "Download the organization's data as JSON",
        params: workspaceParamsSchema,
        response: { 401: ApiErrorSchema, 403: ApiErrorSchema },
      },
    },
    async (request, reply) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      deps.rateLimiters.checkSensitive(request);
      const params = request.params as WorkspaceParams;
      const document = await deps.workspaceExporter.exportWorkspace(
        identity,
        params.workspaceId,
      );
      const day = document.exportedAt.slice(0, 10);
      return reply
        .header("content-type", "application/json; charset=utf-8")
        .header(
          "content-disposition",
          `attachment; filename="kardo-organizacion-${day}.json"`,
        )
        .header("cache-control", "no-store")
        .send(JSON.stringify(document, null, 2));
    },
  );

  // Domain audit A2-1: every panel screen saves only what it changed, so
  // one screen can no longer erase what another saved meanwhile.
  app.patch(
    "/v1/workspaces/:workspaceId/profile",
    {
      schema: {
        tags: ["workspaces"],
        summary:
          "Change some fields of the organization profile (Owner/Admin); null removes one",
        params: workspaceParamsSchema,
        body: WorkspaceProfilePatchSchema,
        response: {
          200: WorkspaceProfileSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const params = request.params as WorkspaceParams;
      return deps.workspaceProfileRepository.patchProfile(
        identity,
        params.workspaceId,
        request.body as WorkspaceProfilePatch,
      );
    },
  );
}
