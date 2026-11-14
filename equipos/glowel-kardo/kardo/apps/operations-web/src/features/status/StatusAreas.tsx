import { type ServiceStatus, statusComponentLabels } from "@kardo/contracts";
import { StatusBadge } from "../../components/StatusBadge.js";
import { checkedAgoText, levelLabels, levelTones } from "./format.js";

/** Overall level plus the six areas customers see. */
export function StatusAreas({
  status,
  now,
}: {
  status: ServiceStatus;
  now: number;
}) {
  return (
    <section aria-labelledby="st-areas" className="panel st-areas">
      <div className="st-overall">
        <div>
          <p className="eyebrow">Estado general</p>
          <h2 id="st-areas">{levelLabels[status.overall]}</h2>
        </div>
        <StatusBadge tone={levelTones[status.overall]}>
          {levelLabels[status.overall]}
        </StatusBadge>
      </div>
      <p className="st-checked">{checkedAgoText(status.checkedAt, now)}</p>
      <ul className="st-area-list">
        {status.components.map((component) => (
          <li
            className={`st-area st-area-${component.level}`}
            key={component.id}
          >
            <span className="st-area-name">
              {statusComponentLabels[component.id]}
              {component.provider ? (
                <small className="st-provider-tag"> (proveedor)</small>
              ) : null}
            </span>
            <StatusBadge tone={levelTones[component.level]}>
              {levelLabels[component.level]}
            </StatusBadge>
          </li>
        ))}
      </ul>
    </section>
  );
}
