import { useEffect, useRef, useState } from "react";

/** Exit durations in ms, mirroring `--motion-exit-*` in tokens.css. */
export const exitDurations = { base: 175, slow: 245 } as const;
/** Entrance durations in ms, mirroring `--motion-*` in tokens.css. */
export const motionDurations = {
  instant: 100,
  fast: 150,
  base: 250,
  slow: 350,
  deliberate: 500,
} as const;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export type PresenceState = "open" | "closing" | "closed";

/**
 * Keeps an overlay mounted for its exit animation. `open` flips it on at once;
 * turning it off passes through `closing` for `exitMs` (0 with reduced motion).
 */
export function usePresence(open: boolean, exitMs: number): PresenceState {
  const [state, setState] = useState<PresenceState>(open ? "open" : "closed");

  useEffect(() => {
    if (open) setState("open");
    else setState((current) => (current === "open" ? "closing" : current));
  }, [open]);

  useEffect(() => {
    if (state !== "closing") return;
    const timer = window.setTimeout(
      () => setState("closed"),
      prefersReducedMotion() ? 0 : exitMs,
    );
    return () => window.clearTimeout(timer);
  }, [state, exitMs]);

  // `open` wins immediately so there is never a closed frame on the way in.
  return open ? "open" : state;
}

/**
 * Counts from 0 to `target` the first time a value arrives (research §3:
 * KPI count-up only on first load). Later changes apply instantly.
 */
export function useCountUp(
  target: number,
  duration: number = motionDurations.deliberate,
): number {
  const [value, setValue] = useState(() =>
    prefersReducedMotion() ? target : 0,
  );
  const done = useRef(false);

  useEffect(() => {
    if (
      done.current ||
      target === 0 ||
      prefersReducedMotion() ||
      !Number.isFinite(target)
    ) {
      done.current = true;
      setValue(target);
      return;
    }
    let frame = 0;
    let finished = false;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      // Exponential ease-out, close to --ease-out.
      const eased = progress === 1 ? 1 : 1 - 2 ** (-10 * progress);
      setValue(target * eased);
      if (progress < 1) frame = window.requestAnimationFrame(tick);
      else {
        finished = true;
        done.current = true;
      }
    };
    frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
      // An interrupted first run (StrictMode, fast data change) may restart.
      if (!finished) done.current = false;
    };
  }, [target, duration]);

  return value;
}
