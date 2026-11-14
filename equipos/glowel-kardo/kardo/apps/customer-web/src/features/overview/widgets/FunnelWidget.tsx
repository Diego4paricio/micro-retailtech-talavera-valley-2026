import { formatNumber } from "../../../lib/format.js";
import type { WidgetRenderProps } from "../dashboard/types.js";
import { funnelSteps } from "./charts/aggregate.js";

const stepLabels: Record<"taps" | "clicks" | "leads", string> = {
  taps: "Accesos",
  clicks: "Clics",
  leads: "Solicitudes",
};
/** What each step's `shareOfPrevious` is a share *of* (steps run accesses →
 * clicks → leads, in that fixed order). */
const previousStepLabel: Record<"taps" | "clicks" | "leads", string> = {
  taps: "",
  clicks: "los accesos",
  leads: "los clics",
};
const shareFormat = new Intl.NumberFormat("es-MX", {
  style: "percent",
  maximumFractionDigits: 1,
});

/** How many accesses turn into clicks and, of those, into leads — three
 * decreasing bars with the share of the step before it. */
export function FunnelWidget({ context, preview }: WidgetRenderProps) {
  const { totals } = context.data;

  if (!context.engineAvailable)
    return (
      <p className="kw-empty">Disponible cuando vuelva la analítica en vivo.</p>
    );
  if (totals.taps === 0)
    return (
      <p className="kw-empty">
        Cuando alguien acerque su celular o escanee un código, verás aquí
        cuántos llegan a dejar una solicitud.
      </p>
    );

  const steps = funnelSteps(totals);
  const ariaLabel = `Embudo de acceso a solicitud: ${steps
    .map((step) => `${stepLabels[step.key]} ${formatNumber(step.value)}`)
    .join(", ")}.`;

  return (
    <div className="kw-fill-col">
      <ol
        aria-label={ariaLabel}
        className={preview ? "kw-funnel kw-funnel-compact" : "kw-funnel"}
      >
        {steps.map((step) => (
          <li className="kw-funnel-step" key={step.key}>
            <div className="kw-funnel-head">
              <span className="kw-funnel-label">{stepLabels[step.key]}</span>
              <span className="kw-funnel-value">
                {formatNumber(step.value)}
              </span>
            </div>
            <div className="kw-funnel-track" role="presentation">
              <div
                className="kw-funnel-fill"
                style={{ width: `${Math.max(4, step.shareOfFirst * 100)}%` }}
              />
            </div>
            {step.shareOfPrevious !== null && !preview ? (
              <p className="kw-funnel-note">
                {shareFormat.format(step.shareOfPrevious)} de{" "}
                {previousStepLabel[step.key]}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
      {/* A `<table>` never actually shrinks to 1 px (auto layout keeps its
          min-content width): the div, not the table, carries
          `.visually-hidden` so it clips the table instead of leaving it at
          its natural width and forcing a horizontal scrollbar on a phone. */}
      <div className="visually-hidden">
        <table>
          <caption>Embudo de acceso a solicitud</caption>
          <thead>
            <tr>
              <th scope="col">Paso</th>
              <th scope="col">Cantidad</th>
              <th scope="col">% del paso anterior</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((step) => (
              <tr key={step.key}>
                <td>{stepLabels[step.key]}</td>
                <td>{formatNumber(step.value)}</td>
                <td>
                  {step.shareOfPrevious === null
                    ? "—"
                    : shareFormat.format(step.shareOfPrevious)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
