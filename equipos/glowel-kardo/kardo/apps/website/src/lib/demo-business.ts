import { useSyncExternalStore } from "react";

/*
  The business the live demo shows, shared with the Resumen replica so both
  tell the same story. A tiny external store: the demo writes it and
  ResumenBoard reads it. It lives in memory only, and the server render (the
  static export) always shows the default, the café.
*/

export const demoBusinesses = [
  { id: "cafe", name: "Café Central", kind: "Café" },
  { id: "floreria", name: "Florería Lila", kind: "Florería" },
  { id: "estudio", name: "Estudio Noa", kind: "Salón" },
] as const;

export type DemoBusinessId = (typeof demoBusinesses)[number]["id"];

export const defaultDemoBusiness: DemoBusinessId = "cafe";

let current: DemoBusinessId = defaultDemoBusiness;
const listeners = new Set<() => void>();

export function getDemoBusiness(): DemoBusinessId {
  return current;
}

export function setDemoBusiness(id: DemoBusinessId): void {
  if (id === current) return;
  current = id;
  for (const listener of listeners) listener();
}

export function subscribeDemoBusiness(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const serverSnapshot = () => defaultDemoBusiness;

/** The business chosen in the demo; the café on the server. */
export function useDemoBusiness(): DemoBusinessId {
  return useSyncExternalStore(
    subscribeDemoBusiness,
    getDemoBusiness,
    serverSnapshot,
  );
}

export function demoBusinessName(id: DemoBusinessId): string {
  return demoBusinesses.find((business) => business.id === id)?.name ?? "";
}
