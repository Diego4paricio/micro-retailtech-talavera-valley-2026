/**
 * Undo / redo for the Estudio QR, as a pure reducer (tested without a DOM).
 *
 * Continuous gestures — dragging a slider, scrubbing a color, typing the
 * frame text — send many updates with the same `key`; updates that share the
 * key within `coalesceMs` collapse into a single history step, so one ⌘Z
 * undoes the whole gesture instead of one pixel of it.
 */

export const historyLimit = 100;
export const coalesceMs = 1_000;

export type History<T> = {
  past: readonly T[];
  present: T;
  future: readonly T[];
  /** Coalescing key of the last update, `null` after undo/redo/reset. */
  lastKey: string | null;
  lastAt: number;
};

export type HistoryAction<T> =
  | {
      type: "update";
      recipe: (current: T) => T;
      key?: string | undefined;
      at: number;
    }
  | { type: "undo" }
  | { type: "redo" }
  /** Replaces everything (a freshly loaded design): nothing to undo. */
  | { type: "reset"; value: T };

export function createHistory<T>(value: T): History<T> {
  return { past: [], present: value, future: [], lastKey: null, lastAt: 0 };
}

export function historyReducer<T>(
  state: History<T>,
  action: HistoryAction<T>,
): History<T> {
  switch (action.type) {
    case "update": {
      const next = action.recipe(state.present);
      if (stableKey(next) === stableKey(state.present)) return state;
      const coalesce =
        action.key !== undefined &&
        action.key === state.lastKey &&
        action.at - state.lastAt < coalesceMs;
      return {
        past: coalesce
          ? state.past
          : [...state.past, state.present].slice(-historyLimit),
        present: next,
        future: [],
        lastKey: action.key ?? null,
        lastAt: action.at,
      };
    }
    case "undo": {
      const previous = state.past.at(-1);
      if (previous === undefined) return state;
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
        lastKey: null,
        lastAt: 0,
      };
    }
    case "redo": {
      const [next, ...rest] = state.future;
      if (next === undefined) return state;
      return {
        past: [...state.past, state.present].slice(-historyLimit),
        present: next,
        future: rest,
        lastKey: null,
        lastAt: 0,
      };
    }
    case "reset":
      return createHistory(action.value);
  }
}

/**
 * JSON with object keys sorted, so two designs that differ only in key order
 * compare equal (dirty checks, history no-ops).
 */
export function stableKey(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .filter((key) => record[key] !== undefined)
        .map((key) => [key, sortKeys(record[key])]),
    );
  }
  return value;
}
