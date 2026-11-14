import { formatNumber } from "../../../lib/format.js";
import { Link } from "../../../lib/router.js";
import { effectiveKind, touchpointKindLabels } from "../../touchpoints/kind.js";
import {
  PieceThumb,
  pieceKindLabel,
  pieceModelOf,
} from "../../touchpoints/pieces/PieceThumb.js";
import type { WidgetRenderProps } from "../dashboard/types.js";
import { hasUnknownSilentTail } from "./charts/aggregate.js";

const limit = 8;

/** Active Touchpoints nobody opened in the period: the list to walk through
 * (a tag that fell off, a QR behind a menu stand, a table never used). */
export function SilentWidget({ context }: WidgetRenderProps) {
  const active = context.touchpoints.filter((item) => item.status === "active");

  if (!context.engineAvailable)
    return (
      <p className="kw-empty">Disponible cuando vuelva la analítica en vivo.</p>
    );
  if (active.length === 0)
    return (
      <p className="kw-empty">
        No hay QR ni etiquetas activos en este alcance.
      </p>
    );

  const dataTouchpoints = context.data.touchpoints;
  const tapsById = new Map(
    dataTouchpoints.map((item) => [item.touchpointId, item.taps]),
  );
  // A9-23: marking a Touchpoint that never made the capped list as "sin
  // accesos" would be a guess once the cut's tail is no longer known to be
  // all zeros — see `hasUnknownSilentTail`.
  const unknownTail = hasUnknownSilentTail(
    context.data.touchpointsOmitted,
    dataTouchpoints.map((item) => item.taps),
  );
  const silent = unknownTail
    ? active.filter((item) => tapsById.get(item.id) === 0)
    : active.filter((item) => !tapsById.get(item.id));

  if (silent.length === 0)
    return (
      <p className="kw-empty kw-empty-good">
        Todos tus QR y etiquetas activos recibieron accesos en este periodo.
      </p>
    );

  const shown = silent.slice(0, limit);
  return (
    <div className="kw-fill-col">
      {unknownTail ? (
        <p className="kw-widget-foot">
          Tienes muchos QR y etiquetas: solo revisamos los más visitados, así
          que puede haber más sin accesos.
        </p>
      ) : null}
      <ul className="kw-silent kw-fill">
        {shown.map((touchpoint) => (
          <li key={touchpoint.id}>
            <Link
              to={
                touchpoint.kind === "link"
                  ? { name: "link", id: touchpoint.id }
                  : { name: "touchpoint", id: touchpoint.id }
              }
            >
              {touchpoint.operationalName}
            </Link>
            <span className="kw-silent-kind">
              {pieceModelOf(touchpoint) ? (
                <>
                  <PieceThumb
                    model={pieceModelOf(touchpoint) ?? "card"}
                    size={18}
                  />
                  {pieceKindLabel(pieceModelOf(touchpoint) ?? "card")}
                </>
              ) : touchpoint.kind === "link" ? (
                "Link"
              ) : (
                touchpointKindLabels[effectiveKind(touchpoint.kind)]
              )}
            </span>
          </li>
        ))}
      </ul>
      {silent.length > shown.length ? (
        <p className="kw-widget-foot">
          Y {formatNumber(silent.length - shown.length)} más.{" "}
          <Link to={{ name: "touchpoints" }}>Ver QR y etiquetas</Link>
        </p>
      ) : null}
    </div>
  );
}
