import type {
  QrDesign,
  QrTemplate,
  Touchpoint,
  TouchpointQrDesign,
} from "@kardo/contracts";

/** What a recorded download leaves on the QR's state. */
export type QrLastExport = NonNullable<TouchpointQrDesign["lastExport"]>;

import { useState } from "react";
import { qrDesignsApi, qrExportsApi } from "../../api/qr-designs.js";
import { Dialog } from "../../components/Dialog.js";
import { Icon } from "../../components/Icon.js";
import { useToast } from "../../components/Toast.js";
import { errorMessage } from "../../lib/api.js";
import { useRouter } from "../../lib/router.js";
import { touchpointUrls } from "../../lib/touchpoint-urls.js";
import { type Resource, useResource } from "../../lib/use-resource.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { useWorkspaceProfile } from "../settings/use-workspace-profile.js";
import { DesignThumbnail } from "./qr/library/DesignThumbnail.js";
import { fingerprintOf } from "./qr/library/fingerprints.js";
import { useMarkQrDownloaded } from "./qr/mark-downloaded.js";
import { defaultQrDesign, normalizeQrDesign } from "./qr/qr-design.js";
import { ExportDialog, type Format } from "./qr/studio/ExportDialog.js";
import { useLegibility, useQrBuild } from "./qr/studio/hooks.js";
import { exportGate } from "./qr/studio/Legibility.js";
import { useLogoRaster } from "./qr/studio/useLogoRaster.js";

/** The brand logo a design may use (`undefined` while the profile loads). */
function useBrandAssetId(): string | null | undefined {
  const profile = useWorkspaceProfile();
  return profile.data !== null
    ? (profile.data.logoAssetId ?? null)
    : profile.error
      ? null
      : undefined;
}

/** The design a Touchpoint prints with (Kardo's when nothing is assigned). */
export function effectiveDesign(state: TouchpointQrDesign | null): QrDesign {
  return state?.design ? normalizeQrDesign(state.design) : defaultQrDesign;
}

/**
 * The Diseño del QR's own download dialog, opened right where the QR is
 * (owner, 2026-10-07: «que se descargue directo», no trip to the studio).
 * Same sizes, formats and legibility check. Every download is recorded, so
 * «Descargar» in «Conecta el objeto» (or «Respaldo», for an NFC's backup QR)
 * is marked at once. «Corregir» opens the studio of this same QR, in its
 * download dialog.
 */
export function QrDownloadDialog({
  touchpoint,
  design,
  url,
  open,
  onClose,
  onRecorded,
}: {
  touchpoint: Touchpoint;
  design: QrDesign;
  url: string;
  open: boolean;
  onClose: () => void;
  /** The recorded download, for a «Última descarga» on screen. */
  onRecorded?: ((lastExport: QrLastExport) => void) | undefined;
}) {
  const { workspace } = useWorkspace();
  const markDownloaded = useMarkQrDownloaded();
  const { notify } = useToast();
  const { navigate } = useRouter();
  const brandAssetId = useBrandAssetId();
  const logo = useLogoRaster({
    workspaceId: workspace.id,
    logo: design.logo,
    brandAssetId,
    revision: 0,
  });
  const result = useQrBuild({
    url,
    design,
    logo: logo.raster,
    nombre: touchpoint.operationalName,
  });
  const build = result.ok ? result.build : null;
  // The camera check only runs while the dialog is open.
  const legibility = useLegibility(open ? (build?.scene ?? null) : null, url);
  const gate = exportGate({
    buildError: result.ok ? null : result.error,
    analysis: build?.analysis ?? null,
    logo,
    legibility,
  });

  async function exported(format: Format) {
    try {
      const fingerprint = await fingerprintOf(design);
      await qrExportsApi.record(workspace.id, {
        format,
        items: [{ touchpointId: touchpoint.id, fingerprint }],
      });
      markDownloaded([touchpoint.id]);
      onRecorded?.({ at: new Date().toISOString(), fingerprint, format });
    } catch {
      notify(
        "El archivo se descargó bien, pero no pudimos registrar la descarga.",
        "info",
      );
    }
  }

  return (
    <ExportDialog
      build={build}
      canOpenSheet={false}
      gate={gate}
      onClose={onClose}
      onExported={(format) => void exported(format)}
      onFix={() => {
        // The fixes live in the studio, section by section: it opens on
        // this same QR, ready to download once fixed.
        onClose();
        navigate({ name: "qr-studio", id: touchpoint.id, download: true });
      }}
      onOpenSheet={() => undefined}
      open={open}
      touchpointName={touchpoint.operationalName}
    />
  );
}

type Choice = {
  key: string;
  label: string;
  design: QrDesign;
  selected: boolean;
  apply: (() => Promise<TouchpointQrDesign>) | null;
};

/**
 * Every design as a picture, not a name (owner, 2026-10-07): the one it
 * follows (its group's, or Kardo's), its own, and the library's. Picking one
 * assigns it to this QR; «Crear un diseño» opens the Estudio for it. There is
 * no separate «default»: each QR keeps what was picked, and a group's design
 * covers the QRs added to it later.
 */
export function QrDesignChooser({
  touchpoint,
  state,
  templates,
  canManage,
}: {
  touchpoint: Touchpoint;
  state: Resource<TouchpointQrDesign>;
  templates: Resource<QrTemplate[]>;
  canManage: boolean;
}) {
  const { workspace } = useWorkspace();
  const { notify } = useToast();
  const { navigate } = useRouter();
  const brandAssetId = useBrandAssetId();
  const [busy, setBusy] = useState<string | null>(null);
  const current = state.data;
  const library = templates.data ?? [];
  const url = touchpointUrls(touchpoint.publicId).qr;
  const groupTemplate = current?.group?.template
    ? library.find((item) => item.id === current.group?.template?.id)
    : undefined;
  const choices: Choice[] = [
    {
      key: "inherit",
      // The design may come from a group above its own (ADR 021): name the
      // design, not the group.
      label: groupTemplate ? `${groupTemplate.name} (del grupo)` : "Kardo",
      design: groupTemplate
        ? normalizeQrDesign(groupTemplate.design)
        : defaultQrDesign,
      selected: current?.source === "group" || current?.source === "default",
      apply: () => qrDesignsApi.inherit(workspace.id, touchpoint.id),
    },
    ...(current?.source === "custom" && current.design
      ? [
          {
            key: "custom",
            label: "Propio de este QR",
            design: normalizeQrDesign(current.design),
            selected: true,
            apply: null,
          },
        ]
      : []),
    ...library
      .filter((item) => item.id !== groupTemplate?.id)
      .map((item) => ({
        key: item.id,
        label: item.name,
        design: normalizeQrDesign(item.design),
        selected:
          current?.source === "library" && current.template?.id === item.id,
        apply: () =>
          qrDesignsApi.applyTemplate(workspace.id, touchpoint.id, item.id),
      })),
  ];

  async function pick(choice: Choice) {
    if (!choice.apply || choice.selected || !canManage) return;
    setBusy(choice.key);
    try {
      state.setData(await choice.apply());
      notify(
        `Este QR usa «${choice.label}». Los que ya imprimiste siguen funcionando.`,
      );
    } catch (cause) {
      notify(errorMessage(cause), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <fieldset className="tp-designs">
      <legend className="visually-hidden">Diseño del QR</legend>
      {choices.map((choice) => (
        <button
          aria-busy={busy === choice.key || undefined}
          aria-pressed={choice.selected}
          className="tp-design"
          disabled={!canManage || busy !== null}
          key={choice.key}
          onClick={() => void pick(choice)}
          type="button"
        >
          <DesignThumbnail
            brandAssetId={brandAssetId}
            className="tp-design-thumb"
            design={choice.design}
            nombre={touchpoint.operationalName}
            url={url}
            workspaceId={workspace.id}
          />
          <span>{choice.label}</span>
        </button>
      ))}
      {canManage ? (
        <button
          className="tp-design tp-design-new"
          onClick={() => navigate({ name: "qr-studio", id: touchpoint.id })}
          type="button"
        >
          <span className="tp-design-plus" aria-hidden="true">
            <Icon name="plus" size={22} />
          </span>
          <span>Crear un diseño</span>
        </button>
      ) : null}
    </fieldset>
  );
}

/** A QR's real design as a picture, sized by `className`. */
export function QrPicture({
  touchpoint,
  state,
  className,
}: {
  touchpoint: Touchpoint;
  state: Resource<TouchpointQrDesign>;
  className?: string | undefined;
}) {
  const { workspace } = useWorkspace();
  const brandAssetId = useBrandAssetId();
  if (!state.data) return <span aria-hidden="true" className={className} />;
  return (
    <DesignThumbnail
      brandAssetId={brandAssetId}
      className={className}
      design={effectiveDesign(state.data)}
      nombre={touchpoint.operationalName}
      url={touchpointUrls(touchpoint.publicId).qr}
      workspaceId={workspace.id}
    />
  );
}

/** The code this QR prints, large: its real design, with its logo. */
export function QrPreview({
  touchpoint,
  state,
}: {
  touchpoint: Touchpoint;
  state: Resource<TouchpointQrDesign>;
}) {
  const { workspace } = useWorkspace();
  const brandAssetId = useBrandAssetId();
  if (state.error && !state.data)
    return (
      <span className="tp-qr-preview tp-qr-preview-error">
        <span>No pudimos cargar su diseño.</span>
        <button
          className="text-action"
          onClick={() => void state.reload()}
          type="button"
        >
          Reintentar
        </button>
      </span>
    );
  return (
    <span className="tp-qr-preview">
      {state.isLoading && !state.data ? null : (
        <DesignThumbnail
          brandAssetId={brandAssetId}
          design={effectiveDesign(state.data)}
          nombre={touchpoint.operationalName}
          url={touchpointUrls(touchpoint.publicId).qr}
          workspaceId={workspace.id}
        />
      )}
    </span>
  );
}

/**
 * The download of one QR (or an NFC's backup QR) from anywhere outside its
 * page, such as the publish dialog (domain audit A9-2): it loads the QR's
 * real design and opens the same dialog as its page, with the legibility
 * check and a recorded download (so «Descárgalo» or «Respaldo» is marked).
 * Never Kardo's design in place of the business's, never a link's QR.
 */
export function TouchpointQrDownload({
  touchpoint,
  open,
  onClose,
}: {
  touchpoint: Touchpoint;
  open: boolean;
  onClose: () => void;
}) {
  const { workspace } = useWorkspace();
  const state = useResource(
    open ? `qr-design:${workspace.id}:${touchpoint.id}` : null,
    (signal) => qrDesignsApi.get(workspace.id, touchpoint.id, signal),
  );
  if (state.data)
    return (
      <QrDownloadDialog
        design={effectiveDesign(state.data)}
        onClose={onClose}
        onRecorded={(lastExport) =>
          state.setData((current) =>
            current ? { ...current, lastExport } : current,
          )
        }
        open={open}
        touchpoint={touchpoint}
        url={touchpointUrls(touchpoint.publicId).qr}
      />
    );
  return (
    <Dialog
      footer={
        <button
          className="button button-secondary"
          onClick={onClose}
          type="button"
        >
          Cerrar
        </button>
      }
      onClose={onClose}
      open={open}
      title={`Descargar «${touchpoint.operationalName}»`}
    >
      {state.error ? (
        <p>
          No pudimos cargar su diseño.{" "}
          <button
            className="text-action"
            onClick={() => void state.reload()}
            type="button"
          >
            Reintentar
          </button>
        </p>
      ) : (
        <p className="muted">Cargando su diseño…</p>
      )}
    </Dialog>
  );
}
