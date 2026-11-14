import type {
  Asset,
  ExperienceTheme,
  WorkspaceProfile,
} from "@kardo/contracts";
import { useEffect, useState } from "react";
import { assetsApi } from "../../api/assets.js";
import { Dialog } from "../../components/Dialog.js";
import { Notice } from "../../components/Notice.js";
import {
  SettingsGroup,
  SettingsIntro,
  SettingsRow,
} from "../../components/SettingsBlocks.js";
import { Skeleton } from "../../components/Skeleton.js";
import { useToast } from "../../components/Toast.js";
import { errorMessage } from "../../lib/api.js";
import { useResource } from "../../lib/use-resource.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { ColorFields, defaultBrand } from "../business-profile/BrandPicker.js";
import { industryLabels } from "../business-profile/options.js";
import {
  profilePatchFrom,
  saveWorkspaceProfile,
} from "../business-profile/profile-store.js";
import type { Loose } from "../experiences/editors/fields.js";
import { ThemeEditor } from "../experiences/editors/ThemeEditor.js";
import { ChangeButton } from "./account/ProfilePage.js";
import { BrandIdentityPreview, BrandImageRow } from "./BrandIdentity.js";
import { useWorkspaceProfile } from "./use-workspace-profile.js";

type Editing = "colors" | "theme" | null;
type Patch = Loose<WorkspaceProfile>;

/**
 * Brand identity (Configuración → Marca): the organization's image (logo and
 * cover, shown as its pages will show them), brand colors and the stored
 * page theme. The Estudio, the QR and Kardo's AI use them on their own
 * (2026-10-02). Applies to public pages, not to this panel; available for
 * any workspace kind, personal included. Each row saves on its own.
 */
export function BrandSection() {
  const { workspace, can } = useWorkspace();
  const { notify } = useToast();
  const canManage = can("workspace.manage");
  const profile = useWorkspaceProfile();
  const assets = useResource(`assets:${workspace.id}`, (signal) =>
    assetsApi.list(workspace.id, signal),
  );
  const [editing, setEditing] = useState<Editing>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const data = profile.data;
  const logoAssetId = data?.logoAssetId ?? "";
  const coverAssetId = data?.coverAssetId ?? "";
  const primary = data?.brand?.primary ?? defaultBrand.primary;
  const accent = data?.brand?.accent ?? defaultBrand.accent;

  function addUploaded(asset: Asset) {
    assets.setData((items) => (items ? [asset, ...items] : [asset]));
    notify(`"${asset.filename}" se subió.`);
  }

  /** Saves one change on top of the stored profile; true when it worked. */
  async function save(patch: Patch): Promise<boolean> {
    setError(null);
    setIsSaving(true);
    try {
      // Only this change; the rest of the profile stays as stored (A2-1).
      await saveWorkspaceProfile(workspace.id, profilePatchFrom(patch));
      notify("Marca actualizada.");
      return true;
    } catch (requestError) {
      setError(errorMessage(requestError));
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  const detail =
    [data?.industry ? industryLabels[data.industry] : null, data?.city ?? null]
      .filter(Boolean)
      .join(" · ") || null;

  return (
    <>
      <SettingsIntro
        description="Tu logo, tu portada y tus colores. Las páginas públicas del Estudio y los diseños de la IA de Kardo los usan solos."
        title="Marca"
      />
      {profile.isLoading && !data ? (
        <Skeleton lines={4} />
      ) : profile.error ? (
        <Notice tone="danger">{profile.error}</Notice>
      ) : data ? (
        <>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <BrandIdentityPreview
            accent={accent}
            coverAssetId={coverAssetId}
            detail={detail}
            logoAssetId={logoAssetId}
            name={workspace.name}
            primary={primary}
            workspaceId={workspace.id}
          />
          <SettingsGroup
            footer={
              canManage
                ? undefined
                : "Solo el Owner o un Admin puede cambiar la marca."
            }
            id="brand-group"
            title="Identidad"
          >
            <BrandImageRow
              assets={assets.data ?? []}
              busy={isSaving}
              emptyLabel="Sin definir"
              hint="Cuadrado o redondo, PNG con fondo transparente si lo tienes."
              label="Logo"
              onChange={(id) => void save({ logoAssetId: id || undefined })}
              onUploaded={addUploaded}
              readOnly={!canManage}
              shape="circle"
              value={logoAssetId}
              workspaceId={workspace.id}
            />
            <BrandImageRow
              assets={assets.data ?? []}
              busy={isSaving}
              emptyLabel="Sin definir"
              hint="Una foto horizontal de tu lugar o de lo que vendes."
              label="Portada"
              onChange={(id) => void save({ coverAssetId: id || undefined })}
              onUploaded={addUploaded}
              readOnly={!canManage}
              shape="wide"
              value={coverAssetId}
              workspaceId={workspace.id}
            />
            <SettingsRow
              action={
                canManage ? (
                  <ChangeButton
                    label="Cambiar colores"
                    onClick={() => setEditing("colors")}
                  />
                ) : undefined
              }
              description="Color primario y color de acento."
              label="Colores"
              value={
                data.brand ? (
                  <span className="brand-swatches">
                    <Swatch color={primary} label="Primario" />
                    <Swatch color={accent} label="Acento" />
                  </span>
                ) : (
                  <span className="muted">Sin definir</span>
                )
              }
            />
            <SettingsRow
              action={
                canManage ? (
                  <ChangeButton
                    label="Cambiar apariencia de las páginas"
                    onClick={() => setEditing("theme")}
                  />
                ) : undefined
              }
              description="Fondo, botones y letra que guardas para tus páginas."
              label="Apariencia"
              value={
                data.defaultTheme ? (
                  "Personalizada"
                ) : (
                  <span className="muted">Sin definir</span>
                )
              }
            />
          </SettingsGroup>
          <ColorsDialog
            accent={accent}
            data={data}
            isSaving={isSaving}
            onClose={() => setEditing(null)}
            open={editing === "colors"}
            primary={primary}
            save={save}
            workspaceId={workspace.id}
          />
          <ThemeDialog
            isSaving={isSaving}
            onClose={() => setEditing(null)}
            open={editing === "theme"}
            save={save}
            theme={data.defaultTheme}
            workspaceId={workspace.id}
          />
        </>
      ) : null}
    </>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="brand-swatch-item">
      <span
        aria-hidden="true"
        className="brand-swatch"
        style={{ background: color }}
      />
      {label} {color}
    </span>
  );
}

function ColorsDialog({
  open,
  data,
  primary,
  accent,
  workspaceId,
  isSaving,
  save,
  onClose,
}: {
  open: boolean;
  data: WorkspaceProfile;
  primary: string;
  accent: string;
  workspaceId: string;
  isSaving: boolean;
  save: (patch: Patch) => Promise<boolean>;
  onClose: () => void;
}) {
  const { workspace } = useWorkspace();
  const [draftPrimary, setPrimary] = useState(primary);
  const [draftAccent, setAccent] = useState(accent);

  useEffect(() => {
    if (open) {
      setPrimary(primary);
      setAccent(accent);
    }
  }, [open, primary, accent]);

  return (
    <Dialog
      description="Así se verán en tus páginas públicas y en los diseños de la IA."
      footer={
        <>
          <button
            className="button button-secondary"
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            aria-busy={isSaving || undefined}
            className="button button-primary"
            disabled={isSaving}
            onClick={() =>
              void save({
                brand: { primary: draftPrimary, accent: draftAccent },
              }).then((saved) => {
                if (saved) onClose();
              })
            }
            type="button"
          >
            {isSaving ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
      onClose={onClose}
      open={open}
      title="Cambiar colores"
    >
      <div className="dialog-form">
        <BrandIdentityPreview
          accent={draftAccent}
          coverAssetId={data.coverAssetId ?? ""}
          detail={null}
          logoAssetId={data.logoAssetId ?? ""}
          name={workspace.name}
          primary={draftPrimary}
          workspaceId={workspaceId}
        />
        <ColorFields
          accent={draftAccent}
          idPrefix="brand"
          onChange={(colors) => {
            setPrimary(colors.primary);
            setAccent(colors.accent);
          }}
          primary={draftPrimary}
        />
      </div>
    </Dialog>
  );
}

function ThemeDialog({
  open,
  theme,
  workspaceId,
  isSaving,
  save,
  onClose,
}: {
  open: boolean;
  theme: ExperienceTheme | undefined;
  workspaceId: string;
  isSaving: boolean;
  save: (patch: Patch) => Promise<boolean>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<ExperienceTheme | undefined>(theme);

  useEffect(() => {
    if (open) setDraft(theme);
  }, [open, theme]);

  return (
    <Dialog
      footer={
        <>
          <button
            className="button button-secondary"
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            aria-busy={isSaving || undefined}
            className="button button-primary"
            disabled={isSaving}
            onClick={() =>
              void save({ defaultTheme: draft }).then((saved) => {
                if (saved) onClose();
              })
            }
            type="button"
          >
            {isSaving ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
      onClose={onClose}
      open={open}
      size="large"
      title="Apariencia de las páginas"
    >
      <ThemeEditor
        onChange={setDraft}
        value={draft}
        workspaceId={workspaceId}
      />
    </Dialog>
  );
}
