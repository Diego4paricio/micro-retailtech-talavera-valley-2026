import { useCallback, useState } from "react";

/**
 * Width of an element in CSS pixels, through a callback ref: it keeps
 * measuring when the element remounts (table ↔ chart, empty ↔ data).
 */
export function useMeasuredWidth(
  fallback: number,
): [(element: HTMLElement | null) => (() => void) | undefined, number] {
  const [width, setWidth] = useState(fallback);
  const ref = useCallback((element: HTMLElement | null) => {
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const initial = Math.floor(element.getBoundingClientRect().width);
    if (initial > 0) setWidth(initial);
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.floor(entry?.contentRect.width ?? 0);
      if (next > 0) setWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}
