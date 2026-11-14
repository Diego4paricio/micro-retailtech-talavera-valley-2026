import { RadioGroup, Switch } from "radix-ui";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Icon } from "../../../../components/Icon.js";
import { Tooltip } from "../../../../components/Tooltip.js";
import type { QrAnalysis, Scene } from "../engine/index.js";

export type Mockup = "flat" | "tent" | "card" | "poster";

const mockups: readonly { value: Mockup; label: string }[] = [
  { value: "flat", label: "Plano" },
  { value: "tent", label: "Mesa" },
  { value: "card", label: "Tarjeta" },
  { value: "poster", label: "Cartel" },
];

const mockupCaptions: Record<Exclude<Mockup, "flat">, string> = {
  tent: "Tienda de mesa: se escanea a 30–40 cm, imprímelo de 4 a 5 cm.",
  card: "Tarjeta de presentación: con 2.5 cm de código basta.",
  poster: "Cartel en ventana o pared: para leerlo a 1–2 m, de 10 a 15 cm.",
};

const zoomSteps: readonly number[] = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const minZoom = 0.5;
const maxZoom = 3;

/**
 * The studio's stage: the live preview on a neutral bench, over flat and
 * in-context mockups. The image is exactly the SVG that downloads; new
 * renders cross-fade in (~150 ms) over the previous one, never blinking.
 */
export function CanvasStage({
  svgUrl,
  scene,
  analysis,
  alt,
  transparent,
  organizationName,
  touchpointName,
  status,
  alert,
  error,
  note,
}: {
  svgUrl: string | null;
  scene: Scene | null;
  analysis: QrAnalysis | null;
  alt: string;
  transparent: boolean;
  organizationName: string;
  touchpointName: string;
  /** Legibility indicator, top-left of the stage. */
  status: ReactNode;
  /** A blocking problem and how to fix it, over the bottom of the stage. */
  alert?: ReactNode | undefined;
  error?: string | null | undefined;
  /** How the preview was built (e.g. the address it uses). */
  note?: ReactNode | undefined;
}) {
  const [mockup, setMockup] = useState<Mockup>("flat");
  const [zoom, setZoom] = useState(1);
  const [showZones, setShowZones] = useState(false);
  const zonesId = useId();
  const ratio = scene ? scene.width / scene.height : 1;
  const style = {
    "--qrs-ratio": ratio,
    "--qrs-zoom": zoom,
  } as CSSProperties;

  const art = (
    <Art
      alt={alt}
      analysis={analysis}
      scene={scene}
      showZones={mockup === "flat" && showZones}
      src={svgUrl}
      transparent={mockup === "flat" && transparent}
    />
  );

  return (
    <>
      <section aria-label="Vista previa" className="qrs-stage-main">
        <div className="qrs-stage-bar">
          <div className="qrs-stage-status">{status}</div>
          <RadioGroup.Root
            aria-label="Maqueta"
            className="qrs-segmented qrs-mockups"
            loop
            onValueChange={(next) => {
              if (next) setMockup(next as Mockup);
            }}
            orientation="horizontal"
            value={mockup}
          >
            {mockups.map((item) => (
              <RadioGroup.Item
                className="qrs-segment"
                key={item.value}
                value={item.value}
              >
                {item.label}
              </RadioGroup.Item>
            ))}
          </RadioGroup.Root>
        </div>

        <div className="qrs-stage" data-mockup={mockup}>
          <div className="qrs-stage-viewport" style={style}>
            {error ? (
              <div className="qrs-stage-error" role="alert">
                <Icon name="circle-alert" size={20} />
                <p>{error}</p>
              </div>
            ) : mockup === "flat" ? (
              <div className="qrs-flat">{art}</div>
            ) : mockup === "tent" ? (
              <div className="qrs-tent">
                <div className="qrs-tent-back" />
                <div className="qrs-tent-card">{art}</div>
                <div className="qrs-tent-table" />
              </div>
            ) : mockup === "card" ? (
              <div className="qrs-card-scene">
                <div className="qrs-card qrs-card-back" />
                <div className="qrs-card">
                  <div className="qrs-card-text">
                    <strong>{organizationName}</strong>
                    <span>{touchpointName}</span>
                    <i aria-hidden="true" />
                    <i aria-hidden="true" />
                  </div>
                  <div className="qrs-card-art">{art}</div>
                </div>
              </div>
            ) : (
              <div className="qrs-window">
                <div className="qrs-poster">
                  <span aria-hidden="true" className="qrs-tape qrs-tape-left" />
                  <span
                    aria-hidden="true"
                    className="qrs-tape qrs-tape-right"
                  />
                  <strong className="qrs-poster-title">
                    {organizationName}
                  </strong>
                  <div className="qrs-poster-art">{art}</div>
                  <span className="qrs-poster-foot">{touchpointName}</span>
                </div>
              </div>
            )}
          </div>
          {alert ? <div className="qrs-stage-alert">{alert}</div> : null}
        </div>
      </section>
      <div className="qrs-stage-extras">
        <div className="qrs-stage-foot">
          {mockup === "flat" ? (
            <>
              <div className="qrs-zones-toggle">
                <Switch.Root
                  checked={showZones}
                  className="kd-switch"
                  disabled={!analysis}
                  id={zonesId}
                  onCheckedChange={(checked) => setShowZones(checked === true)}
                >
                  <Switch.Thumb className="kd-switch-thumb" />
                </Switch.Root>
                <label htmlFor={zonesId}>Ver zonas protegidas</label>
              </div>
              <fieldset className="qrs-zoom">
                <legend className="visually-hidden">
                  Zoom de la vista previa
                </legend>
                <ZoomButton
                  disabled={zoom <= minZoom}
                  icon="zoom-out"
                  label="Alejar"
                  onClick={() =>
                    setZoom(
                      [...zoomSteps].reverse().find((step) => step < zoom) ??
                        minZoom,
                    )
                  }
                />
                <output aria-live="polite" className="qrs-zoom-value">
                  {Math.round(zoom * 100)} %
                </output>
                <ZoomButton
                  disabled={zoom >= maxZoom}
                  icon="zoom-in"
                  label="Acercar"
                  onClick={() =>
                    setZoom(zoomSteps.find((step) => step > zoom) ?? maxZoom)
                  }
                />
                <ZoomButton
                  disabled={zoom === 1}
                  icon="fit"
                  label="Ajustar al escenario"
                  onClick={() => setZoom(1)}
                />
              </fieldset>
            </>
          ) : (
            <p className="qrs-stage-caption">{mockupCaptions[mockup]}</p>
          )}
        </div>
        {mockup === "flat" && showZones && analysis ? (
          <ul className="qrs-zones-legend">
            <li>
              <span aria-hidden="true" className="qrs-key qrs-key-protected" />
              Patrones que el lector necesita: nunca se tapan.
            </li>
            {analysis.clearedArea ? (
              <li>
                <span aria-hidden="true" className="qrs-key qrs-key-cleared" />
                Área despejada para el logo.
              </li>
            ) : null}
          </ul>
        ) : null}
        {note ? <p className="qrs-stage-note">{note}</p> : null}
      </div>
    </>
  );
}

function ZoomButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: "zoom-in" | "zoom-out" | "fit";
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <Tooltip content={label}>
      <button
        aria-label={label}
        className="qrs-tool"
        disabled={disabled}
        onClick={onClick}
        type="button"
      >
        <Icon name={icon} size={18} />
      </button>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// The artwork: cross-faded image layers + the protected-zones overlay.
// ---------------------------------------------------------------------------

type Layer = { id: number; src: string; loaded: boolean };

function Art({
  src,
  alt,
  scene,
  analysis,
  showZones,
  transparent,
}: {
  src: string | null;
  alt: string;
  scene: Scene | null;
  analysis: QrAnalysis | null;
  showZones: boolean;
  transparent: boolean;
}) {
  const [layers, setLayers] = useState<Layer[]>(() =>
    src ? [{ id: 0, src, loaded: false }] : [],
  );
  const nextId = useRef(1);

  useEffect(() => {
    if (!src) return;
    setLayers((current) => {
      if (current.at(-1)?.src === src) return current;
      // Keep the last image on screen and fade the new one over it.
      const visible = current.filter((layer) => layer.loaded).slice(-1);
      return [...visible, { id: nextId.current++, src, loaded: false }];
    });
  }, [src]);

  const top = layers.at(-1);
  return (
    <div className="qrs-art" data-transparent={transparent || undefined}>
      {layers.map((layer) => {
        const isTop = layer === top;
        return (
          <img
            alt={isTop ? alt : ""}
            aria-hidden={isTop ? undefined : true}
            className={
              layer.loaded
                ? isTop && layers.length > 1
                  ? "qrs-art-layer qrs-art-enter"
                  : "qrs-art-layer"
                : "qrs-art-layer qrs-art-pending"
            }
            decoding="async"
            draggable={false}
            key={layer.id}
            onAnimationEnd={() => {
              if (isTop) setLayers((current) => current.slice(-1));
            }}
            onLoad={() =>
              setLayers((current) =>
                current.map((item) =>
                  item.id === layer.id ? { ...item, loaded: true } : item,
                ),
              )
            }
            src={layer.src}
          />
        );
      })}
      {showZones && scene && analysis ? (
        <ZonesOverlay analysis={analysis} scene={scene} />
      ) : null}
    </div>
  );
}

function ZonesOverlay({
  scene,
  analysis,
}: {
  scene: Scene;
  analysis: QrAnalysis;
}) {
  // Areas come in scene coordinates (same space as the viewBox).
  const cleared = analysis.clearedArea;
  return (
    <svg
      aria-hidden="true"
      className="qrs-zones"
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
      viewBox={`0 0 ${scene.width} ${scene.height}`}
    >
      <g className="qrs-zone-protected">
        {analysis.protectedAreas.map((area) => (
          <rect
            height={area.height}
            key={`${area.x}-${area.y}-${area.width}-${area.height}`}
            width={area.width}
            x={area.x}
            y={area.y}
          />
        ))}
      </g>
      {cleared ? (
        <g className="qrs-zone-cleared">
          {cleared.shape === "circle" ? (
            <circle
              cx={cleared.x + cleared.width / 2}
              cy={cleared.y + cleared.height / 2}
              r={Math.min(cleared.width, cleared.height) / 2}
            />
          ) : (
            <rect
              height={cleared.height}
              width={cleared.width}
              x={cleared.x}
              y={cleared.y}
            />
          )}
        </g>
      ) : null}
    </svg>
  );
}
