import {
  type QrDesign,
  type QrFrameIcon,
  type QrFrameStyle,
  qrFrameFonts,
  qrFrameIcons,
  qrFrameStyles,
  qrFrameTextMaxLength,
} from "@kardo/contracts";
import { RadioGroup } from "radix-ui";
import { useId, useRef } from "react";
import { Icon } from "../../../../../components/Icon.js";
import { qrFrameTextPresets } from "../../qr-design.js";
import {
  ColorField,
  ControlBlock,
  ControlGroup,
  Segmented,
  SwitchField,
} from "../controls.js";
import { stableKey } from "../history.js";
import { buildDesign, svgDataUrl, useIdleValue } from "../hooks.js";
import {
  asChoice,
  frameFontLabels,
  frameIcons,
  frameStyleLabels,
} from "../labels.js";
import { useStudio } from "../StudioContext.js";
import { SectionWarnings } from "./SectionWarnings.js";

const nameToken = "{nombre}";

export function FrameSection() {
  const { design, change, readOnly, swatches, touchpointName } = useStudio();
  const frame = design.frame;
  const textId = useId();
  const textRef = useRef<HTMLInputElement>(null);
  const setFrame = (patch: Partial<QrDesign["frame"]>, key?: string) =>
    change(
      (current) => ({ ...current, frame: { ...current.frame, ...patch } }),
      key,
    );
  const resolved = frame.text.split(nameToken).join(touchpointName);
  const shown = frame.uppercase ? resolved.toLocaleUpperCase("es") : resolved;

  function insertName() {
    const input = textRef.current;
    const start = input?.selectionStart ?? frame.text.length;
    const end = input?.selectionEnd ?? frame.text.length;
    const next = `${frame.text.slice(0, start)}${nameToken}${frame.text.slice(end)}`;
    if (next.length > qrFrameTextMaxLength) return;
    setFrame({ text: next });
    window.requestAnimationFrame(() => {
      input?.focus();
      const caret = start + nameToken.length;
      input?.setSelectionRange(caret, caret);
    });
  }

  return (
    <>
      <SectionWarnings section="frame" />
      <FrameStylePicker
        disabled={readOnly}
        onChange={(style) => setFrame({ style })}
        value={asChoice(qrFrameStyles, frame.style)}
      />

      {frame.style === "none" ? (
        <p className="qrs-hint">
          Sin marco el código queda solo. Un marco con una frase como «Escanea
          para ver el menú» suele conseguir más escaneos.
        </p>
      ) : (
        <>
          <ControlBlock title="Texto">
            <div className="qrs-control">
              <div className="qrs-control-head">
                <label className="qrs-control-label" htmlFor={textId}>
                  Llamada a la acción
                </label>
                <span
                  className={
                    frame.text.length >= qrFrameTextMaxLength
                      ? "qrs-counter qrs-counter-full"
                      : "qrs-counter"
                  }
                >
                  {frame.text.length}/{qrFrameTextMaxLength}
                </span>
              </div>
              <input
                aria-describedby={`${textId}-preview`}
                className="input"
                disabled={readOnly}
                id={textId}
                maxLength={qrFrameTextMaxLength}
                onChange={(event) =>
                  setFrame(
                    { text: event.target.value.replace(/[<>]/g, "") },
                    "frame.text",
                  )
                }
                placeholder="Escanea aquí"
                ref={textRef}
                value={frame.text}
              />
              <p className="qrs-hint" id={`${textId}-preview`}>
                {frame.text.includes(nameToken) ? (
                  <>
                    Se verá: <strong>{shown || "—"}</strong>. En la hoja del
                    grupo, {nameToken} toma el nombre de cada QR.
                  </>
                ) : (
                  <>
                    Usa {nameToken} para mostrar el nombre del QR (por ejemplo,
                    «Mesa 4»).
                  </>
                )}
              </p>
            </div>
            <div className="qrs-inline-actions">
              <button
                className="button button-secondary button-small"
                disabled={
                  readOnly ||
                  frame.text.length + nameToken.length > qrFrameTextMaxLength
                }
                onClick={insertName}
                type="button"
              >
                <Icon name="plus" size={14} /> Insertar nombre
              </button>
            </div>
            <fieldset className="qrs-chips">
              <legend className="qrs-control-label">Frases sugeridas</legend>
              {qrFrameTextPresets.map((preset) => (
                <button
                  aria-pressed={frame.text === preset}
                  className="qrs-chip"
                  disabled={readOnly}
                  key={preset}
                  onClick={() => setFrame({ text: preset })}
                  type="button"
                >
                  {preset}
                </button>
              ))}
            </fieldset>
          </ControlBlock>

          <ControlBlock title="Tipografía">
            <Segmented
              disabled={readOnly}
              fill
              label="Fuente"
              onChange={(font) => setFrame({ font })}
              options={(["sans", "serif", "mono"] as const).map((font) => ({
                value: font,
                label: frameFontLabels[font],
              }))}
              value={asChoice(qrFrameFonts, frame.font)}
            />
            <SwitchField
              checked={frame.uppercase}
              disabled={readOnly}
              label="Todo en mayúsculas"
              onChange={(uppercase) => setFrame({ uppercase })}
            />
          </ControlBlock>

          <ControlBlock title="Ícono">
            <FrameIconPicker
              disabled={readOnly}
              onChange={(icon) => setFrame({ icon })}
              value={asChoice(qrFrameIcons, frame.icon)}
            />
          </ControlBlock>

          <ControlBlock title="Colores del marco">
            <ColorField
              disabled={readOnly}
              label="Color del marco"
              onChange={(color) => setFrame({ color }, "frame.color")}
              swatches={swatches.all}
              value={frame.color}
            />
            <ColorField
              disabled={readOnly}
              label="Color del texto"
              onChange={(textColor) =>
                setFrame({ textColor }, "frame.textColor")
              }
              swatches={swatches.all}
              value={frame.textColor}
            />
          </ControlBlock>
        </>
      )}
    </>
  );
}

function FrameStylePicker({
  value,
  onChange,
  disabled,
}: {
  value: QrFrameStyle;
  onChange: (style: QrFrameStyle) => void;
  disabled: boolean;
}) {
  const { design, url, touchpointName, logo } = useStudio();
  const labelId = useId();
  const raster = logo.state.raster;
  // One real render per style, with the current design, once the browser is idle.
  const thumbs = useIdleValue(
    () =>
      Object.fromEntries(
        qrFrameStyles.map((style) => {
          const result = buildDesign({
            url,
            design: { ...design, frame: { ...design.frame, style } },
            logo: raster,
            nombre: touchpointName,
          });
          return [style, result.ok ? svgDataUrl(result.svg) : null];
        }),
      ) as Record<QrFrameStyle, string | null>,
    `${stableKey({ ...design, frame: { ...design.frame, style: null } })}:${raster?.href.length ?? 0}`,
  );

  return (
    <ControlGroup
      aside={frameStyleLabels[value]}
      label="Estilo"
      labelId={labelId}
    >
      <RadioGroup.Root
        aria-labelledby={labelId}
        className="qrs-tiles qrs-tiles-frames"
        disabled={disabled}
        loop
        onValueChange={(next) => {
          if (next) onChange(next as QrFrameStyle);
        }}
        value={value}
      >
        {qrFrameStyles.map((style) => {
          const src = thumbs?.[style] ?? null;
          return (
            <RadioGroup.Item
              className="qrs-tile qrs-tile-frame"
              key={style}
              value={style}
            >
              <span className="qrs-tile-thumb">
                {src ? <img alt="" src={src} /> : null}
              </span>
              <span className="qrs-tile-label">{frameStyleLabels[style]}</span>
            </RadioGroup.Item>
          );
        })}
      </RadioGroup.Root>
    </ControlGroup>
  );
}

function FrameIconPicker({
  value,
  onChange,
  disabled,
}: {
  value: QrFrameIcon;
  onChange: (icon: QrFrameIcon) => void;
  disabled: boolean;
}) {
  const labelId = useId();
  return (
    <ControlGroup
      aside={frameIcons[value].label}
      hint="Opcional: un dibujo pequeño junto al texto del marco. Elige el que combine con lo que ofreces (un menú, Wi-Fi, un regalo…) o déjalo en «Sin ícono»."
      label="Ícono junto al texto"
      labelId={labelId}
    >
      <RadioGroup.Root
        aria-labelledby={labelId}
        className="qrs-icon-grid"
        disabled={disabled}
        loop
        onValueChange={(next) => {
          if (next) onChange(next as QrFrameIcon);
        }}
        value={value}
      >
        {qrFrameIcons.map((icon) => (
          <RadioGroup.Item
            aria-label={frameIcons[icon].label}
            className="qrs-icon-option"
            key={icon}
            title={frameIcons[icon].label}
            value={icon}
          >
            <Icon name={frameIcons[icon].icon} size={18} />
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
    </ControlGroup>
  );
}
