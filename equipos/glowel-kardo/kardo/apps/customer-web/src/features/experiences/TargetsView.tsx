import { EmptyState } from "../../components/EmptyState.js";
import { Icon } from "../../components/Icon.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { Link } from "../../lib/router.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { useExperienceWorkspace } from "./ExperienceWorkspaceContext.js";
import { TargetPicker } from "./TargetPicker.js";
import {
  summarizeTargetStatuses,
  type TargetStatusKind,
  targetStatusKind,
  targetStatusViews,
} from "./workspace-model.js";

const summaryOrder: TargetStatusKind[] = [
  "live",
  "publishing",
  "waiting",
  "failed",
  "overridden",
];

const summaryLabels: Record<TargetStatusKind, string> = {
  live: "En vivo",
  publishing: "Publicando",
  waiting: "Al publicar",
  failed: "Con error",
  overridden: "Anulados",
};

/**
 * Destinos: where the Experience is published. Choosing targets only saves
 * them; publishing is what puts the content on the new Touchpoints.
 */
export function TargetsView() {
  const ws = useExperienceWorkspace();
  const { touchpoints, groups } = useWorkspace();
  const physical = (touchpoints.data ?? []).filter(
    (item) => item.kind !== "link" && item.status !== "retired",
  );
  const isLive = (ws.experience?.liveTouchpointCount ?? 0) > 0;

  return (
    <div className="xpw-targets">
      <section
        aria-labelledby="xpw-targets-title"
        className="panel xpw-targets-main"
      >
        <div className="xpw-section-head">
          <h2 className="xpw-section-title" id="xpw-targets-title">
            Dónde se publica
          </h2>
          <p className="xpw-section-note">
            {isLive
              ? "Publica para llevar esta página a los QR y etiquetas que agregues. Si quitas uno, pasa a la página de su grupo (si tiene) o conserva esta hasta que publiques otra."
              : "Guardar dónde se ve no publica nada: se aplica cuando publiques."}
          </p>
        </div>
        {touchpoints.isLoading && !touchpoints.data ? (
          <p className="muted">Cargando QR y etiquetas…</p>
        ) : physical.length ? (
          <TargetPicker
            groups={groups.data ?? []}
            legend="Grupos y QR o etiquetas"
            onChange={ws.setTargets}
            readOnly={ws.readOnly}
            touchpoints={touchpoints.data ?? []}
            value={ws.targets}
          />
        ) : (
          <EmptyState
            action={
              ws.canEdit ? (
                <Link
                  className="button button-primary"
                  to={{ name: "touchpoints" }}
                >
                  Crear QR o etiqueta
                </Link>
              ) : null
            }
            compact
            icon="touchpoint"
            title="Aún no tienes QR ni etiquetas"
          >
            Diseña tranquilo: cuando tengas una tarjeta, etiqueta o QR, aquí
            eliges dónde se muestra.
          </EmptyState>
        )}
      </section>

      <aside aria-label="Estado y reglas" className="xpw-targets-side">
        <TargetStatusPanel />
        <section className="xpw-rule" aria-labelledby="xpw-rule-title">
          <span aria-hidden="true" className="xpw-rule-icon">
            <Icon name="group" size={16} />
          </span>
          <div>
            <h3 id="xpw-rule-title">Gana lo más cercano</h3>
            <p>
              Elegir un grupo incluye a sus subgrupos. Si un QR o etiqueta ya
              muestra otra página asignada directamente, o desde un grupo más
              cercano, conserva esa. Los QR y etiquetas que se agreguen después
              a un grupo elegido la reciben al volver a publicar.
            </p>
          </div>
        </section>
      </aside>
    </div>
  );
}

function TargetStatusPanel() {
  const ws = useExperienceWorkspace();
  const statuses = ws.targetStatuses;
  const counts = summarizeTargetStatuses(statuses);
  const total = statuses.length;

  return (
    <section aria-labelledby="xpw-status-title" className="panel xpw-status">
      <div className="xpw-section-head">
        <h2 className="xpw-section-title" id="xpw-status-title">
          Estado por QR o etiqueta
        </h2>
        {ws.targetsChanged ? (
          <p className="xpw-section-note">
            Muestra dónde se ve según lo guardado. Guarda los cambios para
            actualizarlo.
          </p>
        ) : null}
      </div>
      {total ? (
        <>
          <div
            aria-label={summaryOrder
              .filter((kind) => counts[kind])
              .map(
                (kind) =>
                  `${counts[kind]} ${summaryLabels[kind].toLowerCase()}`,
              )
              .join(", ")}
            className="xpw-status-bar"
            role="img"
          >
            {summaryOrder.map((kind) =>
              counts[kind] ? (
                <span
                  className={`xpw-status-segment xpw-status-${kind}`}
                  key={kind}
                  style={{ flexGrow: counts[kind] }}
                />
              ) : null,
            )}
          </div>
          <ul className="xpw-status-legend">
            {summaryOrder.map((kind) =>
              counts[kind] ? (
                <li key={kind}>
                  <span
                    aria-hidden="true"
                    className={`xpw-status-swatch xpw-status-${kind}`}
                  />
                  <strong className="tabular">{counts[kind]}</strong>
                  {summaryLabels[kind]}
                </li>
              ) : null,
            )}
          </ul>
          <ul className="xpw-status-list">
            {statuses.map((target) => {
              const kind = targetStatusKind(target);
              const view = targetStatusViews[kind];
              return (
                <li key={target.touchpointId}>
                  <div className="xpw-status-row">
                    <Link to={{ name: "touchpoint", id: target.touchpointId }}>
                      {target.touchpointName}
                    </Link>
                    <StatusBadge tone={view.tone}>{view.label}</StatusBadge>
                  </div>
                  {kind === "overridden" && target.liveExperienceName ? (
                    <small>
                      Conserva «{target.liveExperienceName}» (asignación
                      directa)
                    </small>
                  ) : kind !== "live" && target.liveExperienceName ? (
                    <small>Ahora muestra: {target.liveExperienceName}</small>
                  ) : target.via === "group" ? (
                    <small>Por su grupo</small>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="xpw-empty-note">
          <Icon name="info" size={16} />
          Sin dónde se ve todavía. Elige grupos o QR y etiquetas aquí, o hazlo
          al publicar.
        </p>
      )}
    </section>
  );
}
