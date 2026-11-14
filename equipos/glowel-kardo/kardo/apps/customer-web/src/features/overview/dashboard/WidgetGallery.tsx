import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { AnalyticsRange } from "../../../api/analytics.js";
import { Icon } from "../../../components/Icon.js";
import { widgetCatalog } from "./catalog.js";
import { Drawer } from "./Drawer.js";
import { MAX_WIDGETS } from "./layout-store.js";
import { sampleWidgetContext } from "./sample-data.js";
import {
  categoryLabels,
  type WidgetCategory,
  type WidgetConfig,
  type WidgetContext,
  type WidgetDefinition,
  type WidgetInstance,
  type WidgetType,
  widgetTypes,
} from "./types.js";
import { WidgetFields } from "./WidgetFields.js";
import { WidgetPreview } from "./WidgetFrame.js";

const categories = Object.keys(categoryLabels) as WidgetCategory[];

const byCategory = categories.map((key) => ({
  key,
  definitions: widgetTypes
    .map((type) => widgetCatalog[type])
    .filter((definition) => definition.category === key),
}));

/** A widget of `definition` at its default size, for a preview. */
function sampleWidget(
  definition: WidgetDefinition,
  config: WidgetConfig,
): WidgetInstance {
  return {
    id: `sample-${definition.type}`,
    type: definition.type,
    x: 0,
    y: 0,
    w: definition.defaultSize.w,
    h: definition.defaultSize.h,
    config,
  };
}

/**
 * "Agregar widget", in two steps inside the same panel: the catalog by
 * category (every preview drawn with example numbers, never the
 * workspace's), then the chosen widget's options with a large live preview
 * and "Agregar al tablero".
 */
export function WidgetGallery({
  open,
  days,
  count,
  onAdd,
  onClose,
}: {
  open: boolean;
  /** The period on screen: the examples cover the same number of days. */
  days: AnalyticsRange;
  /** Widgets already on the board. */
  count: number;
  onAdd: (type: WidgetType, config: WidgetConfig) => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<WidgetCategory | "all">("all");
  const [chosen, setChosen] = useState<WidgetType | null>(null);
  const [draft, setDraft] = useState<WidgetConfig>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  // Where the catalog was, to come back to the same card.
  const listScroll = useRef(0);
  const returnTo = useRef<WidgetType | null>(null);

  const full = count >= MAX_WIDGETS;
  const context = sampleWidgetContext(days);
  const definition = chosen ? widgetCatalog[chosen] : null;

  // Every opening starts at the catalog. Reset once closed, so the panel
  // keeps its last step while it slides out.
  useEffect(() => {
    if (open) return;
    setChosen(null);
    returnTo.current = null;
  }, [open]);

  // A new step: its heading takes the focus (and is announced); back at
  // the catalog, the card that was chosen does, where it was.
  useLayoutEffect(() => {
    if (!open) return;
    const body = rootRef.current?.closest<HTMLElement>(".db-drawer-body");
    if (chosen) {
      if (body) body.scrollTop = 0;
      titleRef.current?.focus({ preventScroll: true });
      return;
    }
    const type = returnTo.current;
    if (!type) return;
    returnTo.current = null;
    if (body) body.scrollTop = listScroll.current;
    rootRef.current
      ?.querySelector<HTMLElement>(`[data-gallery-type="${type}"]`)
      ?.focus({ preventScroll: true });
  }, [chosen, open]);

  function choose(type: WidgetType) {
    const body = rootRef.current?.closest<HTMLElement>(".db-drawer-body");
    listScroll.current = body?.scrollTop ?? 0;
    returnTo.current = type;
    setDraft({ ...widgetCatalog[type].defaultConfig });
    setChosen(type);
  }

  const shown =
    category === "all"
      ? byCategory
      : byCategory.filter((group) => group.key === category);

  return (
    <Drawer
      description={
        definition
          ? definition.description
          : full
            ? `Tu tablero ya tiene ${MAX_WIDGETS} widgets, el máximo. Quita alguno para agregar otro.`
            : "Las vistas previas usan datos de ejemplo. Elige un widget para configurarlo; aparecerá al final del tablero."
      }
      footer={
        definition ? (
          <>
            <button
              className="button button-secondary button-small"
              onClick={() => setChosen(null)}
              type="button"
            >
              <Icon name="arrow-left" size={15} />
              Volver
            </button>
            <button
              className="button button-primary button-small"
              disabled={full}
              onClick={() => onAdd(definition.type, draft)}
              title={full ? "Llegaste al máximo de widgets" : undefined}
              type="button"
            >
              <Icon name="plus" size={15} />
              Agregar al tablero
            </button>
          </>
        ) : undefined
      }
      onClose={onClose}
      open={open}
      size="wide"
      title={definition ? definition.name : "Agregar widget"}
      titleRef={titleRef}
    >
      <div className="db-gallery" ref={rootRef}>
        {definition ? (
          <WidgetSetup
            config={draft}
            context={context}
            definition={definition}
            onChange={setDraft}
          />
        ) : (
          <>
            <fieldset className="db-chips">
              <legend className="visually-hidden">Categoría</legend>
              {(["all", ...categories] as const).map((key) => (
                <button
                  aria-pressed={category === key}
                  className="db-chip"
                  key={key}
                  onClick={() => setCategory(key)}
                  type="button"
                >
                  {key === "all" ? "Todos" : categoryLabels[key]}
                </button>
              ))}
            </fieldset>
            {shown.map((group) => (
              <section
                aria-labelledby={`db-gallery-${group.key}`}
                className="db-gallery-group"
                key={group.key}
              >
                <h3
                  className="db-gallery-heading"
                  id={`db-gallery-${group.key}`}
                >
                  {categoryLabels[group.key]}
                </h3>
                <ul className="db-gallery-list">
                  {group.definitions.map((item) => (
                    <GalleryCard
                      context={context}
                      definition={item}
                      key={item.type}
                      onChoose={choose}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}
      </div>
    </Drawer>
  );
}

/** One option of the catalog: the whole card chooses it. */
function GalleryCard({
  definition,
  context,
  onChoose,
}: {
  definition: WidgetDefinition;
  context: WidgetContext;
  onChoose: (type: WidgetType) => void;
}) {
  const descriptionId = useId();
  return (
    <li className="db-gallery-card">
      <div className="db-gallery-stage">
        <WidgetPreview
          context={context}
          widget={sampleWidget(definition, definition.defaultConfig)}
        />
        <span aria-hidden="true" className="db-sample-tag">
          Ejemplo
        </span>
      </div>
      <div className="db-gallery-copy">
        <h4 className="db-gallery-name">
          <button
            aria-describedby={descriptionId}
            className="db-gallery-pick"
            data-gallery-type={definition.type}
            onClick={() => onChoose(definition.type)}
            type="button"
          >
            {definition.name}
          </button>
        </h4>
        <p id={descriptionId}>{definition.description}</p>
      </div>
    </li>
  );
}

/** The chosen widget: a large preview with example numbers that follows
 * its options, the options themselves and how to read it. */
function WidgetSetup({
  definition,
  config,
  context,
  onChange,
}: {
  definition: WidgetDefinition;
  config: WidgetConfig;
  context: WidgetContext;
  onChange: (config: WidgetConfig) => void;
}) {
  const helpId = useId();
  return (
    <div className="db-setup">
      <figure className="db-setup-stage">
        <WidgetPreview
          context={context}
          size="stage"
          widget={sampleWidget(definition, config)}
        />
        <figcaption className="db-sample-note">
          <Icon name="info" size={14} />
          Vista previa con datos de ejemplo. En tu tablero verás tus propios
          números.
        </figcaption>
      </figure>
      {definition.fields.length ? (
        <section aria-label="Opciones" className="db-setup-options">
          <WidgetFields
            config={config}
            definition={definition}
            onChange={onChange}
          />
        </section>
      ) : (
        <p className="db-fields-empty">
          Este widget no tiene opciones. En el tablero puedes moverlo, cambiar
          su tamaño o duplicarlo.
        </p>
      )}
      <section aria-labelledby={helpId} className="db-setup-help">
        <h3 id={helpId}>Cómo leerlo</h3>
        <p>{definition.help}</p>
      </section>
    </div>
  );
}
