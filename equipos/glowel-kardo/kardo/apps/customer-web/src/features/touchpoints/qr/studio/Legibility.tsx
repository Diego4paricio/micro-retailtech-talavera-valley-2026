import { Popover } from "radix-ui";
import { Icon } from "../../../../components/Icon.js";
import type { LegibilityReport, QrAnalysis } from "../engine/index.js";
import type { LegibilityState } from "./hooks.js";
import {
  type StudioSectionId,
  studioSections,
  warningSections,
} from "./labels.js";
import { WarningList } from "./sections/SectionWarnings.js";
import type { LogoState } from "./useLogoRaster.js";

export type GateProblem = { message: string; section: StudioSectionId | null };

/** Failed critical decode checks, in plain words, with where to fix them. */
const checkProblems: Record<string, GateProblem> = {
  reference: {
    message:
      "El lector no pudo leerlo ni en condiciones ideales. Prueba módulos cuadrados o redondeados.",
    section: "modules",
  },
  "small-print": {
    message:
      "No se lee cuando se imprime pequeño. Reduce la versión o la corrección de errores.",
    section: "advanced",
  },
  blur: {
    message:
      "No se lee si la cámara desenfoca un poco. Usa módulos más llenos.",
    section: "modules",
  },
  "sensor-noise": {
    message:
      "No se lee con el ruido de una cámara real. Sube el contraste entre módulos y fondo.",
    section: "colors",
  },
};

/** Whether the current design may be exported, and why not. */
export type ExportGate = {
  ready: boolean;
  checking: boolean;
  problems: readonly GateProblem[];
};

export function exportGate({
  buildError,
  analysis,
  logo,
  legibility,
}: {
  buildError: string | null;
  analysis: QrAnalysis | null;
  logo: LogoState;
  legibility: LegibilityState;
}): ExportGate {
  const problems: GateProblem[] = [];
  if (buildError)
    problems.push({
      message: `No pudimos generar el código: ${buildError}`,
      section: null,
    });
  if (logo.status === "unavailable")
    problems.push({
      message:
        "El logo no está disponible. Elige otra imagen, súbela de nuevo o quita el logo.",
      section: "logo",
    });
  for (const warning of analysis?.warnings ?? [])
    if (warning.level === "error")
      problems.push({
        message: warning.message,
        section: warningSections[warning.code],
      });
  const report = legibility.report;
  if (legibility.status === "error")
    problems.push({
      message:
        "No pudimos verificar la lectura. Cambia cualquier ajuste para volver a intentarlo.",
      section: null,
    });
  if (legibility.status === "done" && report) {
    const failed = report.checks.filter(
      (check) => check.critical && !check.passed,
    );
    for (const check of failed)
      problems.push(
        checkProblems[check.id] ?? {
          message: `No pasó la comprobación «${check.label}».`,
          section: null,
        },
      );
    if (!report.ok && !failed.length)
      problems.push({
        message: "El código no se pudo leer con la dirección de este QR.",
        section: null,
      });
  }
  const checking =
    logo.status === "loading" ||
    (!buildError &&
      (legibility.status === "checking" || legibility.status === "idle"));
  return { ready: !checking && problems.length === 0, checking, problems };
}

type Tone = "checking" | "ok" | "fair" | "blocked";

/**
 * While a new check runs, the pill keeps the previous verdict (with a
 * spinner) instead of flashing "checking" on every slider step.
 */
function toneOf(gate: ExportGate, report: LegibilityReport | null): Tone {
  if (gate.problems.length) return "blocked";
  if (!report) return gate.checking ? "checking" : "ok";
  if (!report.ok || report.checks.some((c) => c.critical && !c.passed))
    return "blocked";
  if (report.checks.some((check) => !check.passed)) return "fair";
  return "ok";
}

const toneText: Record<Tone, string> = {
  checking: "Verificando lectura…",
  ok: "Se lee bien",
  fair: "Se lee, con reparos",
  blocked: "No se puede exportar",
};

/**
 * Always-visible legibility pill on the stage. It opens the full report:
 * score, every decode check, the engine's advice and one-click fixes.
 */
export function LegibilityIndicator({
  gate,
  legibility,
  analysis,
  onFix,
}: {
  gate: ExportGate;
  legibility: LegibilityState;
  analysis: QrAnalysis | null;
  onFix: (section: StudioSectionId) => void;
}) {
  const report = legibility.report;
  const tone = toneOf(gate, report);
  const busy = gate.checking;
  const score = report ? report.score : null;
  const announcement =
    busy || tone === "checking"
      ? ""
      : tone === "blocked"
        ? `Legibilidad: no se puede exportar. ${gate.problems[0]?.message ?? ""}`
        : `Legibilidad: ${toneText[tone].toLowerCase()}${score !== null ? `, ${score} de 100` : ""}.`;

  return (
    <>
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            aria-busy={busy || undefined}
            aria-label={`${busy ? "Verificando lectura. " : ""}${toneText[tone]}${score !== null ? `, puntuación ${score} de 100` : ""}. Ver detalles de legibilidad`}
            className="qrs-legibility"
            data-busy={busy || undefined}
            data-tone={tone}
            type="button"
          >
            <span aria-hidden="true" className="qrs-legibility-icon">
              {busy || tone === "checking" ? (
                <Icon className="qrs-spin" name="loader" size={16} />
              ) : tone === "blocked" ? (
                <Icon name="octagon-alert" size={16} />
              ) : tone === "fair" ? (
                <Icon name="alert" size={16} />
              ) : (
                <Icon name="shield-check" size={16} />
              )}
            </span>
            <span className="qrs-legibility-text">{toneText[tone]}</span>
            {score !== null ? (
              <span aria-hidden="true" className="qrs-legibility-score">
                {score}
              </span>
            ) : null}
            <Icon name="chevron-down" size={14} />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            className="qrs-popover"
            collisionPadding={12}
            sideOffset={8}
          >
            <LegibilityReportView
              analysis={analysis}
              gate={gate}
              onFix={onFix}
              report={report}
            />
            <Popover.Arrow className="qrs-popover-arrow" />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <p aria-atomic="true" className="visually-hidden" role="status">
        {announcement}
      </p>
    </>
  );
}

export function LegibilityReportView({
  gate,
  report,
  analysis,
  onFix,
}: {
  gate: ExportGate;
  report: LegibilityReport | null;
  analysis: QrAnalysis | null;
  onFix: (section: StudioSectionId) => void;
}) {
  const advice = (analysis?.warnings ?? []).filter(
    (warning) => warning.level !== "error",
  );
  return (
    <div className="qrs-report">
      <div className="qrs-report-head">
        <div>
          <h3>Legibilidad</h3>
          <p>
            Leemos el código como lo haría una cámara: a varios tamaños, con
            desenfoque y con ruido.
          </p>
        </div>
        {report && !gate.checking ? (
          <span className="qrs-report-score">
            <strong>{report.score}</strong>
            <small>de 100</small>
          </span>
        ) : null}
      </div>

      {gate.problems.length ? <GateProblems gate={gate} onFix={onFix} /> : null}

      {report ? (
        <ul className="qrs-checks">
          {report.checks.map((check) => (
            <li data-passed={check.passed} key={check.id}>
              <Icon
                name={check.passed ? "circle-check" : "circle-alert"}
                size={16}
              />
              <span>{check.label}</span>
              {check.critical ? (
                <small className="qrs-check-tag">Obligatoria</small>
              ) : null}
              <span className="visually-hidden">
                {check.passed ? "(pasó)" : "(no pasó)"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="qrs-hint">Verificando…</p>
      )}

      {advice.length ? (
        <div className="qrs-report-advice">
          <h4>Recomendaciones</h4>
          <WarningList warnings={advice} />
        </div>
      ) : null}
    </div>
  );
}

/** What blocks the export, each with a shortcut to the section that fixes it. */
export function GateProblems({
  gate,
  onFix,
}: {
  gate: ExportGate;
  onFix: (section: StudioSectionId) => void;
}) {
  return (
    <div className="qrs-gate" role="alert">
      <p className="qrs-gate-title">
        <Icon name="octagon-alert" size={16} /> Corrige esto antes de exportar
      </p>
      <ul>
        {gate.problems.map((problem) => (
          <li key={problem.message}>
            <span>{problem.message}</span>
            {problem.section ? (
              <button
                className="link-button"
                onClick={() => {
                  if (problem.section) onFix(problem.section);
                }}
                type="button"
              >
                Ir a {studioSections[problem.section].label}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {gate.problems.some((problem) => problem.section === null) ? (
        <p className="qrs-hint">
          Suele arreglarse subiendo el contraste, reduciendo el logo o eligiendo
          módulos más simples (cuadrados o redondeados).
        </p>
      ) : null}
    </div>
  );
}
