import { RadioGroup, Slider, Switch } from "radix-ui";
import { type ReactNode, useEffect, useId, useState } from "react";
import { Icon, type IconName } from "../Icon.js";

/**
 * Studio controls. Every choice is a radix RadioGroup (roving focus, arrow
 * keys, one tab stop), styled through `data-state`; sliders and switches are
 * radix too. Labels are always visible.
 */

// ---------------------------------------------------------------------------
// Control group: a visible label + optional hint around any control.
// ---------------------------------------------------------------------------

export function ControlGroup({
  label,
  labelId,
  hint,
  aside,
  children,
}: {
  label: string;
  labelId?: string | undefined;
  hint?: ReactNode | undefined;
  aside?: ReactNode | undefined;
  children: ReactNode;
}) {
  return (
    <div className="qrs-control">
      <div className="qrs-control-head">
        <span className="qrs-control-label" id={labelId}>
          {label}
        </span>
        {aside ? <span className="qrs-control-aside">{aside}</span> : null}
      </div>
      {children}
      {hint ? <p className="qrs-hint">{hint}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Segmented control (mutually exclusive, so a radiogroup).
// ---------------------------------------------------------------------------

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
  icon?: IconName | undefined;
  /** Renders the label visually hidden (icon-only segment). */
  iconOnly?: boolean | undefined;
  disabled?: boolean | undefined;
};

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  hint,
  aside,
  fill,
}: {
  label: string;
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean | undefined;
  hint?: ReactNode | undefined;
  aside?: ReactNode | undefined;
  /** Stretch segments to the full width. */
  fill?: boolean | undefined;
}) {
  const labelId = useId();
  return (
    <ControlGroup aside={aside} hint={hint} label={label} labelId={labelId}>
      <RadioGroup.Root
        aria-labelledby={labelId}
        className={fill ? "qrs-segmented qrs-segmented-fill" : "qrs-segmented"}
        disabled={disabled}
        loop
        onValueChange={(next) => {
          if (next) onChange(next as T);
        }}
        orientation="horizontal"
        value={value}
      >
        {options.map((option) => (
          <RadioGroup.Item
            aria-label={option.iconOnly ? option.label : undefined}
            className="qrs-segment"
            disabled={option.disabled}
            key={option.value}
            title={option.iconOnly ? option.label : undefined}
            value={option.value}
          >
            {option.icon ? <Icon name={option.icon} size={16} /> : null}
            {option.iconOnly ? null : <span>{option.label}</span>}
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
    </ControlGroup>
  );
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

export type Swatch = { name: string; color: string };

const hexPattern = /^#?([0-9a-fA-F]{6})$/;

export function normalizeHex(value: string): string | null {
  const match = hexPattern.exec(value.trim());
  return match?.[1] ? `#${match[1].toLowerCase()}` : null;
}

/**
 * A color with three ways in: the native picker, a hex field (validated, it
 * only commits valid values) and one-click swatches.
 */
export function ColorField({
  label,
  value,
  onChange,
  swatches,
  disabled,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  swatches?: readonly Swatch[] | undefined;
  disabled?: boolean | undefined;
  hint?: ReactNode | undefined;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setDraft(value);
    setInvalid(false);
  }, [value]);

  return (
    <div className="qrs-control">
      <div className="qrs-control-head">
        <label className="qrs-control-label" htmlFor={`${id}-hex`}>
          {label}
        </label>
      </div>
      <div className="qrs-color">
        <span className="qrs-color-well" style={{ background: value }}>
          <input
            aria-label={`${label}: abrir selector de color`}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value.toLowerCase())}
            type="color"
            value={value}
          />
        </span>
        <input
          aria-describedby={invalid ? `${id}-error` : undefined}
          aria-invalid={invalid || undefined}
          autoCapitalize="off"
          autoComplete="off"
          className="input qrs-color-hex"
          disabled={disabled}
          id={`${id}-hex`}
          maxLength={7}
          onBlur={() => {
            const next = normalizeHex(draft);
            if (next) {
              setInvalid(false);
              if (next !== value) onChange(next);
            } else setInvalid(true);
          }}
          onChange={(event) => {
            setDraft(event.target.value);
            const next = normalizeHex(event.target.value);
            if (next) {
              setInvalid(false);
              onChange(next);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setDraft(value);
              setInvalid(false);
            }
          }}
          spellCheck={false}
          value={draft}
        />
        {swatches?.length ? (
          <SwatchRow
            disabled={disabled}
            label={label}
            onPick={onChange}
            swatches={swatches}
            value={value}
          />
        ) : null}
      </div>
      {invalid ? (
        <p className="qrs-hint qrs-hint-error" id={`${id}-error`}>
          <Icon name="circle-alert" size={14} /> Escribe un color hexadecimal de
          6 dígitos, por ejemplo #16232e.
        </p>
      ) : hint ? (
        <p className="qrs-hint">{hint}</p>
      ) : null}
    </div>
  );
}

function SwatchRow({
  label,
  swatches,
  value,
  onPick,
  disabled,
}: {
  label: string;
  swatches: readonly Swatch[];
  value: string;
  onPick: (color: string) => void;
  disabled?: boolean | undefined;
}) {
  return (
    <fieldset className="qrs-swatches">
      <legend className="visually-hidden">
        Colores sugeridos para {label}
      </legend>
      {swatches.map((swatch) => {
        const selected = swatch.color.toLowerCase() === value.toLowerCase();
        return (
          <button
            aria-label={`${swatch.name} (${swatch.color})`}
            aria-pressed={selected}
            className="qrs-swatch"
            disabled={disabled}
            key={`${swatch.name}-${swatch.color}`}
            onClick={() => onPick(swatch.color.toLowerCase())}
            style={{ background: swatch.color }}
            title={swatch.name}
            type="button"
          >
            {selected ? <Icon name="check" size={12} /> : null}
          </button>
        );
      })}
    </fieldset>
  );
}

/** A color that can also inherit another one (`null`). */
export function OptionalColorField({
  label,
  value,
  inheritLabel,
  fallback,
  onChange,
  swatches,
  disabled,
}: {
  label: string;
  value: string | null;
  inheritLabel: string;
  /** Shown in the picker while inheriting. */
  fallback: string;
  onChange: (value: string | null) => void;
  swatches?: readonly Swatch[] | undefined;
  disabled?: boolean | undefined;
}) {
  const id = useId();
  return (
    <div className="qrs-optional-color">
      <div className="kd-switch-row qrs-switch-row">
        <Switch.Root
          checked={value === null}
          className="kd-switch"
          disabled={disabled}
          id={`${id}-inherit`}
          onCheckedChange={(checked) => onChange(checked ? null : fallback)}
        >
          <Switch.Thumb className="kd-switch-thumb" />
        </Switch.Root>
        <label htmlFor={`${id}-inherit`}>
          <strong>{label}</strong>
          <small>{inheritLabel}</small>
        </label>
      </div>
      {value !== null ? (
        <ColorField
          disabled={disabled}
          label={`${label}: color`}
          onChange={onChange}
          swatches={swatches}
          value={value}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slider
// ---------------------------------------------------------------------------

export function RangeField({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  disabled,
  hint,
  marker,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
  disabled?: boolean | undefined;
  hint?: ReactNode | undefined;
  /** A labelled tick on the track (e.g. the recommended value). */
  marker?: { value: number; label: string } | undefined;
}) {
  const labelId = useId();
  const clamped = Math.min(max, Math.max(min, value));
  const markerPercent =
    marker && max > min ? ((marker.value - min) / (max - min)) * 100 : null;
  return (
    <ControlGroup
      aside={<output aria-hidden="true">{format(clamped)}</output>}
      hint={hint}
      label={label}
      labelId={labelId}
    >
      <Slider.Root
        className="qrs-slider"
        disabled={disabled ?? false}
        max={max}
        min={min}
        onValueChange={([next]) => {
          if (next !== undefined) onChange(next);
        }}
        step={step}
        value={[clamped]}
      >
        <Slider.Track className="qrs-slider-track">
          <Slider.Range className="qrs-slider-range" />
          {markerPercent !== null &&
          markerPercent >= 0 &&
          markerPercent <= 100 ? (
            <span
              aria-hidden="true"
              className="qrs-slider-marker"
              style={{ left: `${markerPercent}%` }}
              title={marker?.label}
            />
          ) : null}
        </Slider.Track>
        <Slider.Thumb
          aria-labelledby={labelId}
          aria-valuetext={format(clamped)}
          className="qrs-slider-thumb"
        />
      </Slider.Root>
    </ControlGroup>
  );
}

// ---------------------------------------------------------------------------
// Switch with a visible label and description.
// ---------------------------------------------------------------------------

export function SwitchField({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: ReactNode | undefined;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean | undefined;
}) {
  const id = useId();
  return (
    <div className="kd-switch-row qrs-switch-row">
      <Switch.Root
        checked={checked}
        className="kd-switch"
        disabled={disabled}
        id={id}
        onCheckedChange={(next) => onChange(next === true)}
      >
        <Switch.Thumb className="kd-switch-thumb" />
      </Switch.Root>
      <label htmlFor={id}>
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </label>
    </div>
  );
}

/** Groups related controls under a small heading inside a section. */
export function ControlBlock({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode | undefined;
}) {
  return (
    <section className="qrs-block">
      <div className="qrs-block-head">
        <h3>{title}</h3>
        {actions}
      </div>
      <div className="qrs-block-body">{children}</div>
    </section>
  );
}
