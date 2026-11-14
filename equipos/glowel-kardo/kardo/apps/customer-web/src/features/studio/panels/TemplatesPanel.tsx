import { useMemo, useState } from "react";
import { ConfirmDialog } from "../../../components/Dialog.js";
import { Icon } from "../../../components/Icon.js";
import { useWorkspace } from "../../../workspace/WorkspaceContext.js";
import { brandLookTemplates } from "../model/brand-looks.js";
import { withBusinessData } from "../model/business-contact.js";
import { designFromContent } from "../model/from-content.js";
import {
  adaptTemplateDesign,
  type StudioTemplate,
} from "../model/templates.js";
import { DesignThumbnail } from "../preview/DesignThumbnail.js";
import { useStudio } from "../StudioContext.js";
import { useOrganizationBrand } from "../use-organization-brand.js";

type Choice =
  | { kind: "template"; template: StudioTemplate }
  | { kind: "current" };

/** Plantillas: Kardo's templates for this type, shown with the page's content. */
export function TemplatesPanel() {
  const { templates, type, content, contentIds, actions, readOnly } =
    useStudio();
  const { workspace } = useWorkspace();
  const [pending, setPending] = useState<Choice | null>(null);
  const [allLooks, setAllLooks] = useState(false);
  // The thumbnails show the template as it will be applied: with the
  // business's WhatsApp and hours, or without them when it has none.
  const organization = useOrganizationBrand();
  const business = organization.brand;
  // «Para tu marca»: Primeros pasos' looks, made with this brand (A2-41).
  const brandLooks = useMemo(
    () =>
      brandLookTemplates({
        type,
        content,
        contentIds,
        businessName: workspace.name,
        profile: organization.profile,
        brand: business,
      }),
    [type, content, contentIds, workspace.name, organization.profile, business],
  );
  const shownLooks = allLooks ? brandLooks : brandLooks.slice(0, 6);
  const current = useMemo(
    () => designFromContent(type, content),
    [type, content],
  );
  const adapted = useMemo(
    () =>
      new Map(
        [...shownLooks, ...templates].map((template) => [
          template.id,
          withBusinessData(
            adaptTemplateDesign(template.design, type, contentIds),
            business,
          ),
        ]),
      ),
    [shownLooks, templates, type, contentIds, business],
  );

  const renderCard = (template: StudioTemplate) => {
    const design = adapted.get(template.id);
    if (!design) return null;
    return (
      <button
        aria-label={`Usar la plantilla «${template.name}»`}
        className="es-template"
        disabled={readOnly}
        key={template.id}
        onClick={() => setPending({ kind: "template", template })}
        type="button"
      >
        <DesignThumbnail
          content={content}
          design={design}
          label={template.name}
          scale={0.3}
          type={type}
        />
        <span className="es-template-text">
          <span className="es-template-giro">{template.giro}</span>
          <strong>{template.name}</strong>
          <small>{template.description}</small>
        </span>
      </button>
    );
  };

  return (
    <div className="es-panel-stack">
      <p className="qrs-hint">
        Tu contenido (nombre, enlaces y redes) se queda igual: solo cambia el
        diseño. Puedes deshacerlo con ⌘Z.
      </p>
      {shownLooks.length ? (
        <section aria-label="Para tu marca" className="es-panel-group">
          <h3 className="es-group-title">Para tu marca</h3>
          <p className="qrs-hint">
            Los mismos estilos de Primeros pasos, hechos con tu color, tu logo y
            tus datos.
          </p>
          <div className="es-templates">
            {shownLooks.map((template) => renderCard(template))}
          </div>
          {brandLooks.length > shownLooks.length || allLooks ? (
            <button
              className="text-action"
              onClick={() => setAllLooks((value) => !value)}
              type="button"
            >
              {allLooks
                ? "Ver menos estilos"
                : `Ver los ${brandLooks.length} estilos`}
            </button>
          ) : null}
        </section>
      ) : null}
      <section aria-label="Plantillas por giro" className="es-panel-group">
        <h3 className="es-group-title">Por giro</h3>
        <div className="es-templates">
          {templates.map((template) => renderCard(template))}
          <button
            aria-label="Volver al tema que tenía la página"
            className="es-template es-template-current"
            disabled={readOnly}
            onClick={() => setPending({ kind: "current" })}
            type="button"
          >
            <DesignThumbnail
              content={content}
              design={current}
              label="Tema actual"
              scale={0.3}
              type={type}
            />
            <span className="es-template-text">
              <span className="es-template-giro">
                <Icon name="history" size={12} /> Tu tema
              </span>
              <strong>El tema de siempre</strong>
              <small>
                Los colores y botones que tenía tu página antes del Estudio.
              </small>
            </span>
          </button>
        </div>
      </section>
      <ConfirmDialog
        confirmLabel={
          pending?.kind === "current" ? "Usar mi tema" : "Usar plantilla"
        }
        description="Reemplaza el diseño que tienes en el Estudio. Tu contenido no cambia y puedes deshacerlo con ⌘Z. No se guarda hasta que pulses Guardar."
        onClose={() => setPending(null)}
        onConfirm={() => {
          const choice = pending;
          setPending(null);
          if (!choice) return;
          if (choice.kind === "current") actions.restoreCurrentLook();
          else actions.applyTemplate(choice.template);
        }}
        open={pending !== null}
        title={
          pending?.kind === "template"
            ? `Usar «${pending.template.name}»`
            : "Volver a tu tema"
        }
      />
    </div>
  );
}
