import { type FormEvent, useEffect, useState } from "react";
import { workspacesApi } from "../../api/workspaces.js";
import { Dialog } from "../../components/Dialog.js";
import { Field } from "../../components/Field.js";
import { Notice } from "../../components/Notice.js";
import {
  SettingsGroup,
  SettingsIntro,
  SettingsRow,
} from "../../components/SettingsBlocks.js";
import { useToast } from "../../components/Toast.js";
import { errorMessage } from "../../lib/api.js";
import { businessAddressLabel } from "../../lib/business-address.js";
import { Link } from "../../lib/router.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { BusinessAddressDialog } from "../business-profile/BusinessAddressDialog.js";
import { CreateOrganizationDialog } from "../organization/CreateOrganizationDialog.js";
import { useOrganizationExport } from "../organization/use-export.js";
import { ChangeButton } from "./account/ProfilePage.js";

/**
 * Organización → General, top: the page title and the organization's name.
 * The business data below it live in `OrganizationProfileSection`.
 */
export function WorkspaceSection() {
  const { workspace, pendingSetup, can, reloadWorkspaces } = useWorkspace();
  const { notify } = useToast();
  const canManage = can("workspace.manage");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(workspace.name);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [editingAddress, setEditingAddress] = useState(false);
  const [creating, setCreating] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const exporter = useOrganizationExport(workspace, setExportError);
  // Someone who came in by invitation still has to start their own business
  // (trial included) at /crear-negocio, like the side menu says (A2-12).
  const setupPending = Boolean(pendingSetup);

  useEffect(() => {
    if (editing) {
      setName(workspace.name);
      setError(null);
    }
  }, [editing, workspace.name]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      await workspacesApi.update(workspace.id, { name: name.trim() });
      await reloadWorkspaces();
      notify("Espacio de trabajo actualizado.");
      setEditing(false);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <SettingsIntro
        description="Los datos de tu negocio. Los ve todo tu equipo y la IA de Kardo los usa para diseñar."
        title="General"
      />
      <SettingsGroup
        footer={
          canManage
            ? undefined
            : "Solo el Owner o un Admin puede cambiar el nombre."
        }
        id="workspace-name-group"
        title="Organización"
      >
        <SettingsRow
          action={
            canManage ? (
              <ChangeButton
                label="Cambiar nombre de la organización"
                onClick={() => setEditing(true)}
              />
            ) : undefined
          }
          description="Así la ve tu equipo en el selector de organizaciones."
          label="Nombre"
          value={workspace.name}
        />
        <SettingsRow
          action={
            canManage ? (
              <ChangeButton
                label={
                  workspace.slug
                    ? "Cambiar tu link en Kardo"
                    : "Elegir tu link en Kardo"
                }
                onClick={() => setEditingAddress(true)}
              />
            ) : undefined
          }
          description="Tus links van dentro de ella. Se cambia una vez cada 7 días."
          label="Tu link en Kardo"
          value={
            workspace.slug ? (
              businessAddressLabel(workspace.slug)
            ) : (
              <span className="muted">Sin elegir</span>
            )
          }
        />
        <SettingsRow
          action={
            setupPending ? (
              <Link
                className="button button-secondary button-small"
                to={{ name: "create-business" }}
              >
                Crear mi propio negocio
              </Link>
            ) : (
              <button
                className="button button-secondary button-small"
                onClick={() => setCreating(true)}
                type="button"
              >
                Crear organización
              </button>
            )
          }
          description="Para otra sucursal u otro negocio, con sus propios datos y equipo."
          label="Otra organización"
        />
      </SettingsGroup>
      {can("leads.read") ? (
        <SettingsGroup id="workspace-export" title="Tus datos">
          <SettingsRow
            action={
              <button
                aria-busy={exporter.busy || undefined}
                className="button button-secondary button-small"
                disabled={exporter.busy}
                onClick={() => {
                  setExportError(null);
                  void exporter.download();
                }}
                type="button"
              >
                {exporter.busy ? "Preparando…" : "Descargar"}
              </button>
            }
            description="QR y etiquetas, páginas, grupos y solicitudes de esta organización, en un archivo JSON."
            label="Descargar los datos de la organización"
          />
          {exportError ? <Notice tone="danger">{exportError}</Notice> : null}
        </SettingsGroup>
      ) : null}
      {setupPending ? null : (
        <CreateOrganizationDialog
          onClose={() => setCreating(false)}
          open={creating}
        />
      )}
      <BusinessAddressDialog
        onClose={() => setEditingAddress(false)}
        open={editingAddress}
      />
      <Dialog
        description="El nombre de tu negocio u organización."
        footer={
          <>
            <button
              className="button button-secondary"
              onClick={() => setEditing(false)}
              type="button"
            >
              Cancelar
            </button>
            <button
              aria-busy={isSaving || undefined}
              className="button button-primary"
              disabled={
                isSaving || !name.trim() || name.trim() === workspace.name
              }
              form="workspace-name-form"
              type="submit"
            >
              {isSaving ? "Guardando…" : "Guardar"}
            </button>
          </>
        }
        onClose={() => setEditing(false)}
        open={editing}
        title="Cambiar nombre"
      >
        <form
          className="dialog-form"
          id="workspace-name-form"
          onSubmit={submit}
        >
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <Field
            counter={{ value: name.length, max: 120 }}
            id="workspace-name"
            label="Nombre del espacio"
          >
            <input
              id="workspace-name"
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </Field>
        </form>
      </Dialog>
    </>
  );
}
