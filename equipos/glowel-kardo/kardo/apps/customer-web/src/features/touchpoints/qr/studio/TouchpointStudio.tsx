import type {
  QrDesign,
  QrTemplate,
  Touchpoint,
  TouchpointQrDesign,
} from "@kardo/contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  qrDesignsApi,
  qrExportsApi,
  qrTemplatesApi,
} from "../../../../api/qr-designs.js";
import { ConfirmDialog, Dialog } from "../../../../components/Dialog.js";
import { Icon } from "../../../../components/Icon.js";
import { Notice } from "../../../../components/Notice.js";
import { Skeleton } from "../../../../components/Skeleton.js";
import { useToast } from "../../../../components/Toast.js";
import { UnsavedChangesBar } from "../../../../components/UnsavedChangesBar.js";
import { errorMessage } from "../../../../lib/api.js";
import { formatRelative } from "../../../../lib/format.js";
import { useRouter } from "../../../../lib/router.js";
import { touchpointUrls } from "../../../../lib/touchpoint-urls.js";
import { useResource } from "../../../../lib/use-resource.js";
import { useWorkspace } from "../../../../workspace/WorkspaceContext.js";
import {
  NameDialog,
  TemplatePickerDialog,
  templateErrorMessage,
} from "../library/dialogs.js";
import { fingerprintOf } from "../library/fingerprints.js";
import {
  printState,
  usageCount,
  usageTotal,
  usedByText,
} from "../library/model.js";
import { useMarkQrDownloaded } from "../mark-downloaded.js";
import {
  defaultQrDesign,
  migrateLegacyQrDesign,
  normalizeQrDesign,
} from "../qr-design.js";
import { BatchExportDialog } from "./BatchExportDialog.js";
import { ExportDialog } from "./ExportDialog.js";
import { useStudioShortcuts, useTick, useUnsavedGuard } from "./effects.js";
import { stableKey } from "./history.js";
import { legacyLogoHref } from "./logo-cache.js";
import { OriginBanner, PrintStatus } from "./OriginBanner.js";
import { StudioBody } from "./StudioBody.js";
import {
  type SaveStatus,
  StudioHeader,
  StudioToolbar,
  ToolbarAction,
} from "./StudioChrome.js";
import type { LibraryBinding } from "./StudioContext.js";
import { useStudioCore } from "./useStudioCore.js";

const legacyKey = (touchpointId: string) => `kardo.qr-design.${touchpointId}`;
const emptyState: TouchpointQrDesign = {
  source: "default",
  design: null,
  updatedAt: null,
  template: null,
  group: null,
  lastExport: null,
};

type Legacy = { design: QrDesign; legacyLogo: string | null };

function readLegacy(touchpointId: string): Legacy | null {
  try {
    const raw = window.localStorage.getItem(legacyKey(touchpointId));
    if (!raw) return null;
    const migrated = migrateLegacyQrDesign(JSON.parse(raw));
    return migrated
      ? {
          design: migrated.design,
          legacyLogo: legacyLogoHref(migrated.legacyLogo),
        }
      : null;
  } catch {
    return null;
  }
}

/**
 * Loads a QR's design (or its browser-only v1 one) and opens the editor.
 * `backup`: the backup QR of an NFC (relevo 38). `download`: open straight
 * in the download dialog.
 */
export function TouchpointStudio({
  touchpoint,
  groupName,
  backup = false,
  download = false,
}: {
  touchpoint: Touchpoint;
  groupName: string | null;
  backup?: boolean;
  download?: boolean;
}) {
  const { workspace } = useWorkspace();
  const saved = useResource(
    `qr-design:${workspace.id}:${touchpoint.id}`,
    (signal) => qrDesignsApi.get(workspace.id, touchpoint.id, signal),
  );
  const [fallback, setFallback] = useState(false);

  const state = saved.data ?? (fallback ? emptyState : null);
  const legacy = useMemo(
    () =>
      state && state.source === "default" ? readLegacy(touchpoint.id) : null,
    [state, touchpoint.id],
  );

  if (!state) {
    return (
      <div className="page qrs-page">
        <StudioHeader
          backup={backup}
          groupName={groupName}
          touchpoint={touchpoint}
        />
        {saved.error ? (
          <Notice
            action={
              <>
                <button
                  className="text-action"
                  onClick={() => void saved.reload()}
                  type="button"
                >
                  Reintentar
                </button>
                <button
                  className="text-action"
                  onClick={() => setFallback(true)}
                  type="button"
                >
                  Abrir con el diseño Kardo
                </button>
              </>
            }
            title="No pudimos cargar el diseño de este QR"
            tone="danger"
            variant="banner"
          >
            {saved.error}
          </Notice>
        ) : (
          <Skeleton label="Cargando el diseño del QR…" lines={6} />
        )}
      </div>
    );
  }

  return (
    <TouchpointEditor
      backup={backup}
      download={download}
      groupName={groupName}
      initialState={state}
      legacy={legacy}
      loadWarning={
        fallback && !saved.data
          ? "Abriste el estudio sin el diseño guardado. Si guardas, lo reemplazas."
          : null
      }
      touchpoint={touchpoint}
    />
  );
}

type PendingAction = {
  title: string;
  description: string;
  confirmLabel: string;
  run: () => Promise<void>;
};

function TouchpointEditor({
  touchpoint,
  groupName,
  backup,
  download,
  initialState,
  legacy,
  loadWarning,
}: {
  touchpoint: Touchpoint;
  groupName: string | null;
  backup: boolean;
  download: boolean;
  initialState: TouchpointQrDesign;
  legacy: Legacy | null;
  loadWarning: string | null;
}) {
  const { workspace, can } = useWorkspace();
  const { notify } = useToast();
  const { navigate } = useRouter();
  const markDownloaded = useMarkQrDownloaded();
  const canEdit = can("touchpoints.manage");
  const readOnly = !canEdit;
  const url = touchpointUrls(touchpoint.publicId).qr;

  const [server, setServer] = useState(initialState);
  const [legacyPending, setLegacyPending] = useState(legacy !== null);
  const baseline = useMemo(
    () => (server.design ? normalizeQrDesign(server.design) : defaultQrDesign),
    [server.design],
  );
  const core = useStudioCore({
    initialDesign: legacy?.design ?? baseline,
    url,
    nombre: touchpoint.operationalName,
    legacyLogo: legacy?.legacyLogo,
  });
  const { history, design, templates } = core;
  const isDirty = legacyPending || stableKey(design) !== stableKey(baseline);
  const shared = server.source === "library" || server.source === "group";
  const template = server.template;
  const usage =
    (template &&
      templates.data?.find((item) => item.id === template.id)?.usage) ??
    null;

  const [isSaving, setIsSaving] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [isChoiceOpen, setChoiceOpen] = useState(false);
  const [isPickerOpen, setPickerOpen] = useState(false);
  const [isLibraryNameOpen, setLibraryNameOpen] = useState(false);
  // Opened to download («Corregir» in a download elsewhere): the dialog
  // opens with this QR, and the address drops `?descargar` so a later
  // reload opens the design, not the dialog again.
  const [isExportOpen, setExportOpen] = useState(download);
  const [isSheetOpen, setSheetOpen] = useState(false);
  useEffect(() => {
    if (download)
      navigate({ name: "qr-studio", id: touchpoint.id }, { replace: true });
  }, [download, navigate, touchpoint.id]);
  const [isResetOpen, setResetOpen] = useState(false);

  // --- Server actions --------------------------------------------------------
  /** Adopts a new server state; `reset` loads its design (drops edits). */
  const adopt = useCallback(
    (next: TouchpointQrDesign, reset: boolean) => {
      setServer(next);
      setLegacyPending(false);
      if (reset)
        history.reset(
          next.design ? normalizeQrDesign(next.design) : defaultQrDesign,
        );
    },
    [history],
  );

  /** Runs now, or after confirming that unsaved edits will be dropped. */
  function confirmIfDirty(action: PendingAction) {
    if (isDirty && !legacyPending) setPending(action);
    else void action.run();
  }

  async function perform(
    task: () => Promise<TouchpointQrDesign>,
    success: string,
    reset: boolean,
  ) {
    setIsBusy(true);
    try {
      adopt(await task(), reset);
      notify(success);
      void templates.reload();
      return true;
    } catch (error) {
      notify(templateErrorMessage(error), "error");
      return false;
    } finally {
      setIsBusy(false);
    }
  }

  const saveCustom = useCallback(
    async (message: string) => {
      setIsSaving(true);
      try {
        const response = await qrDesignsApi.save(
          workspace.id,
          touchpoint.id,
          design,
        );
        adopt(response, false);
        notify(message);
        void templates.reload();
      } catch (error) {
        notify(errorMessage(error), "error");
      } finally {
        setIsSaving(false);
      }
    },
    [adopt, design, notify, templates, touchpoint.id, workspace.id],
  );

  async function updateShared() {
    if (!template) return;
    setIsSaving(true);
    try {
      await qrTemplatesApi.update(workspace.id, template.id, { design });
      adopt({ ...server, design }, false);
      notify(
        usage && usageTotal(usage) > 1
          ? `«${template.name}» se actualizó: ${usedByText(usage)}.`
          : `«${template.name}» se actualizó.`,
      );
      void templates.reload();
    } catch (error) {
      notify(templateErrorMessage(error), "error");
    } finally {
      setIsSaving(false);
    }
  }

  const save = useCallback(() => {
    if (readOnly || isSaving) return;
    if (shared && template && !legacyPending) setChoiceOpen(true);
    else void saveCustom("Diseño guardado para este QR.");
  }, [isSaving, legacyPending, readOnly, saveCustom, shared, template]);

  function link(target: QrTemplate) {
    if (target.id === template?.id && server.source === "library") return;
    confirmIfDirty({
      title: `Usar «${target.name}»`,
      description:
        "Tienes cambios sin guardar. Si usas este diseño de la biblioteca, se descartan.",
      confirmLabel: "Descartar y usar",
      run: async () => {
        await perform(
          () =>
            qrDesignsApi.applyTemplate(workspace.id, touchpoint.id, target.id),
          `Ahora usa «${target.name}» de la biblioteca.`,
          true,
        );
      },
    });
  }

  function inherit() {
    const groupTemplate = server.group?.template;
    confirmIfDirty({
      title: groupTemplate
        ? `Usar el diseño del grupo «${server.group?.name ?? ""}»`
        : "Volver al diseño Kardo",
      description:
        "Tienes cambios sin guardar. Si cambias de diseño, se descartan.",
      confirmLabel: "Descartar y cambiar",
      run: async () => {
        await perform(
          () => qrDesignsApi.inherit(workspace.id, touchpoint.id),
          groupTemplate
            ? `Ahora hereda «${groupTemplate.name}» del grupo «${server.group?.name ?? ""}».`
            : "Ahora usa el diseño Kardo por defecto.",
          true,
        );
      },
    });
  }

  // A stable binding whose `use` always runs the latest `link`.
  const linkRef = useRef(link);
  linkRef.current = link;
  const currentTemplateId = template?.id ?? null;
  const library = useMemo<LibraryBinding | null>(
    () =>
      readOnly
        ? null
        : { currentTemplateId, use: (target) => linkRef.current(target) },
    [readOnly, currentTemplateId],
  );

  // --- Print tracking --------------------------------------------------------
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const designKey = stableKey(design);
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by content
  useEffect(() => {
    let cancelled = false;
    setFingerprint(null);
    void fingerprintOf(design).then((value) => {
      if (!cancelled) setFingerprint(value);
    });
    return () => {
      cancelled = true;
    };
  }, [designKey]);

  async function recordExport(format: "png" | "svg" | "pdf") {
    try {
      const printed = await fingerprintOf(design);
      await qrExportsApi.record(workspace.id, {
        format,
        items: [{ touchpointId: touchpoint.id, fingerprint: printed }],
      });
      markDownloaded([touchpoint.id]);
      setServer((current) => ({
        ...current,
        lastExport: {
          at: new Date().toISOString(),
          fingerprint: printed,
          format,
        },
      }));
    } catch {
      notify(
        "El archivo se descargó bien, pero no pudimos registrar la impresión.",
        "info",
      );
    }
  }

  async function refreshLastExport() {
    try {
      const fresh = await qrDesignsApi.get(workspace.id, touchpoint.id);
      setServer((current) => ({ ...current, lastExport: fresh.lastExport }));
    } catch {
      // The print still happened; the status refreshes on the next visit.
    }
  }

  // --- Guards, shortcuts, status ---------------------------------------------
  useUnsavedGuard(
    isDirty && !readOnly,
    "Si sales ahora, se pierden los cambios del diseño de este QR.",
  );
  useStudioShortcuts({
    enabled: !readOnly,
    undo: history.undo,
    redo: history.redo,
    save,
  });
  useTick();

  const status: SaveStatus = readOnly
    ? { kind: "readonly" }
    : isSaving
      ? { kind: "saving" }
      : isDirty
        ? { kind: "dirty" }
        : server.source === "custom" && server.updatedAt
          ? {
              kind: "saved",
              label: `Guardado ${formatRelative(server.updatedAt)}`,
            }
          : shared && template
            ? { kind: "saved", label: `Al día con «${template.name}»` }
            : { kind: "never", label: "Diseño Kardo por defecto" };

  const saveTemplateNameInitial =
    `Diseño de ${touchpoint.operationalName}`.slice(0, 60);

  return (
    <div
      className="page qrs-page"
      data-dirty={(isDirty && !readOnly) || undefined}
    >
      <StudioHeader
        backup={backup}
        groupName={groupName}
        touchpoint={touchpoint}
      />
      {loadWarning ? <Notice tone="warning">{loadWarning}</Notice> : null}
      {legacyPending && !readOnly ? (
        <Notice tone="info">
          Recuperamos el diseño que tenías en este navegador. Guárdalo para
          tenerlo en todos tus dispositivos y con todo tu equipo.
        </Notice>
      ) : null}
      {readOnly ? (
        <Notice tone="info">
          Tu rol permite ver y exportar este diseño, pero no cambiarlo.
        </Notice>
      ) : null}

      <OriginBanner
        busy={isBusy || isSaving}
        onInherit={inherit}
        onPersonalize={() =>
          void saveCustom(
            "Este QR ahora tiene su propio diseño. Los cambios del diseño compartido ya no le llegan.",
          )
        }
        onPickLibrary={() => setPickerOpen(true)}
        onSaveToLibrary={() => setLibraryNameOpen(true)}
        print={
          <PrintStatus
            lastExport={server.lastExport}
            state={printState(server.lastExport, fingerprint)}
          />
        }
        readOnly={readOnly}
        state={server}
        usage={usage}
      />

      <StudioToolbar
        canEdit={canEdit}
        canRedo={history.canRedo}
        canUndo={history.canUndo}
        isDirty={isDirty}
        isSaving={isSaving}
        onExport={() => setExportOpen(true)}
        onRedo={history.redo}
        onReset={() => setResetOpen(true)}
        onSave={save}
        onUndo={history.undo}
        secondary={
          <>
            <ToolbarAction href={url} icon="external" label="Probar enlace" />
            {canEdit ? (
              <ToolbarAction
                icon="bookmark-plus"
                label="Guardar en la biblioteca"
                onClick={() => setLibraryNameOpen(true)}
              />
            ) : null}
          </>
        }
        status={status}
      />

      <StudioBody
        alt={`Vista previa del código QR de ${touchpoint.operationalName}`}
        canManageTemplates={canEdit}
        core={core}
        library={library}
        mockupName={touchpoint.operationalName}
        openSaveTemplate={canEdit ? () => setLibraryNameOpen(true) : null}
        readOnly={readOnly}
      />

      {isDirty && !readOnly ? (
        <UnsavedChangesBar
          isSaving={isSaving}
          message={
            legacyPending
              ? "Este diseño aún no está guardado"
              : shared
                ? "Cambiaste un diseño compartido"
                : "Tienes cambios sin guardar"
          }
          onDiscard={
            legacyPending
              ? undefined
              : () => {
                  history.update(() => baseline);
                  notify("Cambios descartados.", "info", {
                    action: { label: "Deshacer", onClick: history.undo },
                  });
                }
          }
          onSave={save}
          saveLabel="Guardar diseño"
        />
      ) : null}

      <SaveChoiceDialog
        isSaving={isSaving}
        onClose={() => setChoiceOpen(false)}
        onSaveCustom={() => {
          setChoiceOpen(false);
          void saveCustom(
            "Guardado solo para este QR: ahora tiene su propio diseño.",
          );
        }}
        onUpdateShared={() => {
          setChoiceOpen(false);
          void updateShared();
        }}
        open={isChoiceOpen}
        templateName={template?.name ?? ""}
        usage={usage}
      />

      <TemplatePickerDialog
        brandAssetId={core.brandAssetId}
        confirmLabel="Usar este diseño"
        currentId={server.source === "library" ? (template?.id ?? null) : null}
        description={
          isDirty && !legacyPending
            ? "Se aplica por referencia: si el diseño cambia en la biblioteca, este QR cambia con él. Tus cambios sin guardar se descartan."
            : "Se aplica por referencia: si el diseño cambia en la biblioteca, este QR cambia con él."
        }
        onClose={() => setPickerOpen(false)}
        onPick={async (templateId) => {
          const target = templates.data?.find((item) => item.id === templateId);
          if (!target) return "Elige un diseño de la biblioteca.";
          const ok = await perform(
            () =>
              qrDesignsApi.applyTemplate(
                workspace.id,
                touchpoint.id,
                target.id,
              ),
            `Ahora usa «${target.name}» de la biblioteca.`,
            true,
          );
          if (ok) setPickerOpen(false);
          return null;
        }}
        open={isPickerOpen}
        templates={templates.data ?? []}
        title="Elegir de la biblioteca"
      />

      <NameDialog
        confirmLabel="Guardar en la biblioteca"
        description="Se guarda con el aspecto actual y este QR pasa a usarlo. Luego puedes aplicarlo a otros QR o grupos."
        initialName={saveTemplateNameInitial}
        onClose={() => setLibraryNameOpen(false)}
        onSubmit={async (name) => {
          try {
            const created = await qrTemplatesApi.create(workspace.id, {
              name,
              design,
            });
            const linked = await qrDesignsApi.applyTemplate(
              workspace.id,
              touchpoint.id,
              created.id,
            );
            adopt(linked, false);
            void templates.reload();
            setLibraryNameOpen(false);
            notify(
              `«${created.name}» quedó en la biblioteca y este QR lo usa.`,
            );
            return null;
          } catch (error) {
            return templateErrorMessage(error);
          }
        }}
        open={isLibraryNameOpen}
        title="Guardar en la biblioteca"
      />

      <ConfirmDialog
        confirmLabel={pending?.confirmLabel ?? "Continuar"}
        description={pending?.description ?? ""}
        isBusy={isBusy}
        onClose={() => setPending(null)}
        onConfirm={() => {
          const action = pending;
          setPending(null);
          if (action) void action.run();
        }}
        open={pending !== null}
        title={pending?.title ?? ""}
      />

      <ExportDialog
        build={core.build}
        canOpenSheet
        gate={core.gate}
        onClose={() => setExportOpen(false)}
        onExported={(format) => void recordExport(format)}
        onFix={core.goToSection}
        onOpenSheet={() => {
          setExportOpen(false);
          setSheetOpen(true);
        }}
        open={isExportOpen}
        touchpointName={touchpoint.operationalName}
      />
      <BatchExportDialog
        brandAssetId={core.brandAssetId}
        notice={
          isDirty ? (
            <Notice tone="info">
              La hoja usa los diseños guardados. Guarda antes si quieres
              imprimir tus cambios en este QR.
            </Notice>
          ) : null
        }
        onClose={() => setSheetOpen(false)}
        onExported={() => void refreshLastExport()}
        open={isSheetOpen}
        preselect={{
          touchpointIds: [touchpoint.id],
          groupId: touchpoint.groupId ?? null,
        }}
      />
      <ConfirmDialog
        confirmLabel="Restablecer"
        description="El diseño vuelve al predeterminado de Kardo: formas, colores, logo y marco. No se guarda hasta que pulses Guardar, y puedes deshacerlo."
        onClose={() => setResetOpen(false)}
        onConfirm={() => {
          history.update(() => defaultQrDesign);
          setResetOpen(false);
          notify("Diseño restablecido.", "info", {
            action: { label: "Deshacer", onClick: history.undo },
          });
        }}
        open={isResetOpen}
        title="Restablecer diseño"
      />
    </div>
  );
}

/**
 * Saving edits to a design this Touchpoint shares: update the library design
 * for everyone, or keep them only here (it stops following the shared one).
 */
function SaveChoiceDialog({
  open,
  templateName,
  usage,
  isSaving,
  onClose,
  onUpdateShared,
  onSaveCustom,
}: {
  open: boolean;
  templateName: string;
  usage: { touchpoints: number; groups: number } | null;
  isSaving: boolean;
  onClose: () => void;
  onUpdateShared: () => void;
  onSaveCustom: () => void;
}) {
  const reach =
    usage && usageTotal(usage)
      ? `Se actualizará en ${usageCount(usage)}.`
      : "Se actualizará en todos los QR y grupos que lo usan.";
  return (
    <Dialog
      description={`Este QR usa «${templateName}», un diseño compartido de la biblioteca.`}
      footer={
        <button
          className="button button-secondary"
          onClick={onClose}
          type="button"
        >
          Cancelar
        </button>
      }
      onClose={onClose}
      open={open}
      title="¿Dónde guardamos los cambios?"
    >
      <div className="qrs-choice-list">
        <button
          className="qrs-choice"
          disabled={isSaving}
          onClick={onUpdateShared}
          type="button"
        >
          <span aria-hidden="true" className="qrs-choice-icon">
            <Icon name="template" size={18} />
          </span>
          <span className="qrs-choice-copy">
            <strong>Actualizar el diseño compartido</strong>
            <small>
              {reach} Los QR impresos siguen funcionando; solo cambian las
              nuevas impresiones.
            </small>
          </span>
        </button>
        <button
          className="qrs-choice"
          disabled={isSaving}
          onClick={onSaveCustom}
          type="button"
        >
          <span aria-hidden="true" className="qrs-choice-icon">
            <Icon name="edit" size={18} />
          </span>
          <span className="qrs-choice-copy">
            <strong>Guardar solo para este QR</strong>
            <small>
              Se separa de «{templateName}»: los cambios futuros del diseño
              compartido ya no le llegarán.
            </small>
          </span>
        </button>
      </div>
    </Dialog>
  );
}
