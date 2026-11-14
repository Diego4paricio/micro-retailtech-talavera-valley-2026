import { useEffect, useRef, useState } from "react";
import type { Channel } from "./demo-data";

/** How the phone got to a page: a channel, or @handle for Links. */
export type Via = Channel | "handle";

export type Screen =
  | { kind: "lock" }
  | { kind: "reading"; via: Via; found: boolean }
  | { kind: "page"; via: Via }
  /** The Resolver's "¡Listo!" page after a form is sent. */
  | { kind: "sent"; via: Via };

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** Timeouts that are cleared together and when the demo unmounts. */
function useTimers() {
  const timers = useRef<number[]>([]);
  useEffect(
    () => () => {
      for (const timer of timers.current) window.clearTimeout(timer);
    },
    [],
  );
  return {
    schedule(run: () => void, ms: number) {
      timers.current.push(window.setTimeout(run, ms));
    },
    clear() {
      for (const timer of timers.current) window.clearTimeout(timer);
      timers.current = [];
    },
  };
}

/** Milliseconds until the phone finds the tag, code or link, and opens. */
const timing: Record<Via, readonly [found: number, open: number]> = {
  nfc: [350, 1500],
  qr: [900, 1750],
  link: [700, 1350],
  handle: [700, 1350],
};

/** The customer's phone: locked, reading a channel, or showing a page. */
export function usePhone(reduced: boolean) {
  const [screen, setScreen] = useState<Screen>({ kind: "lock" });
  const timers = useTimers();

  function visit(via: Via, opened: () => void) {
    timers.clear();
    setScreen({ kind: "reading", via, found: false });
    const [found, open] = reduced ? [60, 180] : timing[via];
    timers.schedule(
      () => setScreen({ kind: "reading", via, found: true }),
      found,
    );
    timers.schedule(() => {
      setScreen({ kind: "page", via });
      opened();
    }, open);
  }

  return { screen, setScreen, visit };
}

/**
 * A publication reaching `size` Touchpoints: progress in steps over about a
 * second, like the panel's (it takes seconds, never "al instante").
 */
export function usePublisher(size: number, reduced: boolean) {
  const [progress, setProgress] = useState<number | null>(null);
  const timers = useTimers();

  function run(done: () => void) {
    timers.clear();
    const steps = reduced ? 1 : Math.min(size, 10);
    const stepMs = reduced ? 250 : Math.round(1200 / steps);
    setProgress(0);
    for (let step = 1; step <= steps; step++)
      timers.schedule(
        () => setProgress(Math.round((size * step) / steps)),
        step * stepMs,
      );
    timers.schedule(
      () => {
        setProgress(null);
        done();
      },
      steps * stepMs + 150,
    );
  }

  return { progress, run };
}
