import { useCallback, useMemo, useReducer } from "react";
import { createHistory, historyReducer } from "./history.js";

export type DesignHistory<T> = {
  value: T;
  canUndo: boolean;
  canRedo: boolean;
  /** Applies `recipe`; updates sharing `key` coalesce into one undo step. */
  update: (recipe: (current: T) => T, key?: string) => void;
  undo: () => void;
  redo: () => void;
  /** Starts over from `value` with an empty history (e.g. after loading). */
  reset: (value: T) => void;
};

export function useDesignHistory<T>(initial: () => T): DesignHistory<T> {
  const [state, dispatch] = useReducer(historyReducer<T>, undefined, () =>
    createHistory(initial()),
  );

  const update = useCallback(
    (recipe: (current: T) => T, key?: string) =>
      dispatch({ type: "update", recipe, key, at: Date.now() }),
    [],
  );
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  const reset = useCallback(
    (value: T) => dispatch({ type: "reset", value }),
    [],
  );

  return useMemo(
    () => ({
      value: state.present,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
      update,
      undo,
      redo,
      reset,
    }),
    [state, update, undo, redo, reset],
  );
}
