import { timingSafeEqual } from "node:crypto";
import {
  createHttpResolverProjection,
  createPostgresPublicationJobRepository,
  processPendingPublications,
} from "./index.js";

type PublisherWorkerEnv = Env & {
  // Wrangler cannot generate a type for a secret because it is deliberately
  // absent from wrangler.jsonc.
  PUBLISH_COMMAND_KEY: string;
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ status: "ok", service: "publisher" });
    }
    if (request.method === "POST" && url.pathname === "/internal/run-once") {
      if (!isAuthorized(request, env.PUBLISH_COMMAND_KEY)) {
        return new Response("Unauthorized", { status: 401 });
      }
      const outcome = await runPublisherOnce(env);
      return Response.json({ outcome });
    }
    return new Response("Not found", { status: 404 });
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runPublisherOnce(env));
  },
} satisfies ExportedHandler<PublisherWorkerEnv>;

async function runPublisherOnce(
  env: PublisherWorkerEnv,
): Promise<{ published: number; failed: number; idle: boolean }> {
  const repository = createPostgresPublicationJobRepository(
    env.HYPERDRIVE.connectionString,
  );
  try {
    const outcome = await processPendingPublications(
      repository,
      createHttpResolverProjection({
        publishUrl: "https://resolver.internal/internal/publish",
        commandKey: env.PUBLISH_COMMAND_KEY,
        fetchFn: (input, init) => env.RESOLVER.fetch(input, init),
      }),
    );
    console.log(JSON.stringify({ event: "publisher.run", outcome }));
    return outcome;
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "publisher.run_failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    throw error;
  } finally {
    await repository.close();
  }
}

export function isAuthorized(
  request: Request,
  expectedKey: string | undefined,
): boolean {
  // Fails closed on purpose without the key (security review 2026-10).
  if (!expectedKey) return false;
  const actual = request.headers.get("authorization");
  if (!actual?.startsWith("Bearer ")) return false;
  const suppliedKey = actual.slice("Bearer ".length);
  const expected = Buffer.from(expectedKey);
  const supplied = Buffer.from(suppliedKey);
  return (
    expected.length === supplied.length && timingSafeEqual(expected, supplied)
  );
}
