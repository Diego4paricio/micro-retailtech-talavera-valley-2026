import { useEffect, useState } from "react";

/** Re-renders every `ms` so relative times ("hace 2 minutos") stay current. */
export function useTick(ms = 30_000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick((tick) => tick + 1), ms);
    return () => window.clearInterval(timer);
  }, [ms]);
}
