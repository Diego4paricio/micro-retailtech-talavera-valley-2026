import { useWorkspaceProfile } from "../../settings/use-workspace-profile.js";
import "./ai-panel.css";

/**
 * What of the organization's brand Kardo's AI already uses on its own
 * (2026-10-02): the API adds the logo, the cover, the brand colors, the giro
 * and "Sobre tu negocio" to every generation. Says which ones it has, or
 * where to add them. Opens Configuración in a new tab so the Estudio's
 * unsaved changes stay put.
 */
export function BrandUsageNote() {
  const profile = useWorkspaceProfile();
  const data = profile.data;
  if (!data) return null;
  const used = [
    data.logoAssetId ? "tu logo" : null,
    data.coverAssetId ? "tu portada" : null,
    data.brand ? "tus colores" : null,
    data.industry ? "tu giro" : null,
  ].filter((item): item is string => item !== null);
  const list =
    used.length > 1
      ? `${used.slice(0, -1).join(", ")} y ${used.at(-1)}`
      : used[0];
  return (
    <p className="es-ai-brand-note">
      {list ? (
        <>La IA ya usa {list}. </>
      ) : (
        <>Agrega tu logo y tu portada para que la IA los use. </>
      )}
      <a href="/settings/marca" rel="noopener" target="_blank">
        {list ? "Cambiar tu marca" : "Ir a Marca"}
      </a>
    </p>
  );
}
