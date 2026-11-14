import {
  type AcceptLegalTerms,
  AcceptLegalTermsSchema,
  ApiErrorSchema,
  CustomerProfileSchema,
  CustomerSessionSchema,
  legalVersions,
  type UpdateCustomerProfile,
  UpdateCustomerProfileSchema,
} from "@kardo/contracts";
import type { FastifyInstance } from "fastify";
import { ApiError } from "../errors.js";
import type { AppDependencies } from "../http/dependencies.js";
import { requireSession } from "../http/session.js";
import { resolveTimeZone } from "../timezone.js";

export function registerProfileRoutes(
  app: FastifyInstance,
  deps: AppDependencies,
): void {
  app.get(
    "/v1/me",
    {
      schema: {
        tags: ["auth"],
        summary: "Read the current customer session",
        response: { 200: CustomerSessionSchema, 401: ApiErrorSchema },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      return { subject: identity.subject, email: identity.email };
    },
  );

  app.get(
    "/v1/me/profile",
    {
      schema: {
        tags: ["auth"],
        summary: "Read the current customer's profile",
        response: {
          200: CustomerProfileSchema,
          401: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      return deps.profileRepository.getProfile(identity);
    },
  );

  app.patch(
    "/v1/me/profile",
    {
      schema: {
        tags: ["auth"],
        summary: "Update the current customer's name and preferences",
        body: UpdateCustomerProfileSchema,
        response: {
          200: CustomerProfileSchema,
          401: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const body = request.body as UpdateCustomerProfile;
      // Only a zone Intl knows: dates in the panel are formatted with it.
      if (body.timeZone && resolveTimeZone(body.timeZone) !== body.timeZone)
        throw new ApiError(
          "VALIDATION_FAILED",
          400,
          "The time zone is not valid.",
        );
      return deps.profileRepository.updateProfile(identity, body);
    },
  );

  // Clickwrap (Términos y Aviso de Privacidad). The server stamps the time.
  app.post(
    "/v1/me/terms-acceptance",
    {
      schema: {
        tags: ["auth"],
        summary: "Accept the current Terms and Privacy Notice",
        body: AcceptLegalTermsSchema,
        response: {
          200: CustomerProfileSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      const body = request.body as AcceptLegalTerms;
      if (
        body.termsVersion !== legalVersions.terms ||
        body.privacyVersion !== legalVersions.privacy
      ) {
        // Only the versions currently published can be accepted.
        throw new ApiError(
          "VALIDATION_FAILED",
          400,
          "These are not the current legal versions.",
        );
      }
      return deps.profileRepository.acceptLegalTerms(identity, body);
    },
  );
}
