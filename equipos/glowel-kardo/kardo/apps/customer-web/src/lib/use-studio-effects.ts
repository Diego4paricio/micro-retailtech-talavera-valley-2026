import { useEffect, useRef } from "react";
import { useRouter } from "./router.js";

/**
 * Asks before leaving while `active`: Kardo's dialog inside the panel, the
 * browser's when the tab closes. `save`, when given, offers "Guardar y
 * salir" (it must save in one step and resolve `true` when it worked).
 */
export function useUnsavedGuard(
  active: boolean,
  message: string,
  save?: () => Promise<boolean>,
) {
  const { setGuard } = useRouter();
  const saveRef = useRef(save);
  saveRef.current = save;
  const canSave = Boolean(save);
  useEffect(() => {
    if (!active) {
      setGuard(null);
      return;
    }
    setGuard({
      message,
      save: canSave
        ? () => saveRef.current?.() ?? Promise.resolve(false)
        : undefined,
    });
    return () => setGuard(null);
  }, [active, message, canSave, setGuard]);
}

/**
 * ⌘S / Ctrl+S saves; ⌘Z, ⇧⌘Z and Ctrl+Y undo and redo — except inside text
 * fields (they keep their own undo) and dialogs.
 */
export function useStudioShortcuts({
  enabled,
  undo,
  redo,
  save,
}: {
  enabled: boolean;
  undo: () => void;
  redo: () => void;
  save: () => void;
}) {
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("dialog")) return;
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        save();
        return;
      }
      if (
        target?.isContentEditable ||
        (target instanceof HTMLInputElement &&
          !["color", "checkbox", "radio", "range", "button"].includes(
            target.type,
          )) ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      )
        return;
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, undo, redo, save]);
}
