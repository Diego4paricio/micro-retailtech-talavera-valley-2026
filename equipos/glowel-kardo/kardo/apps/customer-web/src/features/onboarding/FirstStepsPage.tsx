import { useEffect, useRef, useState } from "react";
import { Icon } from "../../components/Icon.js";
import { Skeleton } from "../../components/Skeleton.js";
import { StepTrack } from "../../components/StepTrack.js";
import { useRouter } from "../../lib/router.js";
import { FinishBusinessLine } from "./FinishBusinessLine.js";
import { firstStepTitles } from "./first-steps-copy.js";
import {
  type FirstStepId,
  type FirstStepsState,
  firstStepIds,
  isStepOpenable,
} from "./first-steps-model.js";
import { openKardoTour } from "./HowKardoWorks.js";
import { BusinessStep } from "./steps/BusinessStep.js";
import { LookStep } from "./steps/LookStep.js";
import { PageStep } from "./steps/PageStep.js";
import { ShareStep } from "./steps/ShareStep.js";
import { Finished, TryStep } from "./steps/TryStep.js";
import { type FirstSteps, useSharedFirstSteps } from "./use-first-steps.js";

/**
 * Primeros pasos (relevo 31, approved by the owner 2026-10-03): five steps
 * in the owner's words that end in a page a customer can use. A focused
 * screen without the sidebar, right after the sign-up questions; one step
 * at a time, the five centered above its title. Redesign (relevo 33,
 * 2026-10-04): only the title as text, the steps close once the page is
 * published, and once finished Primeros pasos does not come back.
 */
export function FirstStepsPage() {
  const steps = useSharedFirstSteps();
  const { state } = steps;
  // Coming back here (Ayuda, «Continuar») brings the guide button back too.
  const { hidden, show } = steps;
  useEffect(() => {
    if (hidden) show();
  }, [hidden, show]);
  const { route, navigate } = useRouter();
  const requested = route.name === "first-steps" ? (route.step ?? null) : null;
  const [open, setOpen] = useState<FirstStepId | null>(requested);
  // «Ya lo vi» shows «¡Listo!» once; any later visit goes to the panel.
  const [finishedHere, setFinishedHere] = useState(false);
  const closed =
    !steps.isLoading && steps.canUse && !steps.isPending && !finishedHere;
  useEffect(() => {
    if (closed) navigate({ name: "overview" }, { replace: true });
  }, [closed, navigate]);

  const finished = state.next === null;
  const current =
    open && isStepOpenable(open, state) ? open : (state.next ?? "try");
  const shownStep = finished && finishedHere ? "finished" : current;

  // Each step starts at the top, with its title read out.
  const title = useRef<HTMLHeadingElement>(null);
  const firstShown = useRef(shownStep);
  useEffect(() => {
    if (firstShown.current === shownStep) return;
    firstShown.current = "";
    window.scrollTo({ top: 0 });
    title.current?.focus({ preventScroll: true });
  }, [shownStep]);

  // «Salir» (relevo 37 C1b): a link, not a button, that saves whatever the
  // current step already has before leaving (today, only «Tu negocio»
  // registers something here; the other steps just navigate away).
  const exitSave = useRef<(() => Promise<void>) | undefined>(undefined);
  const [exiting, setExiting] = useState(false);
  async function handleExit() {
    if (exiting) return;
    setExiting(true);
    try {
      await exitSave.current?.();
    } finally {
      navigate({ name: "overview" });
    }
  }

  const bar = (
    <header className="fs-focus-bar">
      <img alt="Kardo" className="fs-focus-logo" src="/kardo-logo.svg" />
      <div className="fs-focus-actions">
        <button
          aria-label="¿Cómo funciona?"
          className="link-button"
          onClick={openKardoTour}
          type="button"
        >
          <Icon name="help" size={18} />
          <span className="fs-focus-help">¿Cómo funciona?</span>
        </button>
        {shownStep === "finished" ? null : (
          <button
            aria-busy={exiting || undefined}
            className="link-button"
            disabled={exiting}
            onClick={handleExit}
            type="button"
          >
            Salir
          </button>
        )}
      </div>
    </header>
  );

  if (steps.isLoading || !steps.canUse || closed)
    return (
      <div className="fs-focus">
        {bar}
        <main className="fs" id="main-content" tabIndex={-1}>
          {steps.canUse || steps.isLoading || closed ? (
            <Skeleton label="Preparando tus primeros pasos…" lines={5} />
          ) : (
            <>
              <h1 className="fs-title">Primeros pasos</h1>
              <p className="fs-note fs-center">
                Tu rol no puede crear ni publicar páginas. Pídele a un Owner o
                Admin que lo haga o que te cambie de rol.
              </p>
            </>
          )}
        </main>
      </div>
    );

  if (shownStep === "finished")
    return (
      <div className="fs-focus">
        {bar}
        <main className="fs" id="main-content" tabIndex={-1}>
          <h1 className="fs-title" ref={title} tabIndex={-1}>
            ¡Listo! Tu página ya está publicada
          </h1>
          <Finished steps={steps} />
        </main>
      </div>
    );

  return (
    <div className="fs-focus">
      {bar}
      <main
        className={
          current === "look" || current === "content" ? "fs fs-wide" : "fs"
        }
        id="main-content"
        tabIndex={-1}
      >
        <Stepper current={current} onPick={setOpen} state={state} />
        <h1 className="fs-title" ref={title} tabIndex={-1}>
          {firstStepTitles[current]}
        </h1>
        {current === "business" ? null : (
          <FinishBusinessLine profile={steps.profile.data} />
        )}
        <StepBody
          id={current}
          onDone={() => setOpen(null)}
          onFinish={() => {
            setFinishedHere(true);
            steps.markTried();
          }}
          onGo={setOpen}
          onRegisterExit={(save) => {
            exitSave.current = save;
          }}
          steps={steps}
        />
      </main>
    </div>
  );
}

/** The five steps, centered above the title (the shared `StepTrack`). Only
 * the steps the person can open are buttons. */
function Stepper({
  state,
  current,
  onPick,
}: {
  state: FirstStepsState;
  current: FirstStepId;
  onPick: (id: FirstStepId) => void;
}) {
  return (
    <div className="fs-stepper">
      <StepTrack
        current={firstStepIds.indexOf(current)}
        items={firstStepIds.map((id) => ({
          label: firstStepTitles[id],
          done: state.done[id],
          locked: id === current || !isStepOpenable(id, state),
        }))}
        label="Tus primeros pasos"
        onSelect={(index) => {
          const id = firstStepIds[index];
          if (id) onPick(id);
        }}
      />
    </div>
  );
}

function StepBody({
  id,
  steps,
  onDone,
  onGo,
  onFinish,
  onRegisterExit,
}: {
  id: FirstStepId;
  steps: FirstSteps;
  onDone: () => void;
  onGo: (id: FirstStepId) => void;
  onFinish: () => void;
  /** «Salir» (C1b): only «Tu negocio» has something to flush before it. */
  onRegisterExit: (save: (() => Promise<void>) | undefined) => void;
}) {
  const { experience, done } = steps.state;
  switch (id) {
    case "business":
      return (
        <BusinessStep
          onDone={onDone}
          onRegisterExit={onRegisterExit}
          steps={steps}
        />
      );
    case "content":
      return <PageStep onDone={onDone} steps={steps} />;
    case "look":
      return experience && done.content ? (
        <LookStep experience={experience} onDone={onDone} steps={steps} />
      ) : (
        <NeedsBefore onGo={() => onGo("content")} />
      );
    case "qr":
      return experience && done.content ? (
        <ShareStep
          experience={experience}
          onGo={onGo}
          onPublished={onDone}
          steps={steps}
        />
      ) : (
        <NeedsBefore onGo={() => onGo("content")} />
      );
    case "try":
      return <TryStep onFinish={onFinish} steps={steps} />;
  }
}

function NeedsBefore({ onGo }: { onGo: () => void }) {
  return (
    <p className="fs-note fs-center">
      Primero elige y llena tu página.{" "}
      <button className="link-button" onClick={onGo} type="button">
        Ir a ese paso
      </button>
    </p>
  );
}
