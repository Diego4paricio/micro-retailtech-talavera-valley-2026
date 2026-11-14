import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { errorMessage, isAbortError } from "./api.js";

export type Resource<T> = {
  data: T | null;
  error: string | null;
  isLoading: boolean;
  reload: () => Promise<void>;
  setData: Dispatch<SetStateAction<T | null>>;
};

/**
 * Loads data for the current screen, cancels stale requests when inputs
 * change, and exposes `reload` for explicit refreshes after mutations.
 * `key` must change whenever the loader's inputs change.
 */
export function useResource<T>(
  key: string | null,
  loader: (signal: AbortSignal) => Promise<T>,
): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(key !== null);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const controllerRef = useRef<AbortController | null>(null);

  const run = useCallback(async (isInitial: boolean) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    if (isInitial) setData(null);
    setIsLoading(true);
    setError(null);
    try {
      const value = await loaderRef.current(controller.signal);
      if (!controller.signal.aborted) setData(value);
    } catch (requestError) {
      if (!isAbortError(requestError) && !controller.signal.aborted)
        setError(errorMessage(requestError));
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (key === null) {
      setIsLoading(false);
      return;
    }
    void run(true);
    return () => controllerRef.current?.abort();
  }, [key, run]);

  const reload = useCallback(() => run(false), [run]);
  return { data, error, isLoading, reload, setData };
}
