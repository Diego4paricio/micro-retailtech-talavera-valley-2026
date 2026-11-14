import type { DesignableExperienceType } from "@kardo/contracts";
import type { FormEvent } from "react";
import { useState } from "react";
import { linkPublicUrl } from "../../api/links.js";
import { Icon } from "../../components/Icon.js";
import { Notice } from "../../components/Notice.js";
import { Link } from "../../lib/router.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { LinkAddressCopy } from "../links/LinkAddressCopy.js";
import { isDesignableType } from "../studio/model/content.js";
import { StudioEntryCard } from "../studio/StudioEntry.js";
import { EditItemsDialog, useItemsNoun } from "./EditItemsDialog.js";
import { useExperienceWorkspace } from "./ExperienceWorkspaceContext.js";
import { isItemsPage } from "./edit-items.js";
import { ContentEditor } from "./editors/ContentEditor.js";
import { PagePreview } from "./PagePreview.js";

/**
 * Diseño (ADR 018, addendum 3): every type with a page (links, profile,
 * linkpage, menu, catalog, form, document, image) no longer shows a content
 * form or a Contenido | Estilo switch here — everything, content included,
 * is edited in the Estudio. This view is just the door to it: a real, live
 * thumbnail of the page and one big button. Destinos and Historial are
 * unaffected. Redirección has no page, so it keeps its one-field editor.
 */
export function DesignView() {
  const ws = useExperienceWorkspace();
  const studioType = isDesignableType(ws.type) ? ws.type : null;
  return studioType ? (
    <StudioGateway type={studioType} />
  ) : (
    <RedirectDesignView />
  );
}

function StudioGateway({ type }: { type: DesignableExperienceType }) {
  const ws = useExperienceWorkspace();
  const [editingItems, setEditingItems] = useState(false);
  const experience = ws.experience;
  const itemsPage =
    experience && isItemsPage(experience.type) && !ws.readOnly
      ? { ...experience, type: experience.type }
      : null;
  const noun = useItemsNoun(itemsPage?.type ?? "catalog");
  const route = { name: "experience-studio", id: ws.experienceId } as const;
  return (
    <div className="xpw-design">
      <div className="xpw-gateway">
        <StudioEntryCard
          content={ws.content}
          readOnly={ws.readOnly}
          to={route}
        />
        {itemsPage ? (
          <div className="xpw-items">
            <button
              className="button button-secondary"
              onClick={() => setEditingItems(true)}
              type="button"
            >
              <Icon name="edit" size={16} />
              Editar {noun.many} y precios
            </button>
            <p className="xpw-section-note">
              Agrega, quita o cambia precios sin abrir el diseño.
            </p>
            <EditItemsDialog
              experience={itemsPage}
              onClose={() => setEditingItems(false)}
              onSaved={({ content, draftRevision }) =>
                ws.adoptSavedContent(content, draftRevision)
              }
              open={editingItems}
            />
          </div>
        ) : null}
        <WhereItShows experienceId={ws.experienceId} />
        {ws.errorCount ? (
          <Notice
            action={
              <Link className="text-action" to={route}>
                Abrir el Estudio
              </Link>
            }
            tone="warning"
          >
            {ws.errorCount === 1
              ? "1 campo necesita tu atención"
              : `${ws.errorCount} campos necesitan tu atención`}{" "}
            antes de publicar. Ábrelos en el Estudio para corregirlos.
          </Notice>
        ) : null}
      </div>
      <aside aria-label="Vista previa" className="xpw-preview">
        <PagePreview assets={ws.assets} content={ws.content} type={type} />
      </aside>
    </div>
  );
}

/**
 * Where customers see this page, with its address to copy (relevo 37,
 * S11): Diego typed his page's address by hand and landed on the panel's
 * login. Links show their full address; QR and tags show their names.
 */
function WhereItShows({ experienceId }: { experienceId: string }) {
  const { touchpoints, workspace } = useWorkspace();
  const serving = (touchpoints.data ?? []).filter(
    (touchpoint) =>
      touchpoint.live?.experienceId === experienceId &&
      touchpoint.status !== "retired",
  );
  if (serving.length === 0) return null;
  const links = serving.filter((touchpoint) => touchpoint.kind === "link");
  const objects = serving.filter((touchpoint) => touchpoint.kind !== "link");
  return (
    <div className="xpw-where">
      <p className="xpw-where-title">Dónde se ve</p>
      {links.map((link) => (
        <LinkAddressCopy
          key={link.id}
          url={linkPublicUrl(link, workspace.slug)}
        />
      ))}
      {objects.length ? (
        <p className="xpw-section-note">
          {objects.length === 1
            ? "En tu QR o etiqueta "
            : "En tus QR y etiquetas "}
          {objects.map((object) => `«${object.operationalName}»`).join(", ")}
        </p>
      ) : null}
    </div>
  );
}

/** Redirección: a single URL field, no page and no Estudio. */
function RedirectDesignView() {
  const ws = useExperienceWorkspace();
  const [showPreview, setShowPreview] = useState(false);
  const errorCount = Object.keys(ws.visibleErrors).length;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ws.save();
  }

  return (
    <div className="xpw-design" data-preview={showPreview ? "open" : "closed"}>
      <form
        aria-label="Contenido de la página"
        className="panel editor-form xpw-editor"
        id="experience-form"
        noValidate
        onSubmit={onSubmit}
      >
        <div className="xpw-editor-head">
          <h2 className="xpw-section-title">Contenido</h2>
          <button
            aria-pressed={showPreview}
            className="button button-secondary button-small xpw-preview-toggle"
            onClick={() => setShowPreview((value) => !value)}
            type="button"
          >
            <Icon name={showPreview ? "edit" : "phone"} size={15} />
            {showPreview ? "Editar" : "Vista previa"}
          </button>
        </div>
        <p className="xpw-section-note xpw-editor-note">
          Lo que se abre al tocar o escanear. Los cambios no se publican hasta
          que tú lo decidas.
        </p>
        {errorCount ? (
          <Notice tone="danger">
            Revisa{" "}
            {errorCount === 1
              ? "1 campo marcado"
              : `${errorCount} campos marcados`}{" "}
            antes de guardar.
          </Notice>
        ) : null}
        <ContentEditor
          assets={ws.assets}
          content={ws.content}
          errors={ws.visibleErrors}
          onAssetUploaded={ws.addAsset}
          onChange={ws.setContent}
          readOnly={ws.readOnly}
          type={ws.type}
        />
      </form>

      <aside aria-label="Vista previa" className="xpw-preview">
        <PagePreview assets={ws.assets} content={ws.content} type={ws.type} />
      </aside>
    </div>
  );
}
