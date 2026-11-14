import {
  type StatusProbeDetail,
  statusComponentLabels,
} from "@kardo/contracts";
import { StatusBadge } from "../../components/StatusBadge.js";
import { formatDateTime, formatNumber } from "../../lib/format.js";
import { probeLabel } from "./format.js";

function probeResult(probe: StatusProbeDetail) {
  if (!probe.configured)
    return <StatusBadge tone="neutral">Sin configurar</StatusBadge>;
  if (probe.ok === null)
    return <StatusBadge tone="neutral">Sin datos</StatusBadge>;
  if (!probe.ok) return <StatusBadge tone="danger">Falla</StatusBadge>;
  return probe.slow ? (
    <StatusBadge tone="warning">Lenta</StatusBadge>
  ) : (
    <StatusBadge tone="success">Bien</StatusBadge>
  );
}

export function ProbesTable({
  probes,
}: {
  probes: readonly StatusProbeDetail[];
}) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <caption className="visually-hidden">Pruebas técnicas</caption>
        <thead>
          <tr>
            <th scope="col">Prueba</th>
            <th scope="col">Área</th>
            <th scope="col">Resultado</th>
            <th className="numeric" scope="col">
              Latencia
            </th>
            <th className="numeric" scope="col">
              HTTP
            </th>
            <th scope="col">Detalle</th>
            <th className="numeric" scope="col">
              Fallas seguidas
            </th>
            <th className="numeric" scope="col">
              Aciertos seguidos
            </th>
            <th scope="col">Revisada</th>
          </tr>
        </thead>
        <tbody>
          {probes.map((probe) => (
            <tr key={probe.id}>
              <th scope="row">{probeLabel(probe.id)}</th>
              <td>{statusComponentLabels[probe.component]}</td>
              <td>{probeResult(probe)}</td>
              <td className="numeric">
                {probe.latencyMs === null
                  ? "—"
                  : `${formatNumber(probe.latencyMs)} ms`}
              </td>
              <td className="numeric">{probe.httpStatus ?? "—"}</td>
              <td className="op-message-cell">
                {probe.error ?? probe.detail ?? "—"}
              </td>
              <td className="numeric">{probe.consecutiveFailures}</td>
              <td className="numeric">{probe.consecutiveSuccesses}</td>
              <td>{formatDateTime(probe.checkedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
