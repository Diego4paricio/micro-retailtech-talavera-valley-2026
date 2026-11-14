import type {
  ExperienceContent,
  ExperienceTheme,
  ExperienceType,
} from "@kardo/contracts";
import { Icon } from "../../components/Icon.js";
import { useAssetImage } from "../../lib/asset-images.js";
import { type PhoneThemeVars, phoneThemeVars } from "../../lib/theme-style.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import type { ContentOf } from "./content.js";

/**
 * The phone preview of a Redirección, the one type without an Estudio
 * design. Every other type is previewed by `PagePreview` with the same
 * renderer as the public page (domain audit A2-26), so this keeps only the
 * redirect card on the page's theme; the old per-type previews of menus,
 * catalogs, forms and the rest were removed with it.
 */
export function ExperiencePreview({
  content,
}: {
  type: ExperienceType;
  content: ExperienceContent;
}) {
  const { workspace } = useWorkspace();
  const theme = (content as { theme?: ExperienceTheme }).theme;
  const screenVars = usePhoneBackgroundVars(workspace.id, theme);
  const value = content as ContentOf<"redirect">;

  return (
    <figure className="phone-preview" aria-label="Vista previa en un teléfono">
      <div className="phone-frame">
        <div className="phone-screen" style={screenVars}>
          <div className="preview-redirect">
            <Icon name="external" size={28} />
            <strong>Redirección inmediata</strong>
            <p>Al tocar o escanear, la persona irá a:</p>
            <code>{value.destinationUrl || "https://…"}</code>
          </div>
          <p className="preview-footer">Creado con Kardo</p>
        </div>
      </div>
      <figcaption>
        Vista previa · la página pública usa este mismo contenido.
      </figcaption>
    </figure>
  );
}

/**
 * `phoneThemeVars` plus, once the chosen background photo is readable, the
 * real image layered under the same darkening overlay theme-style.ts already
 * computes (a soft hatch stands in until then, or when it can't be read).
 */
function usePhoneBackgroundVars(
  workspaceId: string,
  theme: ExperienceTheme | undefined,
): PhoneThemeVars {
  const background = theme?.background;
  const imageAssetId =
    background?.kind === "image" ? background.imageAssetId : undefined;
  const { url } = useAssetImage(workspaceId, imageAssetId, "full");
  const vars = phoneThemeVars(theme);
  if (!url || background?.kind !== "image") return vars;
  const overlay = (background.overlay ?? 40) / 100;
  return {
    ...vars,
    "--phone-bg-image": `linear-gradient(rgba(0,0,0,${overlay}), rgba(0,0,0,${overlay})), url("${url}")`,
  };
}
