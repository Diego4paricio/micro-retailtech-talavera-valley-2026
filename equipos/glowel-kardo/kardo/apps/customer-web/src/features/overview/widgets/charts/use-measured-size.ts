import { useCallback, useState } from "react";

/**
 * Width and height of an element in CSS pixels, through a callback ref.
 * Dashboard widgets sit in a grid cell whose height is fixed by its row span
 * (see `dashboard/layout-store.ts`), so — unlike `use-measured-width` in
 * `features/analytics/charts` — a chart body here must track both axes to
 * fill whatever the grid gives it without overflowing.
 */
export function useMeasuredSize(
  fallbackWidth: number,
  fallbackHeight: number,
): [(element: HTMLElement | null) => (() => void) | undefined, number, number] {
  const [size, setSize] = useState({
    width: fallbackWidth,
    height: fallbackHeight,
  });
  const ref = useCallback((element: HTMLElement | null) => {
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0)
      setSize({
        width: Math.floor(rect.width),
        height: Math.floor(rect.height),
      });
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.floor(entry?.contentRect.width ?? 0);
      const height = Math.floor(entry?.contentRect.height ?? 0);
      if (width > 0 && height > 0) setSize({ width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, size.width, size.height];
}
