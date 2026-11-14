import type { QrTemplateDetail } from "@kardo/contracts";
import { useCallback, useMemo, useState } from "react";
import { qrTemplatesApi } from "../../../../api/qr-designs.js";
import { ConfirmDialog } from "../../../../components/Dialog.js";
import { EmptyState } from "../../../../components/EmptyState.js";
import { Icon } from "../../../../components/Icon.js";
import { Notice } from "../../../../components/Notice.js";
import { Skeleton } from "../../../../components/Skeleton.js";
import { useToast } from "../../../../components/Toast.js";
import { UnsavedChangesBar } from "../../../../components/UnsavedChangesBar.js";
import { formatRelative } from "../../../../lib/format.js";
import { Link } from "../../../../lib/router.js";
import { touchpointUrls } from "../../../../lib/touchpoint-urls.js";
import { useResource } from "../../../../lib/use-resource.js";
import { useWorkspace } from "../../../../workspace/WorkspaceContext.js";
import {
  ApplyTemplateDialog,
  NameDialog,
  templateErrorMessage,
} from "../library/dialogs.js";
import { worstCasePreviewUrl } from "../library/fingerprints.js";
import {
  longest,
  usageCount,
  usageText,
  usageTotal,
  usedByText,
} from "../library/model.js";
import { useQrTouchpoints } from "../library/TouchpointChecklist.js";
import { defaultQrDesign, normalizeQrDesign } from "../qr-design.js";
import { BatchExportDialog } from "./BatchExportDialog.js";
import { useStudioShortcuts, useTick, useUnsavedGuard } from "./effects.js";
import { stableKey } from "./history.js";
import { StudioBody } from "./StudioBody.js";
import {
  type SaveStatus,
  StudioToolbar,
  TemplateHeader,
} from "./StudioChrome.js";
import { useStudioCore } from "./useStudioCore.js";

/** Loads a library design and opens it in the studio ("modo biblioteca"). */
export function TemplateStudio({ templateId }: { templateId: string }) {
  const { workspace } = useWorkspace();
  const detail = useResource(
    `qr-template:${workspace.id}:${templateId}`,
    (signal) => qrTemplatesApi.get(workspace.id, templateId, signal),
  );

  if (!detail.data) {
    if (detail.error)
      return (
        <div className="page">
          <EmptyState
            action={
              <Link className="button button-primary" to={{ name: "qr" }}>
                Ir a Diseño del QR
              </Link>
            }
            icon="qr"
            title="No encontramos este diseño"
          >
            {detail.error} Puede que alguien lo haya borrado de la biblioteca.
          </EmptyState>
        </div>
      );
    return (
      <div className="page qrs-page">
        <Skeleton label="Cargando el diseño…" lines={6} />
      </div>
    );
  }
  return <TemplateEditor initialDetail={detail.data} />;
}

function TemplateEditor({
  initialDetail,
}: {
  initialDetail: QrTemplateDetail;
}) {
  const { workspace, can } = useWorkspace();
  const { notify } = useToast();
  const { items: qrTouchpoints } = useQrTouchpoints();
  const canEdit = can("touchpoints.manage");
  const readOnly = !canEdit;

  const [detail, setDetail] = useState(initialDetail);
  const template = detail.template;
  const usage = template.usage;
  const baseline = useMemo(
    () => normalizeQrDesign(template.design),
    [template.design],
  );

  // Preview with the longest real address among its Touchpoints (the
  // densest code), or the longest possible one when nobody uses it yet.
  const users = useMemo(() => {
    const ids = new Set(detail.touchpointIds);
    const groups = new Set(detail.groupIds);
    return qrTouchpoints.filter(
      (item) => ids.has(item.id) || (item.groupId && groups.has(item.groupId)),
    );
  }, [detail.touchpointIds, detail.groupIds, qrTouchpoints]);
  const url = users.length
    ? longest(
        users.map((item) => touchpointUrls(item.publicId).qr),
        worstCasePreviewUrl(),
      )
    : worstCasePreviewUrl();
  const nombre = longest(
    users.map((item) => item.operationalName),
    "Mesa 12",
  );

  const core = useStudioCore({ initialDesign: baseline, url, nombre });
  const { history, design, templates } = core;
  const isDirty = stableKey(design) !== stableKey(baseline);

  const [isSaving, setIsSaving] = useState(false);
  const [isConfirmOpen, setConfirmOpen] = useState(false);
  const [isRenameOpen, setRenameOpen] = useState(false);
  const [isApplyOpen, setApplyOpen] = useState(false);
  const [isSheetOpen, setSheetOpen] = useState(false);
  const [isResetOpen, setResetOpen] = useState(false);

  const reloadDetail = useCallback(async () => {
    try {
      const fresh = await qrTemplatesApi.get(workspace.id, template.id);
      setDetail(fresh);
    } catch {
      // Keeps the current detail; the list refreshes on the next visit.
    }
  }, [template.id, workspace.id]);

  const update = useCallback(async () => {
    setIsSaving(true);
    try {
      const updated = await qrTemplatesApi.update(workspace.id, template.id, {
        design,
      });
      setDetail((current) => ({ ...current, template: updated }));
      notify(
        usageTotal(updated.usage)
          ? `«${updated.name}» se actualizó: ${usedByText(updated.usage)}.`
          : `«${updated.name}» se guardó.`,
      );
      void templates.reload();
    } catch (error) {
      notify(templateErrorMessage(error), "error");
    } finally {
      setIsSaving(false);
    }
  }, [design, notify, template.id, templates, workspace.id]);

  const save = useCallback(() => {
    if (readOnly || isSaving) return;
    if (usageTotal(usage)) setConfirmOpen(true);
    else void update();
  }, [isSaving, readOnly, update, usage]);

  useUnsavedGuard(
    isDirty && !readOnly,
    "Si sales ahora, se pierden los cambios de este diseño de QR.",
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
        : {
            kind: "saved",
            label: `Guardado ${formatRelative(template.updatedAt)}`,
          };

  const previewNote = users.length
    ? `Vista previa con la dirección más larga de sus ${users.length === 1 ? "QR" : `${users.length} QR`}: si se lee aquí, se lee en todos.`
    : "Vista previa con una dirección de ejemplo del peor caso (la más larga posible): la verificación es conservadora.";

  return (
    <div
      className="page qrs-page"
      data-dirty={(isDirty && !readOnly) || undefined}
    >
      <TemplateHeader
        meta={
          <>
            <span className="qrs-header-usage">{usageText(usage)}</span>
            <span className="qrs-header-edited">
              Editado {formatRelative(template.updatedAt)}
            </span>
          </>
        }
        name={template.name}
        onRename={canEdit ? () => setRenameOpen(true) : null}
      />
      <section aria-label="Cómo funciona" className="qrs-origin">
        <span aria-hidden="true" className="qrs-origin-icon">
          <Icon name="template" size={18} />
        </span>
        <div className="qrs-origin-copy">
          <p className="qrs-origin-title">Diseño compartido de la biblioteca</p>
          <p className="qrs-origin-text">
            {usageTotal(usage)
              ? `Al guardar, se actualiza en ${usageCount(usage)}. `
              : "Aún no lo usa ningún QR. Aplícalo a QR o grupos cuando esté listo. "}
            Los QR impresos siguen funcionando; solo cambian las nuevas
            impresiones.
          </p>
        </div>
        {canEdit ? (
          <div className="qrs-origin-actions">
            <button
              className="button button-secondary button-small"
              onClick={() => setApplyOpen(true)}
              type="button"
            >
              Aplicar a QR o grupos
            </button>
          </div>
        ) : null}
      </section>
      {readOnly ? (
        <Notice tone="info">
          Tu rol permite ver y exportar este diseño, pero no cambiarlo.
        </Notice>
      ) : null}

      <StudioToolbar
        canEdit={canEdit}
        canRedo={history.canRedo}
        canUndo={history.canUndo}
        exportLabel="Descargar hoja"
        isDirty={isDirty}
        isSaving={isSaving}
        onExport={() => setSheetOpen(true)}
        onRedo={history.redo}
        onReset={() => setResetOpen(true)}
        onSave={save}
        onUndo={history.undo}
        secondary={null}
        status={status}
      />

      <StudioBody
        alt={`Vista previa del diseño «${template.name}»`}
        canManageTemplates={canEdit}
        core={core}
        library={null}
        mockupName={nombre}
        openSaveTemplate={null}
        previewNote={previewNote}
        readOnly={readOnly}
      />

      {isDirty && !readOnly ? (
        <UnsavedChangesBar
          isSaving={isSaving}
          message={
            usageTotal(usage)
              ? "Cambiaste un diseño compartido"
              : "Tienes cambios sin guardar"
          }
          onDiscard={() => {
            history.update(() => baseline);
            notify("Cambios descartados.", "info", {
              action: { label: "Deshacer", onClick: history.undo },
            });
          }}
          onSave={save}
          saveLabel="Guardar diseño"
        />
      ) : null}

      <ConfirmDialog
        confirmLabel="Actualizar diseño"
        description={`Se actualizará en ${usageCount(usage)}. Los QR impresos siguen funcionando; solo cambian las nuevas impresiones.`}
        isBusy={isSaving}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          void update();
        }}
        open={isConfirmOpen}
        title={`¿Actualizar «${template.name}»?`}
      />
      <NameDialog
        confirmLabel="Renombrar"
        description="El nombre solo lo ve tu equipo; no cambia ningún QR."
        initialName={template.name}
        onClose={() => setRenameOpen(false)}
        onSubmit={async (name) => {
          try {
            const updated = await qrTemplatesApi.update(
              workspace.id,
              template.id,
              { name },
            );
            setDetail((current) => ({ ...current, template: updated }));
            void templates.reload();
            setRenameOpen(false);
            notify(`Renombraste el diseño a «${updated.name}».`);
            return null;
          } catch (error) {
            return templateErrorMessage(error);
          }
        }}
        open={isRenameOpen}
        title="Renombrar diseño"
      />
      <ApplyTemplateDialog
        onApplied={() => {
          void reloadDetail();
          void templates.reload();
        }}
        onClose={() => setApplyOpen(false)}
        open={isApplyOpen}
        template={{ id: template.id, name: template.name }}
      />
      <BatchExportDialog
        brandAssetId={core.brandAssetId}
        notice={
          isDirty ? (
            <Notice tone="info">
              La hoja usa el diseño guardado. Guarda antes si quieres imprimir
              tus cambios.
            </Notice>
          ) : !users.length ? (
            <Notice tone="info">
              Este diseño aún no lo usa ningún QR. Aplícalo primero o elige QR
              para imprimir los suyos.
            </Notice>
          ) : null
        }
        onClose={() => setSheetOpen(false)}
        open={isSheetOpen}
        preselect={{ templateId: template.id }}
      />
      <ConfirmDialog
        confirmLabel="Restablecer"
        description="El diseño vuelve al predeterminado de Kardo. No se guarda hasta que pulses Guardar, y puedes deshacerlo."
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
