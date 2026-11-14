import { RadioGroup } from "radix-ui";
import { useId, useState } from "react";
import { Dialog } from "../../../../components/Dialog.js";
import { Icon } from "../../../../components/Icon.js";
import { useToast } from "../../../../components/Toast.js";
import { downloadFile, safeFilename } from "../../../../lib/download.js";
import {
  type QrBuild,
  sceneToPdf,
  sceneToPng,
  sceneToSvg,
} from "../engine/index.js";
import {
  moduleSizeMm,
  pixelsForPhysicalSize,
  qrDpiOptions,
  qrPrintSizes,
} from "../qr-design.js";
import { Segmented } from "./controls.js";
import { type ExportGate, GateProblems } from "./Legibility.js";
import type { StudioSectionId } from "./labels.js";

export type Format = "png" | "svg" | "pdf";

const customCmRange = { min: 1, max: 150 } as const;
/** Browsers refuse larger canvases; SVG/PDF have no such limit. */
const maxPngSide = 10_000;

const formatInfo: Record<Format, { label: string; detail: string }> = {
  png: {
    label: "PNG",
    detail: "Imagen lista para imprimir al tamaño que elijas.",
  },
  svg: {
    label: "SVG",
    detail:
      "Vectorial: se ve nítido a cualquier tamaño. Ideal para tu diseñador.",
  },
  pdf: {
    label: "PDF",
    detail: "Vectorial, con el ancho exacto en centímetros para la imprenta.",
  },
};

const numberFormat = (value: number, digits = 1) =>
  value.toLocaleString("es-MX", { maximumFractionDigits: digits });

export function ExportDialog({
  open,
  onClose,
  build,
  gate,
  touchpointName,
  onFix,
  onOpenSheet,
  canOpenSheet,
  onExported,
}: {
  open: boolean;
  onClose: () => void;
  build: QrBuild | null;
  gate: ExportGate;
  touchpointName: string;
  onFix: (section: StudioSectionId) => void;
  onOpenSheet: () => void;
  canOpenSheet: boolean;
  /** After a successful download (print tracking). */
  onExported?: ((format: Format) => void) | undefined;
}) {
  const { notify } = useToast();
  const customId = useId();
  const [format, setFormat] = useState<Format>("png");
  const defaultSize =
    qrPrintSizes.find((size) => size.cm === 5) ?? qrPrintSizes[0];
  const [sizeId, setSizeId] = useState<string>(defaultSize?.id ?? "custom");
  const [customCm, setCustomCm] = useState("5");
  const [dpi, setDpi] = useState<number>(
    qrDpiOptions.includes(300) ? 300 : (qrDpiOptions[0] ?? 300),
  );
  const [isExporting, setIsExporting] = useState(false);

  const preset = qrPrintSizes.find((size) => size.id === sizeId);
  const parsedCustom = Number.parseFloat(customCm.replace(",", "."));
  const customValid =
    Number.isFinite(parsedCustom) &&
    parsedCustom >= customCmRange.min &&
    parsedCustom <= customCmRange.max;
  const widthCm = preset ? preset.cm : customValid ? parsedCustom : null;

  const scene = build?.scene ?? null;
  const analysis = build?.analysis ?? null;
  const widthPx = widthCm ? pixelsForPhysicalSize(widthCm, dpi) : null;
  const heightPx =
    widthPx && scene
      ? Math.round((widthPx * scene.height) / scene.width)
      : null;
  const moduleMm =
    widthCm && scene ? safeNumber(() => moduleSizeMm(scene, widthCm)) : null;
  const symbolCm =
    moduleMm !== null && analysis ? (moduleMm * analysis.size) / 10 : null;
  const pngTooLarge =
    format === "png" &&
    widthPx !== null &&
    Math.max(widthPx, heightPx ?? 0) > maxPngSide;
  const needsSize = format !== "svg";
  const canDownload =
    gate.ready &&
    scene !== null &&
    !isExporting &&
    (!needsSize || widthCm !== null) &&
    !pngTooLarge;

  const base = `${safeFilename(touchpointName)}-qr`;

  async function download() {
    if (!scene || !canDownload) return;
    setIsExporting(true);
    try {
      if (format === "svg") {
        const svg = sceneToSvg(scene, { title: touchpointName });
        downloadFile(
          new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
          `${base}.svg`,
        );
        notify("SVG descargado: vectorial, nítido a cualquier tamaño.");
      } else if (format === "png" && widthCm && widthPx) {
        const blob = await sceneToPng(scene, { widthPx, dpi });
        downloadFile(blob, `${base}-${numberFormat(widthCm)}cm-${dpi}dpi.png`);
        notify(
          `PNG descargado: ${numberFormat(widthCm)} cm de ancho a ${dpi} DPI.`,
        );
      } else if (format === "pdf" && widthCm) {
        const blob = await sceneToPdf(scene, {
          widthMm: widthCm * 10,
          title: touchpointName,
        });
        downloadFile(blob, `${base}-${numberFormat(widthCm)}cm.pdf`);
        notify(`PDF descargado: ${numberFormat(widthCm)} cm de ancho.`);
      }
      onExported?.(format);
      onClose();
    } catch (error) {
      notify(
        error instanceof Error && error.message
          ? `No pudimos generar el archivo: ${error.message}`
          : "No pudimos generar el archivo. Intenta de nuevo.",
        "error",
      );
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Dialog
      description="Todas las descargas llevan la marca Kardo abajo a la derecha, fuera del código."
      footer={
        <>
          {canOpenSheet ? (
            <button
              className="button button-ghost qrs-footer-start"
              onClick={onOpenSheet}
              type="button"
            >
              <Icon name="file-stack" size={16} /> Hoja con varios QR
            </button>
          ) : null}
          <button
            className="button button-secondary"
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            aria-busy={isExporting || undefined}
            className="button button-primary"
            disabled={!canDownload}
            onClick={() => void download()}
            type="button"
          >
            {isExporting ? (
              <>
                <span aria-hidden="true" className="button-spinner" />
                Generando…
              </>
            ) : (
              <>
                <Icon name="download" size={16} /> Descargar{" "}
                {formatInfo[format].label}
              </>
            )}
          </button>
        </>
      }
      onClose={onClose}
      open={open}
      size="large"
      title="Descargar tu QR"
    >
      <div className="qrs-export">
        {gate.problems.length ? (
          <GateProblems
            gate={gate}
            onFix={(section) => {
              onClose();
              onFix(section);
            }}
          />
        ) : gate.checking ? (
          <p className="qrs-status-line" role="status">
            <Icon className="qrs-spin" name="loader" size={16} /> Verificando
            que el código se lea antes de descargar…
          </p>
        ) : (
          <p className="qrs-status-line qrs-status-ok" role="status">
            <Icon name="shield-check" size={16} /> Verificado: el código se lee
            y abre esta página.
          </p>
        )}

        <Segmented
          fill
          hint={formatInfo[format].detail}
          label="Formato"
          onChange={setFormat}
          options={(["png", "svg", "pdf"] as const).map((value) => ({
            value,
            label: formatInfo[value].label,
            icon:
              value === "png"
                ? "file-image"
                : value === "svg"
                  ? "file-code"
                  : "printer",
          }))}
          value={format}
        />

        {needsSize ? (
          <div className="qrs-control">
            <div className="qrs-control-head">
              <span className="qrs-control-label" id={`${customId}-size`}>
                Ancho impreso del diseño
              </span>
            </div>
            <RadioGroup.Root
              aria-labelledby={`${customId}-size`}
              className="qrs-sizes"
              onValueChange={(next) => {
                if (next) setSizeId(next);
              }}
              value={sizeId}
            >
              {qrPrintSizes.map((size) => (
                <RadioGroup.Item
                  className="qrs-size"
                  key={size.id}
                  value={size.id}
                >
                  <strong>{size.label}</strong>
                  <small>{size.hint}</small>
                </RadioGroup.Item>
              ))}
              <RadioGroup.Item className="qrs-size" value="custom">
                <strong>Personalizado</strong>
                <small>En centímetros</small>
              </RadioGroup.Item>
            </RadioGroup.Root>
            {sizeId === "custom" ? (
              <div className="qrs-custom-size">
                <label htmlFor={customId}>Ancho en cm</label>
                <input
                  aria-invalid={!customValid || undefined}
                  className="input"
                  id={customId}
                  inputMode="decimal"
                  max={customCmRange.max}
                  min={customCmRange.min}
                  onChange={(event) => setCustomCm(event.target.value)}
                  step={0.5}
                  type="number"
                  value={customCm}
                />
                {!customValid ? (
                  <p className="qrs-hint qrs-hint-error">
                    Escribe un ancho entre {customCmRange.min} y{" "}
                    {customCmRange.max} cm.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {format === "png" ? (
          <Segmented
            fill
            hint="300 DPI es el estándar de imprenta. 150 basta para pantallas; 600 para impresión láser fina."
            label="Resolución"
            onChange={(value) => setDpi(Number(value))}
            options={qrDpiOptions.map((option) => ({
              value: String(option),
              label: `${option} DPI`,
            }))}
            value={String(dpi)}
          />
        ) : null}

        {needsSize && widthCm && moduleMm !== null && symbolCm !== null ? (
          <>
            <dl className="qrs-facts qrs-facts-wide">
              {format === "png" && widthPx && heightPx ? (
                <div>
                  <dt>Imagen</dt>
                  <dd>
                    {widthPx.toLocaleString("es-MX")} ×{" "}
                    {heightPx.toLocaleString("es-MX")} px
                  </dd>
                </div>
              ) : null}
              <div>
                <dt>Código</dt>
                <dd>
                  {numberFormat(symbolCm)} × {numberFormat(symbolCm)} cm
                </dd>
              </div>
              <div>
                <dt>Módulo</dt>
                <dd>{numberFormat(moduleMm, 2)} mm</dd>
              </div>
              <div>
                <dt>Se lee hasta</dt>
                <dd>{formatDistance(symbolCm * 10)}</dd>
              </div>
            </dl>
            {moduleMm < 0.4 ? (
              <p className="qrs-warning qrs-warning-error">
                <Icon name="octagon-alert" size={16} />
                <span>
                  Cada módulo mide menos de 0.4 mm: muchas cámaras e impresoras
                  no lo resuelven. Elige un tamaño mayor o una versión más
                  pequeña.
                </span>
              </p>
            ) : moduleMm < 0.8 ? (
              <p className="qrs-warning qrs-warning-warning">
                <Icon name="alert" size={16} />
                <span>
                  Módulos de {numberFormat(moduleMm, 2)} mm: funciona en buenas
                  impresoras, pero recomendamos al menos 0.8 mm para impresoras
                  caseras o laminados con brillo.
                </span>
              </p>
            ) : null}
          </>
        ) : null}

        {pngTooLarge ? (
          <p className="qrs-warning qrs-warning-error">
            <Icon name="octagon-alert" size={16} />
            <span>
              Ese tamaño supera {maxPngSide.toLocaleString("es-MX")} px por
              lado. Baja los DPI o usa SVG o PDF, que no tienen límite.
            </span>
          </p>
        ) : null}

        <p className="qrs-hint">
          <Icon name="info" size={13} /> Los colores se exportan en RGB. Si tu
          imprenta pide CMYK, que conviertan el archivo conservando el contraste
          entre módulos y fondo. Deja al menos el margen claro alrededor del
          código al recortar.
        </p>
      </div>
    </Dialog>
  );
}

function safeNumber(compute: () => number): number | null {
  try {
    const value = compute();
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/** Comfortable scanning distance ≈ 10 × code width. */
function formatDistance(cm: number): string {
  if (cm >= 100) return `${numberFormat(cm / 100)} m`;
  return `${Math.round(cm)} cm`;
}
