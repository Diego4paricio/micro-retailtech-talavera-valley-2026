import { type ReactNode, useEffect, useMemo, useState } from "react";
import { type Layout, ResponsiveGridLayout } from "react-grid-layout";
import { bottom, verticalCompactor } from "react-grid-layout/core";
import { GridBackground } from "react-grid-layout/extras";
import "react-grid-layout/css/styles.css";
import {
  GRID_GAP,
  type GridBreakpoint,
  gridBreakpoints,
  gridCols,
  gridLayouts,
  ROW_HEIGHT,
  readingOrder,
} from "./grid-model.js";
import type { WidgetInstance } from "./types.js";

const margin = [GRID_GAP, GRID_GAP] as const;
const padding = [0, 0] as const;
/** Clicks on controls inside a widget never start a drag. */
const dragCancel =
  "button, a, input, select, textarea, label, [role='menu'], .db-no-drag";

/**
 * The board on react-grid-layout: 12 columns on wide screens, the same board
 * at half resolution on 6 columns and a single stacked column on phones. In
 * edit mode widgets are dragged (and, with columns to spare, resized) while
 * the others slide out of the way live.
 */
export function DashboardGrid({
  width,
  breakpoint,
  widgets,
  editing,
  canDrag,
  dragHandle,
  isStale,
  isSkeleton,
  renderWidget,
  onLayoutCommit,
}: {
  width: number;
  breakpoint: GridBreakpoint;
  widgets: readonly WidgetInstance[];
  editing: boolean;
  canDrag: boolean;
  /** CSS selector of what starts a drag. */
  dragHandle: string;
  isStale: boolean;
  isSkeleton: boolean;
  renderWidget: (widget: WidgetInstance, index: number) => ReactNode;
  /** The 12-column layout after a drag or a resize ends. */
  onLayoutCommit: (layout: Layout) => void;
}) {
  const layouts = useMemo(() => gridLayouts(widgets), [widgets]);
  const ordered = useMemo(() => readingOrder(widgets), [widgets]);
  const [active, setActive] = useState(false);

  // Items would glide in from the top-left corner on the first paint: turn
  // transitions on only once the board has been placed.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let second = 0;
    const first = window.requestAnimationFrame(() => {
      second = window.requestAnimationFrame(() => setReady(true));
    });
    return () => {
      window.cancelAnimationFrame(first);
      window.cancelAnimationFrame(second);
    };
  }, []);

  const cols = gridCols[breakpoint];
  const rows = bottom(layouts[breakpoint]);

  return (
    <div
      className={[
        "db-grid",
        ready && "db-grid-ready",
        editing && "db-grid-editing",
        active && "db-grid-active",
        isStale && "db-grid-stale",
        isSkeleton && "db-grid-skeleton",
      ]
        .filter(Boolean)
        .join(" ")}
      data-breakpoint={breakpoint}
    >
      {editing && canDrag ? (
        <GridBackground
          borderRadius={10}
          className="db-grid-guides"
          cols={cols}
          containerPadding={padding}
          margin={margin}
          rowHeight={ROW_HEIGHT}
          rows={rows + 3}
          width={width}
        />
      ) : null}
      <ResponsiveGridLayout
        breakpoint={breakpoint}
        breakpoints={gridBreakpoints}
        cols={gridCols}
        compactor={verticalCompactor}
        containerPadding={padding}
        dragConfig={{
          enabled: canDrag,
          handle: dragHandle,
          cancel: dragCancel,
          threshold: 4,
        }}
        layouts={layouts}
        margin={margin}
        onDragStart={() => setActive(true)}
        onDragStop={(layout) => {
          setActive(false);
          onLayoutCommit(layout);
        }}
        onResizeStart={() => setActive(true)}
        onResizeStop={(layout) => {
          setActive(false);
          onLayoutCommit(layout);
        }}
        resizeConfig={{
          // One column has nothing to resize across.
          enabled: canDrag && breakpoint !== "sm",
          handles: ["se"],
        }}
        rowHeight={ROW_HEIGHT}
        width={width}
      >
        {ordered.map((widget, index) => (
          <div className="db-item" data-widget-id={widget.id} key={widget.id}>
            {renderWidget(widget, index)}
          </div>
        ))}
      </ResponsiveGridLayout>
    </div>
  );
}
