import { type RefObject, useEffect, useState } from "react";

/** Tracks an element's content width so SVG charts can lay out in real pixels. */
export function useElementWidth<T extends HTMLElement>(
  ref: RefObject<T | null>,
  fallback: number,
): number {
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.floor(entry?.contentRect.width ?? 0);
      if (next > 0) setWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
