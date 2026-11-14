import type { TimeZoneSelection } from "./timezone-choice.js";

/**
 * A9-25: a plain line next to the period selector naming the zone Analítica
 * and Resumen are using right now, with a text button to switch to the
 * other one when there is a real choice. No box, no halo — just text.
 */
export function TimeZoneNote({
  selection,
}: {
  selection: TimeZoneSelection & { toggle: () => void };
}) {
  const { label, choice, canToggle, otherLabel, toggle } = selection;
  return (
    <p className="analytics-tz-note">
      Horas en {label} ({choice === "business" ? "tu negocio" : "tu navegador"})
      {canToggle ? (
        <>
          {" "}
          <button className="text-action" onClick={toggle} type="button">
            {choice === "business"
              ? "Usar la de tu navegador"
              : `Usar la del negocio (${otherLabel})`}
          </button>
        </>
      ) : null}
    </p>
  );
}
