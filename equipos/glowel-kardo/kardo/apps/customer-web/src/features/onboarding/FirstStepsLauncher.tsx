import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "../../components/Icon.js";
import { useRouter } from "../../lib/router.js";
import { firstStepDetail, firstStepTitles } from "./first-steps-copy.js";
import { firstStepIds } from "./first-steps-model.js";
import { openKardoTour } from "./HowKardoWorks.js";
import type { FirstSteps } from "./use-first-steps.js";

/**
 * The Primeros pasos guide, out of the way (owner, 2026-10-03: «como lo
 * coloca Stripe»): a small button at the bottom right with the progress,
 * that opens the five steps, «Cómo funciona Kardo» and «Ocultar esta
 * guía». Hidden for good once the steps are done or the owner hides it;
 * Ayuda keeps both entries.
 */
export function FirstStepsLauncher({ steps }: { steps: FirstSteps }) {
  const [open, setOpen] = useState(false);
  const { navigate } = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Escape and a click outside fold the guide back into its button.
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointer(event: PointerEvent) {
      if (root.current && !root.current.contains(event.target as Node))
        setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  if (!steps.isPending || steps.hidden) return null;
  const { state } = steps;
  const next = state.next;
  const go = (step = next) => {
    setOpen(false);
    navigate({ name: "first-steps", ...(step ? { step } : {}) });
  };

  return (
    <div className="fsl" ref={root}>
      {open ? (
        <section aria-labelledby={titleId} className="fsl-panel" role="dialog">
          <header className="fsl-head">
            <div>
              <h2 id={titleId}>Primeros pasos</h2>
              <p>
                {state.completed} de 5 · tu{" "}
                {state.plan.type === "menu" ? "menú" : "página"} con QR
              </p>
            </div>
            <button
              aria-label="Minimizar la guía"
              className="icon-button"
              onClick={() => setOpen(false)}
              type="button"
            >
              <Icon name="chevron-down" size={18} />
            </button>
          </header>
          <div aria-hidden="true" className="fs-progress">
            <span style={{ width: `${(state.completed / 5) * 100}%` }} />
          </div>
          <ol className="fsl-steps">
            {firstStepIds.map((id, index) => {
              const done = state.done[id];
              return (
                <li key={id}>
                  <button
                    className={[
                      "fsl-step",
                      done ? "fs-step-done" : "",
                      id === next ? "fsl-step-next" : "",
                    ].join(" ")}
                    onClick={() => go(id)}
                    type="button"
                  >
                    <span aria-hidden="true" className="fs-step-mark">
                      {done ? <Icon name="check" size={12} /> : index + 1}
                    </span>
                    <span>
                      <strong>{firstStepTitles[id]}</strong>
                      {id === next ? (
                        <small>{firstStepDetail(id, state.plan)}</small>
                      ) : null}
                    </span>
                    {done ? (
                      <span className="visually-hidden"> (listo)</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ol>
          {next ? (
            <button
              className="button button-primary fsl-continue"
              onClick={() => go()}
              type="button"
            >
              Continuar: {firstStepTitles[next].toLowerCase()}
              <Icon name="arrow-right" size={16} />
            </button>
          ) : null}
          <div className="fsl-links">
            <button
              className="link-button"
              onClick={() => {
                setOpen(false);
                openKardoTour();
              }}
              type="button"
            >
              <Icon name="compass" size={15} /> Cómo funciona Kardo
            </button>
            <button
              className="link-button fsl-hide"
              onClick={() => {
                setOpen(false);
                steps.hide();
              }}
              type="button"
            >
              Ocultar esta guía
            </button>
          </div>
          <p className="fsl-note">Si la ocultas, la encuentras en Ayuda.</p>
        </section>
      ) : null}
      <button
        aria-expanded={open}
        aria-label={`Primeros pasos: ${state.completed} de 5`}
        className="fsl-button"
        onClick={() => {
          // Configuración may have filled the WhatsApp in the meantime.
          if (!open) void steps.reloadProfile();
          setOpen(!open);
        }}
        type="button"
      >
        <ProgressRing value={state.completed / 5} />
        <span className="fsl-button-label">Primeros pasos</span>
        <span className="fsl-button-count">{state.completed}/5</span>
      </button>
    </div>
  );
}

function ProgressRing({ value }: { value: number }) {
  const radius = 8;
  const length = 2 * Math.PI * radius;
  return (
    <svg
      aria-hidden="true"
      className="fsl-ring"
      height="22"
      viewBox="0 0 22 22"
      width="22"
    >
      <circle cx="11" cy="11" fill="none" r={radius} strokeWidth="3" />
      <circle
        cx="11"
        cy="11"
        fill="none"
        r={radius}
        strokeDasharray={`${length * value} ${length}`}
        strokeLinecap="round"
        strokeWidth="3"
        transform="rotate(-90 11 11)"
      />
    </svg>
  );
}
