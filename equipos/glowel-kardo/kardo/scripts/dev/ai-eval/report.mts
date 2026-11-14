// Kardo AI test bench: joins one or more rounds' results and evaluations
// into a Markdown report (a table per round, averages per round, and how
// many generations each plan's monthly AI spend cap pays for).
//
//   pnpm exec tsx scripts/dev/ai-eval/report.mts --name=<name> <round> [<round> ...]
// writes scripts/dev/ai-eval/out/report-<name>.md and .json

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const MXN_PER_USD = Number(process.env.KARDO_EVAL_MXN ?? "17.84");
/** Each plan's two monthly AI limits, read from kardo-dev's
 * `kardo_core.plan_entitlements` on 2026-10-02: `ai.generations_month` and
 * `ai.spend_cents_month` (owner decision 2026-10-01). A model fits a plan
 * when every included generation fits under the spend cap. */
const planCaps = [
  { plan: "Esencial", usd: 1, generations: 2 },
  { plan: "Profesional", usd: 2, generations: 18 },
  { plan: "Negocio", usd: 4, generations: 50 },
  { plan: "Corporativo", usd: 15, generations: 100 },
];
/** Adaptive thinking is billed as output and no answer file shows it: the
 * report adds this share of the visible output as a sensitivity (Sonnet 5
 * runs at medium effort; Haiku 4.5 runs without thinking). */
const thinkingShare: Record<string, number> = {
  "claude-sonnet-5": 0.5,
  "claude-haiku-4-5": 0,
};
const outputPrice: Record<string, number> = {
  "claude-sonnet-5": 10,
  "claude-haiku-4-5": 5,
};

type Scores = {
  entiende: number;
  boton: number;
  celular: number;
  marca: number;
  profesional: number;
  contenido: number;
  comentario: string;
};
const criteria = [
  "entiende",
  "boton",
  "celular",
  "marca",
  "profesional",
  "contenido",
] as const;

type Result = {
  key: string;
  type: string;
  path: string;
  industry: string;
  model: string;
  mode: string;
  status: string;
  turns: number;
  perTurn: { turn: number; feedback?: string }[];
  totals: {
    inputTokens: number;
    outputTokens: number;
    cacheWriteTokens: number;
    cacheReadTokens: number;
  };
  costUsd: number;
  warmCostUsd: number;
  business: { name: string };
};

const nameArg = process.argv
  .find((value) => value.startsWith("--name="))
  ?.slice("--name=".length);
const rounds = process.argv.slice(2).filter((value) => !value.startsWith("--"));
if (!nameArg || rounds.length === 0) {
  console.error(
    "usage: pnpm exec tsx scripts/dev/ai-eval/report.mts --name=<name> <round> [<round> ...]",
  );
  process.exit(1);
}

const round2 = (value: number) => Math.round(value * 100) / 100;
const usd = (value: number) => `US$${value.toFixed(4)}`;
const mxn = (value: number) => `$${(value * MXN_PER_USD).toFixed(2)}`;
const average = (values: number[]) =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

/** What the loop had to correct, one short line per correction turn. */
function corrections(result: Result): string {
  const lines = result.perTurn
    .filter((turn) => turn.feedback)
    .map((turn) => {
      const items = (turn.feedback ?? "")
        .split("\n")
        .filter((line) => line.startsWith("- "))
        .map((line) => line.slice(2).split(":")[0]?.trim() ?? "")
        .filter(Boolean);
      return items.length ? items.join("; ") : "formato";
    });
  return lines.length ? lines.join(" / ") : "nada";
}

function thinkingCost(result: Result): number {
  const share = thinkingShare[result.model] ?? 0;
  const price = outputPrice[result.model] ?? 10;
  return (result.totals.outputTokens * share * price) / 1_000_000;
}

const sections: string[] = [];
const summary: Record<string, unknown>[] = [];

for (const round of rounds) {
  const dir = path.join(here, "out", round);
  const results = fs
    .readdirSync(path.join(dir, "results"))
    .filter((file) => file.endsWith(".json"))
    .map(
      (file) =>
        JSON.parse(
          fs.readFileSync(path.join(dir, "results", file), "utf8"),
        ) as Result,
    )
    .sort((a, b) => a.key.localeCompare(b.key));
  const evals = new Map<string, Scores>();
  for (const result of results) {
    const file = path.join(dir, "evals", `${result.key}.json`);
    if (fs.existsSync(file))
      evals.set(result.key, JSON.parse(fs.readFileSync(file, "utf8")));
  }

  const rows = results.map((result) => {
    const score = evals.get(result.key);
    const mean = score ? average(criteria.map((c) => score[c])) : null;
    return [
      result.key,
      result.industry,
      result.status,
      String(result.turns),
      String(result.totals.inputTokens),
      String(result.totals.outputTokens),
      `${result.totals.cacheWriteTokens}/${result.totals.cacheReadTokens}`,
      usd(result.costUsd),
      mxn(result.costUsd),
      corrections(result),
      score ? criteria.map((c) => score[c]).join(" ") : "",
      mean === null ? "" : mean.toFixed(1),
      score?.comentario ?? "",
    ];
  });

  const finished = results.filter((result) => result.status === "ok");
  const model = results[0]?.model ?? "";
  const avgCost = average(finished.map((result) => result.costUsd));
  const avgWarm = average(finished.map((result) => result.warmCostUsd));
  const avgThinking = average(
    finished.map((result) => result.costUsd + thinkingCost(result)),
  );
  const scored = results.filter((result) => evals.has(result.key));
  const perCriterion = Object.fromEntries(
    criteria.map((c) => [
      c,
      round2(average(scored.map((result) => evals.get(result.key)?.[c] ?? 0))),
    ]),
  );
  const overall = round2(
    average(
      scored.map((result) => {
        const score = evals.get(result.key);
        return score ? average(criteria.map((c) => score[c])) : 0;
      }),
    ),
  );

  summary.push({
    round,
    model,
    mode: results[0]?.mode,
    cases: results.length,
    ok: finished.length,
    firstTurn: finished.filter((result) => result.turns === 1).length,
    avgTurns: round2(average(finished.map((result) => result.turns))),
    avgCostUsd: avgCost,
    avgWarmCostUsd: avgWarm,
    avgWithThinkingUsd: avgThinking,
    scores: perCriterion,
    overall,
    perPlan: planCaps.map((cap) => ({
      plan: cap.plan,
      capUsd: cap.usd,
      includedGenerations: cap.generations,
      generationsTheCapPays: Math.floor(cap.usd / (avgThinking || 1)),
      includedCostUsd: round2(cap.generations * avgThinking * 100) / 100,
      fits: cap.generations * avgThinking <= cap.usd,
    })),
  });

  sections.push(
    [
      `## ${round} (${model}, modo ${results[0]?.mode})`,
      "",
      `Terminados: ${finished.length} de ${results.length}; a la primera: ${finished.filter((r) => r.turns === 1).length}; turnos promedio: ${round2(average(finished.map((r) => r.turns)))}.`,
      `Costo promedio por generación: ${usd(avgCost)} (${mxn(avgCost)} MXN) con caché fría; ${usd(avgWarm)} con caché caliente; ${usd(avgThinking)} sumando el razonamiento estimado.`,
      scored.length
        ? `Calificación promedio (1 a 5): ${overall} (entiende ${perCriterion.entiende}, botón ${perCriterion.boton}, celular ${perCriterion.celular}, marca ${perCriterion.marca}, profesional ${perCriterion.profesional}, contenido ${perCriterion.contenido}).`
        : "Sin evaluar todavía.",
      `Topes por plan (generaciones incluidas, tope de gasto): ${planCaps.map((cap) => `${cap.plan} ${cap.generations} gen. cuestan US$${(cap.generations * avgThinking).toFixed(2)} de US$${cap.usd} (${cap.generations * avgThinking <= cap.usd ? "cabe" : "no cabe"}; el tope paga ${Math.floor(cap.usd / (avgThinking || 1))})`).join("; ")}.`,
      "",
      "| Caso | Giro | Estado | Turnos | Entrada | Salida | Caché esc./lect. | USD | MXN | Qué se corrigió | Calificación (E B C M P Ct) | Prom. | Comentario |",
      "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
      ...rows.map(
        (row) =>
          `| ${row.map((cell) => cell.replaceAll("|", "/")).join(" | ")} |`,
      ),
    ].join("\n"),
  );
}

const outBase = path.join(here, "out", `report-${nameArg}`);
fs.writeFileSync(
  `${outBase}.md`,
  [
    `# Banco de pruebas de la IA de Kardo: ${nameArg}`,
    "",
    `Tokens estimados (3 caracteres por token; imágenes ancho x alto / 750). Precios de services/customer-api/src/custom-html/pricing.ts. Tipo de cambio ${MXN_PER_USD} MXN por dólar.`,
    "",
    ...sections.flatMap((section) => [section, ""]),
  ].join("\n"),
);
fs.writeFileSync(`${outBase}.json`, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`${outBase}.md`);
console.log(JSON.stringify(summary, null, 2));
