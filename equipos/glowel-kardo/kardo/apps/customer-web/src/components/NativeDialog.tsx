import {
  type ComponentPropsWithoutRef,
  type ReactNode,
  useEffect,
  useRef,
} from "react";
import { usePresence } from "./motion.js";

type NativeDialogProps = Omit<
  ComponentPropsWithoutRef<"dialog">,
  "children" | "onCancel" | "onClick" | "open" | "ref"
> & {
  open: boolean;
  /** Called on Escape and on a click on the backdrop; omit for a gate. */
  onClose?: (() => void) | undefined;
  /** How long it stays mounted after `open` turns off, to animate out. */
  exitMs: number;
  children?: ReactNode | undefined;
};

/**
 * The plumbing every native modal <dialog> in the panel shares: `showModal`
 * and `close` follow `open` (through `usePresence`, so it can animate out;
 * `data-state` carries open/closing/closed for the CSS), Escape and a click
 * on the backdrop call `onClose`. Without `onClose` neither dismisses it (a
 * gate such as the terms). Children render only while it is not closed.
 * Other props (className, aria-*, data-*) go to the <dialog>.
 */
export function NativeDialog({
  open,
  onClose,
  exitMs,
  children,
  ...rest
}: NativeDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const presence = usePresence(open, exitMs);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (presence === "open" && !dialog.open) dialog.showModal();
    if (presence === "closed" && dialog.open) dialog.close();
  }, [presence]);

  return (
    // Escape is handled natively through `onCancel`; the click only covers the backdrop.
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard dismissal is native to <dialog>
    <dialog
      {...rest}
      data-state={presence}
      onCancel={(event) => {
        event.preventDefault();
        if (onClose && presence === "open") onClose();
      }}
      onClick={(event) => {
        // A click on the backdrop targets the dialog element itself.
        if (onClose && event.target === ref.current && presence === "open")
          onClose();
      }}
      ref={ref}
    >
      {presence !== "closed" ? children : null}
    </dialog>
  );
}
