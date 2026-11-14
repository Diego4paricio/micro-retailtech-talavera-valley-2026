import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Layout, useContainerWidth } from "react-grid-layout";
import type { AnalyticsRange } from "../../../api/analytics.js";
import { ConfirmDialog } from "../../../components/Dialog.js";
import { Icon } from "../../../components/Icon.js";
import {
  exitDurations,
  prefersReducedMotion,
} from "../../../components/motion.js";
import { Notice } from "../../../components/Notice.js";
import { useToast } from "../../../components/Toast.js";
import { widgetCatalog } from "./catalog.js";
import { DashboardGrid } from "./DashboardGrid.js";
import { EditBar } from "./EditBar.js";
import {
  appendWidget,
  applyGridLayout,
  breakpointFor,
  describeWidth,
  duplicateWidget,
  moveWidget,
  orderIndex,
  readingOrder,
  removeWidget,
  resizeWidget,
  restoreWidget,
  samePlacement,
  stepHeight,
  stepWidth,
} from "./grid-model.js";
import {
  createWidget,
  type DashboardLayoutStore,
  MAX_WIDGETS,
} from "./layout-store.js";
import type {
  WidgetConfig,
  WidgetContext,
  WidgetInstance,
  WidgetType,
} from "./types.js";
import { WidgetEditor } from "./WidgetEditor.js";
import { WidgetFrame, WidgetSkeleton } from "./WidgetFrame.js";
import { WidgetGallery } from "./WidgetGallery.js";
import type { WidgetAction, WidgetAvailability } from "./WidgetMenu.js";

const titleOf = (widget: WidgetInstance) =>
  widgetCatalog[widget.type].title(widget.config);

/** Touch screens drag by the grip only, so the page still scrolls. */
function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(
    () =>
      typeof window !== "undefined" &&
      Boolean(window.matchMedia?.("(pointer: coarse)").matches),
  );
  useEffect(() => {
    const query = window.matchMedia?.("(pointer: coarse)");
    if (!query) return;
    const listener = () => setCoarse(query.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);
  return coarse;
}

/**
 * The Resumen board: the grid, its edit mode (drag, resize, add, edit,
 * remove, reset) and the keyboard alternatives in each widget's menu.
 * Every change goes through the layout store, which saves it on its own.
 */
export function Dashboard({
  store,
  context,
  days,
  isStale,
  editing,
  onEditingChange,
}: {
  store: DashboardLayoutStore;
  /** Null while the first numbers load: the board shows its skeleton. */
  context: WidgetContext | null;
  /** The period on screen: the gallery's example numbers use it too. */
  days: AnalyticsRange;
  isStale: boolean;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
}) {
  const { widgets, update, reset, status } = store;
  const { notify } = useToast();
  const { width, containerRef, mounted } = useContainerWidth({
    measureBeforeMount: true,
  });
  const breakpoint = breakpointFor(width);
  const coarse = useCoarsePointer();
  // Every breakpoint can be rearranged by dragging (see `applyGridLayout`).
  const canDrag = editing && context !== null;

  const [galleryOpen, setGalleryOpen] = useState(false);
  const [editorId, setEditorId] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  // Menu actions may fire again before a re-render (the menu stays open to
  // repeat a step): always start from the latest board.
  const widgetsRef = useRef(widgets);
  widgetsRef.current = widgets;

  const announce = useCallback((text: string) => {
    // Cleared first, so repeating the same message is announced again.
    setMessage("");
    window.setTimeout(() => setMessage(text), 60);
  }, []);

  const focusMenu = useCallback(
    (id: string | undefined) => {
      window.requestAnimationFrame(() => {
        if (!id) return;
        containerRef.current
          ?.querySelector<HTMLElement>(`[data-widget-menu="${id}"]`)
          ?.focus();
      });
    },
    [containerRef],
  );

  // A new widget: bring it into view and light it up for a moment. The
  // scroll waits for the gallery to finish closing: returning focus to its
  // opener would otherwise cancel a smooth scroll halfway.
  useEffect(() => {
    if (!highlightId) return;
    const scroll = window.setTimeout(() => {
      containerRef.current
        ?.querySelector(`[data-widget-id="${highlightId}"]`)
        ?.scrollIntoView({
          behavior: prefersReducedMotion() ? "auto" : "smooth",
          block: "center",
        });
    }, exitDurations.slow + 40);
    const clear = window.setTimeout(() => setHighlightId(null), 3200);
    return () => {
      window.clearTimeout(scroll);
      window.clearTimeout(clear);
    };
  }, [highlightId, containerRef]);

  // Escape leaves edit mode, unless it is closing a menu, a panel or a
  // widget's help.
  useEffect(() => {
    if (!editing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector("dialog[open], [role='menu'], .db-help"))
        return;
      onEditingChange(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [editing, onEditingChange]);

  const remove = useCallback(
    (id: string) => {
      const current = widgetsRef.current;
      const removed = current.find((widget) => widget.id === id);
      if (!removed) return;
      const index = orderIndex(current, id);
      const next = removeWidget(current, id);
      update(next);
      setEditorId((open) => (open === id ? null : open));
      const title = titleOf(removed);
      notify(`Quitaste «${title}» del tablero.`, "info", {
        action: {
          label: "Deshacer",
          onClick: () => {
            update(restoreWidget(widgetsRef.current, removed));
            announce(`«${title}» volvió al tablero.`);
          },
        },
      });
      const order = readingOrder(next);
      focusMenu(order[Math.min(index, order.length - 1)]?.id);
    },
    [update, notify, announce, focusMenu],
  );

  const act = useCallback(
    (id: string, action: WidgetAction) => {
      const current = widgetsRef.current;
      const widget = current.find((item) => item.id === id);
      if (!widget) return;
      const title = titleOf(widget);
      switch (action) {
        case "edit":
          setEditorId(id);
          return;
        case "remove":
          remove(id);
          return;
        case "duplicate": {
          const result = duplicateWidget(current, id);
          if (!result) return;
          update(result.widgets);
          setHighlightId(result.copy.id);
          announce(`Duplicaste «${title}».`);
          return;
        }
        case "before":
        case "after": {
          const next = moveWidget(current, id, action === "before" ? -1 : 1);
          if (samePlacement(next, current)) return;
          update(next);
          announce(
            `«${title}» ahora es el ${orderIndex(next, id) + 1} de ${next.length}.`,
          );
          return;
        }
        case "wider":
        case "narrower": {
          const w = stepWidth(widget, action === "wider" ? 1 : -1);
          if (w === null) return;
          update(resizeWidget(current, id, { w }));
          announce(`«${title}» ocupa ${describeWidth(w)}.`);
          return;
        }
        case "taller":
        case "shorter": {
          const h = stepHeight(widget, action === "taller" ? 1 : -1);
          if (h === null) return;
          update(resizeWidget(current, id, { h }));
          announce(`«${title}» mide ${h} filas de alto.`);
          return;
        }
      }
    },
    [update, remove, announce],
  );

  const add = useCallback(
    (type: WidgetType, config: WidgetConfig) => {
      const current = widgetsRef.current;
      if (current.length >= MAX_WIDGETS) return;
      const widget = createWidget(type, current, config);
      update(appendWidget(current, widget));
      setGalleryOpen(false);
      setHighlightId(widget.id);
      announce(`Agregaste «${titleOf(widget)}» al final del tablero.`);
    },
    [update, announce],
  );

  const commitLayout = useCallback(
    (layout: Layout) => {
      const current = widgetsRef.current;
      const next = applyGridLayout(current, layout, breakpoint);
      if (!samePlacement(current, next)) update(next);
    },
    [update, breakpoint],
  );

  const retrySave = useCallback(() => update(widgetsRef.current), [update]);

  async function resetBoard() {
    setResetting(true);
    await reset();
    setResetting(false);
    setConfirmReset(false);
    setEditorId(null);
    announce("El tablero volvió a su forma inicial.");
  }

  const order = useMemo(
    () => new Map(readingOrder(widgets).map((widget, i) => [widget.id, i])),
    [widgets],
  );
  const availability = (widget: WidgetInstance): WidgetAvailability => {
    const index = order.get(widget.id) ?? 0;
    return {
      edit: widgetCatalog[widget.type].fields.length > 0,
      duplicate: widgets.length < MAX_WIDGETS,
      before: index > 0,
      after: index < widgets.length - 1,
      wider: stepWidth(widget, 1) !== null,
      narrower: stepWidth(widget, -1) !== null,
      taller: stepHeight(widget, 1) !== null,
      shorter: stepHeight(widget, -1) !== null,
      showWidth: breakpoint !== "sm",
    };
  };

  const editorWidget = widgets.find((widget) => widget.id === editorId) ?? null;
  const canAdd = widgets.length < MAX_WIDGETS;
  const isEmpty = widgets.length === 0;

  return (
    <div className={editing ? "db-board db-board-editing" : "db-board"}>
      {status === "error" && !editing ? (
        <Notice
          action={
            <button className="text-action" onClick={retrySave} type="button">
              Reintentar
            </button>
          }
          title="No pudimos guardar los cambios del tablero"
          tone="warning"
        >
          Se ven aquí, pero se perderán al salir si no se guardan.
        </Notice>
      ) : null}

      <div
        aria-busy={context === null || undefined}
        className="db-canvas"
        ref={containerRef}
      >
        {context === null ? (
          <span className="visually-hidden" role="status">
            Cargando el resumen…
          </span>
        ) : null}
        {mounted && isEmpty && context ? (
          <div className="db-empty">
            <span aria-hidden="true" className="db-empty-mark">
              <Icon name="board" size={22} />
            </span>
            <h2>Tu tablero está vacío</h2>
            <p>
              Agrega los indicadores y gráficas que quieras ver primero, o
              vuelve al tablero inicial de Kardo.
            </p>
            <div className="db-empty-actions">
              <button
                className="button button-primary"
                onClick={() => {
                  onEditingChange(true);
                  setGalleryOpen(true);
                }}
                type="button"
              >
                <Icon name="plus" size={16} /> Agregar widget
              </button>
              <button
                className="button button-secondary"
                onClick={() => setConfirmReset(true)}
                type="button"
              >
                <Icon name="reset" size={16} /> Restablecer tablero
              </button>
            </div>
          </div>
        ) : null}
        {mounted && !isEmpty ? (
          <DashboardGrid
            breakpoint={breakpoint}
            canDrag={canDrag}
            dragHandle=".db-drag-handle"
            editing={editing && context !== null}
            isSkeleton={context === null}
            isStale={isStale}
            onLayoutCommit={commitLayout}
            renderWidget={(widget, index) =>
              context ? (
                <WidgetFrame
                  availability={availability(widget)}
                  context={context}
                  dragHandle={canDrag ? (coarse ? "grip" : "widget") : null}
                  editing={editing}
                  highlighted={widget.id === highlightId}
                  onAction={(action) => act(widget.id, action)}
                  widget={widget}
                />
              ) : (
                <WidgetSkeleton index={index} widget={widget} />
              )
            }
            widgets={widgets}
            width={width}
          />
        ) : null}
      </div>

      <p aria-live="polite" className="visually-hidden">
        {message}
      </p>

      {editing ? (
        <EditBar
          canAdd={canAdd}
          canDrag
          onAdd={() => setGalleryOpen(true)}
          onDone={() => onEditingChange(false)}
          onReset={() => setConfirmReset(true)}
          onRetry={retrySave}
          status={status}
        />
      ) : null}

      <WidgetGallery
        count={widgets.length}
        days={days}
        onAdd={add}
        onClose={() => setGalleryOpen(false)}
        open={galleryOpen}
      />

      <WidgetEditor
        context={context}
        onChange={(config) => {
          if (!editorId) return;
          update(
            widgetsRef.current.map((widget) =>
              widget.id === editorId ? { ...widget, config } : widget,
            ),
          );
        }}
        onClose={() => setEditorId(null)}
        onRemove={() => {
          if (editorId) remove(editorId);
        }}
        widget={editorWidget}
      />

      <ConfirmDialog
        confirmLabel="Restablecer"
        description="Vuelve al tablero inicial de Kardo. Los widgets que agregaste y sus opciones se pierden."
        isBusy={resetting}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => void resetBoard()}
        open={confirmReset}
        title="¿Restablecer el tablero?"
        tone="danger"
      />
    </div>
  );
}
