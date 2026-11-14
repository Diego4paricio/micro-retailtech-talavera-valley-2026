import { maxQrTemplatesPerWorkspace, type QrDesign } from "@kardo/contracts";
import { Tabs } from "radix-ui";
import { Icon } from "../../../../../components/Icon.js";
import { Link } from "../../../../../lib/router.js";
import { useWorkspace } from "../../../../../workspace/WorkspaceContext.js";
import { DesignThumbnail } from "../../library/DesignThumbnail.js";
import { usageText } from "../../library/model.js";
import { qrGallery } from "../../qr-design.js";
import { stableKey } from "../history.js";
import { buildDesign, svgDataUrl, useIdleValue } from "../hooks.js";
import { useStudio } from "../StudioContext.js";

/** Same look, ignoring the logo (applying a template keeps it). */
function lookKey(design: QrDesign): string {
  return stableKey({ ...design, logo: null });
}

/**
 * Starting points (a copy you then adjust) and, in a Touchpoint, the
 * organization library (applied by reference: the Touchpoint follows it).
 */
export function TemplatesSection() {
  const { templates, library } = useStudio();
  const count = templates.data?.length ?? 0;
  if (!library) return <Gallery />;
  return (
    <Tabs.Root className="qrs-subtabs" defaultValue="library">
      <Tabs.List aria-label="Origen del diseño" className="qrs-subtabs-list">
        <Tabs.Trigger className="qrs-subtab" value="library">
          Biblioteca
          {count ? <span className="qrs-count">{count}</span> : null}
        </Tabs.Trigger>
        <Tabs.Trigger className="qrs-subtab" value="gallery">
          Galería
        </Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content className="qrs-subtab-panel" value="library">
        <LibraryDesigns />
      </Tabs.Content>
      <Tabs.Content className="qrs-subtab-panel" value="gallery">
        <Gallery />
      </Tabs.Content>
    </Tabs.Root>
  );
}

function Gallery() {
  const { design, change, readOnly } = useStudio();
  const categories = new Map<string, (typeof qrGallery)[number][]>();
  for (const preset of qrGallery) {
    const list = categories.get(preset.category) ?? [];
    list.push(preset);
    categories.set(preset.category, list);
  }
  const current = lookKey(design);

  return (
    <div className="qrs-gallery">
      <p className="qrs-hint">
        Copia el aspecto como punto de partida y ajústalo; tu logo se conserva.
      </p>
      {[...categories.entries()].map(([category, presets]) => (
        <section className="qrs-gallery-group" key={category}>
          <h3>{category}</h3>
          <ul className="qrs-template-grid">
            {presets.map((preset) => {
              const selected = lookKey(preset.design) === current;
              return (
                <li key={preset.id}>
                  <button
                    aria-pressed={selected}
                    className="qrs-template"
                    disabled={readOnly}
                    onClick={() =>
                      change((design) => ({
                        ...preset.design,
                        logo: design.logo,
                      }))
                    }
                    title={preset.description}
                    type="button"
                  >
                    <DesignThumb design={preset.design} />
                    <span className="qrs-template-name">{preset.name}</span>
                    {selected ? (
                      <span className="qrs-template-check">
                        <Icon name="check" size={12} />
                        <span className="visually-hidden">(aplicada)</span>
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function LibraryDesigns() {
  const {
    readOnly,
    templates,
    canManageTemplates,
    openSaveTemplate,
    library,
    url,
    touchpointName,
    profile,
  } = useStudio();
  const { workspace } = useWorkspace();
  const items = templates.data ?? [];
  const isFull = items.length >= maxQrTemplatesPerWorkspace;
  const brandAssetId =
    profile.data !== null
      ? (profile.data.logoAssetId ?? null)
      : profile.error
        ? null
        : undefined;

  return (
    <div className="qrs-saved">
      <p className="qrs-hint">
        Los diseños de la biblioteca se aplican por referencia: si alguien los
        edita, este QR cambia con ellos. Los QR impresos siguen funcionando.
      </p>
      <div className="qrs-inline-actions">
        {canManageTemplates && openSaveTemplate ? (
          <button
            className="button button-secondary button-small"
            disabled={isFull}
            onClick={openSaveTemplate}
            type="button"
          >
            <Icon name="bookmark-plus" size={14} /> Guardar el diseño actual
          </button>
        ) : null}
        <Link className="button button-ghost button-small" to={{ name: "qr" }}>
          <Icon name="template" size={14} /> Gestionar la biblioteca
        </Link>
      </div>

      {templates.isLoading && !templates.data ? (
        <p className="qrs-hint">Cargando la biblioteca…</p>
      ) : templates.error ? (
        <p className="qrs-hint qrs-hint-error">
          {templates.error}{" "}
          <button
            className="link-button"
            onClick={() => void templates.reload()}
            type="button"
          >
            Reintentar
          </button>
        </p>
      ) : !items.length ? (
        <div className="qrs-empty">
          <Icon name="bookmark-plus" size={20} />
          <p>
            La biblioteca está vacía.{" "}
            {canManageTemplates
              ? "Guarda este diseño para reutilizarlo en otros QR y grupos."
              : "Las personas con permiso para gestionar QR y etiquetas pueden crear diseños."}
          </p>
        </div>
      ) : (
        <ul className="qrs-saved-list">
          {items.map((template) => {
            const current = library?.currentTemplateId === template.id;
            return (
              <li className="qrs-saved-item" key={template.id}>
                <button
                  aria-pressed={current}
                  className="qrs-saved-apply"
                  disabled={readOnly || !library}
                  onClick={() => library?.use(template)}
                  type="button"
                >
                  <DesignThumbnail
                    brandAssetId={brandAssetId}
                    design={template.design}
                    nombre={touchpointName}
                    url={url}
                    workspaceId={workspace.id}
                  />
                  <span className="qrs-saved-text">
                    <strong>{template.name}</strong>
                    <small>
                      {current ? "En uso aquí" : usageText(template.usage)}
                    </small>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** A small, real render of a design (with the current logo), built when idle. */
export function DesignThumb({ design }: { design: QrDesign }) {
  const { url, touchpointName, logo, design: current } = useStudio();
  const raster = logo.state.raster;
  const withLogo = { ...design, logo: current.logo };
  const src = useIdleValue(
    () => {
      const result = buildDesign({
        url,
        design: withLogo,
        logo: raster,
        nombre: touchpointName,
      });
      return result.ok ? svgDataUrl(result.svg) : "";
    },
    `${stableKey(withLogo)}:${raster?.href.length ?? 0}:${url}`,
  );
  return (
    <span aria-hidden="true" className="qrs-thumb">
      {src ? <img alt="" src={src} /> : null}
    </span>
  );
}
