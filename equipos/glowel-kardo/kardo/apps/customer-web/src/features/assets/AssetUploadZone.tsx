import type { Asset } from "@kardo/contracts";
import { type DragEvent, useState } from "react";
import { maxAssetBytes } from "../../api/assets.js";
import { Icon } from "../../components/Icon.js";
import { Notice } from "../../components/Notice.js";
import { useToast } from "../../components/Toast.js";
import { errorMessage } from "../../lib/api.js";
import { formatBytes } from "../../lib/format.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { assetFileProblem, uploadAsset } from "./upload.js";

type UploadStep =
  | "idle"
  | "authorizing"
  | "uploading"
  | "verifying"
  | "done"
  | "error";

const stepOrder: Record<UploadStep, number> = {
  idle: -1,
  authorizing: 0,
  uploading: 1,
  verifying: 2,
  done: 3,
  error: -1,
};

const stepLabels: {
  key: "authorizing" | "uploading" | "verifying";
  label: string;
}[] = [
  { key: "authorizing", label: "Autorizando" },
  { key: "uploading", label: "Subiendo" },
  { key: "verifying", label: "Verificando" },
];

function stepClassName(key: UploadStep, current: UploadStep): string {
  if (current === "done" || stepOrder[current] > stepOrder[key])
    return "upload-step upload-step-done";
  if (stepOrder[current] === stepOrder[key])
    return "upload-step upload-step-current";
  return "upload-step upload-step-pending";
}

/** The checks the panel can do before uploading: the one rule in
 * `upload.ts` (domain audit A2-46). */
export const validateAssetFile = assetFileProblem;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * `assetsApi.upload` performs the authorization, the storage PUT and the
 * finalization as a single call: it exposes no progress callback. The step
 * indicator advances on a short timer while the real request is in flight, and
 * jumps straight to "Verificando" once the request settles, so the three
 * server-side steps stay visible without inventing fake percentages.
 */
export function AssetUploadZone({
  onUploaded,
}: {
  onUploaded: (asset: Asset) => void;
}) {
  const { workspace } = useWorkspace();
  const { notify } = useToast();
  const [step, setStep] = useState<UploadStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  async function handleFile(file: File) {
    const validationError = validateAssetFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setStep("authorizing");
    let settled = false;
    const advanceToUploading = window.setTimeout(() => {
      if (!settled)
        setStep((current) =>
          current === "authorizing" ? "uploading" : current,
        );
    }, 350);
    const advanceToVerifying = window.setTimeout(() => {
      if (!settled)
        setStep((current) => (current === "uploading" ? "verifying" : current));
    }, 1_100);
    try {
      // The library lists a rejected file with its reason, so it is kept.
      const asset = await uploadAsset(workspace.id, file, {
        allowUnvalidated: true,
      });
      settled = true;
      window.clearTimeout(advanceToUploading);
      window.clearTimeout(advanceToVerifying);
      setStep("verifying");
      await delay(200);
      setStep("done");
      onUploaded(asset);
      if (asset.status === "validated")
        notify(`"${asset.filename}" se subió y quedó validado.`);
      else if (asset.status === "rejected")
        notify(
          `"${asset.filename}" fue rechazado. Revisa que sea una imagen o PDF válido.`,
          "error",
        );
      else notify(`"${asset.filename}" está en revisión.`, "info");
    } catch (requestError) {
      settled = true;
      window.clearTimeout(advanceToUploading);
      window.clearTimeout(advanceToVerifying);
      setStep("error");
      setError(errorMessage(requestError));
    } finally {
      window.setTimeout(
        () => setStep((current) => (current === "error" ? current : "idle")),
        1_600,
      );
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  const announcement =
    step === "authorizing"
      ? "Autorizando la carga."
      : step === "uploading"
        ? "Subiendo el archivo."
        : step === "verifying"
          ? "Verificando el archivo."
          : step === "done"
            ? "Carga terminada."
            : "";

  return (
    <section aria-labelledby="upload-heading" className="panel upload-panel">
      <h2 className="visually-hidden" id="upload-heading">
        Subir un archivo
      </h2>
      <p className="upload-privacy-note">
        Los originales son privados; solo se publica un derivado verificado a
        través de la página activa. Quitamos automáticamente los metadatos (como
        la ubicación GPS) de las fotos.
      </p>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop is a pointer convenience only; the "Elegir archivo" label below is the fully keyboard-accessible path. */}
      <div
        className={
          isDragging ? "upload-zone upload-zone-active" : "upload-zone"
        }
        onDragLeave={() => setIsDragging(false)}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDrop={onDrop}
      >
        <span aria-hidden="true" className="upload-zone-icon">
          <Icon name="upload" size={22} />
        </span>
        <p>Arrastra un archivo aquí o elige uno de tu equipo.</p>
        <label className="button button-secondary">
          Elegir archivo
          <input
            accept=".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf"
            className="visually-hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void handleFile(file);
            }}
            type="file"
          />
        </label>
        <p className="upload-zone-hint">
          PNG, JPEG, WebP o PDF, máximo {formatBytes(maxAssetBytes)}.
        </p>
      </div>

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {step !== "idle" && step !== "error" ? (
        <>
          <ol aria-hidden="true" className="upload-steps">
            {stepLabels.map((item) => (
              <li className={stepClassName(item.key, step)} key={item.key}>
                {item.label}
              </li>
            ))}
          </ol>
          <p aria-live="polite" className="visually-hidden" role="status">
            {announcement}
          </p>
        </>
      ) : null}
    </section>
  );
}
