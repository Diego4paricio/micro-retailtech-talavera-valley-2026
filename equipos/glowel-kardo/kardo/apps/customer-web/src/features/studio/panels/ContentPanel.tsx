import type { ExperienceContent, WorkspaceProfile } from "@kardo/contracts";
import { useEffect, useRef } from "react";
import { Icon } from "../../../components/Icon.js";
import { Notice } from "../../../components/Notice.js";
import { Link } from "../../../lib/router.js";
import { type ContentOf, newItemId } from "../../experiences/content.js";
import { ContentEditor } from "../../experiences/editors/ContentEditor.js";
import { LinkPageContentEditor } from "../../links/LinkPageEditor.js";
import { mapsSearchUrl } from "../../onboarding/page-links.js";
import { useWorkspaceProfile } from "../../settings/use-workspace-profile.js";
import { focusField } from "../focus-field.js";
import { contentFieldDomId } from "../model/content-focus.js";
import { useStudio } from "../StudioContext.js";
import "./content-panel.css";
import { MenuChoicesEditor } from "./MenuChoicesEditor.js";

type WithLinks = { links?: { id: string; label: string; url: string }[] };

/** The profile's address, in one line: street first, then city, whichever
 * are filled in (relevo 37, C8c). `null` when neither is. */
function profileAddress(profile: WorkspaceProfile | null): string | null {
  const parts = [profile?.address, profile?.city]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(", ") : null;
}

/** "Cómo llegar a {dirección}" (C8c): the Perfil and Página de enlaces'
 * Contenido already has a free list of links/botones; this just offers one
 * already pointed at the profile's own address, instead of the owner
 * typing the Maps link by hand (Raúl never found it). */
function HowToGetThereShortcut({
  content,
  onChange,
}: {
  content: ExperienceContent;
  onChange: (next: ExperienceContent) => void;
}) {
  const profile = useWorkspaceProfile();
  if (!profile.data) return null;
  const address = profileAddress(profile.data);
  const links = (content as WithLinks).links ?? [];
  if (!address) {
    return (
      <Notice tone="info">
        Agrega tu dirección para ofrecer «Cómo llegar».{" "}
        <Link to={{ name: "settings", section: "organizacion" }}>
          Agrega tu dirección
        </Link>
      </Notice>
    );
  }
  const already = links.some((link) =>
    /maps\.google|google\.com\/maps/i.test(link.url),
  );
  if (already) return null;
  return (
    <button
      className="button button-secondary es-maps-shortcut"
      onClick={() =>
        onChange({
          ...content,
          links: [
            ...links,
            {
              id: newItemId(),
              label: "Cómo llegar",
              url: mapsSearchUrl(address),
            },
          ],
        } as ExperienceContent)
      }
      type="button"
    >
      <Icon name="location" size={16} /> Cómo llegar a {address}
    </button>
  );
}

/**
 * "Contenido" rail (addendum 3): the Experience's own text and photos,
 * edited right inside the Estudio, without leaving to another screen. It
 * reuses the same editors as the Experience's own Contenido page
 * (`features/experiences/editors/`, and `LinkPageContentEditor` for Página
 * de Link, which `ContentEditor` does not cover); both already fit a narrow
 * column. `changeContent`/`contentErrors` come from `StudioContext` and
 * share the Estudio's undo history and Guardar with the design.
 */
export function ContentPanel() {
  const {
    type,
    content,
    changeContent,
    contentErrors,
    assets,
    addAsset,
    readOnly,
    contentFocus,
  } = useStudio();

  // C5c: a failed save's first error field scrolls into view and gets
  // focused, instead of leaving a toast as the only sign something needs
  // fixing — Ana saved with an empty product on her phone and never saw
  // why it failed. Reads the latest type/content from a ref so it does not
  // re-run on every keystroke, only when `contentFocus` itself changes.
  const latest = useRef({ type, content });
  latest.current = { type, content };
  useEffect(() => {
    if (!contentFocus) return;
    const { type: currentType, content: currentContent } = latest.current;
    const id = contentFieldDomId(
      currentType,
      currentContent,
      contentFocus.field,
    );
    if (id) focusField(id);
  }, [contentFocus]);

  // A single shared key: rapid edits (typing) within the same second
  // coalesce into one undo step, like every other field in the Estudio;
  // moving to another field just starts a new step.
  if (type === "linkpage")
    return (
      <div className="es-content-panel">
        <HowToGetThereShortcut
          content={content}
          onChange={(next) => changeContent(() => next, "content")}
        />
        <LinkPageContentEditor
          assets={assets}
          content={content as ContentOf<"linkpage">}
          errors={contentErrors}
          onAssetUploaded={addAsset}
          onChange={(next) => changeContent(() => next, "content")}
          readOnly={readOnly}
        />
      </div>
    );

  return (
    <div className="es-content-panel">
      {type === "profile" ? (
        <HowToGetThereShortcut
          content={content}
          onChange={(next) => changeContent(() => next, "content")}
        />
      ) : null}
      <ContentEditor
        assets={assets}
        content={content}
        errors={contentErrors}
        onAssetUploaded={addAsset}
        onChange={(next) => changeContent(() => next, "content")}
        readOnly={readOnly}
        type={type}
      />
      {type === "menu" ? (
        <MenuChoicesEditor
          content={content as ContentOf<"menu">}
          onChange={(next) => changeContent(() => next, "content")}
          readOnly={readOnly}
        />
      ) : null}
    </div>
  );
}
