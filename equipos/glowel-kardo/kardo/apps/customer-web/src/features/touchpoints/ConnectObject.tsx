import type {
  QrTemplate,
  Touchpoint,
  TouchpointQrDesign,
  UpdateTouchpointObject,
} from "@kardo/contracts";
import { type ReactNode, useEffect, useState } from "react";
import { touchpointsApi } from "../../api/touchpoints.js";
import { CopyField } from "../../components/CopyField.js";
import { Icon, type IconName } from "../../components/Icon.js";
import { StepTrack } from "../../components/StepTrack.js";
import { useToast } from "../../components/Toast.js";
import { errorMessage } from "../../lib/api.js";
import { touchpointUrls } from "../../lib/touchpoint-urls.js";
import type { Resource } from "../../lib/use-resource.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { BackupSticker } from "./BackupQr.js";
import {
  doneLabel,
  type ObjectStep,
  objectFlow,
  placedLabel,
  touchpointObject,
} from "./object-steps.js";
import { QrDesignChooser, QrPreview } from "./QrDownload.js";

/**
 * «Conecta el objeto» (relevo 36): the steps across the top, the open one
 * below, until the object is in its place. Every step is saved on the
 * server, so a reload or leaving halfway comes back to the step still
 * missing. Once placed, it folds into one line with «Reemplazar la tarjeta»
 * (the person never touches the chip: a new card replaces the old one).
 */
/** A QR's design and download, shared with its side card (relevo 36). */
/** A QR's design and download, or an NFC's backup QR (relevo 38). */
export type QrTools = {
  state: Resource<TouchpointQrDesign>;
  templates: Resource<QrTemplate[]>;
  /** The design is loaded: a download never prints Kardo's by mistake. */
  ready: boolean;
  onDownload: () => void;
};

export function ConnectObject({
  touchpoint,
  canManage,
  qr,
}: {
  touchpoint: Touchpoint;
  canManage: boolean;
  qr?: QrTools | undefined;
}) {
  const { workspace, upsertTouchpoint } = useWorkspace();
  const { notify } = useToast();
  const flow = objectFlow(touchpoint);
  // `null` follows the first missing step; a number is a step the person opened.
  const [viewing, setViewing] = useState<number | null>(null);
  const [showSteps, setShowSteps] = useState(false);
  const [busy, setBusy] = useState(false);

  // Another touchpoint, or another mode (replacing), starts at its own step.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on identity and mode only
  useEffect(() => {
    setViewing(null);
    setShowSteps(false);
  }, [touchpoint.id, flow.mode]);

  async function send(body: UpdateTouchpointObject, done?: string) {
    setBusy(true);
    try {
      upsertTouchpoint(
        await touchpointsApi.updateObject(workspace.id, touchpoint.id, body),
      );
      setViewing(null);
      if (done) notify(done);
    } catch (cause) {
      notify(errorMessage(cause), "error");
    } finally {
      setBusy(false);
    }
  }

  const index = Math.min(viewing ?? flow.current, flow.steps.length - 1);
  const step = flow.steps[index];
  const testing =
    step?.key === "test" && !step.doneAt && viewing === null && canManage;
  const probe = useObjectProbe(touchpoint, testing);

  if (flow.complete && !showSteps) {
    return (
      <ObjectDone
        busy={busy}
        canManage={canManage}
        onReprint={qr?.onDownload}
        onReplace={() =>
          void send(
            { action: "start_replace" },
            "Reemplazo iniciado. Sigue los pasos.",
          )
        }
        onShowSteps={() => {
          setShowSteps(true);
          setViewing(0);
        }}
        touchpoint={touchpoint}
      />
    );
  }
  if (!step) return null;

  const total = flow.steps.length;
  const doneCount = flow.steps.filter((item) => item.doneAt).length;
  return (
    <section className="panel tp-connect" aria-labelledby="tp-connect-title">
      <div className="tp-card-head">
        <h2 id="tp-connect-title">
          {flow.mode === "replace"
            ? "Reemplazar la tarjeta"
            : "Conecta el objeto"}
        </h2>
        <span className="tp-card-meta">
          {doneCount} de {total}
        </span>
      </div>
      <StepTrack
        current={index}
        items={flow.steps.map((item) => ({
          label: item.label,
          done: Boolean(item.doneAt),
        }))}
        label={
          flow.mode === "replace"
            ? "Pasos para reemplazar la tarjeta"
            : "Pasos para conectar el objeto"
        }
        onSelect={(next) => setViewing(next)}
      />
      <div
        className={`tp-step${stepArt(step, flow.kind) ? " tp-step-with-art" : ""}`}
      >
        {stepArt(step, flow.kind)}
        <h3>{step.title}</h3>
        <StepBody
          busy={busy}
          canManage={canManage}
          kind={flow.kind}
          mode={flow.mode}
          onDone={(api, message) =>
            void send({ action: "done", step: api }, message)
          }
          probe={probe}
          qr={qr}
          step={step}
          touchpoint={touchpoint}
        />
        {step.doneAt && canManage && step.api ? (
          <p className="tp-step-done">
            <Icon name="check" size={16} /> {doneLabel(step.doneAt)}
            <button
              className="text-action"
              disabled={busy}
              onClick={() =>
                step.api && void send({ action: "undo", step: step.api })
              }
              type="button"
            >
              Deshacer
            </button>
            {flow.current < total ? (
              <button
                className="text-action"
                onClick={() => setViewing(null)}
                type="button"
              >
                Ir al paso que falta
              </button>
            ) : null}
          </p>
        ) : null}
        {flow.mode === "replace" && canManage ? (
          <button
            className="text-action tp-step-cancel"
            disabled={busy}
            onClick={() =>
              void send(
                { action: "cancel_replace" },
                "Reemplazo cancelado. La tarjeta anterior sigue igual.",
              )
            }
            type="button"
          >
            Cancelar el reemplazo
          </button>
        ) : null}
        {showSteps && flow.complete ? (
          <button
            className="text-action tp-step-cancel"
            onClick={() => {
              setShowSteps(false);
              setViewing(null);
            }}
            type="button"
          >
            Cerrar los pasos
          </button>
        ) : null}
      </div>
    </section>
  );
}

function StepBody({
  step,
  kind,
  mode,
  touchpoint,
  canManage,
  busy,
  probe,
  qr,
  onDone,
}: {
  step: ObjectStep;
  kind: ReturnType<typeof objectFlow>["kind"];
  mode: "setup" | "replace";
  touchpoint: Touchpoint;
  canManage: boolean;
  busy: boolean;
  probe: ProbeState;
  qr: QrTools | undefined;
  onDone: (api: NonNullable<ObjectStep["api"]>, message?: string) => void;
}) {
  const urls = touchpointUrls(touchpoint.publicId);
  const [helpOpen, setHelpOpen] = useState(false);
  const action = (label: string, message?: string) =>
    canManage && step.api && !step.doneAt ? (
      <div className="tp-step-actions">
        <button
          aria-busy={busy || undefined}
          className="button button-primary"
          disabled={busy}
          onClick={() => step.api && onDone(step.api, message)}
          type="button"
        >
          {label}
        </button>
      </div>
    ) : null;

  switch (step.key) {
    case "prepare":
      return (
        <>
          <p>
            Si la tarjeta nueva ya tenía algo grabado, bórrala primero en la
            app.
          </p>
          <Tips
            items={[
              [
                "refresh",
                <>
                  En NFC Tools: <strong>Otros → Borrar etiqueta</strong>.
                </>,
              ],
              [
                "undo",
                <>
                  Si la app te pide formatearla:{" "}
                  <strong>Otros → Formatear memoria</strong>.
                </>,
              ],
              ["lock", "Si está bloqueada, ya no se puede grabar: usa otra."],
            ]}
          />
          <p className="tp-step-note">
            <Icon name="info" size={16} />
            <span>
              La tarjeta anterior tiene la misma dirección, así que sigue
              abriendo esta página. Si se perdió y no quieres que abra, retira
              esta etiqueta NFC y crea otra.
            </span>
          </p>
          {canManage && !step.doneAt ? (
            <div className="tp-step-actions">
              <button
                className="button button-primary"
                disabled={busy}
                onClick={() => onDone("replace_ready")}
                type="button"
              >
                Ya está lista
              </button>
              <button
                className="text-action"
                disabled={busy}
                onClick={() => onDone("replace_ready")}
                type="button"
              >
                Es nueva, sin nada grabado
              </button>
            </div>
          ) : null}
        </>
      );
    case "write":
      return (
        <>
          <p>Copia la dirección y grábala en la tarjeta con una app gratis.</p>
          <CopyField
            icon="nfc"
            label="Dirección para la tarjeta"
            value={urls.nfc}
          />
          {/* One span per item: the grid of the list keeps each line whole. */}
          <ol className="tp-mini-steps">
            <li>
              <span>
                Abre <strong>NFC Tools</strong> o <strong>NFC TagWriter</strong>
                .
              </span>
            </li>
            <li>
              <span>Escribir → Agregar registro → URL. Pega la dirección.</span>
            </li>
            <li>
              <span>Acerca la tarjeta a tu celular y espera 2 segundos.</span>
            </li>
          </ol>
          <p className="tp-step-hint">
            ¿Qué tarjeta compro? <strong>Una NFC NTAG213 o mayor.</strong> Para
            pegarla sobre metal, una «para metal».
          </p>
          {action(
            "Ya la grabé",
            mode === "replace" ? "Tarjeta nueva grabada." : "Tarjeta grabada.",
          )}
        </>
      );
    case "arrived":
      return (
        <>
          <p>
            Kardo ya grabó su NFC e imprimió su QR. Los dos abren la misma
            dirección, así que lo que publiques se ve igual por cualquiera de
            los dos.
          </p>
          {action("Siguiente")}
        </>
      );
    case "test":
      return (
        <>
          <p>
            {kind === "qr"
              ? "Abre la cámara de tu celular y apunta al QR ya impreso."
              : kind === "kardo"
                ? "Acerca tu celular a la pieza o escanea su QR con la cámara. Cualquiera de los dos cuenta."
                : kind === "nfc"
                  ? "Acerca la parte de arriba de tu celular a la tarjeta. En Android, el centro de la parte de atrás. Deja la pantalla encendida y desbloqueada."
                  : "Abre la dirección desde tu celular, como lo haría un cliente."}
          </p>
          {step.doneAt ? null : touchpoint.live &&
            touchpoint.status === "active" ? (
            probe === "found" ? (
              <p className="tp-probe tp-probe-found">
                <Icon name="check" size={16} /> Funciona.
              </p>
            ) : probe === "unavailable" ? (
              <p className="tp-probe">
                Kardo no puede ver la visita ahora. Márcalo cuando abra.
              </p>
            ) : (
              <p className="tp-probe" aria-live="polite">
                <span className="tp-dot" aria-hidden="true" />
                Esperando la primera visita…
              </p>
            )
          ) : (
            <p className="tp-probe">
              Todavía no hay nada publicado: verás un aviso de Kardo, y con eso
              ya sabes que funciona.
            </p>
          )}
          {canManage && !step.doneAt ? (
            <div className="tp-step-actions">
              <button
                className="button button-secondary"
                disabled={busy}
                onClick={() => step.api && onDone(step.api, "Probado.")}
                type="button"
              >
                Ya lo probé
              </button>
              {kind === "nfc" ? (
                <button
                  aria-expanded={helpOpen}
                  className="text-action"
                  onClick={() => setHelpOpen((open) => !open)}
                  type="button"
                >
                  ¿No abre?
                </button>
              ) : null}
            </div>
          ) : null}
          {helpOpen && kind === "nfc" ? (
            <Tips
              items={[
                ["nfc", "En Android, que el NFC esté encendido en Ajustes."],
                [
                  "phone",
                  "En iPhone 7, 8 o X, abre el lector NFC en el Centro de control.",
                ],
                ["ban", "Quita la funda si tiene metal, imán o tarjetas."],
                [
                  "scan",
                  "Acércalo casi tocando, unos 2 cm, y espera 2 segundos.",
                ],
                ["refresh", "Si sigue sin abrir, vuelve a grabarla."],
              ]}
            />
          ) : null}
        </>
      );
    case "backup":
      return (
        <>
          <p className="tp-why-title">Por qué hace falta</p>
          <ul className="tp-why">
            <li>
              <span aria-hidden="true">
                <Icon name="phone" size={16} />
              </span>
              No todos los celulares leen NFC, o lo traen apagado.
            </li>
            <li>
              <span aria-hidden="true">
                <Icon name="ban" size={16} />
              </span>
              El metal y algunas fundas lo bloquean.
            </li>
            <li>
              <span aria-hidden="true">
                <Icon name="pointer" size={16} />
              </span>
              No todos saben que hay que acercar el celular.
            </li>
          </ul>
          <p>El QR lo abre cualquier cámara y lleva a la misma página.</p>
          <BackupSticker
            canManage={canManage}
            qr={qr}
            touchpoint={touchpoint}
          />
          {action("Ya lo imprimí", "QR de respaldo listo.")}
          {step.doneAt ? null : (
            <p className="tp-step-hint">Se marca solo al descargarlo.</p>
          )}
        </>
      );
    case "download":
      return (
        <>
          <p>
            Elige cómo se ve y descárgalo aquí mismo. Cambiar el diseño nunca
            rompe los QR ya impresos.
          </p>
          {qr ? (
            <div className="tp-qr-step">
              <QrPreview state={qr.state} touchpoint={touchpoint} />
              <QrDesignChooser
                canManage={canManage}
                state={qr.state}
                templates={qr.templates}
                touchpoint={touchpoint}
              />
            </div>
          ) : null}
          <div className="tp-step-actions">
            <button
              className="button button-primary"
              disabled={!qr?.ready}
              onClick={() => qr?.onDownload()}
              type="button"
            >
              <Icon name="download" size={16} /> Descargar
            </button>
          </div>
          {step.doneAt ? null : (
            <p className="tp-step-hint">Se marca solo al descargarlo.</p>
          )}
        </>
      );
    case "print":
      return (
        <>
          <Tips
            items={[
              ["frame", "De al menos 3 × 3 cm."],
              ["printer", "En papel mate, sin brillo ni dobleces."],
            ]}
          />
          {action("Ya lo imprimí", "QR impreso.")}
        </>
      );
    case "address":
      return (
        <>
          <p>
            Grábala, imprímela o pégala en tu objeto: un imán, un letrero, un
            sticker.
          </p>
          <CopyField icon="globe" label="Dirección" value={urls.direct} />
          {action("Ya la puse")}
        </>
      );
    case "place":
      return (
        <>
          <Tips
            items={
              kind === "kardo"
                ? [
                    ["eye", "A la vista y a la altura de la mano."],
                    ["qr", "Que nada tape su QR: así también la escanean."],
                  ]
                : kind === "nfc"
                  ? [
                      ["eye", "A la vista y a la altura de la mano."],
                      [
                        "ban",
                        "Nunca directo sobre metal: ahí usa una tarjeta «para metal».",
                      ],
                      ["qr", "El QR de respaldo junto a la tarjeta."],
                      [
                        "lock",
                        "Ya en su lugar, bloquéala en la app para que nadie la cambie. Es para siempre, y es seguro: su dirección nunca cambia.",
                      ],
                    ]
                  : [
                      ["eye", "A la vista, donde haya luz."],
                      ["pointer", "A la altura de la mano, sin nada enfrente."],
                    ]
            }
          />
          {canManage && !step.doneAt ? (
            <div className="tp-step-actions">
              <button
                className="button button-primary"
                disabled={busy}
                onClick={() =>
                  onDone(
                    "placed",
                    mode === "replace"
                      ? "Tarjeta reemplazada."
                      : "¡Listo! Ya está en su lugar.",
                  )
                }
                type="button"
              >
                Ya está colocado
              </button>
            </div>
          ) : null}
        </>
      );
    default:
      return null;
  }
}

function Tips({ items }: { items: readonly [IconName, ReactNode][] }) {
  return (
    <ul className="tp-tips">
      {items.map(([icon, text], index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list
        <li key={index}>
          <Icon name={icon} size={18} />
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
}

/** The object in its place: one line, «Reemplazar la tarjeta» at hand. */
function ObjectDone({
  touchpoint,
  canManage,
  busy,
  onReplace,
  onReprint,
  onShowSteps,
}: {
  touchpoint: Touchpoint;
  canManage: boolean;
  busy: boolean;
  onReplace: () => void;
  /** A QR prints again right here, with its own design (no trip away). */
  onReprint: (() => void) | undefined;
  onShowSteps: () => void;
}) {
  const object = touchpointObject(touchpoint);
  const flow = objectFlow(touchpoint);
  const parts =
    flow.kind === "nfc"
      ? [
          "Grabado",
          object.testedAt ? "probado" : "sin probar",
          object.backupAt ? "con QR de respaldo" : "sin QR de respaldo",
        ]
      : flow.kind === "kardo"
        ? ["Lista", object.testedAt ? "probada" : "sin probar"]
        : flow.kind === "qr"
          ? ["Impreso", object.testedAt ? "probado" : "sin probar"]
          : [object.testedAt ? "Probado" : "Sin probar"];
  return (
    <section className="panel tp-done" aria-label="El objeto">
      <span className="tp-done-icon" aria-hidden="true">
        <Icon name="check" size={20} />
      </span>
      <div>
        <strong>
          {object.placedAt ? placedLabel(object.placedAt) : "Colocado"}
        </strong>
        <small>{parts.join(" · ")}</small>
      </div>
      <div className="tp-done-actions">
        {canManage && flow.kind === "nfc" ? (
          <button
            className="button button-secondary button-small"
            disabled={busy}
            onClick={onReplace}
            type="button"
          >
            <Icon name="refresh" size={16} /> Reemplazar la tarjeta
          </button>
        ) : flow.kind === "qr" && onReprint ? (
          <button
            className="button button-secondary button-small"
            onClick={onReprint}
            type="button"
          >
            <Icon name="download" size={16} /> Reimprimir
          </button>
        ) : null}
        <button className="text-action" onClick={onShowSteps} type="button">
          Ver pasos
        </button>
      </div>
    </section>
  );
}

type ProbeState = "idle" | "waiting" | "found" | "unavailable";

/**
 * «Pruébalo»: while that step is open and the page is visible, ask every
 * 8 s (about 4 minutes) whether the first visit through this channel has
 * arrived. Visits reach Kardo's analytics in about a minute.
 */
function useObjectProbe(touchpoint: Touchpoint, active: boolean): ProbeState {
  const { workspace, upsertTouchpoint } = useWorkspace();
  const { notify } = useToast();
  const [state, setState] = useState<ProbeState>("idle");
  const live = Boolean(touchpoint.live) && touchpoint.status === "active";
  const enabled = active && live;

  // biome-ignore lint/correctness/useExhaustiveDependencies: restart only when the waiting step changes
  useEffect(() => {
    if (!enabled) {
      setState("idle");
      return;
    }
    let stopped = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Only visits from now on count: an undone test or a reload never
    // marks it with an old visit (owner, 2026-10-07: «se aplicó solo»).
    const openedAt = new Date().toISOString();
    setState("waiting");
    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === "visible") {
        tries += 1;
        try {
          const result = await touchpointsApi.probeObject(
            workspace.id,
            touchpoint.id,
            openedAt,
          );
          if (stopped) return;
          if (result.detected) {
            setState("found");
            upsertTouchpoint(result.touchpoint);
            notify("¡Funciona! Ya abrió desde un celular.");
            return;
          }
          if (result.source === "unavailable") {
            setState("unavailable");
            return;
          }
        } catch {
          // A failed check is retried on the next turn.
        }
      }
      if (tries >= 30) return;
      timer = setTimeout(() => void tick(), 8000);
    };
    timer = setTimeout(() => void tick(), 1500);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, workspace.id, touchpoint.id]);

  return state;
}

function stepArt(step: ObjectStep, kind: string): ReactNode {
  if (
    step.key === "write" ||
    (step.key === "test" && (kind === "nfc" || kind === "kardo"))
  )
    return <TapArt />;
  if (step.key === "test" && kind === "qr") return <ScanArt />;
  return null;
}

function TapArt() {
  return (
    <svg aria-hidden="true" className="tp-step-art" viewBox="0 0 150 150">
      <rect
        fill="var(--tint)"
        height="34"
        rx="9"
        stroke="var(--teal)"
        strokeWidth="2"
        width="106"
        x="22"
        y="96"
      />
      <circle
        cx="75"
        cy="113"
        fill="none"
        r="9"
        stroke="var(--aqua)"
        strokeWidth="2.4"
      />
      <circle cx="75" cy="113" fill="var(--aqua)" r="3" />
      <g transform="rotate(-8 80 50)">
        <rect
          fill="#fff"
          height="96"
          rx="11"
          stroke="var(--ink)"
          strokeWidth="2.4"
          width="58"
          x="50"
          y="6"
        />
        <rect fill="var(--ink)" height="4" rx="2" width="18" x="70" y="11" />
        <path
          d="M60 64h38M60 72h28"
          stroke="var(--line)"
          strokeLinecap="round"
          strokeWidth="4"
        />
      </g>
      <path
        d="M40 78a14 14 0 0 1 0-20M32 84a24 24 0 0 1 0-32"
        fill="none"
        stroke="var(--aqua)"
        strokeLinecap="round"
        strokeWidth="2.4"
      />
    </svg>
  );
}

function ScanArt() {
  return (
    <svg aria-hidden="true" className="tp-step-art" viewBox="0 0 150 150">
      <rect
        fill="#fff"
        height="120"
        rx="12"
        stroke="var(--ink)"
        strokeWidth="2.4"
        width="70"
        x="40"
        y="10"
      />
      <rect
        fill="none"
        height="46"
        rx="4"
        stroke="var(--aqua)"
        strokeDasharray="8 6"
        strokeWidth="2.4"
        width="46"
        x="52"
        y="34"
      />
      <rect fill="var(--ink)" height="10" width="10" x="62" y="44" />
      <rect fill="var(--ink)" height="10" width="10" x="78" y="44" />
      <rect fill="var(--ink)" height="10" width="10" x="62" y="60" />
      <rect fill="var(--ink)" height="6" width="6" x="80" y="62" />
      <circle
        cx="75"
        cy="112"
        fill="none"
        r="7"
        stroke="var(--ink)"
        strokeWidth="2"
      />
    </svg>
  );
}
