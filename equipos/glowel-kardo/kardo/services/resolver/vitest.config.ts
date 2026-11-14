import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          PUBLISH_COMMAND_KEY: "resolver-test-command",
          LEAD_INTAKE_KEY: "lead-intake-test-secret",
          SUSPENSION_COMMAND_KEY: "resolver-test-suspension",
          BILLING_COMMAND_KEY: "resolver-test-billing",
        },
        // Stands in for the real analytics-worker service so tests do not
        // depend on a second Worker project being wired up. Mirrors
        // analytics-worker's POST /v1/public/leads contract closely enough
        // to exercise the Resolver's forwarding, header, and error handling.
        serviceBindings: {
          async LEAD_INTAKE(request: Request) {
            if (
              request.headers.get("x-kardo-lead-intake") !==
              "lead-intake-test-secret"
            ) {
              return new Response("Unauthorized", { status: 401 });
            }
            const body = (await request.json()) as Record<string, unknown>;
            if (typeof body.email !== "string" || body.consent !== true) {
              return new Response("Invalid lead submission", { status: 400 });
            }
            if (body.publicId === "kardonoformtouchpoint1") {
              return new Response("This Kardo Touchpoint is unavailable.", {
                status: 404,
              });
            }
            if (body.publicId === "kardodownstreamdown001") {
              return new Response(
                "Lead submission is temporarily unavailable.",
                {
                  status: 503,
                },
              );
            }
            return Response.json(
              {
                id: "11111111-1111-4111-8111-111111111111",
                status: "accepted",
              },
              { status: 201 },
            );
          },
        },
      },
    }),
  ],
});
