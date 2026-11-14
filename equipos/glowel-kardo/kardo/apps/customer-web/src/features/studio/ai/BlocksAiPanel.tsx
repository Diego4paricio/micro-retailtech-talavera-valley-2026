import {
  type ConceptBrief,
  type DesignPhotoMode,
  supportsCustomHtml,
} from "@kardo/contracts";
import { useEffect, useRef, useState } from "react";
import { Icon } from "../../../components/Icon.js";
import { Notice } from "../../../components/Notice.js";
import { StepTrack } from "../../../components/StepTrack.js";
import { useToast } from "../../../components/Toast.js";
import { Link } from "../../../lib/router.js";
import { useWorkspace } from "../../../workspace/WorkspaceContext.js";
import { saveWorkspaceProfile } from "../../business-profile/profile-store.js";
import { PhoneInput } from "../../profile-fields/PhoneInput.js";
import {
  isPhoneComplete,
  phoneDigits,
  phoneForProfile,
} from "../../profile-fields/phone.js";
import { briefReady, emptyBrief, prepareBrief } from "../html/model.js";
import { DesignThumbnail } from "../preview/DesignThumbnail.js";
import { useStudio } from "../StudioContext.js";
import { useOrganizationBrand } from "../use-organization-brand.js";
import { AiBriefForm } from "./AiBriefForm.js";
import { AiProgress } from "./AiProgress.js";
import {
  aiTypeCopy,
  pedidoAsksForPricesOnPageWithout,
  readAiDraft,
  saveAiDraft,
} from "./ai-brief.js";
import {
  applyItemPhotos,
  photoSpacesIn,
  prepareGeneratedDesign,
} from "./apply-design.js";
import { BrandUsageNote } from "./BrandUsageNote.js";
import { ConceptCards } from "./ConceptCards.js";
import { AiStatusNotice } from "./StatusNotice.js";
import {
  designsLeft,
  hourLeft,
  usageLine,
  useAiUsage,
} from "./use-ai-usage.js";
import { useDesignAiFlow } from "./use-design-ai-flow.js";
import "./ai-panel.css";

/** "¿Qué le cambio?" (B3e): short, concrete tweaks, so typing isn't the
 * only way to start — appended to the description, not a replacement. */
const tweakChips = [
  "Más colorido",
  "Sin foto arriba",
  "Botón más grande",
] as const;

const steps = [
  { view: "form", label: "Describe" },
  { view: "ideas", label: "Ideas" },
  { view: "result", label: "Diseño" },
] as const;

/**
 * "Diseñar con IA" rail, modo bloques (ADR 018 addendum 3; redesigned in
 * relevo 29, 2026-10-03). Three steps for the Experience's own type:
 * describe it (examples and additions for that type, with or without
 * photos), choose among three ideas (free), and review the design (one of
 * the plan's designs) before "Usar este diseño" (one undoable change).
 * What is left of the plan shows before anything runs. A generation keeps
 * running on the server when the page reloads or closes, and its ideas or
 * design wait here (`use-design-ai-flow.ts`).
 */
export function BlocksAiPanel() {
  const {
    type,
    design,
    content,
    workspaceId,
    experienceId,
    canEditHtml,
    readOnly,
    reportAi,
    hasSavedDesign,
    aiApply,
    applyAiDesign,
    undoAiApply,
    retryAiApplySave,
    requestPublish,
    ensureSaved,
  } = useStudio();
  const organization = useOrganizationBrand();
  const { brand } = organization;
  const copy = aiTypeCopy[type];
  const draft = useRef(readAiDraft(experienceId));
  const [brief, setBrief] = useState<ConceptBrief>(
    draft.current?.brief ?? emptyBrief(),
  );
  const [photos, setPhotos] = useState<DesignPhotoMode>(
    draft.current?.photos ?? "auto",
  );
  // "¿Qué le cambio?" is the default once there is already a design to
  // tweak (B3e); "Ver otras 3 ideas" opts into the full brief below.
  const [wantFreshIdeas, setWantFreshIdeas] = useState(false);
  // IA4: "Seguir así" just stops repeating the notice this visit.
  const [pricesNoticeDismissed, setPricesNoticeDismissed] = useState(false);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const htmlMode = supportsCustomHtml(type);
  const { usage, reload: reloadUsage } = useAiUsage(workspaceId);
  // A2-39: the AI designs with the saved content, so unsaved edits go first.
  const [unsavedBlock, setUnsavedBlock] = useState(false);
  const flow = useDesignAiFlow({
    workspaceId,
    experienceId,
    htmlMode,
    onSettled: () => void reloadUsage(),
  });

  // The session found on open brings back what was asked.
  useEffect(() => {
    if (!flow.restored) return;
    setBrief(flow.restored.brief);
    setPhotos(flow.restored.photos);
  }, [flow.restored]);

  // Tells the Estudio what the rail holds: closing it with a design ready
  // asks first, and a generation that ends with the rail closed shows a
  // notice (relevo 31, finding 2). The last report stays after the rail
  // closes on purpose.
  useEffect(() => {
    reportAi(
      flow.running
        ? { status: "running" }
        : flow.view === "result" && flow.result
          ? { status: "ready", result: flow.result }
          : null,
    );
  }, [flow.running, flow.view, flow.result, reportAi]);

  // The form survives a reload before generating (this browser only).
  useEffect(() => {
    saveAiDraft(experienceId, { brief, photos });
  }, [experienceId, brief, photos]);

  // A new step starts reading from the top (not on open: the rail is
  // already there).
  const shownView = useRef(flow.view);
  useEffect(() => {
    if (shownView.current === flow.view) return;
    shownView.current = flow.view;
    // Only the rail's own scroll: scrollIntoView also scrolls the page in
    // WebKit, which moves the whole full-screen Estudio up.
    top.current?.closest(".es-panel-body")?.scrollTo({ top: 0 });
  }, [flow.view]);

  // A run that starts shows its progress at the top of the rail, in view.
  const isRunning = flow.running !== null;
  useEffect(() => {
    if (!isRunning) return;
    top.current?.closest(".es-panel-body")?.scrollTo({ top: 0 });
  }, [isRunning]);

  const ready = briefReady(brief);
  const left = designsLeft(usage);
  // Today's or the month's designs are used, or this hour's requests are.
  const hourBlocked = hourLeft(usage) === 0;
  const outOfDesigns = left === 0 || hourBlocked;
  const running = flow.running;
  const busy = running !== null;

  /** The AI reads the saved content, so what is on screen is saved first. */
  async function seesYourChanges(): Promise<boolean> {
    const saved = await ensureSaved();
    setUnsavedBlock(!saved);
    return saved;
  }

  async function askIdeas() {
    if (!ready || readOnly || busy || outOfDesigns) return;
    if (!(await seesYourChanges())) return;
    void flow.askIdeas(prepareBrief(brief), photos);
  }

  async function improveCurrent() {
    if (!ready || readOnly || busy || outOfDesigns) return;
    if (!(await seesYourChanges())) return;
    void flow.design(prepareBrief(brief), photos, { current: design });
  }

  async function designChosenIdea() {
    const concept = flow.concepts?.[flow.selected];
    if (!concept || readOnly || busy || outOfDesigns) return;
    if (!(await seesYourChanges())) return;
    void flow.design(prepareBrief(brief), photos, { concept });
  }

  function useThisDesign() {
    const result = flow.result;
    if (!result || readOnly) return;
    applyAiDesign(result);
    flow.afterUse();
    // «¿Qué le cambio?» starts empty, not with the first request.
    setWantFreshIdeas(false);
    setBrief((current) => ({ ...current, description: "" }));
  }

  const stepIndex = steps.findIndex((step) => step.view === flow.view);
  // «¿Qué le cambio?» is not one of the three steps: they hide meanwhile.
  const tweaking =
    flow.view === "form" && !running && hasSavedDesign && !wantFreshIdeas;

  return (
    <div className="es-panel-stack es-ai-panel" ref={top}>
      <UsageStrip usage={usage} />

      {tweaking ? null : (
        <StepTrack
          current={stepIndex}
          items={steps.map((step, index) => ({
            label: step.label,
            done: index < stepIndex,
          }))}
        />
      )}

      {aiApply ? (
        <AiApplyBanner
          notice={aiApply}
          onPublish={requestPublish}
          onRetry={retryAiApplySave}
          onUndo={undoAiApply}
        />
      ) : null}

      {flow.restoring ? (
        <p className="es-ai-quiet">Buscando tu último diseño con la IA…</p>
      ) : null}

      {flow.view === "result" && flow.result ? (
        <ResultView
          canEditHtml={canEditHtml}
          content={content}
          onBack={flow.backToIdeas}
          onUse={useThisDesign}
          readOnly={readOnly}
          result={flow.result}
          type={type}
          hasIdeas={flow.concepts !== null}
        />
      ) : flow.view === "ideas" && flow.concepts ? (
        <div className="es-ai-step">
          <div className="es-ai-step-head">
            <p className="es-ai-step-title">Elige la idea para {copy.noun}</p>
            <button
              className="link-button"
              disabled={busy}
              onClick={flow.startOver}
              type="button"
            >
              Cambiar mi descripción
            </button>
          </div>
          {running ? (
            <RunningCard onCancel={flow.cancel} running={running} />
          ) : null}
          <ConceptCards
            businessName={brand?.name ?? ""}
            concepts={flow.concepts}
            coverAssetId={
              photos === "without" ? undefined : brand?.coverAssetId
            }
            onSelect={flow.setSelected}
            selected={flow.selected}
            workspaceId={workspaceId}
          />
          {running ? null : (
            <>
              <button
                className="button button-secondary"
                disabled={readOnly || outOfDesigns}
                onClick={askIdeas}
                type="button"
              >
                <Icon name="refresh" size={15} /> Otras ideas
              </button>
              <div className="es-ai-actions es-ai-cta">
                <button
                  className="button button-primary"
                  disabled={readOnly || outOfDesigns}
                  onClick={designChosenIdea}
                  type="button"
                >
                  <Icon name="sparkles" size={15} /> Diseñar con esta idea
                </button>
                <CostLine left={left} />
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="es-ai-step">
          {/* While it works, the progress replaces the form: below the form
              it fell out of the phone sheet and 3 owners left thinking
              nothing happened (relevo 37, B3a). */}
          {running ? (
            <>
              <RunningCard onCancel={flow.cancel} running={running} />
              {brief.description.trim() ? (
                <div className="es-ai-asked">
                  <p className="es-ai-step-title">Lo que pediste</p>
                  <p>{brief.description.trim()}</p>
                </div>
              ) : null}
            </>
          ) : hasSavedDesign && !wantFreshIdeas ? (
            // "¿Qué le cambio?" (B3e): with a design already on the page,
            // this — not asking for 3 ideas from zero — is the default.
            // Fernanda, Javier and Karla all asked for a small change and
            // got sent back through the whole idea-picking flow.
            <QuickTweakForm
              brief={brief}
              disabled={readOnly || busy}
              left={left}
              onBrief={(recipe) => setBrief((current) => recipe(current))}
              onSubmit={improveCurrent}
              onWantFreshIdeas={() => setWantFreshIdeas(true)}
              outOfDesigns={outOfDesigns}
              ready={ready}
            />
          ) : (
            <>
              <BrandUsageNote />
              <AiBriefForm
                brief={brief}
                descriptionRef={descriptionRef}
                disabled={readOnly || busy}
                onBrief={(recipe) => setBrief((current) => recipe(current))}
                onPhotos={setPhotos}
                photos={photos}
                type={type}
              />
              {!pricesNoticeDismissed &&
              pedidoAsksForPricesOnPageWithout(type, brief.description) ? (
                <PricesNotShownNotice
                  onDismiss={() => setPricesNoticeDismissed(true)}
                />
              ) : null}
              {/* Only once the profile is read: while it loads (or if it
                  could not be read) `brand` is null too, and saving then
                  used to replace the whole profile with just the phone
                  (domain audit A2-1). */}
              {!busy && organization.profile && !brand?.whatsappUrl ? (
                <MissingWhatsAppNotice
                  disabled={readOnly}
                  organization={organization}
                />
              ) : null}
              {/* Always in view at the bottom of the rail: 3 of 5 owners
                  never found it below the suggestions (relevo 31). */}
              <div className="es-ai-actions es-ai-cta">
                <button
                  className="button button-primary"
                  disabled={!ready || readOnly || outOfDesigns}
                  onClick={askIdeas}
                  type="button"
                >
                  <Icon name="sparkles" size={15} /> Ver 3 ideas
                </button>
                {!ready ? (
                  <p className="es-ai-quiet">
                    Escribe primero cómo quieres {copy.noun}.
                  </p>
                ) : (
                  <p className="es-ai-quiet">
                    Ver ideas no gasta diseños. Diseñar con una sí.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {flow.failure ? (
        <AiStatusNotice
          htmlMode={htmlMode}
          message={
            flow.failure.status === "error" ? flow.failure.message : undefined
          }
          status={flow.failure.status}
        />
      ) : null}
      {unsavedBlock && !running ? (
        <Notice tone="warning">
          Guarda tus cambios para que la IA los vea.
        </Notice>
      ) : null}
      {usage && left === 0 && !running ? <OutOfDesigns usage={usage} /> : null}
      {readOnly ? (
        <Notice tone="info">
          Estás en modo de solo lectura: no puedes diseñar con la IA.
        </Notice>
      ) : null}
    </div>
  );
}

function UsageStrip({
  usage,
}: {
  usage: ReturnType<typeof useAiUsage>["usage"];
}) {
  if (!usage) return null;
  const line = usageLine(usage);
  const month = usage.month;
  const ratio =
    month.limit && month.remaining !== null
      ? month.remaining / month.limit
      : usage.day.limit
        ? usage.day.remaining / usage.day.limit
        : 0;
  return (
    <div className="es-ai-usage" aria-live="polite">
      <div className="es-ai-usage-row">
        <span className="es-ai-usage-main">{line.main}</span>
        {line.detail ? (
          <span className="es-ai-usage-detail">{line.detail}</span>
        ) : null}
      </div>
      <span aria-hidden="true" className="es-ai-usage-bar">
        <span style={{ width: `${Math.round(Math.max(0, ratio) * 100)}%` }} />
      </span>
    </div>
  );
}

/**
 * What "Usar este diseño" left behind (B3c/B3d/E6): saving, saved (with
 * "Publicar ahora" and "Deshacer"), or stuck (with "Reintentar"). Fernanda
 * and Sofía saved a design and never knew their customers still saw the
 * old page; Karla lost hers because nothing like this existed at all.
 */
function AiApplyBanner({
  notice,
  onPublish,
  onUndo,
  onRetry,
}: {
  notice: NonNullable<ReturnType<typeof useStudio>["aiApply"]>;
  onPublish: () => void;
  onUndo: () => void;
  onRetry: () => void;
}) {
  if (notice.kind === "saving")
    return <p className="es-ai-quiet">Guardando tu diseño…</p>;
  if (notice.kind === "published")
    return (
      <Notice title="Listo" tone="success">
        Tus clientes ya ven tu diseño nuevo.
      </Notice>
    );
  if (notice.kind === "error")
    return (
      <Notice
        action={
          <>
            <button
              className="button button-primary button-small"
              onClick={onRetry}
              type="button"
            >
              Reintentar
            </button>
            <button
              className="button button-secondary button-small"
              onClick={onUndo}
              type="button"
            >
              Deshacer
            </button>
          </>
        }
        title="No se guardó tu diseño"
        tone="danger"
      >
        Toca «Reintentar».
      </Notice>
    );
  return (
    <Notice
      action={
        <>
          <button
            className="button button-primary button-small"
            onClick={onPublish}
            type="button"
          >
            Publicar ahora
          </button>
          <button
            className="button button-secondary button-small"
            onClick={onUndo}
            type="button"
          >
            Deshacer
          </button>
        </>
      }
      title="Tu diseño nuevo ya está guardado"
      tone="success"
    >
      {notice.live
        ? "Tus clientes todavía ven el diseño anterior."
        : "Publícalo para que tus clientes lo vean."}
    </Notice>
  );
}

/**
 * "¿Qué le cambio?" (B3e): with a design already on the page, a short box
 * plus quick chips ajusts it, reusing the path that already existed
 * ("Partir de mi diseño actual, sin ideas") but hidden below the full
 * brief — Fernanda, Javier and Karla never found it and asked for 3 ideas
 * from zero instead.
 */
function QuickTweakForm({
  brief,
  disabled,
  left,
  onBrief,
  onSubmit,
  onWantFreshIdeas,
  outOfDesigns,
  ready,
}: {
  brief: ConceptBrief;
  disabled: boolean;
  left: number | null;
  onBrief: (recipe: (brief: ConceptBrief) => ConceptBrief) => void;
  onSubmit: () => void;
  onWantFreshIdeas: () => void;
  outOfDesigns: boolean;
  ready: boolean;
}) {
  function addTweak(text: string) {
    onBrief((current) => {
      const base = current.description.trim();
      return { ...current, description: base ? `${base}, ${text}` : text };
    });
  }
  return (
    <div className="es-ai-step">
      <section className="es-aif-block">
        <p className="es-aif-label">¿Qué le cambio?</p>
        <textarea
          className="es-aif-textarea"
          disabled={disabled}
          onChange={(event) => {
            const value = event.target.value;
            onBrief((current) => ({ ...current, description: value }));
          }}
          placeholder="Ej.: letra más grande en los precios"
          rows={3}
          value={brief.description}
        />
        <div className="es-aif-examples">
          {tweakChips.map((chip) => (
            <button
              className="es-aif-example"
              disabled={disabled}
              key={chip}
              onClick={() => addTweak(chip)}
              type="button"
            >
              {chip}
            </button>
          ))}
        </div>
      </section>
      <div className="es-ai-actions es-ai-cta">
        <button
          className="button button-primary"
          disabled={!ready || disabled || outOfDesigns}
          onClick={onSubmit}
          type="button"
        >
          <Icon name="sparkles" size={15} /> Ajustar este diseño
        </button>
        {!ready ? (
          <p className="es-ai-quiet">Escribe primero qué le cambio.</p>
        ) : (
          <CostLine left={left} />
        )}
      </div>
      <p className="es-ai-tweak-more">
        <button
          className="link-button"
          disabled={disabled}
          onClick={onWantFreshIdeas}
          type="button"
        >
          Ver otras 3 ideas
        </button>
      </p>
    </div>
  );
}

function CostLine({ left }: { left: number | null }) {
  if (left === null) return null;
  if (left === 0) return null;
  return (
    <p className="es-ai-quiet">
      {left === 1
        ? "Usa tu último diseño disponible."
        : `Usa 1 de tus ${left} diseños disponibles.`}
    </p>
  );
}

function OutOfDesigns({
  usage,
}: {
  usage: NonNullable<ReturnType<typeof useAiUsage>["usage"]>;
}) {
  const monthOver = usage.month.remaining === 0 || usage.spendCapReached;
  return (
    <Notice tone="info">
      {!usage.enabled
        ? "Tu plan no incluye diseños con la IA de Kardo."
        : monthOver
          ? "Ya usaste los diseños con IA de este mes."
          : "Ya usaste los diseños con IA de hoy. Mañana tienes más."}{" "}
      {monthOver || !usage.enabled ? (
        <a href="/settings/plan">Ver planes</a>
      ) : null}
    </Notice>
  );
}

/** IA4: Chema's "mis platillos y precios" on a Página de enlaces, Perfil or
 * Enlaces — none of these show them. Offers the type that can, or to
 * keep going anyway. */
function PricesNotShownNotice({ onDismiss }: { onDismiss: () => void }) {
  return (
    <Notice
      action={
        <span className="es-notice-actions">
          <Link
            className="button button-secondary button-small"
            to={{ name: "experience-new", touchpointId: null, type: "menu" }}
          >
            Crear un Menú
          </Link>
          <button className="text-action" onClick={onDismiss} type="button">
            Seguir así
          </button>
        </span>
      }
      tone="info"
    >
      Esta página no muestra precios. Para tus platillos y precios, haz un Menú
      o un Catálogo.
    </Notice>
  );
}

/** IA6: with no WhatsApp on the business, the IA has no number for the
 * contact button it would otherwise add — Mezcalería and Florería
 * (relevo 37 informe §6) got a page with none at all. Saves it to the
 * business profile right here, before asking for a design, so the next
 * one already has a number to work with. */
function MissingWhatsAppNotice({
  organization,
  disabled,
}: {
  organization: ReturnType<typeof useOrganizationBrand>;
  disabled: boolean;
}) {
  const { workspace, can } = useWorkspace();
  const { notify } = useToast();
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const complete = isPhoneComplete(phone, "MX");
  const profile = organization.profile;
  // An Editor cannot change the business's data (domain audit A2-7): say
  // who can instead of offering a save that answers 403.
  const canSave =
    can("workspace.manage") &&
    profile !== null &&
    (!profile.country || profile.country === "MX");

  async function save() {
    if (!complete || saving || disabled || !canSave || !profile) return;
    setSaving(true);
    try {
      // Only the phone (and the country when there is none), never the
      // whole profile (A2-1).
      await saveWorkspaceProfile(workspace.id, {
        phone: phoneForProfile(phoneDigits(phone, "MX"), "MX"),
        ...(profile.country ? {} : { country: "MX" }),
      });
      notify("Guardamos tu WhatsApp.", "success");
    } catch {
      notify("No pudimos guardar tu WhatsApp. Intenta otra vez.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Notice
      title="Tu página no tendrá botón de contacto: falta tu WhatsApp"
      tone="warning"
    >
      {canSave ? (
        <div className="es-ai-phone-row">
          <PhoneInput
            id="es-ai-missing-whatsapp"
            onChange={setPhone}
            value={phone}
          />
          <button
            className="button button-secondary button-small"
            disabled={!complete || saving || disabled}
            onClick={() => void save()}
            type="button"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      ) : (
        <p>
          Pídele a quien administra la organización que lo agregue en
          Configuración → General.
        </p>
      )}
    </Notice>
  );
}

function RunningCard({
  running,
  onCancel,
}: {
  running: NonNullable<ReturnType<typeof useDesignAiFlow>["running"]>;
  onCancel: () => void;
}) {
  return (
    <div className="es-ai-running">
      <AiProgress
        generatingLabel={
          running.kind === "ideas"
            ? "Pensando 3 ideas para tu página…"
            : "Diseñando tu página…"
        }
        maxTurns={running.maxTurns}
        onCancel={onCancel}
        stage={running.stage}
        startedAt={running.startedAt}
        turn={running.turn}
      />
      <p className="es-ai-quiet">
        {running.kind === "ideas"
          ? "Puedes salir o recargar: tus ideas te esperan aquí."
          : "Puedes salir o recargar: tu diseño te espera aquí."}
      </p>
    </div>
  );
}

function ResultView({
  result,
  content,
  type,
  canEditHtml,
  readOnly,
  hasIdeas,
  onUse,
  onBack,
}: {
  result: NonNullable<ReturnType<typeof useDesignAiFlow>["result"]>;
  content: ReturnType<typeof useStudio>["content"];
  type: ReturnType<typeof useStudio>["type"];
  canEditHtml: boolean;
  readOnly: boolean;
  hasIdeas: boolean;
  onUse: () => void;
  onBack: () => void;
}) {
  const preview = prepareGeneratedDesign(result.design, canEditHtml);
  const spaces = photoSpacesIn(preview.design);
  return (
    <div className="es-ai-step">
      <div className="es-ai-result">
        <DesignThumbnail
          content={applyItemPhotos(content, result.itemPhotos)}
          design={result.design}
          label="Vista previa del diseño de la IA"
          type={type}
        />
      </div>
      {result.notes ? (
        <div className="es-ai-notes">
          <p className="es-ai-notes-title">Lo que hizo la IA</p>
          <p>{result.notes}</p>
          {spaces > 0 ? (
            <p className="es-ai-notes-extra">
              {spaces === 1
                ? "Dejó un espacio para foto: lo llenas tocándolo en la página."
                : `Dejó ${spaces} espacios para foto: los llenas tocándolos en la página.`}
            </p>
          ) : null}
        </div>
      ) : null}
      {preview.removedHtmlBlocks ? (
        <Notice tone="warning">
          Este diseño incluye{" "}
          {preview.removedHtmlBlocks === 1
            ? "un bloque de código"
            : `${preview.removedHtmlBlocks} bloques de código`}
          . Solo el dueño o un administrador puede usarlos: se quitar
          {preview.removedHtmlBlocks === 1 ? "á" : "án"} al aplicarlo.
        </Notice>
      ) : null}
      <button
        className="button button-secondary"
        onClick={onBack}
        type="button"
      >
        <Icon name="arrow-left" size={15} />{" "}
        {hasIdeas ? "Volver a las ideas" : "Volver"}
      </button>
      <div className="es-ai-actions es-ai-cta">
        <button
          className="button button-primary"
          disabled={readOnly}
          onClick={onUse}
          type="button"
        >
          <Icon name="circle-check" size={15} /> Usar este diseño
        </button>
        <p className="es-ai-quiet">
          Se guarda sola. Después puedes publicarla o deshacerla.
        </p>
      </div>
    </div>
  );
}
