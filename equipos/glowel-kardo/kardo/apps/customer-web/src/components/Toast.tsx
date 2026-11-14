import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { Icon, type IconName } from "./Icon.js";
import { exitDurations, prefersReducedMotion } from "./motion.js";

type ToastTone = "success" | "error" | "info";
type ToastAction = { label: string; onClick: () => void };
type ToastOptions = {
  /** A reversible action such as "Deshacer". */
  action?: ToastAction | undefined;
  /** Milliseconds before auto-dismissal. */
  duration?: number | undefined;
};
type Toast = {
  id: number;
  tone: ToastTone;
  message: string;
  action: ToastAction | null;
  leaving: boolean;
};
type ToastApi = {
  notify: (message: string, tone?: ToastTone, options?: ToastOptions) => void;
};

const toneIcons: Record<ToastTone, IconName> = {
  success: "circle-check",
  info: "info",
  error: "circle-alert",
};

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const remove = useCallback((id: number) => {
    setToasts((items) => items.filter((item) => item.id !== id));
  }, []);

  const dismiss = useCallback(
    (id: number) => {
      setToasts((items) =>
        items.map((item) =>
          item.id === id ? { ...item, leaving: true } : item,
        ),
      );
      window.setTimeout(
        () => remove(id),
        prefersReducedMotion() ? 0 : exitDurations.base,
      );
    },
    [remove],
  );

  const notify = useCallback(
    (message: string, tone: ToastTone = "success", options?: ToastOptions) => {
      const id = nextId.current++;
      const action = options?.action ?? null;
      setToasts((items) => [
        ...items.slice(-2),
        { id, tone, message, action, leaving: false },
      ]);
      const duration =
        options?.duration ?? (tone === "error" || action ? 7_000 : 5_000);
      window.setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ notify }), [notify]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <section
        aria-label="Notificaciones"
        aria-live="polite"
        className="toast-region"
      >
        {toasts.map((toast) => (
          <div
            className={
              toast.leaving
                ? `toast toast-${toast.tone} toast-leaving`
                : `toast toast-${toast.tone}`
            }
            key={toast.id}
            role={toast.tone === "error" ? "alert" : "status"}
          >
            <Icon name={toneIcons[toast.tone]} />
            <span>{toast.message}</span>
            <span className="toast-actions">
              {toast.action ? (
                <button
                  className="toast-action"
                  onClick={() => {
                    toast.action?.onClick();
                    dismiss(toast.id);
                  }}
                  type="button"
                >
                  {toast.action.label}
                </button>
              ) : null}
              <button
                aria-label="Cerrar notificación"
                className="icon-button"
                onClick={() => dismiss(toast.id)}
                type="button"
              >
                <Icon name="close" size={16} />
              </button>
            </span>
          </div>
        ))}
      </section>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside ToastProvider.");
  return value;
}
