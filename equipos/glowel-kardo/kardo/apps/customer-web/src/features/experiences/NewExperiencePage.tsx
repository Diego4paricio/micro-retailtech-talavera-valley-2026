import type {
  Asset,
  CreateExperience,
  DocumentPage,
  ExperienceContent,
  ExperienceType,
} from "@kardo/contracts";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { assetsApi } from "../../api/assets.js";
import { experiencesApi } from "../../api/experiences.js";
import { EmptyState } from "../../components/EmptyState.js";
import { Field } from "../../components/Field.js";
import { AssetSelect, TextInput } from "../../components/FormFields.js";
import { Icon } from "../../components/Icon.js";
import { Notice } from "../../components/Notice.js";
import { PageHeader } from "../../components/PageHeader.js";
import { PageTypeIcon } from "../../components/PageTypeIcon.js";
import { StepTrack } from "../../components/StepTrack.js";
import { errorMessage } from "../../lib/api.js";
import { Link, useRouter } from "../../lib/router.js";
import { useResource } from "../../lib/use-resource.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { useWorkspaceProfile } from "../settings/use-workspace-profile.js";
import {
  type ContentOf,
  cleanContent,
  limits,
  seedContentForCreation,
  validateContent,
} from "./content.js";
import { experienceTypeDescriptions, experienceTypeLabels } from "./labels.js";
import {
  canCreateFromStep2,
  creationStepOf,
  newExperienceRoute,
  suggestedName,
} from "./new-experience-model.js";
import { creationTypesFor, pagePlanFor } from "./page-types.js";
import { PdfPagesField } from "./pdf/PdfPagesField.js";

/**
 * Two steps: first "¿Qué quieres crear?" (just the type cards), then only
 * what that type needs — the internal name and, for Imagen, Documento PDF
 * and Redirección, the one extra thing each requires. Creating and opening
 * the Estudio is a single action from there (ADR 018, addendum 3); every
 * Documento PDF created here always shows its pages in the page — there is
 * no download-only option any more, though existing ones keep working until
 * their own editor prepares their pages. Redirección has no page to design,
 * so "Crear" saves it directly and opens its own simple editor.
 */
export function NewExperiencePage({
  touchpointId,
  groupId,
}: {
  touchpointId: string | null;
  groupId: string | null;
}) {
  const { touchpoints, groups, can, workspace } = useWorkspace();
  // The type that fits the giro goes first (relevo 37, S5): Carmen, of a
  // nail salon, made a «Menú» and it said «Platillo 1».
  const profile = useWorkspaceProfile();
  // The one catalog Primeros pasos also reads: same order, same names
  // (domain audit A2-28).
  const plan = profile.data?.industry
    ? pagePlanFor(profile.data.industry)
    : null;
  const typeOrder = creationTypesFor(plan);
  const recommended = plan ? (typeOrder[0] ?? null) : null;
  const { navigate, route } = useRouter();
  const routeType =
    route.name === "experience-new" ? (route.type ?? null) : null;
  // «Crear página con este archivo» (Archivos, A2-47): starts with the file.
  const routeAssetId =
    route.name === "experience-new" ? (route.assetId ?? "") : "";

  const [option, setOption] = useState<ExperienceType | null>(routeType);
  const [step, setStep] = useState(creationStepOf(routeType));
  const [name, setName] = useState("");
  const [assetId, setAssetId] = useState(routeAssetId);
  const [alt, setAlt] = useState("");
  const [pdfPages, setPdfPages] = useState<DocumentPage[] | null>(null);
  const [destinationUrl, setDestinationUrl] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // The browser's own Back/Forward also moves between the two steps: it only
  // ever adds the chosen type back in, never clearing what was already typed.
  useEffect(() => {
    setStep(creationStepOf(routeType));
    if (routeType) setOption(routeType);
  }, [routeType]);

  // A file chosen in Archivos names the page, the first time only.
  useEffect(() => {
    if (routeAssetId) setAssetId(routeAssetId);
  }, [routeAssetId]);

  const targets = useMemo(
    () => ({
      touchpointIds: touchpointId ? [touchpointId] : [],
      groupIds: groupId ? [groupId] : [],
    }),
    [touchpointId, groupId],
  );

  const needsAsset = option === "image" || option === "document";
  const assetsResource = useResource(
    needsAsset ? `assets:${workspace.id}` : null,
    (signal) => assetsApi.list(workspace.id, signal),
  );
  const { setData: setAssets } = assetsResource;
  const addAsset = (asset: Asset) =>
    setAssets((items) => (items ? [asset, ...items] : [asset]));

  if (!can("experiences.edit"))
    return (
      <div className="page">
        <EmptyState icon="experience" title="Tu rol no permite crear páginas">
          Pide a una persona con rol Owner, Admin o Editor que la cree.
        </EmptyState>
      </div>
    );

  const origin = touchpointId
    ? touchpoints.data?.find((item) => item.id === touchpointId)
    : undefined;
  const originGroup = groupId
    ? groups.data?.find((item) => item.id === groupId)
    : undefined;
  const originName = origin?.operationalName ?? originGroup?.name ?? null;

  function selectOption(next: ExperienceType) {
    if (next !== option) {
      setAssetId(
        routeAssetId && (next === "image" || next === "document")
          ? routeAssetId
          : "",
      );
      setAlt("");
      setPdfPages(null);
      setDestinationUrl("");
      setCreateError(null);
    }
    setName((current) => suggestedName(next, current, plan));
    setOption(next);
    setStep(2);
    navigate(newExperienceRoute(touchpointId, groupId, next));
  }

  function backToStep1() {
    setCreateError(null);
    setStep(1);
    navigate(newExperienceRoute(touchpointId, groupId, null), {
      replace: true,
    });
  }

  // A PDF picked in Archivos has no pages yet: it is offered as a download
  // until the person uploads it again to show it in the page (A2-47).
  const fromLibraryPdf =
    option === "document" && Boolean(assetId) && !pdfPages?.length;

  const redirectError =
    option === "redirect" && destinationUrl.trim()
      ? validateContent("redirect", { destinationUrl }).destinationUrl
      : undefined;

  const readyToSubmit = Boolean(
    option &&
      canCreateFromStep2(option, {
        name,
        assetId,
        alt,
        pdfPages,
        destinationUrl,
        fromLibrary: fromLibraryPdf,
      }),
  );

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!option || !readyToSubmit) return;
    const trimmedName = name.trim();
    setIsCreating(true);
    setCreateError(null);
    try {
      if (option === "redirect") {
        const content = cleanContent("redirect", {
          destinationUrl,
        } satisfies ContentOf<"redirect">);
        const created = await experiencesApi.create(workspace.id, {
          type: "redirect",
          name: trimmedName,
          content,
          targets,
        } as CreateExperience);
        navigate({ name: "experience", id: created.id });
        return;
      }
      const businessName =
        workspace.kind === "organization" ? workspace.name : undefined;
      let content: ExperienceContent;
      if (option === "image") {
        content = {
          assetId,
          alt: alt.trim(),
        } satisfies ContentOf<"image">;
      } else if (option === "document") {
        content = fromLibraryPdf
          ? ({
              assetId,
              title: trimmedName,
              display: "download",
            } satisfies ContentOf<"document">)
          : ({
              ...(assetId ? { assetId } : {}),
              title: trimmedName,
              display: "viewer",
              pages: pdfPages ?? [],
            } satisfies ContentOf<"document">);
      } else {
        content = seedContentForCreation(option, trimmedName, businessName);
      }
      const created = await experiencesApi.create(workspace.id, {
        type: option,
        name: trimmedName,
        content: cleanContent(option, content),
        targets,
      } as CreateExperience);
      navigate({ name: "experience-studio", id: created.id });
    } catch (error) {
      setCreateError(errorMessage(error));
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="page xpn">
      <PageHeader
        back={
          <Link
            className="text-action"
            to={
              origin
                ? { name: "touchpoint", id: origin.id }
                : { name: "experiences" }
            }
          >
            <Icon name="arrow-left" size={16} />{" "}
            {origin ? origin.operationalName : "Páginas"}
          </Link>
        }
        description={
          step === 1
            ? "Elige qué verá tu cliente al escanear tu QR. En qué QR se ve lo eliges al publicar."
            : "Ponle nombre y, si ese tipo lo necesita, súbelo aquí. Todo lo demás se edita en el Estudio."
        }
        title="Nueva página"
      />
      <div className="xpn-steps">
        <StepTrack
          current={step - 1}
          items={[
            { label: "Tipo", done: step === 2, locked: step === 1 },
            { label: "Nombre", done: false, locked: true },
          ]}
          label="Pasos para crear la página"
          onSelect={() => backToStep1()}
        />
        <p className="visually-hidden" aria-live="polite">
          Paso {step} de 2
        </p>
      </div>
      {step === 1 ? (
        <fieldset className="type-picker xpn-types">
          <legend className="visually-hidden">¿Qué quieres crear?</legend>
          {typeOrder.map((candidate) => (
            <label
              className={
                option === candidate
                  ? "type-card type-card-selected"
                  : "type-card"
              }
              key={candidate}
            >
              <input
                checked={option === candidate}
                name="experience-type"
                // `onChange` covers picking a different type (mouse or
                // keyboard). A click on the already-checked card fires no
                // change event, so `onClick` covers going back to step 1 and
                // clicking the same card again to return to step 2.
                onChange={() => selectOption(candidate)}
                onClick={() => {
                  if (option === candidate) selectOption(candidate);
                }}
                type="radio"
                value={candidate}
              />
              <span className="type-card-icon" aria-hidden="true">
                <PageTypeIcon size={22} type={candidate} />
              </span>
              <strong>{experienceTypeLabels[candidate]}</strong>
              {candidate === recommended ? (
                <span className="type-card-pick">Para tu negocio</span>
              ) : null}
              <small>{experienceTypeDescriptions[candidate]}</small>
            </label>
          ))}
        </fieldset>
      ) : option ? (
        <form className="xpn-form" onSubmit={start}>
          <div className="panel xpn-details form-grid">
            {/* The PDF is what this step is about: first and full width, so
                the drop zone and the page preview have room. */}
            {option === "document" ? (
              <div className="xpn-file">
                <PdfPagesField
                  assetId={assetId || undefined}
                  id="new-experience-pdf"
                  label="Tu PDF"
                  onAssetUploaded={addAsset}
                  onChange={(next) => {
                    setAssetId(next.assetId ?? "");
                    setPdfPages(next.pages);
                  }}
                  pages={pdfPages ?? undefined}
                  workspaceId={workspace.id}
                />
                {fromLibraryPdf ? (
                  <p className="form-note">
                    Elegiste un PDF de tus archivos: tu cliente lo verá como
                    descarga. Para mostrarlo dentro de la página, súbelo otra
                    vez aquí.
                  </p>
                ) : null}
              </div>
            ) : null}
            <Field
              hint="Solo lo ve tu equipo. Puedes cambiarlo después."
              id="new-experience-name"
              label="Nombre interno"
            >
              <input
                id="new-experience-name"
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ej. Menú de temporada"
                required
                value={name}
              />
            </Field>

            {option === "image" ? (
              <>
                <AssetSelect
                  assets={assetsResource.data ?? []}
                  id="new-experience-asset"
                  kind="image"
                  label="Imagen"
                  onAssetUploaded={addAsset}
                  onChange={setAssetId}
                  value={assetId}
                />
                <TextInput
                  hint="Describe la imagen para quien usa lector de pantalla."
                  id="new-experience-alt"
                  label="Texto alternativo"
                  max={limits.alt}
                  onChange={setAlt}
                  placeholder="Ej. Carta de bebidas de otoño"
                  value={alt}
                />
              </>
            ) : null}
            {option === "redirect" ? (
              <TextInput
                error={redirectError}
                hint="Quien toque o escanee irá directamente a esta dirección."
                id="new-experience-url"
                label="URL de destino"
                max={2048}
                onChange={setDestinationUrl}
                placeholder="https://tu-sitio.com/bienvenida"
                type="url"
                value={destinationUrl}
              />
            ) : null}

            {createError ? <Notice tone="danger">{createError}</Notice> : null}

            <div className="xpn-actions">
              <div className="xpn-actions-buttons">
                <button
                  className="button button-secondary"
                  onClick={backToStep1}
                  type="button"
                >
                  <Icon name="arrow-left" size={16} /> Atrás
                </button>
                <button
                  aria-busy={isCreating || undefined}
                  className="button button-primary"
                  disabled={!readyToSubmit || isCreating}
                  type="submit"
                >
                  {isCreating ? (
                    <>
                      <span aria-hidden="true" className="button-spinner" />
                      Creando…
                    </>
                  ) : option === "redirect" ? (
                    "Crear"
                  ) : (
                    <>
                      Crear y abrir el Estudio{" "}
                      <Icon name="arrow-right" size={16} />
                    </>
                  )}
                </button>
              </div>
              <p className="form-note">
                {originName
                  ? `Quedará asignada a ${originName}. Nada se publica hasta que tú lo decidas.`
                  : "Nada se publica hasta que tú lo decidas."}
              </p>
            </div>
          </div>
        </form>
      ) : null}
    </div>
  );
}
