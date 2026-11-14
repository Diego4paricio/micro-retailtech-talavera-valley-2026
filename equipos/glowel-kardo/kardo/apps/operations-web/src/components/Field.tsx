import type { ReactNode } from "react";

/** Label + control + hint/error, with the ids wired for assistive tech. */
export function Field({
  id,
  label,
  hint,
  error,
  optional,
  children,
  counter,
}: {
  id: string;
  label: string;
  hint?: ReactNode | undefined;
  error?: string | null | undefined;
  optional?: boolean | undefined;
  children: ReactNode;
  counter?: { value: number; max: number } | undefined;
}) {
  return (
    <div className={error ? "field field-invalid" : "field"}>
      <div className="field-label-row">
        <label htmlFor={id}>
          {label}
          {optional ? (
            <span className="optional-label"> (opcional)</span>
          ) : null}
        </label>
        {counter ? (
          <span
            className={
              counter.value > counter.max
                ? "field-counter field-counter-over"
                : "field-counter"
            }
          >
            {counter.value}/{counter.max}
          </span>
        ) : null}
      </div>
      {children}
      {error ? (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      ) : hint ? (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
