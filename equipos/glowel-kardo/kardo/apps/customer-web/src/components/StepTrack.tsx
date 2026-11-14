import { Icon } from "./Icon.js";
import "./step-track.css";

export type StepTrackItem = {
  label: string;
  done: boolean;
  /** With `onSelect`, this step still shows as plain text, not a button. */
  locked?: boolean | undefined;
};

/**
 * Steps across the top, centered: a circle per step joined by a line, its
 * name below, a check when it is done (owner, 2026-10-07: horizontal so the
 * page does not grow, and the progress always in sight). The same piece in
 * the touchpoint page and in «Crear organización».
 *
 * With `onSelect` every step is a button (except those marked `locked`);
 * without it, a plain list.
 */
export function StepTrack({
  items,
  current,
  onSelect,
  label = "Pasos",
}: {
  items: readonly StepTrackItem[];
  current: number;
  onSelect?: ((index: number) => void) | undefined;
  label?: string | undefined;
}) {
  return (
    <ol
      aria-label={label}
      className="step-track"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item, index) => {
        const state = index === current ? "now" : item.done ? "done" : "next";
        const body = (
          <>
            <span className="step-track-mark" aria-hidden="true">
              {item.done && index !== current ? (
                <Icon name="check" size={16} />
              ) : (
                index + 1
              )}
            </span>
            <span className="step-track-label">
              {item.label}
              {item.done ? (
                <span className="visually-hidden">, hecho</span>
              ) : null}
            </span>
          </>
        );
        return (
          <li
            className={`step-track-item step-track-${state}${
              index > 0 && (items[index - 1]?.done || index <= current)
                ? " step-track-joined"
                : ""
            }`}
            key={item.label}
          >
            {onSelect && !item.locked ? (
              <button
                aria-current={index === current ? "step" : undefined}
                className="step-track-button"
                onClick={() => onSelect(index)}
                type="button"
              >
                {body}
              </button>
            ) : (
              <span
                aria-current={index === current ? "step" : undefined}
                className="step-track-button"
              >
                {body}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
