import { RadioGroup } from "radix-ui";
import { type ReactNode, useId, useMemo } from "react";
import { ControlGroup } from "../../../../components/controls/index.js";
import { pathData, shapeSwatch } from "../engine/index.js";

/**
 * QR-only controls. The generic ones (Segmented, RangeField, ColorField…)
 * live in `components/controls`; they are re-exported so the QR studio's
 * imports keep working.
 */
export {
  ColorField,
  ControlBlock,
  ControlGroup,
  normalizeHex,
  OptionalColorField,
  RangeField,
  Segmented,
  type SegmentOption,
  type Swatch,
  SwitchField,
} from "../../../../components/controls/index.js";

// ---------------------------------------------------------------------------
// Visual shape picker (modules, eye frames, eye centres).
// ---------------------------------------------------------------------------

export function ShapeGlyph({
  kind,
  shape,
}: {
  kind: "module" | "eye-frame" | "eye-ball";
  shape: string;
}) {
  const swatch = useMemo(() => {
    try {
      const result = shapeSwatch(kind, shape);
      return { ...result, d: pathData(result.d) };
    } catch {
      return null;
    }
  }, [kind, shape]);
  if (!swatch)
    return <span aria-hidden="true" className="qrs-glyph qrs-glyph-empty" />;
  return (
    <svg
      aria-hidden="true"
      className="qrs-glyph"
      focusable="false"
      viewBox={`0 0 ${swatch.size} ${swatch.size}`}
    >
      <path d={swatch.d} fill="currentColor" fillRule={swatch.fillRule} />
    </svg>
  );
}

export function ShapePicker<T extends string>({
  label,
  kind,
  options,
  labels,
  value,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  kind: "module" | "eye-frame" | "eye-ball";
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean | undefined;
  hint?: ReactNode | undefined;
}) {
  const labelId = useId();
  return (
    <ControlGroup
      aside={labels[value]}
      hint={hint}
      label={label}
      labelId={labelId}
    >
      <RadioGroup.Root
        aria-labelledby={labelId}
        className="qrs-tiles"
        disabled={disabled}
        loop
        onValueChange={(next) => {
          if (next) onChange(next as T);
        }}
        value={value}
      >
        {options.map((option) => (
          <RadioGroup.Item
            className="qrs-tile"
            key={option}
            title={labels[option]}
            value={option}
          >
            <ShapeGlyph kind={kind} shape={option} />
            <span className="qrs-tile-label">{labels[option]}</span>
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
    </ControlGroup>
  );
}
