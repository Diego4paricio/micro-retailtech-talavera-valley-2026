import type { Asset, ConceptBrief, DesignAiUsage } from "@kardo/contracts";
import { type RefObject, useEffect, useRef, useState } from "react";
import { Dialog } from "../../../components/Dialog.js";
import { Icon } from "../../../components/Icon.js";
import { AiProgress } from "../ai/AiProgress.js";
import { AiUsageNote } from "../ai/AiUsageNote.js";
import { BrandUsageNote } from "../ai/BrandUsageNote.js";
import { AiStatusNotice } from "../ai/StatusNotice.js";
import { hourLeft } from "../ai/use-ai-usage.js";
import { BrandForm, type BriefChange, ConceptForm } from "./ConceptForm.js";
import type { KardoAiState } from "./kardo-ai.js";
import {
  conceptRecap,
  nextOnboardStep,
  type OnboardStep,
  onboardStepLabels,
  onboardSteps,
  previousOnboardStep,
} from "./onboarding.js";
import { PasteBox } from "./parts.js";
import type { PastedCode } from "./paste.js";
import { type AiService, aiServices } from "./prompt.js";

export type AiPath = "own" | "kardo";

/**
 * "Ayuda de la IA": a guided onboarding over the editor, 3 short steps with
 * visible progress (Qué quieres · Tu marca · Quién la diseña), skippable at
 * any time, always ending in the editor with Deshacer. `path`/`onPathChange`
 * are kept only so `HtmlStudio` can remember which way the customer leans
 * (e.g. for future reopenings); the dialog itself always shows both ways
 * side by side in the last step.
 */
type AiHelpProps = {
  path: AiPath;
  onPathChange: (path: AiPath) => void;
  brief: ConceptBrief;
  onBriefChange: BriefChange;
  canEdit: boolean;
  workspaceId: string;
  assets: readonly Asset[];
  onAssetUploaded: (asset: Asset) => void;
  canUpload: boolean;
  brandColors: readonly string[];
  /** The concept has a description (the prompt and the AI need it). */
  ready: boolean;
  copied: boolean;
  opened: boolean;
  onCopy: () => void;
  onOpen: (service: AiService) => void;
  onShowPrompt: () => void;
  onPaste: (code: PastedCode) => void;
  ai: KardoAiState;
  aiUsage: DesignAiUsage | null;
  onGenerate: () => void;
  onCancelGenerate: () => void;
  hasCode: boolean;
  refineCurrent: boolean;
  onRefineCurrentChange: (value: boolean) => void;
  descriptionRef: RefObject<HTMLTextAreaElement | null>;
};

export function AiHelpDialog({
  open,
  onClose,
  ...props
}: AiHelpProps & { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      description="Tres pasos cortos, siempre con la opción de saltarlos. Termina en tu editor, con Deshacer."
      onClose={onClose}
      open={open}
      size="large"
      title="Ayuda de la IA"
    >
      <AiHelp {...props} />
    </Dialog>
  );
}

type View = "onboard" | "paste";

function AiHelp({
  brief,
  onBriefChange,
  canEdit,
  workspaceId,
  assets,
  onAssetUploaded,
  canUpload,
  brandColors,
  ready,
  copied,
  opened,
  onCopy,
  onOpen,
  onShowPrompt,
  onPaste,
  ai,
  aiUsage,
  onGenerate,
  onCancelGenerate,
  hasCode,
  refineCurrent,
  onRefineCurrentChange,
  descriptionRef,
}: AiHelpProps) {
  const [step, setStep] = useState<OnboardStep>(1);
  const [view, setView] = useState<View>("onboard");
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Focus management between steps: an accessible wizard moves focus to the
  // new step's own heading rather than leaving it on the button that was
  // just clicked (or losing it entirely). `headingRef` itself never changes,
  // but the element it points to does: a different step (or the paste view)
  // re-mounts its own heading on the same ref.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-focuses the new step/view's heading
  useEffect(() => {
    headingRef.current?.focus();
  }, [step, view]);

  function writeConcept() {
    setView("onboard");
    setStep(1);
    requestAnimationFrame(() => descriptionRef.current?.focus());
  }

  const recap = conceptRecap(brief);

  if (view === "paste")
    return (
      <div className="esh-ai">
        <div className="esh-ob-paste">
          <button
            className="button button-secondary button-small"
            onClick={() => setView("onboard")}
            type="button"
          >
            <Icon name="arrow-left" size={14} />
            Atrás
          </button>
          <h3 ref={headingRef} tabIndex={-1}>
            Pega el código de tu IA
          </h3>
          <p className="esh-ob-step-lead">
            Pega lo que te respondió: el documento completo, o el HTML y el CSS
            por separado. Nosotros lo acomodamos.
          </p>
          <PasteBox disabled={!canEdit} onUse={onPaste} />
        </div>
      </div>
    );

  return (
    <div className="esh-ai">
      <OnboardProgress step={step} />

      {step === 1 ? (
        <StepQue
          brief={brief}
          canEdit={canEdit}
          descriptionRef={descriptionRef}
          headingRef={headingRef}
          onBriefChange={onBriefChange}
        />
      ) : step === 2 ? (
        <StepMarca
          assets={assets}
          brandColors={brandColors}
          brief={brief}
          canEdit={canEdit}
          canUpload={canUpload}
          headingRef={headingRef}
          onAssetUploaded={onAssetUploaded}
          onBriefChange={onBriefChange}
          workspaceId={workspaceId}
        />
      ) : (
        <StepQuien
          ai={ai}
          aiUsage={aiUsage}
          canEdit={canEdit}
          copied={copied}
          hasCode={hasCode}
          headingRef={headingRef}
          onCancelGenerate={onCancelGenerate}
          onCopy={onCopy}
          onGenerate={onGenerate}
          onOpen={onOpen}
          onPaste={onPaste}
          onRefineCurrentChange={onRefineCurrentChange}
          onShowPrompt={onShowPrompt}
          onWriteConcept={writeConcept}
          opened={opened}
          ready={ready}
          refineCurrent={refineCurrent}
        />
      )}

      <footer className="esh-ob-footer">
        <div aria-live="polite" className="esh-ob-recap">
          {recap.length ? (
            recap.map((chip) => (
              <span className="esh-ob-recap-chip" key={chip}>
                {chip}
              </span>
            ))
          ) : (
            <span className="esh-ob-recap-empty">
              Aún no describes tu página
            </span>
          )}
        </div>
        <div className="esh-ob-actions">
          <button
            className="button button-secondary button-small"
            disabled={step === 1}
            onClick={() => setStep(previousOnboardStep(step))}
            type="button"
          >
            <Icon name="arrow-left" size={14} />
            Atrás
          </button>
          {step === 2 ? (
            <button
              className="link-button"
              onClick={() => setStep(3)}
              type="button"
            >
              Saltar
            </button>
          ) : null}
          {step < 3 ? (
            <button
              className="button button-primary button-small"
              onClick={() => setStep(nextOnboardStep(step))}
              type="button"
            >
              Siguiente
            </button>
          ) : null}
          <button
            className="link-button"
            onClick={() => setView("paste")}
            type="button"
          >
            Saltar, ya tengo código
          </button>
        </div>
      </footer>
    </div>
  );
}

function OnboardProgress({ step }: { step: OnboardStep }) {
  return (
    <div className="esh-ob-progress">
      <div aria-hidden="true" className="esh-ob-progress-track">
        {onboardSteps.map((value) => (
          <span
            className="esh-ob-progress-seg"
            data-state={
              value < step ? "done" : value === step ? "current" : "upcoming"
            }
            key={value}
          />
        ))}
      </div>
      <p className="esh-ob-progress-caption">
        {onboardSteps.map((value) => (
          <span
            aria-current={value === step ? "step" : undefined}
            data-state={
              value < step ? "done" : value === step ? "current" : "upcoming"
            }
            key={value}
          >
            {onboardStepLabels[value]}
          </span>
        ))}
      </p>
    </div>
  );
}

function StepQue({
  brief,
  onBriefChange,
  canEdit,
  descriptionRef,
  headingRef,
}: {
  brief: ConceptBrief;
  onBriefChange: BriefChange;
  canEdit: boolean;
  descriptionRef: RefObject<HTMLTextAreaElement | null>;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <section aria-labelledby="esh-ob-step1-title" className="esh-ob-step">
      <h3 id="esh-ob-step1-title" ref={headingRef} tabIndex={-1}>
        ¿Qué quieres?
      </h3>
      <p className="esh-ob-step-lead">
        Descríbelo con tus palabras; los chips te ayudan a empezar.
      </p>
      <ConceptForm
        brief={brief}
        descriptionRef={descriptionRef}
        disabled={!canEdit}
        onChange={onBriefChange}
      />
    </section>
  );
}

function StepMarca({
  brief,
  onBriefChange,
  canEdit,
  workspaceId,
  assets,
  onAssetUploaded,
  canUpload,
  brandColors,
  headingRef,
}: {
  brief: ConceptBrief;
  onBriefChange: BriefChange;
  canEdit: boolean;
  workspaceId: string;
  assets: readonly Asset[];
  onAssetUploaded: (asset: Asset) => void;
  canUpload: boolean;
  brandColors: readonly string[];
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <section aria-labelledby="esh-ob-step2-title" className="esh-ob-step">
      <h3 id="esh-ob-step2-title" ref={headingRef} tabIndex={-1}>
        Tu marca
      </h3>
      <p className="esh-ob-step-lead">
        Opcional: colores, imágenes y tipografías de tu marca.
      </p>
      <BrandUsageNote />
      <BrandForm
        assets={assets}
        brandColors={brandColors}
        brief={brief}
        canUpload={canUpload}
        disabled={!canEdit}
        onAssetUploaded={onAssetUploaded}
        onChange={onBriefChange}
        workspaceId={workspaceId}
      />
    </section>
  );
}

function StepQuien({
  ready,
  copied,
  opened,
  onCopy,
  onOpen,
  onShowPrompt,
  onPaste,
  ai,
  aiUsage,
  onGenerate,
  onCancelGenerate,
  canEdit,
  hasCode,
  refineCurrent,
  onRefineCurrentChange,
  onWriteConcept,
  headingRef,
}: {
  ready: boolean;
  copied: boolean;
  opened: boolean;
  onCopy: () => void;
  onOpen: (service: AiService) => void;
  onShowPrompt: () => void;
  onPaste: (code: PastedCode) => void;
  ai: KardoAiState;
  aiUsage: DesignAiUsage | null;
  onGenerate: () => void;
  onCancelGenerate: () => void;
  canEdit: boolean;
  hasCode: boolean;
  refineCurrent: boolean;
  onRefineCurrentChange: (value: boolean) => void;
  onWriteConcept: () => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <section aria-labelledby="esh-ob-step3-title" className="esh-ob-step">
      <h3 id="esh-ob-step3-title" ref={headingRef} tabIndex={-1}>
        ¿Quién la diseña?
      </h3>
      <p className="esh-ob-step-lead">
        Elige un camino; puedes probar el otro después.
      </p>
      <div className="esh-ob-cards">
        <OwnCard
          canEdit={canEdit}
          copied={copied}
          onCopy={onCopy}
          onOpen={onOpen}
          onPaste={onPaste}
          onShowPrompt={onShowPrompt}
          onWriteConcept={onWriteConcept}
          opened={opened}
          ready={ready}
        />
        <KardoCard
          ai={ai}
          aiUsage={aiUsage}
          canEdit={canEdit}
          hasCode={hasCode}
          onCancelGenerate={onCancelGenerate}
          onGenerate={onGenerate}
          onRefineCurrentChange={onRefineCurrentChange}
          onWriteConcept={onWriteConcept}
          ready={ready}
          refineCurrent={refineCurrent}
        />
      </div>
    </section>
  );
}

function OwnCard({
  ready,
  copied,
  opened,
  onCopy,
  onOpen,
  onShowPrompt,
  onPaste,
  onWriteConcept,
  canEdit,
}: {
  ready: boolean;
  copied: boolean;
  opened: boolean;
  onCopy: () => void;
  onOpen: (service: AiService) => void;
  onShowPrompt: () => void;
  onPaste: (code: PastedCode) => void;
  onWriteConcept: () => void;
  canEdit: boolean;
}) {
  return (
    <div className="esh-ob-card">
      <div className="esh-ob-card-head">
        <h4>Con tu IA</h4>
        <span className="esh-tag">Gratis</span>
      </div>
      <p className="esh-ob-card-lead">
        ChatGPT, Claude o Gemini diseñan tu página con tus instrucciones.
      </p>
      <div className="esh-step-actions">
        <button
          className={
            copied
              ? "button button-secondary button-small"
              : "button button-primary button-small"
          }
          disabled={!ready}
          onClick={onCopy}
          type="button"
        >
          <Icon name={copied ? "check" : "copy"} size={15} />
          {copied ? "Prompt copiado" : "Copiar prompt"}
        </button>
        <button
          className="link-button"
          disabled={!ready}
          onClick={onShowPrompt}
          type="button"
        >
          Ver instrucciones
        </button>
      </div>
      {!ready ? (
        <p className="esh-step-note">
          Antes, describe tu página en el paso 1.{" "}
          <button
            className="link-button"
            onClick={onWriteConcept}
            type="button"
          >
            Escribir ahora
          </button>
        </p>
      ) : (
        <>
          <div className="esh-step-actions esh-ai-links">
            {(Object.keys(aiServices) as AiService[]).map((service) => (
              <button
                className="button button-secondary button-small"
                key={service}
                onClick={() => onOpen(service)}
                type="button"
              >
                {aiServices[service].label}
                <Icon name="arrow-up-right" size={13} />
              </button>
            ))}
          </div>
          <p className="esh-step-note">
            {opened
              ? "Ya abriste tu IA. Adjunta ahí las mismas imágenes de tu marca y pega aquí el código cuando esté listo."
              : "Adjunta ahí las mismas imágenes de tu marca para que las use."}
          </p>
        </>
      )}
      <div className="esh-ob-card-paste">
        <p className="esh-ob-card-paste-label">Cuando tengas el código</p>
        <PasteBox disabled={!canEdit} onUse={onPaste} />
      </div>
    </div>
  );
}

function KardoCard({
  ready,
  ai,
  aiUsage,
  onGenerate,
  onCancelGenerate,
  canEdit,
  hasCode,
  refineCurrent,
  onRefineCurrentChange,
  onWriteConcept,
}: {
  ready: boolean;
  ai: KardoAiState;
  aiUsage: DesignAiUsage | null;
  onGenerate: () => void;
  onCancelGenerate: () => void;
  canEdit: boolean;
  hasCode: boolean;
  refineCurrent: boolean;
  onRefineCurrentChange: (value: boolean) => void;
  onWriteConcept: () => void;
}) {
  const unavailable = ai.status === "unavailable";
  return (
    <div
      className="esh-ob-card"
      data-disabled={unavailable || undefined}
      data-tone="kardo"
    >
      <div className="esh-ob-card-head">
        <span aria-hidden="true" className="esh-ob-card-icon">
          <Icon name="sparkles" size={16} />
        </span>
        <h4>Con la IA de Kardo</h4>
      </div>
      <p className="esh-ob-card-lead">
        Diseña aquí mismo con tus colores y tus imágenes. Revisas el resultado
        antes de publicarlo.
      </p>
      <AiUsageNote usage={aiUsage} />

      {ai.status === "running" ? (
        <AiProgress
          maxTurns={ai.maxTurns}
          onCancel={onCancelGenerate}
          stage={ai.stage}
          startedAt={ai.startedAt}
          turn={ai.turn}
        />
      ) : (
        <>
          <button
            className="button button-primary esh-ai-button"
            disabled={
              !ready || !canEdit || unavailable || hourLeft(aiUsage) === 0
            }
            onClick={onGenerate}
            type="button"
          >
            <Icon name="sparkles" size={15} />
            {ai.status === "done"
              ? "Pedir otra versión"
              : "Diseñar con la IA de Kardo"}
          </button>
          {hasCode ? (
            <label className="esh-check">
              <input
                checked={refineCurrent}
                disabled={!canEdit}
                onChange={(event) =>
                  onRefineCurrentChange(event.target.checked)
                }
                type="checkbox"
              />
              Partir de mi código actual
            </label>
          ) : null}
          {!ready ? (
            <p className="esh-step-note">
              Antes, describe tu página en el paso 1.{" "}
              <button
                className="link-button"
                onClick={onWriteConcept}
                type="button"
              >
                Escribir ahora
              </button>
            </p>
          ) : null}
        </>
      )}

      <AiStatusNotice
        htmlMode
        message={ai.status === "error" ? ai.message : undefined}
        status={ai.status}
      />
    </div>
  );
}
