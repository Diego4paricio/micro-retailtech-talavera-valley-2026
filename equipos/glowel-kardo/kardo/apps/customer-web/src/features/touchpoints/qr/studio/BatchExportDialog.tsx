import type { Touchpoint } from "@kardo/contracts";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { qrExportsApi } from "../../../../api/qr-designs.js";
import { Dialog } from "../../../../components/Dialog.js";
import { Icon } from "../../../../components/Icon.js";
import { useToast } from "../../../../components/Toast.js";
import { isAbortError } from "../../../../lib/api.js";
import { downloadFile, safeFilename } from "../../../../lib/download.js";
import { touchpointUrls } from "../../../../lib/touchpoint-urls.js";
import { useWorkspace } from "../../../../workspace/WorkspaceContext.js";
import {
  type LogoRaster,
  type PrintPaper,
  type Scene,
  scenesToSheetPdf,
  verifyLegibility,
} from "../engine/index.js";
import { fingerprintOf } from "../library/fingerprints.js";
import { qrSourceLabels } from "../library/model.js";
import {
  TouchpointChecklist,
  toggleIds,
  useQrTouchpoints,
} from "../library/TouchpointChecklist.js";
import { useResolvedQrs } from "../library/useResolvedQrs.js";
import { useMarkQrDownloaded } from "../mark-downloaded.js";
import { defaultQrDesign } from "../qr-design.js";
import { Segmented, SwitchField } from "./controls.js";
import { buildDesign } from "./hooks.js";
import { loadLogoRaster, logoAssetId } from "./useLogoRaster.js";

const widthOptions = [3, 4, 5, 6, 8] as const;

type Failure = { name: string; reason: string };
type Progress = { done: number; total: number; current: string } | null;

/** Who starts selected when the sheet dialog opens. */
export type SheetPreselect = {
  touchpointIds?: readonly string[] | undefined;
  /** Every Touchpoint currently using this library design. */
  templateId?: string | undefined;
  /** Every QR Touchpoint of this group. */
  groupId?: string | null | undefined;
};

/**
 * "Hoja con varios QR": several QR Touchpoints — each with its own address,
 * its own design (the one a new print uses) and its {nombre} — verified one
 * by one and laid out on A4/Carta pages with captions and crop marks. The
 * print is recorded so the Estudio QR can tell when a design changed since.
 */
export function BatchExportDialog({
  open,
  onClose,
  preselect,
  brandAssetId,
  notice,
  onExported,
}: {
  open: boolean;
  onClose: () => void;
  preselect: SheetPreselect;
  brandAssetId: string | null | undefined;
  notice?: ReactNode | undefined;
  onExported?: (() => void) | undefined;
}) {
  const { workspace, groups } = useWorkspace();
  const { notify } = useToast();
  const markDownloaded = useMarkQrDownloaded();
  const { items: candidates, sections } = useQrTouchpoints();
  const resolved = useResolvedQrs(open);

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [paper, setPaper] = useState<PrintPaper>("letter");
  const [widthCm, setWidthCm] = useState<number>(5);
  const [cropMarks, setCropMarks] = useState(true);
  const [progress, setProgress] = useState<Progress>(null);
  const [failures, setFailures] = useState<readonly Failure[]>([]);
  const controller = useRef<AbortController | null>(null);
  const initialized = useRef(false);

  const { byTouchpoint, isLoading } = resolved;
  // Selection starts once, when the dialog opens and the designs are known.
  useEffect(() => {
    if (!open) {
      initialized.current = false;
      return;
    }
    if (initialized.current || isLoading) return;
    initialized.current = true;
    const ids = new Set(preselect.touchpointIds ?? []);
    for (const item of candidates) {
      if (preselect.groupId && item.groupId === preselect.groupId)
        ids.add(item.id);
      if (
        preselect.templateId &&
        byTouchpoint.get(item.id)?.templateId === preselect.templateId
      )
        ids.add(item.id);
    }
    setSelected(ids);
    setFailures([]);
    setProgress(null);
  }, [open, isLoading, byTouchpoint, candidates, preselect]);

  useEffect(() => () => controller.current?.abort(), []);

  const chosen = candidates.filter((item) => selected.has(item.id));
  const isRunning = progress !== null;
  const usesName = chosen.some((item) =>
    (byTouchpoint.get(item.id)?.design ?? defaultQrDesign).frame.text.includes(
      "{nombre}",
    ),
  );

  function close() {
    controller.current?.abort();
    onClose();
  }

  async function logoFor(touchpoint: Touchpoint): Promise<LogoRaster | null> {
    const design = byTouchpoint.get(touchpoint.id)?.design ?? defaultQrDesign;
    const assetId = logoAssetId(design.logo, brandAssetId);
    if (!design.logo) return null;
    if (!assetId) throw new Error("logo");
    return loadLogoRaster(workspace.id, assetId);
  }

  async function generate() {
    if (!chosen.length) return;
    const run = new AbortController();
    controller.current = run;
    const items: { scene: Scene; caption: string }[] = [];
    const printed: { touchpointId: string; fingerprint: string }[] = [];
    const failed: Failure[] = [];
    setFailures([]);
    try {
      for (const [index, touchpoint] of chosen.entries()) {
        setProgress({
          done: index,
          total: chosen.length,
          current: touchpoint.operationalName,
        });
        const design =
          byTouchpoint.get(touchpoint.id)?.design ?? defaultQrDesign;
        let logo: LogoRaster | null;
        try {
          logo = await logoFor(touchpoint);
        } catch {
          failed.push({
            name: touchpoint.operationalName,
            reason: "Su logo no está disponible ahora.",
          });
          continue;
        }
        const url = touchpointUrls(touchpoint.publicId).qr;
        const result = buildDesign({
          url,
          design,
          logo,
          nombre: touchpoint.operationalName,
        });
        if (!result.ok) {
          failed.push({
            name: touchpoint.operationalName,
            reason: result.error,
          });
          continue;
        }
        const blocking = result.build.analysis.warnings.find(
          (warning) => warning.level === "error",
        );
        if (blocking) {
          failed.push({
            name: touchpoint.operationalName,
            reason: blocking.message,
          });
          continue;
        }
        const report = await verifyLegibility(result.build.scene, url, {
          signal: run.signal,
        });
        const critical = report.checks.find(
          (check) => check.critical && !check.passed,
        );
        if (!report.ok || critical) {
          failed.push({
            name: touchpoint.operationalName,
            reason: critical
              ? `No pasó la comprobación «${critical.label}».`
              : "No se pudo leer con su dirección.",
          });
          continue;
        }
        items.push({
          scene: result.build.scene,
          caption: touchpoint.operationalName,
        });
        printed.push({
          touchpointId: touchpoint.id,
          fingerprint: await fingerprintOf(design),
        });
      }
      setFailures(failed);
      if (!items.length) {
        notify(
          "Ningún código pasó la verificación de lectura: no generamos la hoja.",
          "error",
        );
        return;
      }
      setProgress({ done: chosen.length, total: chosen.length, current: "" });
      const title = sheetTitle(chosen, groups.data ?? []);
      const blob = await scenesToSheetPdf(items, {
        paper,
        widthMm: widthCm * 10,
        cropMarks,
        title,
      });
      downloadFile(blob, `${safeFilename(title)}-hoja-qr.pdf`);
      notify(
        failed.length
          ? `Hoja descargada con ${items.length} códigos. ${failed.length} no pasaron la verificación.`
          : `Hoja descargada con ${items.length} ${items.length === 1 ? "código" : "códigos"}.`,
        failed.length ? "info" : "success",
      );
      try {
        await qrExportsApi.record(workspace.id, {
          format: "sheet",
          items: printed,
        });
        markDownloaded(printed.map((item) => item.touchpointId));
        onExported?.();
      } catch {
        notify(
          "La hoja se descargó bien, pero no pudimos registrar la impresión.",
          "info",
        );
      }
      if (!failed.length) onClose();
    } catch (error) {
      if (!isAbortError(error) && !run.signal.aborted)
        notify(
          "No pudimos generar la hoja. Intenta de nuevo con menos códigos.",
          "error",
        );
    } finally {
      setProgress(null);
      controller.current = null;
    }
  }

  return (
    <Dialog
      description="Cada código lleva su propia dirección y el diseño que tiene asignado. Kardo verifica que se lea antes de armar el PDF."
      footer={
        <>
          <button
            className="button button-secondary"
            onClick={close}
            type="button"
          >
            {isRunning ? "Detener" : "Cancelar"}
          </button>
          <button
            aria-busy={isRunning || undefined}
            className="button button-primary"
            disabled={!chosen.length || isRunning || isLoading}
            onClick={() => void generate()}
            type="button"
          >
            {isRunning ? (
              <>
                <span aria-hidden="true" className="button-spinner" />
                Generando…
              </>
            ) : (
              <>
                <Icon name="download" size={16} />
                {`Generar hoja (${chosen.length})`}
              </>
            )}
          </button>
        </>
      }
      onClose={close}
      open={open}
      size="large"
      title="Hoja con varios QR"
    >
      <div className="qrs-batch">
        {notice ? <div className="qrs-batch-notice">{notice}</div> : null}
        {resolved.error ? (
          <p className="qrs-hint qrs-hint-error">{resolved.error}</p>
        ) : null}
        <TouchpointChecklist
          describe={(item) => {
            const row = byTouchpoint.get(item.id);
            if (!row) return isLoading ? "Cargando diseño…" : "Diseño Kardo";
            return row.templateName
              ? `«${row.templateName}» (${qrSourceLabels[row.source].toLowerCase()})`
              : row.source === "custom"
                ? "Diseño propio"
                : "Diseño Kardo";
          }}
          disabled={isRunning}
          legend="Tus QR"
          onToggle={(ids, checked) =>
            setSelected((current) => toggleIds(current, ids, checked))
          }
          sections={sections}
          selected={selected}
        />

        <div className="qrs-batch-options">
          <Segmented
            disabled={isRunning}
            fill
            label="Papel"
            onChange={(value) => setPaper(value)}
            options={[
              { value: "letter", label: "Carta" },
              { value: "a4", label: "A4" },
            ]}
            value={paper}
          />
          <Segmented
            disabled={isRunning}
            fill
            hint="Ancho de cada diseño impreso. Para mesas y mostradores, de 4 a 5 cm."
            label="Ancho de cada código"
            onChange={(value) => setWidthCm(Number(value))}
            options={widthOptions.map((value) => ({
              value: String(value),
              label: `${value} cm`,
            }))}
            value={String(widthCm)}
          />
          <SwitchField
            checked={cropMarks}
            description="Guías en las esquinas para recortar cada código."
            disabled={isRunning}
            label="Marcas de corte"
            onChange={setCropMarks}
          />
          <p className="qrs-hint">
            {usesName
              ? "Los marcos con {nombre} muestran el nombre de cada QR."
              : "Consejo: con {nombre} en el texto del marco, cada código muestra su nombre."}
          </p>
        </div>

        {progress ? (
          <div className="qrs-progress" role="status">
            <div className="qrs-progress-head">
              <span>
                {progress.done < progress.total
                  ? `Verificando ${progress.done + 1} de ${progress.total}: ${progress.current}`
                  : "Armando el PDF…"}
              </span>
            </div>
            <progress max={progress.total} value={progress.done} />
          </div>
        ) : null}

        {failures.length ? (
          <div className="qrs-gate qrs-gate-warning">
            <p className="qrs-gate-title">
              <Icon name="alert" size={16} /> No incluimos estos códigos
            </p>
            <ul>
              {failures.map((failure) => (
                <li key={failure.name}>
                  <span>
                    <strong>{failure.name}</strong>: {failure.reason}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

function sheetTitle(
  chosen: readonly Touchpoint[],
  groups: readonly { id: string; name: string }[],
): string {
  const groupIds = new Set(chosen.map((item) => item.groupId ?? null));
  if (groupIds.size === 1) {
    const [groupId] = [...groupIds];
    const group = groups.find((item) => item.id === groupId);
    if (group) return group.name;
  }
  return chosen.length === 1
    ? (chosen[0]?.operationalName ?? "Códigos QR")
    : "Códigos QR";
}
