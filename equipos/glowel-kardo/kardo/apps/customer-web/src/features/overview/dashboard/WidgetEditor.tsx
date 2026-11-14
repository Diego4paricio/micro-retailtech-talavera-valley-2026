import { Icon } from "../../../components/Icon.js";
import { widgetCatalog } from "./catalog.js";
import { Drawer } from "./Drawer.js";
import type { WidgetConfig, WidgetContext, WidgetInstance } from "./types.js";
import { WidgetFields } from "./WidgetFields.js";
import { WidgetPreview } from "./WidgetFrame.js";

/**
 * Side panel with the options of a widget already on the board. Every change
 * applies (and saves) at once; the preview (with the workspace's own
 * numbers) and the board behind the light scrim follow along.
 */
export function WidgetEditor({
  widget,
  context,
  onChange,
  onRemove,
  onClose,
}: {
  /** The widget being edited, or null when the panel is closed. */
  widget: WidgetInstance | null;
  context: WidgetContext | null;
  onChange: (config: WidgetConfig) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const definition = widget ? widgetCatalog[widget.type] : null;
  return (
    <Drawer
      description={definition?.description}
      footer={
        <>
          <button
            className="button button-danger-quiet button-small"
            onClick={onRemove}
            type="button"
          >
            <Icon name="trash" size={15} />
            Quitar widget
          </button>
          <button
            className="button button-primary button-small"
            onClick={onClose}
            type="button"
          >
            Listo
          </button>
        </>
      }
      onClose={onClose}
      open={widget !== null}
      scrim="light"
      title={widget && definition ? definition.title(widget.config) : ""}
    >
      {widget && definition ? (
        <>
          <WidgetPreview context={context} size="large" widget={widget} />
          {definition.fields.length ? (
            <WidgetFields
              config={widget.config}
              definition={definition}
              onChange={onChange}
            />
          ) : (
            <p className="db-fields-empty">
              Este widget no tiene opciones. Puedes moverlo, cambiar su tamaño o
              duplicarlo desde su menú.
            </p>
          )}
          <p className="db-fields-note">
            <Icon name="check" size={14} /> Los cambios se aplican y se guardan
            al instante.
          </p>
        </>
      ) : null}
    </Drawer>
  );
}
