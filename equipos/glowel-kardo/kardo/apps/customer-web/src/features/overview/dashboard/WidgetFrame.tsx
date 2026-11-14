import { Component, type CSSProperties, type ReactNode } from "react";
import { Icon } from "../../../components/Icon.js";
import { widgetRenderers } from "../widgets/index.js";
import { widgetCatalog } from "./catalog.js";
import { columnsToPixels, rowsToPixels } from "./grid-model.js";
import type { WidgetContext, WidgetInstance } from "./types.js";
import { WidgetHelp } from "./WidgetHelp.js";
import {
  type WidgetAction,
  type WidgetAvailability,
  WidgetMenu,
} from "./WidgetMenu.js";

const classes = (...names: (string | false | null | undefined)[]) =>
  names.filter(Boolean).join(" ");

/**
 * One widget on the board. `titled` widgets get a sheet with their title,
 * its (i) help and the menu around the renderer's body; `bare` ones (KPI
 * cards, with their own (i)) are drawn whole by the renderer and only get
 * the menu, floating over the card.
 *
 * In edit mode the whole card (or only the grip, on touch screens) is the
 * drag handle and a remove button joins the menu.
 */
export function WidgetFrame({
  widget,
  context,
  editing,
  dragHandle,
  highlighted,
  availability,
  onAction,
}: {
  widget: WidgetInstance;
  context: WidgetContext;
  editing: boolean;
  /** What starts a drag: the whole card, only the grip, or nothing. */
  dragHandle: "widget" | "grip" | null;
  highlighted: boolean;
  availability: WidgetAvailability;
  onAction: (action: WidgetAction) => void;
}) {
  const definition = widgetCatalog[widget.type];
  const title = definition.title(widget.config);
  const Renderer = widgetRenderers[widget.type];
  const bare = definition.frame === "bare";

  const grip = dragHandle ? (
    <span
      aria-hidden="true"
      className={classes("db-grip", dragHandle === "grip" && "db-drag-handle")}
      title="Arrastra para mover"
    >
      <Icon name="grip" size={16} />
    </span>
  ) : null;

  const tools = (
    <div className="db-widget-tools">
      <WidgetMenu
        availability={availability}
        onAction={onAction}
        title={title}
        widgetId={widget.id}
      />
      {editing ? (
        <button
          aria-label={`Quitar «${title}»`}
          className="db-icon-button db-remove db-no-drag"
          onClick={() => onAction("remove")}
          title="Quitar"
          type="button"
        >
          <Icon name="close" size={16} />
        </button>
      ) : null}
    </div>
  );

  const body = (
    <div className="db-widget-body">
      <WidgetBoundary
        resetKey={`${JSON.stringify(widget.config)}|${context.data.generatedAt}`}
      >
        <Renderer context={context} widget={widget} />
      </WidgetBoundary>
    </div>
  );

  const className = classes(
    "db-widget",
    bare ? "db-widget-bare" : "db-widget-titled",
    editing && "db-widget-editing",
    highlighted && "db-widget-new",
    dragHandle === "widget" && "db-drag-handle",
  );

  if (bare)
    return (
      <div className={className}>
        {body}
        <div className="db-widget-float">
          {grip}
          {tools}
        </div>
      </div>
    );

  return (
    <div className={className}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: double-click is a mouse shortcut; the menu's "Editar…" is the accessible path */}
      <header
        className="db-widget-head"
        onDoubleClick={
          editing && availability.edit ? () => onAction("edit") : undefined
        }
      >
        {grip}
        <div className="db-widget-heading">
          <h2 className="db-widget-title">{title}</h2>
          <WidgetHelp text={definition.help} title={title} />
        </div>
        {tools}
      </header>
      {body}
    </div>
  );
}

/** The board's shape while the first numbers load. */
export function WidgetSkeleton({
  widget,
  index,
}: {
  widget: WidgetInstance;
  index: number;
}) {
  const style = { "--db-i": index } as CSSProperties;
  if (widgetCatalog[widget.type].frame === "bare")
    return (
      <div
        aria-hidden="true"
        className="db-widget db-widget-bare db-skeleton-card"
        style={style}
      >
        <span className="db-bone db-bone-label" />
        <span className="db-bone db-bone-value" />
        <span className="db-bone db-bone-foot" />
      </div>
    );
  return (
    <div
      aria-hidden="true"
      className="db-widget db-widget-titled db-skeleton-card"
      style={style}
    >
      <div className="db-widget-head">
        <span className="db-bone db-bone-title" />
      </div>
      <div className="db-widget-body">
        <span className="db-bone db-bone-block" />
      </div>
    </div>
  );
}

/**
 * A live, inert miniature of a widget: with example numbers in the gallery,
 * with the workspace's own in the editor. The renderer receives `preview` to
 * draw compactly. `small` fits a gallery card; `large` shows the widget at
 * its height (capped) across the panel; `stage` also at the width it takes
 * on a full-width board.
 */
export function WidgetPreview({
  widget,
  context,
  size = "small",
}: {
  widget: WidgetInstance;
  context: WidgetContext | null;
  size?: "small" | "large" | "stage" | undefined;
}) {
  const definition = widgetCatalog[widget.type];
  const Renderer = widgetRenderers[widget.type];
  const content = context ? (
    <WidgetBoundary resetKey={JSON.stringify(widget.config)}>
      <Renderer context={context} preview widget={widget} />
    </WidgetBoundary>
  ) : (
    <span className="db-bone db-bone-block" />
  );
  return (
    <div
      aria-hidden="true"
      className={`db-preview db-preview-${size} db-preview-${definition.frame}`}
      inert
      // Large previews take the widget's real size (capped in CSS).
      style={
        size === "small"
          ? undefined
          : ({
              "--db-preview-h": `${rowsToPixels(widget.h)}px`,
              "--db-preview-w": `${columnsToPixels(widget.w)}px`,
            } as CSSProperties)
      }
    >
      {definition.frame === "bare" ? (
        <div className="db-preview-card">{content}</div>
      ) : (
        <div className="db-widget db-widget-titled">
          <div className="db-widget-head">
            <p className="db-widget-title">{definition.title(widget.config)}</p>
          </div>
          <div className="db-widget-body">{content}</div>
        </div>
      )}
    </div>
  );
}

/** One failing widget never takes the board down with it. */
class WidgetBoundary extends Component<
  { resetKey: string; children: ReactNode },
  { failed: boolean; resetKey: string }
> {
  state = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  static getDerivedStateFromProps(
    props: { resetKey: string },
    state: { failed: boolean; resetKey: string },
  ) {
    return props.resetKey === state.resetKey
      ? null
      : { failed: false, resetKey: props.resetKey };
  }

  render() {
    return this.state.failed ? (
      <p className="db-widget-error">
        <Icon name="circle-alert" size={16} /> No pudimos mostrar este widget.
      </p>
    ) : (
      this.props.children
    );
  }
}
