import { useCallback } from "react";
import { canvasItemOf, moveCanvasItems } from "../model/canvas.js";
import { selectedBlockIds, useStudio } from "../StudioContext.js";
import { measuredItemHeight } from "./canvas-measure.js";

/** The parts of a keydown event the handler reads (DOM or React). */
export type CanvasKeyEvent = {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  target: EventTarget | null;
  preventDefault: () => void;
};

const steps: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** Fields and menus keep their own arrow keys. */
export function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(
    element?.closest?.(
      "input, textarea, select, [contenteditable='true'], [contenteditable='plaintext-only'], [role='menu'], [role='menuitem'], [role='slider'], [role='radiogroup'], [role='listbox'], [role='tablist'], [role='toolbar'], dialog",
    ),
  );
}

/**
 * Arrow keys for the selected canvas blocks: 1 px, or 10 px with Shift.
 * Several selected move together; locked ones stay. Repeated presses
 * coalesce into one undo step. Returns whether the event was used (and
 * then prevents its default scrolling).
 */
export function useCanvasKeyboard(): (event: CanvasKeyEvent) => boolean {
  const { design, change, selection, readOnly } = useStudio();
  return useCallback(
    (event: CanvasKeyEvent) => {
      const step = steps[event.key];
      const ids = selectedBlockIds(selection).filter((id) => {
        const at = canvasItemOf(design, id);
        return at !== null && !at.item.locked;
      });
      if (
        !step ||
        readOnly ||
        !ids.length ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isTyping(event.target)
      )
        return false;
      event.preventDefault();
      const distance = event.shiftKey ? 10 : 1;
      change(
        (current) =>
          moveCanvasItems(
            current,
            ids,
            step[0] * distance,
            step[1] * distance,
            measuredItemHeight,
          ),
        `${ids.join(",")}:nudge`,
      );
      return true;
    },
    [design, change, selection, readOnly],
  );
}
