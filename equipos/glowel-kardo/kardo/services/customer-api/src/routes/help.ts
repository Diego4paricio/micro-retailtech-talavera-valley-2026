import {
  ApiErrorSchema,
  type AskHelp,
  AskHelpSchema,
  HelpAnswerSchema,
} from "@kardo/contracts";
import type { FastifyInstance } from "fastify";
import { RateLimitedError } from "../errors.js";
import type { AppDependencies } from "../http/dependencies.js";
import { requireSession } from "../http/session.js";
import { createFixedWindowLimiter } from "../rate-limit.js";

/** Help answers per person per hour (each one is a model call). */
export const HELP_QUESTIONS_PER_HOUR = 30;

export function registerHelpRoutes(
  app: FastifyInstance,
  deps: AppDependencies,
): void {
  const askedPerPerson = createFixedWindowLimiter({
    limit: HELP_QUESTIONS_PER_HOUR,
    windowMs: 3_600_000,
  });
  app.post(
    "/v1/help/ask",
    {
      schema: {
        tags: ["help"],
        summary:
          "Ask the in-app help assistant how to use Kardo (no account data is shared)",
        body: AskHelpSchema,
        response: {
          200: HelpAnswerSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          429: ApiErrorSchema,
          503: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      const identity = await requireSession(request, deps.sessionVerifier);
      // Each answer costs a model call: same budget as other sensitive routes.
      deps.rateLimiters.checkSensitive(request);
      if (deps.helpAssistant.enabled) {
        // Kardo's global daily AI budget (shared with the Estudio) and a cap
        // per person, so help cannot run up the bill (security review
        // 2026-10, V9).
        const perPerson = askedPerPerson(`help:${identity.subject}`);
        if (!perPerson.allowed) {
          throw new RateLimitedError(perPerson.retryAfterSeconds);
        }
        await deps.customHtmlBudget.checkBeforeGeneration();
      }
      const answer = await deps.helpAssistant.ask(request.body as AskHelp);
      return { answer };
    },
  );
}
