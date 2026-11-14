import {
  type BlockStyle,
  type DesignBlock,
  type DesignFont,
  designFonts,
} from "@kardo/contracts";
import { Accordion } from "radix-ui";
import { useId } from "react";
import { Segmented } from "../../../components/controls/index.js";
import { Icon } from "../../../components/Icon.js";
import { fontLabels } from "../labels.js";
import { type BlockStylePatch, setBlockStyle } from "../model/operations.js";
import { useStudio } from "../StudioContext.js";
import { ColorTokenField, StepperField } from "./controls.js";

/**
 * "Avanzado": every BlockStyle field with exact values. Empty means
 * automatic (the page style decides); each value can go back to automatic.
 */
export function AdvancedStyle({ block }: { block: DesignBlock }) {
  const { change, readOnly } = useStudio();
  const style: BlockStyle = block.style ?? {};
  const fontId = useId();
  const count = Object.keys(style).length;
  const set = (patch: BlockStylePatch, key?: string) =>
    change(
      (design) => setBlockStyle(design, block.id, patch),
      key ? `${block.id}:${key}` : undefined,
    );
  const isText =
    block.kind !== "spacer" &&
    block.kind !== "divider" &&
    block.kind !== "image";

  return (
    <Accordion.Root className="es-advanced" collapsible type="single">
      <Accordion.Item className="es-advanced-item" value="advanced">
        <Accordion.Header className="es-advanced-header">
          <Accordion.Trigger className="es-advanced-trigger">
            <span aria-hidden="true" className="es-advanced-icon">
              <Icon name="sliders" size={16} />
            </span>
            <span className="es-advanced-title">
              Avanzado
              <small>
                {count
                  ? `${count} ${count === 1 ? "ajuste propio" : "ajustes propios"}`
                  : "Tamaños, espacios y colores exactos"}
              </small>
            </span>
            <Icon
              className="qrs-accordion-chevron"
              name="chevron-down"
              size={16}
            />
          </Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Content className="es-advanced-content">
          <fieldset className="es-fields" disabled={readOnly}>
            {count && !readOnly ? (
              <button
                className="link-button es-advanced-reset"
                onClick={() =>
                  change((design) =>
                    setBlockStyle(
                      design,
                      block.id,
                      Object.fromEntries(
                        Object.keys(style).map((key) => [key, undefined]),
                      ) as BlockStylePatch,
                    ),
                  )
                }
                type="button"
              >
                <Icon name="reset" size={14} /> Quitar todos los ajustes propios
              </button>
            ) : null}

            <h4 className="es-group-title">Alineación y ancho</h4>
            <Segmented
              fill
              label="Alineación"
              onChange={(value) =>
                set({ align: value === "auto" ? undefined : value })
              }
              options={[
                {
                  value: "auto",
                  label: "Automática",
                  icon: "reset",
                  iconOnly: true,
                },
                {
                  value: "start",
                  label: "Izquierda",
                  icon: "align-left",
                  iconOnly: true,
                },
                {
                  value: "center",
                  label: "Centro",
                  icon: "align-center",
                  iconOnly: true,
                },
                {
                  value: "end",
                  label: "Derecha",
                  icon: "align-right",
                  iconOnly: true,
                },
              ]}
              value={style.align ?? "auto"}
            />
            {block.kind === "button" || block.kind === "image" ? (
              <Segmented
                fill
                label="Ancho"
                onChange={(value) =>
                  set({ width: value === "auto" ? undefined : value })
                }
                options={[
                  { value: "auto", label: "Automático" },
                  { value: "full", label: "Todo el ancho" },
                ]}
                value={style.width ?? "auto"}
              />
            ) : null}

            <h4 className="es-group-title">Color</h4>
            <ColorTokenField
              label={isText ? "Color del texto" : "Color"}
              onChange={(value) => set({ color: value }, "color")}
              value={style.color}
            />
            <ColorTokenField
              allowNone
              label="Fondo del bloque"
              onChange={(value) => set({ background: value }, "background")}
              value={style.background}
            />
            {style.background && style.background !== "none" ? (
              <>
                <ColorTokenField
                  label="Fondo: segundo color (degradado)"
                  onChange={(value) =>
                    set(
                      value === undefined
                        ? {
                            backgroundTo: undefined,
                            backgroundAngle: undefined,
                          }
                        : {
                            backgroundTo: value,
                            backgroundAngle: style.backgroundAngle ?? 135,
                          },
                      "backgroundTo",
                    )
                  }
                  value={style.backgroundTo}
                />
                {style.backgroundTo !== undefined ? (
                  <StepperField
                    fallback={135}
                    format={(value) => `${value}°`}
                    label="Fondo: ángulo del degradado"
                    max={360}
                    min={0}
                    onChange={(value) =>
                      set({ backgroundAngle: value }, "backgroundAngle")
                    }
                    value={style.backgroundAngle}
                  />
                ) : null}
              </>
            ) : null}
            <ColorTokenField
              label="Borde"
              onChange={(value) =>
                set(
                  value === undefined
                    ? { borderColor: undefined, borderWidth: undefined }
                    : {
                        borderColor: value,
                        borderWidth: style.borderWidth ?? 1,
                      },
                  "borderColor",
                )
              }
              value={style.borderColor}
            />
            {style.borderColor !== undefined ? (
              <StepperField
                fallback={1}
                label="Borde: grosor"
                max={12}
                min={0}
                onChange={(value) => set({ borderWidth: value }, "borderWidth")}
                unit="px"
                value={style.borderWidth}
              />
            ) : null}

            {isText ? (
              <>
                <h4 className="es-group-title">Tipografía</h4>
                <div className="qrs-control">
                  <label className="qrs-control-label" htmlFor={fontId}>
                    Tipografía
                  </label>
                  <select
                    className="qrs-select"
                    id={fontId}
                    onChange={(event) =>
                      set({
                        font:
                          event.target.value === ""
                            ? undefined
                            : (event.target.value as DesignFont),
                      })
                    }
                    value={style.font ?? ""}
                  >
                    <option value="">La de la página</option>
                    {designFonts.map((font) => (
                      <option key={font} value={font}>
                        {fontLabels[font]}
                      </option>
                    ))}
                  </select>
                </div>
                <StepperField
                  fallback={16}
                  label="Tamaño"
                  max={72}
                  min={12}
                  onChange={(value) => set({ fontSize: value }, "fontSize")}
                  unit="px"
                  value={style.fontSize}
                />
                <Segmented
                  fill
                  label="Grosor"
                  onChange={(value) =>
                    set({
                      fontWeight:
                        value === "auto"
                          ? undefined
                          : (Number(value) as 400 | 500 | 600 | 700),
                    })
                  }
                  hint="400 normal · 500 medio · 600 semi · 700 negrita."
                  options={[
                    { value: "auto", label: "Auto" },
                    { value: "400", label: "400" },
                    { value: "500", label: "500" },
                    { value: "600", label: "600" },
                    { value: "700", label: "700" },
                  ]}
                  value={style.fontWeight ? String(style.fontWeight) : "auto"}
                />
                <StepperField
                  fallback={0}
                  format={(value) => (value / 100).toFixed(2)}
                  hint="En em: negativo junta las letras, positivo las separa."
                  label="Espaciado entre letras"
                  max={30}
                  min={-5}
                  onChange={(value) =>
                    set({ letterSpacing: value }, "letterSpacing")
                  }
                  value={style.letterSpacing}
                />
                <StepperField
                  fallback={15}
                  format={(value) => (value / 10).toFixed(1)}
                  hint="10 = 1.0 (compacto) · 20 = 2.0 (muy aireado)."
                  label="Interlineado"
                  max={20}
                  min={10}
                  onChange={(value) => set({ lineHeight: value }, "lineHeight")}
                  value={style.lineHeight}
                />
              </>
            ) : null}

            <h4 className="es-group-title">Forma</h4>
            <StepperField
              fallback={0}
              label="Esquinas"
              max={48}
              min={0}
              onChange={(value) => set({ radius: value }, "radius")}
              unit="px"
              value={style.radius}
            />
            <Segmented
              fill
              label="Sombra"
              onChange={(value) =>
                set({ shadow: value === "auto" ? undefined : value })
              }
              options={[
                { value: "auto", label: "Auto" },
                { value: "none", label: "Ninguna" },
                { value: "soft", label: "Suave" },
                { value: "strong", label: "Marcada" },
              ]}
              value={style.shadow ?? "auto"}
            />
            <StepperField
              fallback={100}
              label="Opacidad"
              max={100}
              min={20}
              onChange={(value) => set({ opacity: value }, "opacity")}
              unit="%"
              value={style.opacity}
            />

            <h4 className="es-group-title">Espacios</h4>
            <StepperField
              fallback={0}
              label="Relleno a los lados"
              max={64}
              min={0}
              onChange={(value) => set({ paddingX: value }, "paddingX")}
              unit="px"
              value={style.paddingX}
            />
            <StepperField
              fallback={0}
              label="Relleno arriba y abajo"
              max={64}
              min={0}
              onChange={(value) => set({ paddingY: value }, "paddingY")}
              unit="px"
              value={style.paddingY}
            />
            <StepperField
              fallback={0}
              label="Margen superior"
              max={96}
              min={0}
              onChange={(value) => set({ marginTop: value }, "marginTop")}
              unit="px"
              value={style.marginTop}
            />
            <StepperField
              fallback={0}
              label="Margen inferior"
              max={96}
              min={0}
              onChange={(value) => set({ marginBottom: value }, "marginBottom")}
              unit="px"
              value={style.marginBottom}
            />
          </fieldset>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
}
