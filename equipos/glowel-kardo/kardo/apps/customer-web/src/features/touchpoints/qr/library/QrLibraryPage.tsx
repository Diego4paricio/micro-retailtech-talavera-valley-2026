import {
  maxQrTemplatesPerWorkspace,
  type QrTemplate,
  type TouchpointGroup,
} from "@kardo/contracts";
import { DropdownMenu } from "radix-ui";
import { useMemo, useState } from "react";
import { qrTemplatesApi } from "../../../../api/qr-designs.js";
import { ConfirmDialog } from "../../../../components/Dialog.js";
import { EmptyState } from "../../../../components/EmptyState.js";
import { Icon } from "../../../../components/Icon.js";
import { Notice } from "../../../../components/Notice.js";
import {
  PageHeader,
  SectionHeading,
} from "../../../../components/PageHeader.js";
import { Skeleton } from "../../../../components/Skeleton.js";
import { useToast } from "../../../../components/Toast.js";
import { formatRelative } from "../../../../lib/format.js";
import { Link, useRouter } from "../../../../lib/router.js";
import { useWorkspace } from "../../../../workspace/WorkspaceContext.js";
import { useWorkspaceProfile } from "../../../settings/use-workspace-profile.js";
import { defaultQrDesign } from "../qr-design.js";
import { DesignThumbnail } from "./DesignThumbnail.js";
import {
  ApplyTemplateDialog,
  NameDialog,
  NewDesignDialog,
  templateErrorMessage,
} from "./dialogs.js";
import { worstCasePreviewUrl } from "./fingerprints.js";
import { GroupDesignDialog } from "./GroupDesignDialog.js";
import { copyName, usageText, usageTotal, usedByText } from "./model.js";
import { QrInventory } from "./QrInventory.js";
import { useQrTouchpoints } from "./TouchpointChecklist.js";
import { useResolvedQrs } from "./useResolvedQrs.js";

const sampleName = "Mesa 12";

/**
 * Estudio QR (`/qr`): the organization's design library, the default
 * design of each group and every QR code with its design and print status.
 */
export function QrLibraryPage() {
  const { workspace, groups, can } = useWorkspace();
  const { navigate } = useRouter();
  const { notify } = useToast();
  const canEdit = can("touchpoints.manage");
  const profile = useWorkspaceProfile();
  const brandAssetId =
    profile.data !== null
      ? (profile.data.logoAssetId ?? null)
      : profile.error
        ? null
        : undefined;
  const resolved = useResolvedQrs();
  const { items: qrTouchpoints } = useQrTouchpoints();
  const templates = resolved.templates;
  const isFull = templates.length >= maxQrTemplatesPerWorkspace;

  const [isNewOpen, setNewOpen] = useState(false);
  const [applyTarget, setApplyTarget] = useState<QrTemplate | null>(null);
  const [renameTarget, setRenameTarget] = useState<QrTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<QrTemplate | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const deleteInUse = deleteTarget ? usageTotal(deleteTarget.usage) > 0 : false;
  const [groupTarget, setGroupTarget] = useState<TouchpointGroup | null>(null);

  async function duplicate(template: QrTemplate) {
    try {
      const created = await qrTemplatesApi.create(workspace.id, {
        name: copyName(template.name),
        design: template.design,
      });
      await resolved.reload();
      notify(`Duplicaste «${template.name}».`, "success", {
        action: {
          label: "Editar",
          onClick: () => navigate({ name: "qr-design", id: created.id }),
        },
      });
    } catch (error) {
      notify(templateErrorMessage(error), "error");
    }
  }

  async function remove() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await qrTemplatesApi.remove(workspace.id, deleteTarget.id);
      await resolved.reload();
      notify(`Borraste «${deleteTarget.name}» de la biblioteca.`);
      setDeleteTarget(null);
    } catch (error) {
      notify(templateErrorMessage(error, deleteTarget.usage), "error");
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  }

  const groupsWithCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of qrTouchpoints)
      if (item.groupId)
        counts.set(item.groupId, (counts.get(item.groupId) ?? 0) + 1);
    return (groups.data ?? []).map((group) => ({
      group,
      qrCount: counts.get(group.id) ?? 0,
    }));
  }, [groups.data, qrTouchpoints]);

  return (
    <div className="page qrl-page">
      <PageHeader
        actions={
          canEdit ? (
            <button
              className="button button-primary"
              disabled={isFull}
              onClick={() => setNewOpen(true)}
              type="button"
            >
              <Icon name="plus" /> Nuevo diseño
            </button>
          ) : null
        }
        description="Crea los diseños de tu organización una vez y aplícalos a tus QR y a grupos completos."
        eyebrow="Diseño de códigos"
        help="qr-studio"
        title="Diseño del QR"
      />

      <aside aria-label="Regla de oro" className="qrl-rule">
        <span aria-hidden="true" className="qrl-rule-icon">
          <Icon name="shield-check" size={20} />
        </span>
        <div>
          <p className="qrl-rule-title">
            Tus QR impresos nunca dejan de funcionar
          </p>
          <p className="qrl-rule-text">
            Cada QR guarda su dirección para siempre. Cambiar el diseño solo
            cambia cómo se verán las próximas impresiones; lo único que
            desactiva un QR es retirarlo.
          </p>
        </div>
      </aside>

      {resolved.error ? (
        <Notice
          action={
            <button
              className="text-action"
              onClick={() => void resolved.reload()}
              type="button"
            >
              Reintentar
            </button>
          }
          tone="danger"
        >
          {resolved.error}
        </Notice>
      ) : null}

      {/* --- Library -------------------------------------------------------- */}
      <section aria-labelledby="qrl-library" className="qrl-section">
        <SectionHeading
          description={`Diseños compartidos por toda la organización (${templates.length} de ${maxQrTemplatesPerWorkspace}). Si editas uno, se actualiza donde se usa.`}
          id="qrl-library"
          title="Biblioteca"
        />
        {resolved.isLoading ? (
          <Skeleton lines={3} />
        ) : templates.length ? (
          <ul className="qrl-grid">
            {templates.map((template) => (
              <li className="qrl-card" key={template.id}>
                <Link
                  className="qrl-card-link"
                  to={{ name: "qr-design", id: template.id }}
                >
                  <span className="qrl-card-stage">
                    <DesignThumbnail
                      brandAssetId={brandAssetId}
                      design={template.design}
                      nombre={sampleName}
                      url={worstCasePreviewUrl()}
                      workspaceId={workspace.id}
                    />
                  </span>
                  <span className="qrl-card-copy">
                    <strong>{template.name}</strong>
                    <small>{usageText(template.usage)}</small>
                    <small className="qrl-card-date">
                      Editado {formatRelative(template.updatedAt)}
                    </small>
                  </span>
                </Link>
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button
                      aria-label={`Acciones para ${template.name}`}
                      className="icon-button qrl-card-menu"
                      type="button"
                    >
                      <Icon name="more" />
                    </button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      align="end"
                      className="kd-dropdown-content"
                      sideOffset={6}
                    >
                      <DropdownMenu.Item
                        className="kd-dropdown-item"
                        onSelect={() =>
                          navigate({ name: "qr-design", id: template.id })
                        }
                      >
                        <Icon name="edit" size={16} />
                        {canEdit ? "Editar" : "Ver"}
                      </DropdownMenu.Item>
                      {canEdit ? (
                        <>
                          <DropdownMenu.Item
                            className="kd-dropdown-item"
                            onSelect={() => setApplyTarget(template)}
                          >
                            <Icon name="group" size={16} /> Aplicar a…
                          </DropdownMenu.Item>
                          <DropdownMenu.Item
                            className="kd-dropdown-item"
                            disabled={isFull}
                            onSelect={() => void duplicate(template)}
                          >
                            <Icon name="copy" size={16} /> Duplicar
                          </DropdownMenu.Item>
                          <DropdownMenu.Item
                            className="kd-dropdown-item"
                            onSelect={() => setRenameTarget(template)}
                          >
                            <Icon name="case-upper" size={16} /> Renombrar
                          </DropdownMenu.Item>
                          <DropdownMenu.Separator className="kd-dropdown-separator" />
                          <DropdownMenu.Item
                            className="kd-dropdown-item kd-dropdown-item-danger"
                            onSelect={() => setDeleteTarget(template)}
                          >
                            <Icon name="trash" size={16} /> Borrar
                          </DropdownMenu.Item>
                        </>
                      ) : null}
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </li>
            ))}
            {canEdit && !isFull ? (
              <li className="qrl-card qrl-card-new">
                <button
                  className="qrl-card-link"
                  onClick={() => setNewOpen(true)}
                  type="button"
                >
                  <span aria-hidden="true" className="qrl-card-stage">
                    <Icon name="plus" size={28} />
                  </span>
                  <span className="qrl-card-copy">
                    <strong>Nuevo diseño</strong>
                    <small>Desde el diseño Kardo o una plantilla</small>
                  </span>
                </button>
              </li>
            ) : null}
          </ul>
        ) : (
          <EmptyState
            action={
              canEdit ? (
                <button
                  className="button button-primary"
                  onClick={() => setNewOpen(true)}
                  type="button"
                >
                  <Icon name="plus" /> Crear el primer diseño
                </button>
              ) : undefined
            }
            compact
            icon="template"
            title="Tu biblioteca está vacía"
          >
            Crea un diseño con tus colores y tu logo, y aplícalo a todos tus QR
            de una vez. También puedes guardar el de cualquier QR.
          </EmptyState>
        )}
      </section>

      {/* --- Groups --------------------------------------------------------- */}
      <section aria-labelledby="qrl-groups" className="qrl-section">
        <SectionHeading
          description="Sus QR sin diseño propio ni de la biblioteca lo heredan, también los que agregues después."
          id="qrl-groups"
          title="Diseño por grupo"
        />
        {groupsWithCount.length ? (
          <ul className="qrl-groups">
            {groupsWithCount.map(({ group, qrCount }) => {
              const template = templates.find(
                (item) => item.id === group.qrTemplateId,
              );
              return (
                <li className="qrl-group" key={group.id}>
                  <span aria-hidden="true" className="row-icon">
                    <Icon name="group" />
                  </span>
                  <span className="qrl-group-main">
                    <strong>{group.name}</strong>
                    <small>{qrCount === 1 ? "1 QR" : `${qrCount} QR`}</small>
                  </span>
                  <span className="qrl-group-design">
                    <DesignThumbnail
                      brandAssetId={brandAssetId}
                      className="qrl-mini"
                      design={template?.design ?? defaultQrDesign}
                      nombre={sampleName}
                      url={worstCasePreviewUrl()}
                      workspaceId={workspace.id}
                    />
                    {template ? (
                      <Link
                        className="qrl-group-design-name"
                        to={{ name: "qr-design", id: template.id }}
                      >
                        {template.name}
                      </Link>
                    ) : (
                      <span className="qrl-group-design-name qrl-muted">
                        Diseño Kardo
                      </span>
                    )}
                  </span>
                  {canEdit ? (
                    <button
                      className="button button-secondary button-small"
                      onClick={() => setGroupTarget(group)}
                      type="button"
                    >
                      Cambiar
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            action={
              <Link
                className="button button-secondary"
                to={{ name: "touchpoints" }}
              >
                Ir a QR y etiquetas
              </Link>
            }
            compact
            icon="group"
            title="Aún no tienes grupos"
          >
            Agrupa tus QR y etiquetas por local o zona para darles un diseño a
            todos a la vez.
          </EmptyState>
        )}
      </section>

      {/* --- Every QR ------------------------------------------------------- */}
      <QrInventory brandAssetId={brandAssetId} resolved={resolved} />

      <NewDesignDialog
        brandAssetId={brandAssetId}
        onClose={() => setNewOpen(false)}
        onCreated={(created) => {
          setNewOpen(false);
          navigate({ name: "qr-design", id: created.id });
        }}
        open={isNewOpen}
      />
      <ApplyTemplateDialog
        onApplied={() => void resolved.reload()}
        onClose={() => setApplyTarget(null)}
        open={applyTarget !== null}
        template={applyTarget}
      />
      <NameDialog
        confirmLabel="Renombrar"
        description="El nombre solo lo ve tu equipo; no cambia ningún QR."
        initialName={renameTarget?.name ?? ""}
        onClose={() => setRenameTarget(null)}
        onSubmit={async (name) => {
          if (!renameTarget) return null;
          try {
            await qrTemplatesApi.update(workspace.id, renameTarget.id, {
              name,
            });
            await resolved.reload();
            notify(`Renombraste el diseño a «${name}».`);
            setRenameTarget(null);
            return null;
          } catch (error) {
            return templateErrorMessage(error);
          }
        }}
        open={renameTarget !== null}
        title="Renombrar diseño"
      />
      <ConfirmDialog
        cancelLabel={deleteInUse ? "Cerrar" : "Cancelar"}
        confirmLabel={deleteInUse ? "Ver el diseño" : "Borrar diseño"}
        description={
          deleteTarget && deleteInUse
            ? `«${deleteTarget.name}» todavía está en uso: ${usedByText(deleteTarget.usage)}. Aplícales otro diseño (o quítalo del grupo) y vuelve a intentarlo.`
            : `«${deleteTarget?.name ?? ""}» desaparece de la biblioteca. No afecta a ningún QR impreso.`
        }
        isBusy={isDeleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget && deleteInUse)
            navigate({ name: "qr-design", id: deleteTarget.id });
          else void remove();
        }}
        open={deleteTarget !== null}
        title={deleteInUse ? "Todavía no se puede borrar" : "Borrar diseño"}
        tone={deleteInUse ? "primary" : "danger"}
      />
      <GroupDesignDialog
        group={groupTarget}
        onChanged={() => void resolved.reload()}
        onClose={() => setGroupTarget(null)}
      />
    </div>
  );
}
