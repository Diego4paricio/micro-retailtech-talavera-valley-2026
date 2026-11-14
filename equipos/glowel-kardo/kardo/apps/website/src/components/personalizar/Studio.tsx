"use client";
import { Check, Download, RotateCcw, Share2, Upload, X } from "lucide-react";
import {
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  colorStep,
  logoStep,
  personalizarPage,
  pieceStep,
  sendStep,
} from "@/content/personalizar";
import { type PieceId, pieces } from "@/content/pieces";
import { absoluteUrl, whatsappLink } from "@/lib/site";
import { WhatsAppIcon } from "../ui";
import {
  type Brand,
  type Design,
  decodeDesign,
  defaultDesign,
  encodeDesign,
  fonts,
  isHex,
  limits,
  luminance,
  type PieceTexts,
  palettes,
  type TextTone,
} from "./design";
import { downloadBlob, fileName, renderSheet, type SheetFace } from "./export";
import { logoSource, maxLogoBytes, prepareLogo } from "./logo";
import {
  detailRows,
  type KitChoice,
  kitContents,
  piecesFor,
  whatsappMessage,
} from "./message";
import {
  type Families,
  PieceArt,
  pieceSize,
  type Side,
  sidesOf,
} from "./PieceArt";
import { useFamilies } from "./useFamilies";

/*
  /personalizar/: pick a piece, give it your colors, logo and texts, and
  send the design to Kardo by WhatsApp. No account, no server: the design is
  kept in localStorage (a convenience, it may be empty in a private window)
  and travels as an image plus a link without the logo.
*/

export interface KitOption extends KitChoice {
  /** "$599", formatted on the server from kits-catalog.json. */
  price: string;
  panelLine: string;
}

const storageKey = "kardo.personalizar.v1";
const logoKey = "kardo.personalizar.logo.v1";

interface Saved {
  design: Design;
  step: number;
  kit: string;
  visited: number[];
}

function readSaved(): Partial<Saved> | null {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as Partial<Saved>) : null;
  } catch {
    return null;
  }
}

function writeSaved(saved: Saved): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(saved));
  } catch {
    // Full or blocked storage: the design still works in this visit.
  }
}

function readLogoSource(): string | null {
  try {
    return localStorage.getItem(logoKey);
  } catch {
    return null;
  }
}

function writeLogoSource(value: string | null): void {
  try {
    if (value) localStorage.setItem(logoKey, value);
    else localStorage.removeItem(logoKey);
  } catch {
    // A big logo may not fit: it stays for this visit only.
  }
}

/** A saved design from an older visit, completed with today's defaults. */
function mergeDesign(value: unknown): Design {
  const saved = (value ?? {}) as Partial<Design>;
  return {
    piece: pieces.some((p) => p.id === saved.piece)
      ? (saved.piece as PieceId)
      : defaultDesign.piece,
    brand: { ...defaultDesign.brand, ...(saved.brand ?? {}) },
    texts: {
      stand: { ...defaultDesign.texts.stand, ...(saved.texts?.stand ?? {}) },
      card: { ...defaultDesign.texts.card, ...(saved.texts?.card ?? {}) },
      magnet: { ...defaultDesign.texts.magnet, ...(saved.texts?.magnet ?? {}) },
      sticker: {
        ...defaultDesign.texts.sticker,
        ...(saved.texts?.sticker ?? {}),
      },
    },
  };
}

// Stage: the pieces at the same scale, as big as the box allows -----------------

interface Face {
  piece: PieceId;
  side: Side;
}

function facesOf(list: PieceId[]): Face[] {
  return list.flatMap((piece) =>
    sidesOf(piece).map((side) => ({ piece, side })),
  );
}

const faceGapMm = 10;
const standBaseMm = 14;

function useStageScale(faces: Face[]) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 640, height: 520 });
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setBox({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // One row, or two when that makes the pieces bigger (a kit on a phone,
  // or the two faces of the card in a narrow box).
  const size = (row: Face[]) => ({
    width:
      row.reduce((sum, face) => sum + pieceSize[face.piece].width, 0) +
      faceGapMm * (row.length - 1),
    height: Math.max(
      ...row.map(
        (face) =>
          pieceSize[face.piece].height +
          (face.piece === "stand" ? standBaseMm / 2 : 0),
      ),
    ),
  });
  const fit = (rows: Face[][]) => {
    const sizes = rows.map(size);
    const width = Math.max(...sizes.map((s) => s.width));
    const height =
      sizes.reduce((sum, s) => sum + s.height, 0) +
      faceGapMm * (rows.length - 1);
    return Math.min(box.width / width, box.height / height) * 0.92;
  };
  let rows: Face[][] = [faces];
  if (faces.length > 1) {
    let split: Face[][] = [faces];
    let widest = Number.POSITIVE_INFINITY;
    for (let k = 1; k < faces.length; k += 1) {
      const pair = [faces.slice(0, k), faces.slice(k)];
      const width = Math.max(...pair.map((row) => size(row).width));
      if (width < widest) {
        widest = width;
        split = pair;
      }
    }
    if (fit(split) > fit(rows) * 1.15) rows = split;
  }
  const mm = Math.max(0.6, Math.min(fit(rows), 7.5));
  return { ref, mm, rows };
}

function Stage({
  design,
  faces,
  families,
  qrText,
  caption,
}: {
  design: Design;
  faces: Face[];
  families: Families;
  qrText: string;
  caption: ReactNode;
}) {
  const { ref, mm, rows } = useStageScale(faces);
  return (
    <figure className="ps-stage">
      <div className="ps-stage-box" ref={ref}>
        <div className="ps-stage-rows" style={{ gap: `${faceGapMm * mm}px` }}>
          {rows.map((row) => (
            <div
              className="ps-stage-row"
              key={row.map((face) => `${face.piece}-${face.side}`).join()}
              style={{ gap: `${faceGapMm * mm}px` }}
            >
              {row.map((face) => {
                const size = pieceSize[face.piece];
                return (
                  <div
                    className={`ps-face ps-face-${face.piece}`}
                    data-face={`${face.piece}-${face.side}`}
                    key={`${face.piece}-${face.side}`}
                    style={{
                      width: `${size.width * mm}px`,
                      height: `${size.height * mm}px`,
                    }}
                  >
                    <PieceArt
                      className="ps-art"
                      design={design}
                      families={families}
                      id={`ps-${face.piece}-${face.side}`}
                      piece={face.piece}
                      qrText={qrText}
                      side={face.side}
                      title={`${pieces.find((p) => p.id === face.piece)?.name ?? ""}${face.side === "back" ? ", reverso" : ""}`}
                    />
                    {face.piece === "stand" ? (
                      <span
                        aria-hidden="true"
                        className="ps-stand-base"
                        style={{ height: `${standBaseMm * mm}px` }}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

// Small controls ----------------------------------------------------------------

function StepTrack({
  step,
  visited,
  onStep,
}: {
  step: number;
  visited: number[];
  onStep: (index: number) => void;
}) {
  return (
    <nav aria-label="Pasos" className="ps-steps">
      <ol>
        {personalizarPage.steps.map((label, index) => {
          const done = visited.includes(index) && index !== step;
          return (
            <li
              data-current={index === step ? "true" : undefined}
              data-done={done ? "true" : undefined}
              key={label}
            >
              <button
                aria-current={index === step ? "step" : undefined}
                onClick={() => onStep(index)}
                type="button"
              >
                <span className="ps-step-dot">
                  {done ? <Check aria-hidden="true" size={14} /> : index + 1}
                </span>
                <span className="ps-step-label">{label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function TextField({
  label,
  value,
  max,
  onChange,
  hint,
  placeholder,
}: {
  label: string;
  value: string;
  max: number;
  onChange: (value: string) => void;
  hint?: ReactNode;
  placeholder?: string;
}) {
  return (
    <label className="ps-field">
      <span className="ps-field-head">
        <span>{label}</span>
        <span className="ps-count">
          {value.length}/{max}
        </span>
      </span>
      <input
        maxLength={max}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="text"
        value={value}
      />
      {hint ? <span className="ps-hint">{hint}</span> : null}
    </label>
  );
}

function Switch({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="ps-switch" data-disabled={disabled ? "true" : undefined}>
      <input
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span aria-hidden="true" className="ps-switch-track" />
      <span>{label}</span>
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  const [draft, setDraft] = useState(value.toUpperCase());
  useEffect(() => setDraft(value.toUpperCase()), [value]);
  return (
    <div className="ps-color">
      <span className="ps-field-head">
        <span>{label}</span>
      </span>
      <div className="ps-color-row">
        <input
          aria-label={`${label}: elegir color`}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          type="color"
          value={value}
        />
        <input
          aria-label={`${label}: código del color`}
          maxLength={7}
          onBlur={() => setDraft(value.toUpperCase())}
          onChange={(event) => {
            const next = event.target.value.trim();
            const withHash = next.startsWith("#") ? next : `#${next}`;
            setDraft(withHash.toUpperCase());
            if (isHex(withHash)) onChange(withHash.toUpperCase());
          }}
          spellCheck={false}
          type="text"
          value={draft}
        />
      </div>
      {hint ? <span className="ps-hint">{hint}</span> : null}
    </div>
  );
}

// The studio --------------------------------------------------------------------

export function Studio({
  kits,
  qrText,
}: {
  kits: KitOption[];
  qrText: string;
}) {
  const [design, setDesign] = useState<Design>(defaultDesign);
  const [step, setStep] = useState(0);
  const [visited, setVisited] = useState<number[]>([0]);
  const [kitCode, setKitCode] = useState("");
  const [source, setSource] = useState<string | null>(null);
  const [removeWhite, setRemoveWhite] = useState(true);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoDark, setLogoDark] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSavedImage] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const families = useFamilies(design.brand.font);

  // Restore: a shared link first, then this browser's design, then ?pieza=.
  // Once: the link and the query are removed from the address after use,
  // so a second run (React's development double effect) would lose them.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const hash = new URLSearchParams(window.location.hash.slice(1)).get("d");
    const fromLink = hash ? decodeDesign(hash) : null;
    const stored = readSaved();
    const query = new URLSearchParams(window.location.search).get("pieza");
    let next = stored?.design ? mergeDesign(stored.design) : defaultDesign;
    if (fromLink) {
      next = { ...fromLink, brand: { ...fromLink.brand, logo: null } };
      setNotice(personalizarPage.fromLink);
      history.replaceState(null, "", window.location.pathname);
    } else {
      setSource(readLogoSource());
      if (typeof stored?.step === "number") setStep(stored.step);
      if (Array.isArray(stored?.visited)) setVisited(stored.visited);
      if (typeof stored?.kit === "string") setKitCode(stored.kit);
    }
    if (query && pieces.some((piece) => piece.id === query)) {
      // Coming from a piece on the home: start on that piece. The query
      // leaves the address so a reload comes back to the step you were on.
      next = { ...next, piece: query as PieceId };
      setStep(0);
      history.replaceState(null, "", window.location.pathname);
    }
    setDesign(next);
    setCanShare(
      typeof navigator !== "undefined" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({
          files: [new File([""], "a.png", { type: "image/png" })],
        }),
    );
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) writeSaved({ design, step, kit: kitCode, visited });
  }, [design, step, kitCode, visited, ready]);

  useEffect(() => {
    if (ready) writeLogoSource(source);
  }, [source, ready]);

  // Any change makes a new image necessary.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on change.
  useEffect(() => setSavedImage(false), [design, kitCode]);

  const goTo = useCallback((index: number) => {
    setStep(index);
    setVisited((list) => (list.includes(index) ? list : [...list, index]));
    setConfirmReset(false);
  }, []);

  const setBrand = (patch: Partial<Brand>) =>
    setDesign((current) => ({
      ...current,
      brand: { ...current.brand, ...patch },
    }));

  function setTexts<K extends keyof PieceTexts>(
    piece: K,
    patch: Partial<PieceTexts[K]>,
  ) {
    setDesign((current) => ({
      ...current,
      texts: {
        ...current.texts,
        [piece]: { ...current.texts[piece], ...patch },
      },
    }));
  }

  const setPiece = (piece: PieceId) =>
    setDesign((current) => ({ ...current, piece }));

  async function applyLogo(raw: string, white: boolean) {
    const prepared = await prepareLogo(raw, white);
    setLogoDark(prepared.dark);
    setDesign((current) => ({
      ...current,
      brand: {
        ...current.brand,
        logo: prepared.dataUrl,
        logoRatio: prepared.ratio,
        logoPlate:
          prepared.dark && luminance(current.brand.background) < 0.2
            ? true
            : current.brand.logoPlate,
      },
    }));
  }

  async function onFile(file: File | undefined) {
    setLogoError(null);
    if (!file) return;
    if (file.size > maxLogoBytes) {
      setLogoError(logoStep.tooBig);
      return;
    }
    if (!/^image\/(png|jpeg|svg\+xml|webp)$/.test(file.type)) {
      setLogoError(logoStep.notImage);
      return;
    }
    try {
      const raw = await logoSource(file);
      setSource(raw);
      await applyLogo(raw, removeWhite);
      setNotice(null);
    } catch {
      setLogoError(logoStep.notImage);
    }
  }

  function removeLogo() {
    setSource(null);
    setLogoDark(false);
    setBrand({ logo: null, logoRatio: 1, logoPlate: false });
  }

  const kit = kits.find((option) => option.code === kitCode) ?? null;
  const showFaces = useMemo(
    () => facesOf(step === 3 ? piecesFor(design, kit) : [design.piece]),
    [step, design, kit],
  );
  const current =
    pieces.find((piece) => piece.id === design.piece) ?? pieces[0];
  const link = absoluteUrl(`/personalizar/#d=${encodeDesign(design)}`);
  const message = whatsappMessage(design, kit, link);

  async function makeSheet(): Promise<Blob> {
    const root = stageRef.current;
    if (!root) throw new Error("stage");
    const faces: SheetFace[] = [];
    for (const face of showFaces) {
      const svg = root.querySelector<SVGSVGElement>(
        `[data-face="${face.piece}-${face.side}"] svg`,
      );
      if (svg) faces.push({ ...face, svg });
    }
    const css = getComputedStyle(document.documentElement);
    return renderSheet(faces, {
      design,
      title: design.brand.name.trim() || "Tu negocio",
      subtitle: kit
        ? `${kit.name}: ${kitContents(kit)}`
        : `${current?.name ?? ""}, ${current?.measure ?? ""}`,
      rows: detailRows(design, kit),
      footer: personalizarPage.sampleQr,
      families: {
        display: css.getPropertyValue("--font-geist").trim() || "sans-serif",
        ui: css.getPropertyValue("--font-dm-sans").trim() || "sans-serif",
      },
    });
  }

  async function onDownload() {
    setBusy(true);
    try {
      const blob = await makeSheet();
      await downloadBlob(blob, fileName(design.brand.name));
      setSavedImage(true);
    } catch {
      setNotice(sendStep.failed);
    } finally {
      setBusy(false);
    }
  }

  async function onShare() {
    setBusy(true);
    try {
      const blob = await makeSheet();
      const file = new File([blob], fileName(design.brand.name), {
        type: "image/png",
      });
      await navigator.share({ files: [file], text: message });
      setSavedImage(true);
    } catch {
      // Closing the share sheet also lands here: nothing to say.
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setDesign(defaultDesign);
    setSource(null);
    setKitCode("");
    setVisited([0]);
    setStep(0);
    setConfirmReset(false);
    setNotice(null);
  }

  const callWarning = (value: string) =>
    value.trim() && !/acerca tu celular/i.test(value)
      ? logoStep.callHint
      : undefined;

  const pieceName = current?.name ?? "";

  return (
    <div className="ps-studio">
      <StepTrack onStep={goTo} step={step} visited={visited} />

      <div className="ps-layout">
        <div className="ps-preview" ref={stageRef}>
          <p className="ps-mini-steps" aria-hidden="true">
            <span className="ps-mini-bars">
              {personalizarPage.steps.map((label, index) => (
                <i data-on={index <= step ? "true" : undefined} key={label} />
              ))}
            </span>
            <span>
              Paso {step + 1} de {personalizarPage.steps.length},{" "}
              {personalizarPage.steps[step]}
            </span>
          </p>
          <fieldset className="ps-piece-tabs">
            <legend className="sr-only">Pieza</legend>
            {pieces.map((piece) => (
              <button
                aria-pressed={design.piece === piece.id}
                key={piece.id}
                onClick={() => setPiece(piece.id)}
                type="button"
              >
                {piece.name}
              </button>
            ))}
          </fieldset>
          <Stage
            caption={
              <>
                <span>
                  {step === 3 && kit
                    ? `${kit.name}: ${kitContents(kit)}`
                    : `${pieceName}, ${current?.measure ?? ""}`}
                </span>
                <span>{personalizarPage.sampleQr}</span>
              </>
            }
            design={design}
            faces={showFaces}
            families={families}
            qrText={qrText}
          />
        </div>

        <div className="ps-controls">
          {notice ? (
            <p className="ps-notice" role="status">
              {notice}
            </p>
          ) : null}

          {step === 0 ? (
            <section aria-labelledby="ps-piece-title">
              <h2 id="ps-piece-title">{pieceStep.title}</h2>
              <div className="ps-piece-options">
                {pieces.map((piece) => (
                  <button
                    aria-pressed={design.piece === piece.id}
                    className="ps-piece-option"
                    key={piece.id}
                    onClick={() => setPiece(piece.id)}
                    type="button"
                  >
                    <span className="ps-piece-thumb">
                      <PieceArt
                        design={design}
                        families={families}
                        id={`ps-thumb-${piece.id}`}
                        piece={piece.id}
                        qrText={qrText}
                      />
                    </span>
                    <span className="ps-piece-name">{piece.name}</span>
                    <span className="ps-piece-measure">{piece.measure}</span>
                    <span className="ps-piece-line">{piece.line}</span>
                  </button>
                ))}
              </div>
              <h3 className="ps-subtitle">{pieceStep.layout}</h3>
              <LayoutChoice
                design={design}
                families={families}
                onChange={(layout) =>
                  setTexts(design.piece, { layout } as never)
                }
                qrText={qrText}
              />
            </section>
          ) : null}

          {step === 1 ? (
            <section aria-labelledby="ps-color-title">
              <h2 id="ps-color-title">{colorStep.title}</h2>
              <h3 className="ps-subtitle">{colorStep.palettes}</h3>
              <div className="ps-palettes">
                {palettes.map((option) => {
                  const active =
                    option.background.toUpperCase() ===
                      design.brand.background.toUpperCase() &&
                    option.accent.toUpperCase() ===
                      design.brand.accent.toUpperCase();
                  return (
                    <button
                      aria-pressed={active}
                      key={option.id}
                      onClick={() =>
                        setBrand({
                          background: option.background,
                          accent: option.accent,
                        })
                      }
                      type="button"
                    >
                      <span
                        aria-hidden="true"
                        className="ps-swatch"
                        style={{ background: option.background }}
                      >
                        <i style={{ background: option.accent }} />
                      </span>
                      <span>{option.name}</span>
                    </button>
                  );
                })}
              </div>
              <div className="ps-two">
                <ColorField
                  label={colorStep.background}
                  onChange={(background) => setBrand({ background })}
                  value={design.brand.background}
                />
                <ColorField
                  hint={colorStep.accentHint}
                  label={colorStep.accent}
                  onChange={(accent) => setBrand({ accent })}
                  value={design.brand.accent}
                />
              </div>
              <fieldset className="ps-field">
                <legend className="ps-field-head">{colorStep.textTone}</legend>
                <div className="ps-segmented">
                  {(["auto", "light", "dark"] as TextTone[]).map((tone) => (
                    <button
                      aria-pressed={design.brand.textTone === tone}
                      key={tone}
                      onClick={() => setBrand({ textTone: tone })}
                      type="button"
                    >
                      {colorStep.tones[tone]}
                    </button>
                  ))}
                </div>
              </fieldset>
              <h3 className="ps-subtitle">{colorStep.font}</h3>
              <div className="ps-fonts">
                {fonts.map((font) => (
                  <button
                    aria-pressed={design.brand.font === font.id}
                    key={font.id}
                    onClick={() => setBrand({ font: font.id })}
                    type="button"
                  >
                    <span
                      className="ps-font-sample"
                      style={{ fontFamily: `var(${font.variable})` }}
                    >
                      {design.brand.name.trim() || "Tu negocio"}
                    </span>
                    <span className="ps-font-name">{font.name}</span>
                  </button>
                ))}
              </div>
              <Switch
                checked={design.brand.upper}
                label={colorStep.upper}
                onChange={(upper) => setBrand({ upper })}
              />
            </section>
          ) : null}

          {step === 2 ? (
            <section aria-labelledby="ps-logo-title">
              <h2 id="ps-logo-title">{logoStep.title}</h2>
              <LogoDrop
                hasLogo={Boolean(design.brand.logo)}
                logo={design.brand.logo}
                onFile={onFile}
                onRemove={removeLogo}
                inputRef={fileInput}
                error={logoError}
              />
              {design.brand.logo ? (
                <div className="ps-logo-options">
                  <label className="ps-field">
                    <span className="ps-field-head">
                      <span>{logoStep.size}</span>
                      <span className="ps-count">
                        {Math.round(design.brand.logoScale * 100)}%
                      </span>
                    </span>
                    <input
                      max={140}
                      min={60}
                      onChange={(event) =>
                        setBrand({
                          logoScale: Number(event.target.value) / 100,
                        })
                      }
                      step={5}
                      type="range"
                      value={Math.round(design.brand.logoScale * 100)}
                    />
                  </label>
                  <Switch
                    checked={removeWhite}
                    disabled={!source}
                    label={logoStep.removeWhite}
                    onChange={(value) => {
                      setRemoveWhite(value);
                      if (source) void applyLogo(source, value);
                    }}
                  />
                  {!source ? (
                    <span className="ps-hint">{logoStep.noSource}</span>
                  ) : null}
                  <Switch
                    checked={design.brand.logoPlate}
                    label={logoStep.plate}
                    onChange={(logoPlate) => setBrand({ logoPlate })}
                  />
                  {logoDark &&
                  !design.brand.logoPlate &&
                  luminance(design.brand.background) < 0.2 ? (
                    <span className="ps-hint">{logoStep.plateHint}</span>
                  ) : null}
                </div>
              ) : null}

              <TextField
                label={logoStep.name}
                max={limits.name}
                onChange={(name) => setBrand({ name })}
                value={design.brand.name}
              />

              <h3 className="ps-subtitle">
                {logoStep.textsFor} {pieceName}
              </h3>
              <PieceFields
                callWarning={callWarning}
                design={design}
                setTexts={setTexts}
              />
            </section>
          ) : null}

          {step === 3 ? (
            <section aria-labelledby="ps-send-title">
              <h2 id="ps-send-title">{sendStep.title}</h2>
              <fieldset className="ps-kits">
                <legend>{sendStep.kit}</legend>
                {kits.map((option) => (
                  <label
                    className="ps-kit"
                    data-checked={kitCode === option.code ? "true" : undefined}
                    key={option.code}
                  >
                    <input
                      checked={kitCode === option.code}
                      name="kit"
                      onChange={() => setKitCode(option.code)}
                      type="radio"
                    />
                    <span className="ps-kit-name">{option.name}</span>
                    <span className="ps-kit-price">{option.price}</span>
                    <span className="ps-kit-items">{kitContents(option)}</span>
                    <span className="ps-kit-panel">{option.panelLine}</span>
                  </label>
                ))}
                <label
                  className="ps-kit"
                  data-checked={kitCode === "" ? "true" : undefined}
                >
                  <input
                    checked={kitCode === ""}
                    name="kit"
                    onChange={() => setKitCode("")}
                    type="radio"
                  />
                  <span className="ps-kit-name">{sendStep.noKit}</span>
                  <span className="ps-kit-items">{sendStep.noKitText}</span>
                </label>
              </fieldset>

              {kit && piecesFor(design, kit).length > 1 ? (
                <div className="ps-edit-pieces">
                  <span>{sendStep.editTexts}:</span>
                  {piecesFor(design, kit).map((id) => (
                    <button
                      key={id}
                      onClick={() => {
                        setPiece(id);
                        goTo(2);
                      }}
                      type="button"
                    >
                      {pieces.find((piece) => piece.id === id)?.name}
                    </button>
                  ))}
                </div>
              ) : null}

              <ol className="ps-send">
                <li data-done={saved ? "true" : undefined}>
                  <span className="ps-send-number">
                    {saved ? <Check aria-hidden="true" size={14} /> : 1}
                  </span>
                  <div>
                    <p>{sendStep.how[0]}</p>
                    <div className="ps-actions">
                      <button
                        className="ps-button"
                        disabled={busy}
                        onClick={onDownload}
                        type="button"
                      >
                        <Download aria-hidden="true" size={18} />
                        <span>
                          {busy ? sendStep.working : sendStep.download}
                        </span>
                      </button>
                      {canShare ? (
                        <button
                          className="ps-button ps-button-quiet"
                          disabled={busy}
                          onClick={onShare}
                          type="button"
                        >
                          <Share2 aria-hidden="true" size={18} />
                          <span>{sendStep.share}</span>
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
                <li>
                  <span className="ps-send-number">2</span>
                  <div>
                    <p>{sendStep.how[1]}</p>
                    <a
                      className="ps-button ps-button-whatsapp"
                      href={whatsappLink(message)}
                      rel="noopener"
                      target="_blank"
                    >
                      <WhatsAppIcon className="size-[18px]" />
                      <span>{sendStep.whatsapp}</span>
                    </a>
                  </div>
                </li>
                <li>
                  <span className="ps-send-number">3</span>
                  <div>
                    <p>{sendStep.how[2]}</p>
                  </div>
                </li>
              </ol>
              <p className="ps-after">{sendStep.after}</p>
            </section>
          ) : null}

          <div className="ps-nav">
            {step > 0 ? (
              <button
                className="ps-link"
                onClick={() => goTo(step - 1)}
                type="button"
              >
                {personalizarPage.back}
              </button>
            ) : (
              <span />
            )}
            {step < 3 ? (
              <button
                className="ps-button"
                onClick={() => goTo(step + 1)}
                type="button"
              >
                {personalizarPage.next}: {personalizarPage.steps[step + 1]}
              </button>
            ) : null}
          </div>

          <div className="ps-foot">
            <span>{personalizarPage.saved}</span>
            {confirmReset ? (
              <span className="ps-reset-confirm">
                <button className="ps-link" onClick={reset} type="button">
                  {personalizarPage.resetConfirm}
                </button>
                <button
                  aria-label="Cancelar"
                  className="ps-icon-button"
                  onClick={() => setConfirmReset(false)}
                  type="button"
                >
                  <X aria-hidden="true" size={16} />
                </button>
              </span>
            ) : (
              <button
                className="ps-link"
                onClick={() => setConfirmReset(true)}
                type="button"
              >
                <RotateCcw aria-hidden="true" size={14} />
                <span>{personalizarPage.reset}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LayoutChoice({
  design,
  families,
  qrText,
  onChange,
}: {
  design: Design;
  families: Families;
  qrText: string;
  onChange: (layout: string) => void;
}) {
  const piece = design.piece;
  const names = pieceStep.layouts[piece] as Record<string, string>;
  const currentLayout = design.texts[piece].layout as string;
  return (
    <div className="ps-layouts">
      {Object.entries(names).map(([layout, label]) => {
        const preview: Design = {
          ...design,
          texts: {
            ...design.texts,
            [piece]: { ...design.texts[piece], layout },
          } as PieceTexts,
        };
        return (
          <button
            aria-pressed={currentLayout === layout}
            key={layout}
            onClick={() => onChange(layout)}
            type="button"
          >
            <span className={`ps-layout-thumb ps-layout-${piece}`}>
              <PieceArt
                design={preview}
                families={families}
                id={`ps-layout-${piece}-${layout}`}
                piece={piece}
                qrText={qrText}
              />
            </span>
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function LogoDrop({
  hasLogo,
  logo,
  onFile,
  onRemove,
  inputRef,
  error,
}: {
  hasLogo: boolean;
  logo: string | null;
  onFile: (file: File | undefined) => void;
  onRemove: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  error: string | null;
}) {
  const [over, setOver] = useState(false);
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setOver(false);
    onFile(event.dataTransfer.files[0]);
  };
  return (
    <div className="ps-field">
      <span className="ps-field-head">
        <span>{logoStep.logo}</span>
      </span>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: a drop target for the mouse; the button inside opens the same file picker. */}
      <div
        className="ps-drop"
        data-over={over ? "true" : undefined}
        onDragLeave={() => setOver(false)}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDrop={onDrop}
      >
        {logo ? (
          // biome-ignore lint/performance/noImgElement: a data URL made in the browser.
          <img alt="Tu logo" className="ps-drop-logo" src={logo} />
        ) : (
          <Upload aria-hidden="true" className="ps-drop-icon" size={22} />
        )}
        <div className="ps-drop-actions">
          <button
            className="ps-button ps-button-quiet"
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            {hasLogo ? logoStep.replace : logoStep.upload}
          </button>
          {hasLogo ? (
            <button className="ps-link" onClick={onRemove} type="button">
              {logoStep.remove}
            </button>
          ) : (
            <span className="ps-hint">{logoStep.formats}</span>
          )}
        </div>
        <input
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          className="sr-only"
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            onFile(event.target.files?.[0]);
            event.target.value = "";
          }}
          ref={inputRef}
          tabIndex={-1}
          type="file"
        />
      </div>
      {error ? (
        <span className="ps-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function CallField({
  value,
  onChange,
  warning,
}: {
  value: string;
  onChange: (value: string) => void;
  warning?: string;
}) {
  return (
    <div className="ps-call">
      <TextField
        hint={warning}
        label={logoStep.fields.call}
        max={limits.call}
        onChange={onChange}
        value={value}
      />
      <fieldset className="ps-chips">
        <legend className="sr-only">Sugerencias</legend>
        {logoStep.callSuggestions.map((suggestion) => (
          <button
            aria-pressed={value === suggestion}
            key={suggestion}
            onClick={() => onChange(suggestion)}
            type="button"
          >
            {suggestion}
          </button>
        ))}
      </fieldset>
    </div>
  );
}

function PieceFields({
  design,
  setTexts,
  callWarning,
}: {
  design: Design;
  setTexts: <K extends keyof PieceTexts>(
    piece: K,
    patch: Partial<PieceTexts[K]>,
  ) => void;
  callWarning: (value: string) => string | undefined;
}) {
  const t = design.texts;
  const f = logoStep.fields;
  switch (design.piece) {
    case "stand":
      return (
        <>
          <TextField
            label={f.tagline}
            max={limits.tagline}
            onChange={(tagline) => setTexts("stand", { tagline })}
            value={t.stand.tagline}
          />
          <CallField
            onChange={(call) => setTexts("stand", { call })}
            value={t.stand.call}
            warning={callWarning(t.stand.call)}
          />
        </>
      );
    case "card":
      return (
        <>
          <TextField
            label={f.person}
            max={limits.person}
            onChange={(person) => setTexts("card", { person })}
            value={t.card.person}
          />
          <TextField
            label={f.role}
            max={limits.role}
            onChange={(role) => setTexts("card", { role })}
            value={t.card.role}
          />
          <CallField
            onChange={(call) => setTexts("card", { call })}
            value={t.card.call}
            warning={callWarning(t.card.call)}
          />
        </>
      );
    case "magnet":
      return (
        <>
          <TextField
            label={f.line}
            max={limits.line}
            onChange={(line) => setTexts("magnet", { line })}
            value={t.magnet.line}
          />
          <TextField
            label={f.contact}
            max={limits.contact}
            onChange={(contact) =>
              setTexts("magnet", { contact: contact.replace(/[^\d +()]/g, "") })
            }
            placeholder="222 123 4567"
            value={t.magnet.contact}
          />
          <CallField
            onChange={(call) => setTexts("magnet", { call })}
            value={t.magnet.call}
            warning={callWarning(t.magnet.call)}
          />
        </>
      );
    case "sticker":
      return (
        <>
          {t.sticker.layout === "ring" ? (
            <TextField
              label={f.ring}
              max={limits.ring}
              onChange={(ring) => setTexts("sticker", { ring })}
              value={t.sticker.ring}
            />
          ) : (
            <p className="ps-hint">{logoStep.ringHidden}</p>
          )}
          <CallField
            onChange={(call) => setTexts("sticker", { call })}
            value={t.sticker.call}
            warning={callWarning(t.sticker.call)}
          />
        </>
      );
  }
}
