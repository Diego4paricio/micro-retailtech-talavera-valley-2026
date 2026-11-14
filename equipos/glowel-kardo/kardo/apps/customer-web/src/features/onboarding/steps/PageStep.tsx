import {
  type CreateExperience,
  type DocumentPage,
  type ExperienceContent,
  type ExperienceSummary,
  type ExperienceType,
  whatsappUrlFromPhone,
} from "@kardo/contracts";
import { type ReactNode, useState } from "react";
import { experiencesApi } from "../../../api/experiences.js";
import { Field } from "../../../components/Field.js";
import { Notice } from "../../../components/Notice.js";
import { errorMessage } from "../../../lib/api.js";
import { useWorkspace } from "../../../workspace/WorkspaceContext.js";
import { republishIfLive } from "../../experiences/assign.js";
import {
  type ContentOf,
  cleanContent,
  limits,
  seedContentForCreation,
  validateContent,
} from "../../experiences/content.js";
import { TextInput } from "../../experiences/editors/fields.js";
import { experienceTypeLabels } from "../../experiences/labels.js";
import {
  type PageChoice,
  pageChoices,
  pageNameFor,
} from "../../experiences/page-types.js";
import { PdfPagesField } from "../../experiences/pdf/PdfPagesField.js";
import { PageTypeIcon } from "../first-steps-icons.js";
import {
  contentFromRows,
  type FirstStepsPlan,
  pageHasContent,
  rowsFromContent,
  type SectionRows,
} from "../first-steps-model.js";
import {
  linkPageFromQuick,
  linksFromQuick,
  type QuickLinks,
  quickFromLinkPage,
  quickFromLinks,
  quickLinkFields,
  quickLinkProblem,
  quickLinkUrl,
} from "../page-links.js";
import { QuickItemsEditor, quickItemsSummary } from "../QuickItemsEditor.js";
import type { FirstSteps } from "../use-first-steps.js";
import { ImageDrop } from "./ImageDrop.js";

type PageType = ExperienceType;
type Saved = (experience: ExperienceSummary) => void;

/**
 * 2. Tu página (owner, 2026-10-04): the owner picks their first Experience
 * instead of being sent to a Menú: a menu already in PDF or a photo of it
 * does not have to be rebuilt from zero. Every type is in view, in tiles
 * (relevo 33); each then asks only for what it needs, without notes.
 */
export function PageStep({
  steps,
  onDone,
}: {
  steps: FirstSteps;
  onDone: () => void;
}) {
  const { experiences } = useWorkspace();
  const { state } = steps;
  const current = state.experience;
  const [type, setType] = useState<PageType | null>(current?.type ?? null);
  const choices = pageChoices(state.plan);
  const existing = (experiences.data ?? []).filter((item) => !item.archivedAt);

  const saved: Saved = (experience) => {
    steps.chooseExperience(experience.id);
    onDone();
  };

  if (!type)
    return (
      <PageChoices
        choices={choices}
        existing={existing}
        onPick={setType}
        onUse={(item) => {
          steps.chooseExperience(item.id);
          if (pageHasContent(item.type, item.content as ExperienceContent))
            onDone();
          else setType(item.type);
        }}
      />
    );

  const choice = choices.find((item) => item.type === type);
  const target = current?.type === type ? current : null;
  return (
    <div className="fs-form fs-card fs-narrow">
      <div className="fs-chosen">
        <PageTypeIcon type={type} />
        <strong>
          {target?.name ?? choice?.title ?? experienceTypeLabels[type]}
        </strong>
        <button
          className="link-button"
          onClick={() => setType(null)}
          type="button"
        >
          Cambiar
        </button>
      </div>
      <PageCapture
        onSaved={saved}
        plan={state.plan}
        profilePhone={steps.profile.data?.phone}
        profileCountry={steps.profile.data?.country}
        target={target}
        type={type}
      />
    </div>
  );
}

function PageChoices({
  choices,
  existing,
  onPick,
  onUse,
}: {
  choices: PageChoice[];
  existing: ExperienceSummary[];
  onPick: (type: PageType) => void;
  onUse: (experience: ExperienceSummary) => void;
}) {
  return (
    <div className="fs-form">
      <ul className="fs-tiles">
        {choices.map((choice, index) => (
          <li key={choice.type}>
            <button
              className="fs-tile"
              onClick={() => onPick(choice.type)}
              type="button"
            >
              {index === 0 ? (
                <span className="fs-tile-badge">Para ti</span>
              ) : null}
              <PageTypeIcon type={choice.type} />
              <strong>{choice.title}</strong>
            </button>
          </li>
        ))}
      </ul>
      {existing.length ? (
        <div className="fs-existing">
          <p className="fs-hint">O usa una que ya creaste:</p>
          <ul>
            {existing.map((item) => (
              <li key={item.id}>
                <button
                  className="fs-existing-item"
                  onClick={() => onUse(item)}
                  type="button"
                >
                  <PageTypeIcon size={16} type={item.type} />
                  <strong>{item.name}</strong>
                  <small>{experienceTypeLabels[item.type]}</small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function PageCapture({
  type,
  target,
  plan,
  profilePhone,
  profileCountry,
  onSaved,
}: {
  type: PageType;
  target: ExperienceSummary | null;
  plan: FirstStepsPlan;
  profilePhone: string | undefined;
  profileCountry: string | undefined;
  onSaved: Saved;
}) {
  const props = { target, plan, onSaved };
  switch (type) {
    case "menu":
    case "catalog":
      return <ItemsCapture type={type} {...props} />;
    case "document":
      return <PdfCapture {...props} />;
    case "image":
      return <ImageCapture {...props} />;
    case "redirect":
      return <RedirectCapture {...props} />;
    case "links":
    case "profile":
    case "linkpage":
      return (
        <LinksCapture
          type={type}
          whatsappUrl={whatsappUrlFromPhone(profilePhone, profileCountry)}
          {...props}
        />
      );
    case "form":
      return <FormCapture {...props} />;
  }
}

type CaptureProps = {
  target: ExperienceSummary | null;
  plan: FirstStepsPlan;
  onSaved: Saved;
};

/** Creates the page (or saves the one being edited) and hands it back.
 * `pageName`, when given, names a new page instead of `pageNameFor`'s
 * default (the PDF's own name, relevo 37 C9c: `PdfCapture` below). */
function useSavePage(type: PageType, plan: FirstStepsPlan, pageName?: string) {
  const { workspace, upsertExperience, refreshPublicationState } =
    useWorkspace();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(
    target: ExperienceSummary | null,
    content: ExperienceContent,
    onSaved: Saved,
  ) {
    if (isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const clean = cleanContent(type, content);
      // The revision this step loaded (the panel's list keeps it current
      // after every save): someone who saved meanwhile is not overwritten
      // (domain audit A2-22).
      const saved = target
        ? await experiencesApi.update(workspace.id, target.id, {
            name: target.name,
            content: clean,
            ...(target.draftRevision
              ? { expectedDraftRevision: target.draftRevision }
              : {}),
          })
        : await experiencesApi.create(workspace.id, {
            name: pageName ?? pageNameFor(type, plan),
            type,
            content: clean,
          } as CreateExperience);
      upsertExperience(saved);
      if (target && (await republishIfLive(workspace.id, target)))
        await refreshPublicationState();
      onSaved(saved);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setIsSaving(false);
    }
  }
  return { save, isSaving, error, workspace };
}

function SaveButton({
  isSaving,
  disabled,
  children,
  onClick,
}: {
  isSaving: boolean;
  disabled: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      aria-busy={isSaving || undefined}
      className="button button-primary fs-cta"
      disabled={disabled || isSaving}
      onClick={onClick}
      type="button"
    >
      {isSaving ? "Guardando…" : children}
    </button>
  );
}

const baseOf = (target: ExperienceSummary | null) =>
  (target?.content as ExperienceContent | undefined) ?? null;

/** Escribe tu menú / tus productos: rows of name and price. */
function ItemsCapture({
  type,
  target,
  plan,
  onSaved,
}: CaptureProps & { type: "menu" | "catalog" }) {
  const { save, isSaving, error, workspace } = useSavePage(type, plan);
  const noun =
    type === plan.type
      ? plan.noun
      : type === "menu"
        ? { one: "platillo", many: "platillos" }
        : { one: "producto", many: "productos" };
  const defaultSection = type === "menu" ? "Menú" : "";
  const [sections, setSections] = useState<SectionRows[]>(() =>
    rowsFromContent(type, baseOf(target), defaultSection),
  );
  const { filled, priceErrors } = quickItemsSummary(sections);
  return (
    <>
      <QuickItemsEditor
        defaultSection={defaultSection}
        noun={noun}
        onChange={setSections}
        sections={sections}
        type={type}
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <SaveButton
        disabled={!filled || priceErrors}
        isSaving={isSaving}
        onClick={() =>
          void save(
            target,
            contentFromRows({
              type,
              base: baseOf(target),
              sections,
              title: workspace.name,
              defaultSection: defaultSection || pageNameFor(type, plan),
            }),
            onSaved,
          )
        }
      >
        {filled
          ? `Guardar ${filled === 1 ? `1 ${noun.one}` : `${filled} ${noun.many}`} y seguir`
          : `Escribe por lo menos un ${noun.one}`}
      </SaveButton>
    </>
  );
}

/** Sube tu menú en PDF: its pages show in the page, nothing to download.
 * The new page's name comes from the file the owner uploaded, or from the
 * giro (relevo 37 C9c: "Catálogo en PDF" named nothing of the business). */
function PdfCapture({ target, plan, onSaved }: CaptureProps) {
  // Only a new page is named from the upload; one being edited keeps its
  // name (`useSavePage` ignores `pageName` once `target` is set).
  const [fileName, setFileName] = useState<string | null>(null);
  const { save, isSaving, error, workspace } = useSavePage(
    "document",
    plan,
    pageNameFor("document", plan, fileName),
  );
  const current = baseOf(target) as ContentOf<"document"> | null;
  const [assetId, setAssetId] = useState(current?.assetId);
  const [pages, setPages] = useState<DocumentPage[]>(
    () => current?.pages ?? [],
  );
  const title = plan.type === "menu" ? "Menú" : "Catálogo";
  return (
    <>
      <PdfPagesField
        assetId={assetId}
        id="fs-pdf"
        label={`Tu ${title.toLowerCase()} en PDF`}
        onAssetUploaded={(asset) => setFileName(asset.filename)}
        onChange={(next) => {
          setAssetId(next.assetId);
          setPages(next.pages);
        }}
        pages={pages}
        workspaceId={workspace.id}
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <SaveButton
        disabled={!pages.length}
        isSaving={isSaving}
        onClick={() =>
          void save(
            target,
            {
              ...(current ?? {}),
              ...(assetId ? { assetId } : {}),
              title: current?.title ?? workspace.name,
              display: "viewer",
              pages,
            } as ContentOf<"document">,
            onSaved,
          )
        }
      >
        {pages.length ? "Guardar y seguir" : "Sube tu PDF para seguir"}
      </SaveButton>
    </>
  );
}

/** Sube una foto o imagen: shown large, with a description for screen
 * readers already written. */
function ImageCapture({ target, plan, onSaved }: CaptureProps) {
  const { save, isSaving, error, workspace } = useSavePage("image", plan);
  const current = baseOf(target) as ContentOf<"image"> | null;
  const [assetId, setAssetId] = useState(current?.assetId ?? "");
  const [alt, setAlt] = useState(
    current?.alt ?? `${pageNameFor("image", plan)} de ${workspace.name}`,
  );
  return (
    <>
      <ImageDrop onChange={setAssetId} value={assetId} />
      <TextInput
        id="fs-image-alt"
        label="Qué muestra"
        max={limits.alt}
        onChange={setAlt}
        value={alt}
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <SaveButton
        disabled={!assetId || !alt.trim()}
        isSaving={isSaving}
        onClick={() =>
          void save(
            target,
            {
              ...(current ?? {}),
              assetId,
              alt: alt.trim(),
            } as ContentOf<"image">,
            onSaved,
          )
        }
      >
        {assetId ? "Guardar y seguir" : "Sube tu imagen para seguir"}
      </SaveButton>
    </>
  );
}

/** Enviar a tu sitio web: only the address. */
function RedirectCapture({ target, plan, onSaved }: CaptureProps) {
  const { save, isSaving, error } = useSavePage("redirect", plan);
  const current = baseOf(target) as ContentOf<"redirect"> | null;
  const [url, setUrl] = useState(current?.destinationUrl ?? "");
  const withScheme = /^https?:\/\//i.test(url.trim())
    ? url.trim()
    : url.trim()
      ? `https://${url.trim()}`
      : "";
  const invalid = withScheme
    ? validateContent("redirect", { destinationUrl: withScheme }).destinationUrl
    : undefined;
  return (
    <>
      <TextInput
        error={invalid}
        id="fs-redirect"
        label="Tu sitio web"
        max={2048}
        onChange={setUrl}
        placeholder="tunegocio.com"
        type="url"
        value={url}
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <SaveButton
        disabled={!withScheme || Boolean(invalid)}
        isSaving={isSaving}
        onClick={() =>
          void save(target, { destinationUrl: withScheme }, onSaved)
        }
      >
        Guardar y seguir
      </SaveButton>
    </>
  );
}

/** Tus enlaces / Tu tarjeta: WhatsApp from step 1 and the networks people
 * know by their @usuario. */
function LinksCapture({
  type,
  target,
  plan,
  whatsappUrl,
  onSaved,
}: CaptureProps & {
  type: "links" | "profile" | "linkpage";
  whatsappUrl: string | undefined;
}) {
  const { save, isSaving, error, workspace } = useSavePage(type, plan);
  const current = baseOf(target) as
    | ContentOf<"links">
    | ContentOf<"profile">
    | ContentOf<"linkpage">
    | null;
  const currentLinks = current?.links ?? [];
  const currentPage = (current ?? {}) as Partial<ContentOf<"linkpage">>;
  const [values, setValues] = useState<QuickLinks>(() =>
    type === "linkpage"
      ? quickFromLinkPage(currentPage)
      : quickFromLinks(currentLinks),
  );
  const [withWhatsapp, setWithWhatsapp] = useState(Boolean(whatsappUrl));
  const whatsapp = withWhatsapp ? whatsappUrl : undefined;
  const page = linkPageFromQuick(values, whatsapp, currentPage);
  const links = linksFromQuick(values, whatsapp, currentLinks);
  const count =
    type === "linkpage"
      ? page.socials.length + page.links.length
      : links.length;
  const wrong = quickLinkFields.filter(
    (field) =>
      values[field.key]?.trim() &&
      !quickLinkUrl(field.key, values[field.key] ?? ""),
  );
  function content(): ExperienceContent {
    if (type === "linkpage")
      return {
        ...currentPage,
        displayName: currentPage.displayName || workspace.name,
        socials: page.socials,
        links: page.links,
      } as ContentOf<"linkpage">;
    if (type === "links")
      return {
        ...((current as ContentOf<"links"> | null) ?? {}),
        title: (current as ContentOf<"links"> | null)?.title || workspace.name,
        links,
      } as ContentOf<"links">;
    return {
      ...((current as ContentOf<"profile"> | null) ?? {}),
      displayName:
        (current as ContentOf<"profile"> | null)?.displayName || workspace.name,
      links,
    } as ContentOf<"profile">;
  }
  return (
    <>
      {whatsappUrl ? (
        <label className="fs-check">
          <input
            checked={withWhatsapp}
            onChange={(event) => setWithWhatsapp(event.target.checked)}
            type="checkbox"
          />
          Botón de WhatsApp
        </label>
      ) : (
        <p className="fs-hint">Tu WhatsApp va en el paso 1.</p>
      )}
      {quickLinkFields.map((field) => (
        <Field
          // Said while typing: on leaving the field it came too late, and
          // the button had already turned off without a word (C8b).
          error={
            quickLinkProblem(field.key, values[field.key] ?? "") ?? undefined
          }
          id={`fs-link-${field.key}`}
          key={field.key}
          label={field.label}
          optional
        >
          <input
            className="input"
            id={`fs-link-${field.key}`}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                [field.key]: event.target.value,
              }))
            }
            placeholder={field.placeholder}
            value={values[field.key] ?? ""}
          />
        </Field>
      ))}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <SaveButton
        disabled={!count || wrong.length > 0}
        isSaving={isSaving}
        onClick={() => void save(target, content(), onSaved)}
      >
        {wrong[0]
          ? `Revisa «${wrong[0].label}»`
          : count
            ? `Guardar ${count === 1 ? "1 enlace" : `${count} enlaces`} y seguir`
            : "Pon por lo menos un enlace"}
      </SaveButton>
    </>
  );
}

/** Un formulario de contacto: name, phone and message; it is adjusted in
 * the Estudio. */
function FormCapture({ target, plan, onSaved }: CaptureProps) {
  const { save, isSaving, error, workspace } = useSavePage("form", plan);
  return (
    <>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <SaveButton
        disabled={false}
        isSaving={isSaving}
        onClick={() =>
          target
            ? onSaved(target)
            : void save(
                null,
                seedContentForCreation("form", workspace.name, workspace.name),
                onSaved,
              )
        }
      >
        {target ? "Seguir" : "Crear mi formulario y seguir"}
      </SaveButton>
    </>
  );
}
