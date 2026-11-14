import {
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  useState,
} from "react";

/**
 * One cursor per chart: pointer, touch and keyboard (←/→, Home/End, Esc)
 * all move the same "active index", so hover and focus show the same detail.
 * The plot is a single tab stop instead of one per bar or day.
 */
export function useChartCursor({
  count,
  svgRef,
  svgWidth,
  indexAt,
}: {
  count: number;
  svgRef: RefObject<SVGSVGElement | null>;
  svgWidth: number;
  /** Maps an x in SVG units to the nearest data index. */
  indexAt: (x: number) => number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const current = active !== null && active < count ? active : null;
  const clamp = (index: number) => Math.max(0, Math.min(count - 1, index));

  function fromPointer(event: PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg || !count) return;
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return;
    const x = ((event.clientX - rect.left) * svgWidth) / rect.width;
    setActive(clamp(indexAt(x)));
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!count) return;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
        next = current === null ? count - 1 : clamp(current + 1);
        break;
      case "ArrowLeft":
        next = current === null ? count - 1 : clamp(current - 1);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = count - 1;
        break;
      case "Escape":
        setActive(null);
        return;
      default:
        return;
    }
    event.preventDefault();
    setActive(next);
  }

  return {
    active: current,
    setActive,
    svgHandlers: {
      onPointerDown: fromPointer,
      onPointerMove: fromPointer,
      onPointerLeave: () => setActive(null),
    },
    frameHandlers: {
      onKeyDown,
      onFocus: () => setActive((value) => value ?? (count ? count - 1 : null)),
      onBlur: () => setActive(null),
    },
  };
}
