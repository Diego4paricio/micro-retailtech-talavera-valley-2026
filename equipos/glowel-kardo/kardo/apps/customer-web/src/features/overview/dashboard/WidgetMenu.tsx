import { DropdownMenu } from "radix-ui";
import { Icon, type IconName } from "../../../components/Icon.js";

export type WidgetAction =
  | "edit"
  | "duplicate"
  | "before"
  | "after"
  | "wider"
  | "narrower"
  | "taller"
  | "shorter"
  | "remove";

/** Which actions apply to a widget right now (limits, position, screen). */
export type WidgetAvailability = Record<
  Exclude<WidgetAction, "remove">,
  boolean
> & {
  /** Widths only matter where the board has columns (not on phones). */
  showWidth: boolean;
};

/** Moving and resizing keep the menu open, so the step can be repeated. */
const repeatable = new Set<WidgetAction>([
  "before",
  "after",
  "wider",
  "narrower",
  "taller",
  "shorter",
]);

/**
 * The ⋯ menu of a widget: the keyboard (and touch) alternative to dragging
 * and resizing, plus edit, duplicate and remove. Available in and out of
 * edit mode.
 */
export function WidgetMenu({
  widgetId,
  title,
  availability,
  onAction,
}: {
  widgetId: string;
  title: string;
  availability: WidgetAvailability;
  onAction: (action: WidgetAction) => void;
}) {
  const item = (
    action: WidgetAction,
    icon: IconName,
    label: string,
    enabled = true,
  ) => (
    <DropdownMenu.Item
      className={
        action === "remove"
          ? "kd-dropdown-item kd-dropdown-item-danger"
          : "kd-dropdown-item"
      }
      disabled={!enabled}
      onSelect={(event) => {
        if (repeatable.has(action)) event.preventDefault();
        onAction(action);
      }}
    >
      <Icon name={icon} size={15} />
      {label}
    </DropdownMenu.Item>
  );

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          aria-label={`Opciones de «${title}»`}
          className="db-icon-button db-no-drag"
          data-widget-menu={widgetId}
          type="button"
        >
          <Icon name="more" size={18} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          className="kd-dropdown-content db-menu"
          collisionPadding={12}
          sideOffset={6}
        >
          {availability.edit ? item("edit", "edit", "Editar…") : null}
          {item("duplicate", "duplicate", "Duplicar", availability.duplicate)}
          <DropdownMenu.Separator className="kd-dropdown-separator" />
          {item("before", "arrow-left", "Mover antes", availability.before)}
          {item("after", "arrow-right", "Mover después", availability.after)}
          <DropdownMenu.Separator className="kd-dropdown-separator" />
          {availability.showWidth ? (
            <>
              {item("wider", "wider", "Más ancho", availability.wider)}
              {item(
                "narrower",
                "narrower",
                "Menos ancho",
                availability.narrower,
              )}
            </>
          ) : null}
          {item("taller", "taller", "Más alto", availability.taller)}
          {item("shorter", "shorter", "Menos alto", availability.shorter)}
          <DropdownMenu.Separator className="kd-dropdown-separator" />
          {item("remove", "trash", "Quitar")}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
