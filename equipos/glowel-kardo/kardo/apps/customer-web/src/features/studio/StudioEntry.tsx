import type { ExperienceContent } from "@kardo/contracts";
import { Icon } from "../../components/Icon.js";
import { Link, type Route } from "../../lib/router.js";
import { contentDesign } from "./model/content.js";

/**
 * The way into the Estudio, at the top of a page's design area: large,
 * explicit and impossible to miss.
 */
export function StudioEntryCard({
  to,
  content,
  readOnly,
  actionLabel = "Abrir el Estudio",
}: {
  to: Route;
  content: ExperienceContent;
  readOnly?: boolean | undefined;
  actionLabel?: string | undefined;
}) {
  const designed = contentDesign(content) !== null;
  return (
    <section aria-label="Estudio de diseño" className="es-entry">
      <span aria-hidden="true" className="es-entry-mark">
        <Icon name="template" size={20} />
      </span>
      <div className="es-entry-copy">
        <p className="es-entry-kicker">
          Estudio de diseño
          {designed ? (
            <span className="es-entry-badge">Diseño activo</span>
          ) : null}
        </p>
        <strong>
          {designed
            ? "Tu página tiene un diseño propio"
            : "Personaliza toda la página"}
        </strong>
        <p>
          {designed
            ? "Ajusta secciones, columnas, bloques, fondos y tipografías en el Estudio, junto con todo el contenido."
            : "Plantillas por giro, bloques que arrastras, columnas, fondos con foto y tipografías, sobre la vista previa real."}
        </p>
      </div>
      <Link className="button button-primary es-entry-action" to={to}>
        <Icon name="palette" size={16} />
        {readOnly ? "Ver en el Estudio" : actionLabel}
      </Link>
    </section>
  );
}
