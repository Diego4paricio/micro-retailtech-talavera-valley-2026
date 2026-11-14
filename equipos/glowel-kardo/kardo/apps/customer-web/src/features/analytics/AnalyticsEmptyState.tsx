import { EmptyState } from "../../components/EmptyState.js";
import { Link } from "../../lib/router.js";
import type { AnalyticsEmptyKind } from "./analytics-empty.js";

/**
 * A9-29: the period has no accesses, clicks or requests. One of two
 * messages, depending on whether there is even a page published to visit —
 * shown above the widgets/charts, which keep rendering underneath (in
 * Resumen, the board stays visible: the owner arranges it).
 */
export function AnalyticsEmptyState({
  kind,
  days,
}: {
  kind: Exclude<AnalyticsEmptyKind, null>;
  days: number;
}) {
  if (kind === "unpublished") {
    return (
      <EmptyState
        action={
          <Link className="button button-primary" to={{ name: "experiences" }}>
            Ver páginas
          </Link>
        }
        icon="analytics"
        title="Todavía no hay visitas"
      >
        Publica una página en un QR o un link y aquí verás quién la abre.
      </EmptyState>
    );
  }
  return (
    <EmptyState
      action={
        <Link className="button button-primary" to={{ name: "touchpoints" }}>
          Ver QR y etiquetas
        </Link>
      }
      icon="analytics"
      title={`Aún no hay visitas en estos ${days} días`}
    >
      Escanea tu QR o abre tu link para probarlo. Las visitas tardan unos
      minutos en aparecer.
    </EmptyState>
  );
}
