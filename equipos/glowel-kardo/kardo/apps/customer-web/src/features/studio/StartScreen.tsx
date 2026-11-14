import type {
  CustomerWorkspace,
  DesignableExperienceType,
  ExperienceContent,
  ExperienceSummary,
  PageDesign,
  Touchpoint,
} from "@kardo/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import { experiencesApi } from "../../api/experiences.js";
import { Icon } from "../../components/Icon.js";
import { Tooltip } from "../../components/Tooltip.js";
import { Link, type Route } from "../../lib/router.js";
import { useResource } from "../../lib/use-resource.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { ExperienceThumb } from "../experiences/ExperienceThumb.js";
import { shortTypeLabels } from "../experiences/ExperienceTiles.js";
import { blankCanvasDesign } from "./model/canvas.js";
import {
  contentDesign,
  contentItemIds,
  isDesignableType,
} from "./model/content.js";
import { copyDesignToType, withoutForeignImages } from "./model/copy-design.js";
import { designFromContent } from "./model/from-content.js";
import { idFactoryFor } from "./model/ids.js";
import { withOrganizationBrand } from "./model/organization-brand.js";
import {
  adaptTemplateDesign,
  type StudioTemplate,
  studioTemplatesFor,
} from "./model/templates.js";
import { DesignThumbnail } from "./preview/DesignThumbnail.js";
import { useOrganizationBrand } from "./use-organization-brand.js";
import "./start-copy.css";

/** What each type keeps, in one line (the start screen says it). */
const keptContent: Record<DesignableExperienceType, string> = {
  links: "Tu título y tus enlaces se quedan como están.",
  profile: "Tu nombre, tu foto y tus enlaces se quedan como están.",
  linkpage: "Tu nombre, tus enlaces y tus redes se quedan como están.",
  menu: "Tus platillos y precios se quedan como están.",
  catalog: "Tus productos y precios se quedan como están.",
  form: "Tus campos y tu botón se quedan como están.",
  document: "Tu PDF se queda como está.",
  image: "Tu imagen se queda como está.",
};

/**
 * First visit to the Estudio of a page without a design: its current look
 * in blocks, a blank canvas to place everything freely, or a Kardo
 * template for the giro. Nothing is saved until the person presses
 * Guardar in the Estudio.
 */
export function StartScreen({
  type,
  content,
  currentExperienceId,
  kicker,
  title,
  back,
  onStart,
  onStartHtml,
}: {
  type: DesignableExperienceType;
  content: ExperienceContent;
  /** This page's own id, so "Igual que otra de tus páginas" never offers
   * the page itself as a source. */
  currentExperienceId: string;
  kicker: string;
  title: string;
  back: { to: Route; label: string };
  /** `message`, when given, replaces the usual "Empezaste con…" toast
   * outright (a design copied from another organization, D6, needs its
   * own wording: whose design it is and where the photos went). */
  onStart: (design: PageDesign, origin: string, message?: string) => void;
  /** Opens the modo HTML instead (owners and admins only). */
  onStartHtml?: (() => void) | undefined;
}) {
  const templates = useMemo(() => studioTemplatesFor(type), [type]);
  const contentIds = useMemo(() => contentItemIds(content), [content]);
  const organization = useOrganizationBrand();
  const copy = useCopySources(type, currentExperienceId);
  const foreignOrgs = useForeignOrganizations();
  const current = useMemo(() => {
    const own = designFromContent(type, content);
    // A page without a theme of its own wears Kardo's default look: the
    // organization's brand colors fit it better (2026-10-03).
    const hasOwnTheme = Boolean((content as { theme?: unknown }).theme);
    return withOrganizationBrand(
      own,
      type,
      organization.brand,
      idFactoryFor(own, contentIds),
      { recolor: !hasOwnTheme },
    );
  }, [type, content, contentIds, organization.brand]);
  const blank = useMemo(
    () =>
      blankCanvasDesign(type, current.style, idFactoryFor(null, contentIds)),
    [type, current.style, contentIds],
  );
  const giros = useMemo(
    () => [...new Set(templates.map((template) => template.giro))],
    [templates],
  );
  // Opens on the organization's giro when it has templates for this type
  // (also when the profile arrives after the first render), until the
  // person picks a filter themselves.
  const [giro, setGiro] = useState<string | null>(null);
  const pickedGiro = useRef(false);
  useEffect(() => {
    if (pickedGiro.current || !organization.templateGiro) return;
    if (
      templates.some((template) => template.giro === organization.templateGiro)
    )
      setGiro(organization.templateGiro);
  }, [organization.templateGiro, templates]);
  const pickGiro = (value: string | null) => {
    pickedGiro.current = true;
    setGiro(value);
  };
  const shown = giro
    ? templates.filter((template) => template.giro === giro)
    : templates;
  const adapted = useMemo(
    () =>
      new Map(
        templates.map((template) => {
          const adaptedDesign = adaptTemplateDesign(
            template.design,
            type,
            contentIds,
          );
          return [
            template.id,
            withOrganizationBrand(
              adaptedDesign,
              type,
              organization.brand,
              idFactoryFor(adaptedDesign, contentIds),
              { recolor: true },
            ),
          ];
        }),
      ),
    [templates, type, contentIds, organization.brand],
  );

  const choose = (template: StudioTemplate) => {
    const design = adapted.get(template.id);
    if (design) onStart(design, template.name);
  };

  return (
    <div className="es-page es-start">
      <div className="es-start-inner">
        <header className="es-bar">
          <Tooltip content={`Volver a ${back.label}`}>
            <span className="qrs-back">
              <Link
                ariaLabel={`Volver a ${back.label}`}
                className="icon-button qrs-back-link"
                to={back.to}
              >
                <Icon name="arrow-left" size={18} />
              </Link>
            </span>
          </Tooltip>
          <div className="es-bar-title">
            <p className="qrs-header-kicker">{kicker}</p>
            <h1 title={title}>{title}</h1>
          </div>
        </header>

        <section aria-labelledby="es-start-title" className="es-start-hero">
          <span aria-hidden="true" className="es-start-mark">
            <Icon name="template" size={20} />
          </span>
          <div>
            <h2 id="es-start-title">¿Cómo quieres empezar tu diseño?</h2>
            <p>{keptContent[type]}</p>
          </div>
        </section>

        {copy.candidates.length || foreignOrgs.length ? (
          <CopyDesignSection
            content={content}
            copy={copy}
            foreignOrgs={foreignOrgs}
            onStart={onStart}
            type={type}
          />
        ) : null}

        <div className="es-start-grid">
          <div className="es-start-own">
            <StartCard
              action="Usar el diseño básico"
              description="Tus colores y tu logo, sin más. Lo mueves y ajustas a tu gusto."
              design={current}
              icon="edit"
              id="es-start-current"
              label="El diseño básico"
              onChoose={() => onStart(current, "el diseño básico")}
              primary={!copy.candidates.length}
              title="El diseño básico"
              type={type}
              content={content}
            />
            <StartCard
              action="Empezar en blanco"
              description="Un espacio libre con tus colores: coloca títulos, fotos, formas y botones donde quieras."
              design={blank}
              icon="select-block"
              id="es-start-blank"
              label="Espacio en blanco"
              onChoose={() => onStart(blank, "un espacio en blanco")}
              title="Espacio en blanco"
              type={type}
              content={content}
            />
          </div>

          <section
            aria-labelledby="es-start-templates"
            className="es-start-templates"
          >
            <div className="es-start-templates-head">
              <div>
                <h3 id="es-start-templates">Empezar con una plantilla</h3>
                <p>Diseños de Kardo por giro, ya con tu contenido.</p>
              </div>
              {giros.length > 1 ? (
                <fieldset className="qrs-chips es-giros">
                  <legend className="visually-hidden">Filtrar por giro</legend>
                  <button
                    aria-pressed={giro === null}
                    className="qrs-chip"
                    onClick={() => pickGiro(null)}
                    type="button"
                  >
                    Todos
                  </button>
                  {giros.map((item) => (
                    <button
                      aria-pressed={giro === item}
                      className="qrs-chip"
                      key={item}
                      onClick={() => pickGiro(item)}
                      type="button"
                    >
                      {item.charAt(0).toUpperCase() + item.slice(1)}
                    </button>
                  ))}
                </fieldset>
              ) : null}
            </div>
            {shown.length ? (
              <div className="es-start-template-grid">
                {shown.map((template) => {
                  const design = adapted.get(template.id);
                  if (!design) return null;
                  return (
                    <button
                      aria-label={`Empezar con la plantilla «${template.name}»`}
                      className="es-template es-start-template"
                      key={template.id}
                      onClick={() => choose(template)}
                      type="button"
                    >
                      <DesignThumbnail
                        content={content}
                        design={design}
                        label={template.name}
                        scale={0.34}
                        type={type}
                      />
                      <span className="es-template-text">
                        <span className="es-template-giro">
                          {template.giro}
                        </span>
                        <strong>{template.name}</strong>
                        <small>{template.description}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="es-start-empty">
                Pronto habrá plantillas para este tipo de página. Empieza con tu
                diseño básico o con un espacio en blanco.
              </p>
            )}
          </section>
        </div>

        {onStartHtml &&
        (type === "links" || type === "profile" || type === "linkpage") ? (
          <section aria-labelledby="es-start-html" className="es-start-html">
            <span aria-hidden="true" className="es-start-mark">
              <Icon name="code" size={18} />
            </span>
            <div>
              <h3 id="es-start-html">¿Prefieres tu propio HTML?</h3>
              <p>
                Abre el editor de código y mira tu página al instante. Si
                quieres, la IA te ayuda a diseñarla.
              </p>
            </div>
            <button
              className="button button-secondary"
              onClick={onStartHtml}
              type="button"
            >
              Diseñar con HTML <Icon name="arrow-right" size={16} />
            </button>
          </section>
        ) : null}
      </div>
    </div>
  );
}

/** One of the organization's other pages, offered as a design to copy. */
type CopySource = ExperienceSummary & {
  type: DesignableExperienceType;
  whereShown: string;
};

/** Pages whose design can be copied onto this one (C4a): every other page
 * with a page of its own, not archived, newest and same-type first (its
 * content blocks carry over more directly, see `copyDesignToType`), each
 * with where it is seen today ("En «Mesas»", "En el link /x" or "Sin
 * publicar"). */
function useCopySources(
  type: DesignableExperienceType,
  currentExperienceId: string,
): { candidates: CopySource[] } {
  const { experiences, touchpoints } = useWorkspace();

  const whereShown = useMemo(() => {
    const byExperience = new Map<string, Touchpoint[]>();
    for (const item of touchpoints.data ?? []) {
      if (!item.live) continue;
      const list = byExperience.get(item.live.experienceId);
      if (list) list.push(item);
      else byExperience.set(item.live.experienceId, [item]);
    }
    const map = new Map<string, string>();
    for (const [id, group] of byExperience) {
      const [first, ...rest] = group;
      if (!first) continue;
      const label =
        first.kind === "link"
          ? first.slug
            ? `En el link /${first.slug}`
            : `En tu link «${first.operationalName}»`
          : `En «${first.operationalName}»`;
      map.set(id, rest.length ? `${label} y ${rest.length} más` : label);
    }
    return map;
  }, [touchpoints.data]);

  const candidates = useMemo(() => {
    const list = (experiences.data ?? []).filter(
      (item): item is ExperienceSummary & { type: DesignableExperienceType } =>
        item.id !== currentExperienceId &&
        !item.archivedAt &&
        isDesignableType(item.type),
    );
    const sorted = [...list].sort((a, b) => {
      const bySameType = Number(b.type === type) - Number(a.type === type);
      if (bySameType) return bySameType;
      return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
    });
    return sorted.map((item) => ({
      ...item,
      whereShown: whereShown.get(item.id) ?? "Sin publicar",
    }));
  }, [experiences.data, currentExperienceId, type, whereShown]);

  return { candidates };
}

/** Other organizations this person can copy a design FROM (D6, Diego's
 * case: an agency reusing a client's look for a new one). Owner or Admin
 * only — the roles trusted with another organization's whole design, not
 * just a Viewer's or Editor's own content. */
function useForeignOrganizations(): readonly CustomerWorkspace[] {
  const { workspace, workspaces } = useWorkspace();
  return useMemo(
    () =>
      workspaces.filter(
        (item) =>
          item.id !== workspace.id &&
          (item.role === "owner" || item.role === "admin"),
      ),
    [workspaces, workspace.id],
  );
}

/** The same picker as `useCopySources`, for one other organization's pages
 * — fetched only once it is chosen (`organizationId`), since the API lists
 * an organization's Experiences to any member of it. No "dónde se ve": we
 * never load that organization's Touchpoints just for this picker. */
function useForeignCopySources(
  type: DesignableExperienceType,
  organizationId: string | null,
): { candidates: CopySource[]; isLoading: boolean } {
  const resource = useResource(
    organizationId ? `copy-sources:${organizationId}` : null,
    (signal) => experiencesApi.list(organizationId as string, signal),
  );
  const candidates = useMemo(() => {
    const list = (resource.data ?? []).filter(
      (item): item is ExperienceSummary & { type: DesignableExperienceType } =>
        !item.archivedAt && isDesignableType(item.type),
    );
    const sorted = [...list].sort((a, b) => {
      const bySameType = Number(b.type === type) - Number(a.type === type);
      if (bySameType) return bySameType;
      return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
    });
    return sorted.map((item) => ({ ...item, whereShown: "" }));
  }, [resource.data, type]);
  return { candidates, isLoading: resource.isLoading };
}

/** From this many candidates on, the picker gets a search box and type
 * filters, like `ExperienceTiles` (Links). */
const manyCopySources = 8;

/**
 * "Igual que otra de tus páginas" (C4a, plus D6: también de otra
 * organización). The real top of each candidate page (`ExperienceThumb`,
 * the same thumbnail Links uses), its type and where it is seen today (or
 * which organization it is, when it's not this one's). Choosing one shows
 * "Usar el diseño de «X»" right under it, so the action never needs a
 * scroll of its own; pressing it copies the look onto this page's own
 * content (`copyDesignToType`). From another organization, its photos and
 * logos never come along (`withoutForeignImages`): they live in that
 * organization's own library.
 */
function CopyDesignSection({
  type,
  content,
  copy,
  foreignOrgs,
  onStart,
}: {
  type: DesignableExperienceType;
  content: ExperienceContent;
  copy: { candidates: CopySource[] };
  foreignOrgs: readonly CustomerWorkspace[];
  onStart: (design: PageDesign, origin: string, message?: string) => void;
}) {
  const [scope, setScope] = useState<"own" | "foreign">("own");
  const [orgId, setOrgId] = useState<string | null>(
    foreignOrgs.length === 1 ? (foreignOrgs[0]?.id ?? null) : null,
  );
  const org = foreignOrgs.find((item) => item.id === orgId) ?? null;
  const foreign = useForeignCopySources(
    type,
    scope === "foreign" ? orgId : null,
  );
  const activeCandidates =
    scope === "own" ? copy.candidates : foreign.candidates;

  const [sourceId, setSourceId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<CopySource["type"] | "all">(
    "all",
  );
  // A different scope or organization means a different list: the pick
  // from before no longer applies.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the scope or the organization changes
  useEffect(() => {
    setSourceId(null);
  }, [scope, orgId]);

  const many = activeCandidates.length >= manyCopySources;
  const types = useMemo(
    () => [...new Set(activeCandidates.map((item) => item.type))],
    [activeCandidates],
  );
  const shown = useMemo(() => {
    if (!many) return activeCandidates;
    const needle = query.trim().toLowerCase();
    return activeCandidates.filter(
      (item) =>
        (typeFilter === "all" || item.type === typeFilter) &&
        (!needle || item.name.toLowerCase().includes(needle)),
    );
  }, [activeCandidates, many, query, typeFilter]);
  const source = activeCandidates.find((item) => item.id === sourceId) ?? null;

  function applyChosenDesign() {
    if (!source) return;
    const sourceDesign =
      contentDesign(source.content) ??
      designFromContent(source.type, source.content);
    const newId = idFactoryFor(null, contentItemIds(content));
    const copied = copyDesignToType(sourceDesign, type, newId);
    if (scope === "foreign" && org) {
      onStart(
        withoutForeignImages(copied),
        source.name,
        `Empezaste con el diseño de «${source.name}» de ${org.name}. Sube tus fotos donde dice Falta tu foto.`,
      );
      return;
    }
    onStart(copied, source.name);
  }

  return (
    <section aria-labelledby="es-start-copy" className="es-start-copy">
      <div className="es-start-copy-head">
        <h3 id="es-start-copy">Igual que otra de tus páginas</h3>
        {many ? (
          <label className="es-copy-search">
            <Icon name="search" size={16} />
            <span className="visually-hidden">Buscar</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar"
              type="search"
              value={query}
            />
          </label>
        ) : null}
      </div>

      {foreignOrgs.length ? (
        <fieldset className="qrs-chips">
          <legend className="visually-hidden">De dónde copiar</legend>
          <button
            aria-pressed={scope === "own"}
            className="qrs-chip"
            onClick={() => setScope("own")}
            type="button"
          >
            De esta organización
          </button>
          <button
            aria-pressed={scope === "foreign"}
            className="qrs-chip"
            onClick={() => setScope("foreign")}
            type="button"
          >
            De otra organización
          </button>
        </fieldset>
      ) : null}
      {scope === "foreign" ? (
        <label className="es-copy-org-picker">
          <span>Organización</span>
          <select
            onChange={(event) => setOrgId(event.target.value || null)}
            value={orgId ?? ""}
          >
            <option value="">Elige una organización</option>
            {foreignOrgs.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {many ? (
        <fieldset className="qrs-chips es-copy-chip-row">
          <legend className="visually-hidden">Filtrar por tipo</legend>
          {(["all", ...types] as const).map((item) => (
            <button
              aria-pressed={typeFilter === item}
              className="qrs-chip"
              key={item}
              onClick={() => setTypeFilter(item)}
              type="button"
            >
              {item === "all" ? "Todas" : shortTypeLabels[item]}
            </button>
          ))}
        </fieldset>
      ) : null}

      {scope === "foreign" && !orgId ? (
        <p className="es-start-empty">
          Elige una organización para ver sus páginas.
        </p>
      ) : scope === "foreign" && foreign.isLoading ? (
        <p className="es-start-empty">Cargando sus páginas…</p>
      ) : shown.length ? (
        <ul className="es-copy-tiles">
          {shown.map((item) => (
            <li key={item.id}>
              <button
                aria-pressed={item.id === sourceId}
                className={
                  item.id === sourceId
                    ? "es-copy-tile is-chosen"
                    : "es-copy-tile"
                }
                onClick={() =>
                  setSourceId((current) =>
                    current === item.id ? null : item.id,
                  )
                }
                type="button"
              >
                <ExperienceThumb className="es-copy-thumb" experience={item} />
                <span className="es-copy-text">
                  <span className="es-copy-type">
                    {shortTypeLabels[item.type]}
                  </span>
                  <strong>{item.name}</strong>
                  {scope === "own" ? (
                    <small>{item.whereShown}</small>
                  ) : org ? (
                    <small>De {org.name}</small>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="es-start-empty">
          {scope === "foreign"
            ? "Esa organización todavía no tiene páginas con diseño."
            : `Nada coincide con «${query}».`}
        </p>
      )}

      {source ? (
        // Pegada abajo del panel (laptop) o de la pantalla (celular), en
        // flujo normal (sin position: absolute ni escalas): ningún mosaico
        // cambia de tamaño al elegirlo, solo su borde.
        <div className="es-copy-bar">
          <button
            className="button button-primary"
            onClick={applyChosenDesign}
            type="button"
          >
            Usar el diseño de «{source.name}»
          </button>
        </div>
      ) : null}
    </section>
  );
}

function StartCard({
  id,
  title,
  description,
  action,
  icon,
  design,
  label,
  type,
  content,
  primary,
  onChoose,
}: {
  id: string;
  title: string;
  description: string;
  action: string;
  icon: "edit" | "select-block";
  design: PageDesign;
  label: string;
  type: DesignableExperienceType;
  content: ExperienceContent;
  primary?: boolean;
  onChoose: () => void;
}) {
  return (
    <section aria-labelledby={id} className="es-start-card">
      <DesignThumbnail
        content={content}
        design={design}
        label={label}
        scale={0.34}
        type={type}
      />
      <div className="es-start-card-copy">
        <h3 id={id}>{title}</h3>
        <p>{description}</p>
        <button
          className={
            primary ? "button button-primary" : "button button-secondary"
          }
          onClick={onChoose}
          type="button"
        >
          <Icon name={icon} size={16} /> {action}
        </button>
      </div>
    </section>
  );
}
