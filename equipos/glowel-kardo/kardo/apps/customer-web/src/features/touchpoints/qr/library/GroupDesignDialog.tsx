import type { TouchpointGroup } from "@kardo/contracts";
import {
  groupQrDesignApi,
  qrTemplatesApi,
} from "../../../../api/qr-designs.js";
import { workspaceProfileApi } from "../../../../api/workspace-profile.js";
import { useToast } from "../../../../components/Toast.js";
import { useResource } from "../../../../lib/use-resource.js";
import { useWorkspace } from "../../../../workspace/WorkspaceContext.js";
import { TemplatePickerDialog, templateErrorMessage } from "./dialogs.js";

/**
 * Chooses the library design a group gives its Touchpoints (current and
 * future ones without their own or a library design), or none.
 */
export function GroupDesignDialog({
  group,
  onClose,
  onChanged,
}: {
  /** `null` keeps the dialog closed. */
  group: TouchpointGroup | null;
  onClose: () => void;
  onChanged?: (() => void) | undefined;
}) {
  const { workspace, refreshGroups } = useWorkspace();
  const { notify } = useToast();
  const open = group !== null;
  const templates = useResource(
    open ? `qr-templates:${workspace.id}` : null,
    (signal) => qrTemplatesApi.list(workspace.id, signal),
  );
  const profile = useResource(
    open ? `workspace-profile:${workspace.id}` : null,
    (signal) => workspaceProfileApi.get(workspace.id, signal),
  );
  const brandAssetId =
    profile.data !== null
      ? (profile.data.logoAssetId ?? null)
      : profile.error
        ? null
        : undefined;

  return (
    <TemplatePickerDialog
      brandAssetId={brandAssetId}
      confirmLabel="Usar en el grupo"
      currentId={group?.qrTemplateId ?? null}
      description="Lo heredan los QR del grupo que no tienen diseño propio ni de la biblioteca, también los que agregues después. Los QR impresos siguen funcionando."
      noneLabel="Diseño Kardo"
      onClose={onClose}
      onPick={async (templateId) => {
        if (!group) return null;
        try {
          await groupQrDesignApi.setTemplate(
            workspace.id,
            group.id,
            templateId,
          );
          await refreshGroups();
          onChanged?.();
          const name = templates.data?.find(
            (item) => item.id === templateId,
          )?.name;
          notify(
            name
              ? `«${group.name}» ahora usa «${name}».`
              : `«${group.name}» ya no tiene diseño asignado: usa el diseño Kardo.`,
          );
          onClose();
          return null;
        } catch (error) {
          return templateErrorMessage(error);
        }
      }}
      open={open}
      templates={templates.data ?? []}
      title={group ? `Diseño QR de «${group.name}»` : "Diseño QR del grupo"}
    />
  );
}
