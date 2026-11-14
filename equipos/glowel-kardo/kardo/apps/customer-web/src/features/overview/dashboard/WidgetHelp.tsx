import { Popover } from "radix-ui";
import { type PointerEvent, useEffect, useId, useRef, useState } from "react";
import { Icon } from "../../../components/Icon.js";

const HOVER_OPEN_MS = 250;
const HOVER_CLOSE_MS = 180;

/**
 * The (i) next to a widget's title: how to read it. A toggletip on a
 * popover: a click, a tap, Enter or Space opens it (and focus moves into it,
 * so it is announced); Escape or a click elsewhere closes it and focus goes
 * back to the button. With a mouse, resting over the (i) also shows it,
 * without taking the focus, until the pointer leaves.
 */
export function WidgetHelp({ title, text }: { title: string; text: string }) {
  const [open, setOpen] = useState(false);
  // Stays until dismissed (opened or kept by a press), or follows the pointer.
  const pinned = useRef(false);
  // Shown by hovering: focus neither moves into it nor comes back on close.
  const viaHover = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const titleId = useId();
  const textId = useId();

  const clearTimer = () => window.clearTimeout(timer.current);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const hoverIn = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    clearTimer();
    if (open) return;
    timer.current = window.setTimeout(() => {
      pinned.current = false;
      viaHover.current = true;
      setOpen(true);
    }, HOVER_OPEN_MS);
  };
  const hoverOut = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    clearTimer();
    if (pinned.current) return;
    timer.current = window.setTimeout(() => setOpen(false), HOVER_CLOSE_MS);
  };

  return (
    <Popover.Root
      onOpenChange={(next) => {
        clearTimer();
        pinned.current = next;
        if (next) viaHover.current = false;
        setOpen(next);
      }}
      open={open}
    >
      <Popover.Trigger asChild>
        <button
          aria-label={`Ayuda: ${title}`}
          className="db-help-button db-no-drag"
          onClick={(event) => {
            // Shown by hovering: the click keeps it open instead of closing it.
            if (open && !pinned.current) {
              event.preventDefault();
              clearTimer();
              pinned.current = true;
            }
          }}
          // The title's double-click opens the editor; not from here.
          onDoubleClick={(event) => event.stopPropagation()}
          onPointerEnter={hoverIn}
          onPointerLeave={hoverOut}
          type="button"
        >
          <Icon name="info" size={15} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          aria-describedby={textId}
          aria-labelledby={titleId}
          className="db-help"
          collisionPadding={12}
          onCloseAutoFocus={(event) => {
            if (viaHover.current) event.preventDefault();
          }}
          onOpenAutoFocus={(event) => {
            if (viaHover.current) event.preventDefault();
          }}
          onPointerEnter={hoverIn}
          onPointerLeave={hoverOut}
          side="bottom"
          sideOffset={6}
        >
          <p className="db-help-title" id={titleId}>
            {title}
          </p>
          <p className="db-help-text" id={textId}>
            {text}
          </p>
          <Popover.Arrow className="db-help-arrow" height={6} width={12} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
