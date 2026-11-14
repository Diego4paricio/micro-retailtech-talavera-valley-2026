import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";

const allowedHosts = new Set([
  "kardo-poa-test-resolver.glowel-dev.workers.dev",
  "127.0.0.1",
  "localhost",
]);
const defaults = {
  target: "https://kardo-poa-test-resolver.glowel-dev.workers.dev",
  publicId: "phase9beta00000001",
  rps: 100,
  seconds: 60,
  output: "Docs/engineering/benchmarks/results-resolver-load.json",
};

function usage() {
  console.log(`Usage: pnpm beta:resolver-load -- [options]

Options:
  --target <url>       Test-only Resolver URL (default: ${defaults.target})
  --public-id <id>     Synthetic public ID (default: ${defaults.publicId})
  --rps <1..100>       Requests per second (default: ${defaults.rps})
  --seconds <1..60>    Duration in seconds (default: ${defaults.seconds})
  --output <path>      Sanitized JSON evidence path (default: ${defaults.output})

Safety: requires KARDO_BETA_TEST=1, permits only localhost or the dedicated
kardo-poa-test-resolver hostname, never follows redirects, and caps a run at
6,000 requests. It must not be pointed at production.`);
}

function parseArgs(argv) {
  const options = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--") continue;
    if (flag === "--help" || flag === "-h") return null;
    const value = argv[index + 1];
    if (!value || !flag?.startsWith("--")) throw new Error(`Invalid argument: ${flag}`);
    index += 1;
    if (flag === "--target") options.target = value;
    else if (flag === "--public-id") options.publicId = value;
    else if (flag === "--output") options.output = value;
    else if (flag === "--rps" || flag === "--seconds") options[flag.slice(2)] = Number(value);
    else throw new Error(`Unknown option: ${flag}`);
  }
  return options;
}

function validate(options) {
  if (process.env.KARDO_BETA_TEST !== "1") {
    throw new Error("Set KARDO_BETA_TEST=1 to acknowledge this bounded test.");
  }
  const target = new URL(options.target);
  if (target.protocol !== "https:" && !allowedHosts.has(target.hostname)) {
    throw new Error("Only HTTPS targets are allowed outside localhost.");
  }
  if (!allowedHosts.has(target.hostname)) {
    throw new Error("Target must be a dedicated Kardo PoA Resolver or localhost.");
  }
  if (!/^[A-Za-z0-9_-]{16,32}$/.test(options.publicId)) {
    throw new Error("Public ID must be a 16-32 character synthetic Kardo ID.");
  }
  for (const [name, value, maximum] of [["rps", options.rps, 100], ["seconds", options.seconds, 60]]) {
    if (!Number.isInteger(value) || value < 1 || value > maximum) {
      throw new Error(`${name} must be an integer between 1 and ${maximum}.`);
    }
  }
  const evidenceDirectory = resolve("Docs/engineering/benchmarks");
  const outputPath = resolve(options.output);
  if (!outputPath.startsWith(`${evidenceDirectory}/`) || !outputPath.endsWith(".json")) {
    throw new Error("Evidence output must be a JSON file inside Docs/engineering/benchmarks.");
  }
  return target;
}

function percentile(values, level) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * level) - 1)];
}

async function run(options, target) {
  const latencies = [];
  const statuses = new Map();
  let networkErrors = 0;
  const runStarted = new Date().toISOString();

  for (let second = 0; second < options.seconds; second += 1) {
    const deadline = performance.now() + 1_000;
    await Promise.all(
      Array.from({ length: options.rps }, async () => {
        const started = performance.now();
        try {
          const response = await fetch(
            new URL(`/t/${options.publicId}?channel=link`, target),
            { redirect: "manual", signal: AbortSignal.timeout(10_000) },
          );
          statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);
          latencies.push(performance.now() - started);
        } catch {
          networkErrors += 1;
        }
      }),
    );
    const waitMs = deadline - performance.now();
    if (waitMs > 0) await new Promise((done) => setTimeout(done, waitMs));
  }

  const requests = options.rps * options.seconds;
  const expectedResponses = (statuses.get(200) ?? 0) + (statuses.get(302) ?? 0);
  const result = {
    schemaVersion: 1,
    scenario: "resolver-load",
    commit: process.env.GITHUB_SHA ?? "local-uncommitted",
    startedAt: runStarted,
    completedAt: new Date().toISOString(),
    target: target.origin,
    publicId: options.publicId,
    method: "bounded Node fetch batches; manual redirects; no credentials or request bodies",
    requestedRps: options.rps,
    durationSeconds: options.seconds,
    requests,
    responses: Object.fromEntries(statuses),
    networkErrors,
    expectedResponseRate: Number((expectedResponses / requests).toFixed(6)),
    latencyMs: {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      p99: percentile(latencies, 0.99),
    },
    acceptance: {
      minimumExpectedResponseRate: 0.999,
      passed: expectedResponses / requests >= 0.999,
    },
  };
  const outputPath = resolve(options.output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
  if (!result.acceptance.passed) process.exitCode = 1;
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (!options) usage();
  else await run(options, validate(options));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
