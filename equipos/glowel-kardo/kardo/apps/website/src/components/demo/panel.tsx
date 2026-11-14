import { Check, Globe, LoaderCircle, RotateCcw } from "lucide-react";
import { type KeyboardEvent, type ReactNode, type Ref, useRef } from "react";
import { type PresetName, presetThemes } from "../kardo-page/theme";
import type { ItemState, OtherPoint, Version } from "./demo-data";

/*
  Pieces of the business's panel in the live demo, with the panel's tokens:
  the card, its header and status, a two-way switch, the editor tabs, the
  version history, the theme picker, live availability and the footer with
  the visit counters and the publish button.
*/

export function PanelCard({
  children,
  ref,
}: {
  children: ReactNode;
  ref?: Ref<HTMLDivElement>;
}) {
  return (
    <div
      className="overflow-hidden rounded-[1.4rem] border border-[#e2ded4] bg-paper shadow-[0_1px_2px_rgba(22,35,46,0.05),0_24px_48px_-28px_rgba(22,35,46,0.35)]"
      ref={ref}
    >
      {children}
    </div>
  );
}

/**
 * Where the Experience is published: the group (or the plate) and, under
 * it, the ad, its own "Otro" point.
 */
export function PanelHeader({
  icon,
  title,
  subtitle,
  status,
  other,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  status: ReactNode;
  other: OtherPoint;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e2ded4] px-5 py-4 sm:px-6">
      <div className="grid gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-tint text-teal">
            {icon}
          </span>
          <div>
            <p className="font-display text-[17px] leading-tight font-semibold tracking-[-0.02em]">
              {title}
            </p>
            <p className="text-[13px] text-soft">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-cream text-teal ring-1 ring-[#e2ded4] ring-inset">
            <Globe aria-hidden="true" className="size-[18px]" />
          </span>
          <div>
            <p className="font-display text-[15px] leading-tight font-semibold tracking-[-0.01em]">
              {other.name}
            </p>
            <p className="text-[13px] text-soft">{other.summary}</p>
          </div>
        </div>
      </div>
      {status}
    </div>
  );
}

export function StatusPill({
  publishing,
  dirty,
  liveNumber,
}: {
  publishing: number | null;
  dirty: boolean;
  liveNumber: number;
}) {
  if (publishing !== null)
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-tint px-3 py-1.5 text-[13px] font-semibold text-teal">
        <LoaderCircle
          aria-hidden="true"
          className="size-3.5 motion-safe:animate-spin"
        />
        Publicando
      </span>
    );
  if (dirty)
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-[#fbf0d9] px-3 py-1.5 text-[13px] font-semibold text-[#7a5300]">
        <span className="size-1.5 rounded-full bg-[#c98a12]" />
        Cambios sin publicar
      </span>
    );
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-[#e6f2ec] px-3 py-1.5 text-[13px] font-semibold text-[#1e6b50]">
      <Check aria-hidden="true" className="size-3.5" />
      Publicada la versión {liveNumber}
    </span>
  );
}

/** Two choices as radios, like "Qué muestran las mesas". */
export function Switch<Value extends string>({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  name: string;
  value: Value;
  /** Value, label, and a shorter label for narrow screens. */
  options: readonly (readonly [Value, string, string?])[];
  onChange: (value: Value) => void;
}) {
  return (
    <fieldset className="border-b border-[#e2ded4] px-5 py-4 sm:px-6">
      <legend className="float-left mb-2.5 text-[13px] font-semibold text-muted">
        {legend}
      </legend>
      <div className="clear-left grid grid-cols-2 gap-2 rounded-full bg-cream p-1">
        {options.map(([option, label, short]) => (
          <label
            className={`relative flex cursor-pointer items-center justify-center rounded-full px-3 py-2 text-[14px] font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-teal ${value === option ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
            key={option}
          >
            <input
              checked={value === option}
              className="sr-only"
              name={name}
              onChange={() => onChange(option)}
              type="radio"
              value={option}
            />
            {short ? (
              <>
                <span className="sm:hidden">{short}</span>
                <span className="hidden sm:inline">{label}</span>
              </>
            ) : (
              label
            )}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export interface EditorTab<Id extends string> {
  id: Id;
  label: string;
  icon: ReactNode;
  /** A small count next to the label, like the number of leads. */
  count?: number;
}

/** The editor's sections as tabs; arrow keys, Home and End move. */
export function EditorTabs<Id extends string>({
  id,
  tabs,
  current,
  onChange,
  children,
}: {
  id: string;
  tabs: EditorTab<Id>[];
  current: Id;
  onChange: (tab: Id) => void;
  children: ReactNode;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const index = tabs.findIndex((item) => item.id === current);
    const last = tabs.length - 1;
    const moves: Record<string, number> = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    };
    const next = moves[event.key];
    const target = next === undefined ? undefined : tabs[next];
    if (next === undefined || !target) return;
    event.preventDefault();
    onChange(target.id);
    buttons.current[next]?.focus();
  }

  return (
    <>
      <div
        aria-label="Secciones del editor"
        className="flex gap-1 overflow-x-auto border-b border-[#e2ded4] px-3 [scrollbar-width:none] sm:px-4"
        role="tablist"
      >
        {tabs.map((item, index) => (
          <button
            aria-controls={`${id}-panel-${item.id}`}
            aria-selected={current === item.id}
            className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-[14px] font-semibold transition-colors ${current === item.id ? "border-teal text-ink" : "border-transparent text-soft hover:text-ink"}`}
            id={`${id}-tab-${item.id}`}
            key={item.id}
            onClick={() => onChange(item.id)}
            onKeyDown={onKeyDown}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            role="tab"
            tabIndex={current === item.id ? 0 : -1}
            type="button"
          >
            {item.icon}
            {item.label}
            {item.count !== undefined ? (
              <span className="rounded-full bg-tint px-1.5 py-px text-[12px] leading-snug font-semibold text-teal tabular-nums">
                {item.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <div
        aria-labelledby={`${id}-tab-${current}`}
        className="px-5 py-5 sm:px-6"
        id={`${id}-panel-${current}`}
        role="tabpanel"
      >
        {children}
      </div>
    </>
  );
}

export interface StatItem {
  id: string;
  label: string;
  value: number;
  dot?: string;
  bumpKey?: number;
}

/** Visit counters and the publish button, at the bottom of the panel. */
export function PanelFooter({
  stats,
  dirty,
  publishing,
  canPublish,
  onDiscard,
  onPublish,
  publishLabel,
  progressLabel,
}: {
  stats: StatItem[];
  dirty: boolean;
  publishing: number | null;
  canPublish: boolean;
  onDiscard: () => void;
  onPublish: () => void;
  publishLabel: string;
  progressLabel: string;
}) {
  return (
    <div className="flex flex-col gap-4 border-t border-[#e2ded4] bg-cream/60 px-5 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-6">
      <dl className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
        {stats.map((stat) => (
          <Stat key={stat.id} {...stat} />
        ))}
      </dl>
      <div className="flex items-center gap-2 sm:ml-auto">
        <button
          className="min-h-11 rounded-full px-4 text-[14px] font-semibold text-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!dirty || publishing !== null}
          onClick={onDiscard}
          type="button"
        >
          Descartar
        </button>
        <button
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-teal px-5 text-[14px] font-semibold text-white transition-colors hover:bg-teal-hover disabled:cursor-not-allowed disabled:bg-[#9fb4b6]"
          disabled={!canPublish}
          onClick={onPublish}
          type="button"
        >
          {publishing !== null ? (
            <>
              <LoaderCircle
                aria-hidden="true"
                className="size-4 motion-safe:animate-spin"
              />
              {progressLabel}
            </>
          ) : (
            publishLabel
          )}
        </button>
      </div>
    </div>
  );
}

export function Stat({
  label,
  value,
  dot,
  bumpKey,
  tone = "light",
}: {
  label: string;
  value: number;
  dot?: string;
  bumpKey?: number;
  tone?: "light" | "dark";
}) {
  return (
    <div className="grid">
      <dt
        className={`flex items-center gap-1.5 whitespace-nowrap ${tone === "dark" ? "text-ink-soft" : "text-soft"}`}
      >
        {dot ? (
          <span className="size-2 rounded-full" style={{ background: dot }} />
        ) : null}
        {label}
      </dt>
      <dd
        className={`font-display text-[20px] leading-tight font-semibold tracking-[-0.02em] tabular-nums ${tone === "dark" ? "text-white" : "text-ink"} ${bumpKey ? "stat-bump" : ""}`}
        key={bumpKey}
      >
        {value}
      </dd>
    </div>
  );
}

/** Channel colors of the panel's charts (NFC, QR, URL directa). */
export const channelDots = {
  nfc: "#0a6c78",
  qr: "#4ec3ce",
  link: "#16232e",
} as const;

export function ThemePicker({
  id,
  value,
  choices,
  onChange,
}: {
  id: string;
  value: PresetName;
  choices: PresetName[];
  onChange: (name: PresetName) => void;
}) {
  return (
    <fieldset>
      <legend className="text-[13px] text-soft">
        El tema cambia el fondo, la superficie, el color de acento, los botones
        y el tipo de letra.
      </legend>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {choices.map((name) => {
          const theme = presetThemes[name];
          const background =
            theme.background.kind === "gradient"
              ? `linear-gradient(135deg, ${theme.background.color}, ${theme.background.colorTo})`
              : theme.background.color;
          const selected = value === name;
          return (
            <label
              className={`cursor-pointer rounded-2xl border p-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-teal ${selected ? "border-teal bg-tint/60" : "border-[#e2ded4] hover:border-[#b8c6c3]"}`}
              key={name}
            >
              <input
                checked={selected}
                className="sr-only"
                name={`${id}-theme`}
                onChange={() => onChange(name)}
                type="radio"
                value={name}
              />
              <span
                aria-hidden="true"
                className="flex h-16 items-center justify-center rounded-xl"
                style={{ background }}
              >
                <span
                  className="flex h-10 w-[70%] items-center gap-2 rounded-lg px-2.5"
                  style={{
                    background:
                      theme.surface === "dark" ? "#1c232b" : "#fffdf8",
                    color: theme.surface === "dark" ? "#f4f6f5" : "#16232e",
                    fontFamily:
                      theme.font === "serif"
                        ? "Georgia, serif"
                        : theme.font === "mono"
                          ? "ui-monospace, Menlo, monospace"
                          : "system-ui, sans-serif",
                  }}
                >
                  <span className="text-[15px] font-bold">Aa</span>
                  <span
                    className="h-2 flex-1 rounded-full"
                    style={{ background: theme.accent }}
                  />
                </span>
              </span>
              <span className="mt-2 flex items-center justify-between gap-2 px-0.5 text-[13px] font-semibold text-ink">
                {name}
                {selected ? (
                  <Check aria-hidden="true" className="size-4 text-teal" />
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function VersionList<State>({
  versions,
  liveNumber,
  liveBadge,
  busy,
  onRollback,
}: {
  versions: Version<State>[];
  liveNumber: number;
  liveBadge: string;
  busy: boolean;
  onRollback: (version: Version<State>) => void;
}) {
  return (
    <div>
      <p className="text-[13px] text-soft">
        Cada publicación queda guardada. Si algo no te gustó, regresas a una
        anterior.
      </p>
      <ol className="mt-3 divide-y divide-[#e2ded4]">
        {versions.map((version) => {
          const isLive = version.number === liveNumber;
          return (
            <li
              className="flex flex-wrap items-center justify-between gap-3 py-3"
              key={version.number}
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                  Versión {version.number}
                  {isLive ? (
                    <span className="rounded-full bg-[#e6f2ec] px-2 py-0.5 text-[12px] font-semibold text-[#1e6b50]">
                      {liveBadge}
                    </span>
                  ) : null}
                </p>
                <p className="truncate text-[13px] text-soft">
                  {version.label}. {version.when}
                </p>
              </div>
              {isLive ? null : (
                <button
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-[#b8c6c3] px-3.5 text-[13px] font-semibold text-ink transition-colors hover:border-teal hover:text-teal disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={busy}
                  onClick={() => onRollback(version)}
                  type="button"
                >
                  <RotateCcw aria-hidden="true" className="size-3.5" />
                  Regresar a esta
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Live availability (ADR 017): no draft, no version, no publishing. */
export function AvailabilityEditor({
  id,
  items,
  availability,
  everywhere,
  onChange,
}: {
  id: string;
  items: { id: string; name: string }[];
  availability: Record<string, ItemState>;
  /** "las 20 mesas". */
  everywhere: string;
  onChange: (itemId: string, name: string, next: ItemState) => void;
}) {
  const options: [ItemState["status"], string][] = [
    ["available", "Disponible"],
    ["sold_out", "Agotado"],
    ["hidden", "Oculto"],
  ];
  return (
    <div>
      <p className="text-[13px] text-soft">
        Se ve al momento en {everywhere}: no hay que publicar ni se crea una
        versión.
      </p>
      <ul className="mt-3 divide-y divide-[#e2ded4]">
        {items.map((item) => {
          const current = availability[item.id] ?? {
            status: "available",
            quantity: null,
          };
          return (
            <li className="grid gap-2.5 py-3" key={item.id}>
              <p className="text-[15px] font-semibold text-ink">{item.name}</p>
              <div className="flex flex-wrap items-center gap-2">
                <fieldset className="flex rounded-full bg-cream p-1">
                  <legend className="sr-only">
                    Disponibilidad de {item.name}
                  </legend>
                  {options.map(([value, label]) => (
                    <label
                      className={`cursor-pointer rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-teal ${current.status === value ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
                      key={value}
                    >
                      <input
                        checked={current.status === value}
                        className="sr-only"
                        name={`${id}-availability-${item.id}`}
                        onChange={() =>
                          onChange(item.id, item.name, {
                            status: value,
                            quantity:
                              value === "available" ? current.quantity : null,
                          })
                        }
                        type="radio"
                        value={value}
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>
                {current.status === "available" ? (
                  <label className="flex items-center gap-2 text-[13px] font-semibold text-muted">
                    Quedan
                    <input
                      className="h-9 w-24 rounded-lg border border-[#b8c6c3] bg-white px-2.5 text-right text-[14px] font-semibold text-ink tabular-nums outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
                      inputMode="numeric"
                      max={9999}
                      min={0}
                      onChange={(event) => {
                        const text = event.target.value.trim();
                        const quantity = /^\d{1,4}$/.test(text)
                          ? Number(text)
                          : null;
                        onChange(item.id, item.name, {
                          status: "available",
                          quantity,
                        });
                      }}
                      placeholder="Sin límite"
                      type="number"
                      value={current.quantity ?? ""}
                    />
                  </label>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Text field of the panel's editors. */
export function TextField({
  id,
  label,
  value,
  onChange,
  maxLength,
  error,
  hint,
  multiline = false,
  type = "text",
}: {
  id: string;
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  error?: string;
  hint?: string;
  multiline?: boolean;
  type?: "text" | "url";
}) {
  const describedBy =
    [error ? `${id}-error` : null, hint ? `${id}-hint` : null]
      .filter(Boolean)
      .join(" ") || undefined;
  const className = `w-full rounded-xl border bg-white px-3.5 text-[15px] font-normal text-ink outline-none focus:ring-2 ${error ? "border-[#9b3530] focus:ring-[#9b3530]/20" : "border-[#b8c6c3] focus:border-teal focus:ring-teal/20"}`;
  return (
    <div className="grid gap-1.5">
      <label className="text-[13px] font-semibold text-muted" htmlFor={id}>
        {label}
      </label>
      {multiline ? (
        <textarea
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={`${className} min-h-[4.5rem] resize-y py-2.5 leading-snug`}
          id={id}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
          value={value}
        />
      ) : (
        <input
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={`${className} h-11`}
          id={id}
          inputMode={type === "url" ? "url" : undefined}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={type === "url" ? false : undefined}
          type={type === "url" ? "url" : "text"}
          value={value}
        />
      )}
      {hint ? (
        <p className="text-[12.5px] text-soft" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          className="text-[12.5px] font-medium text-[#9b3530]"
          id={`${id}-error`}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** A customer action under the phone: tap the NFC, scan the QR, open a link. */
export function VisitButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={`inline-flex min-h-[4.25rem] flex-col items-center justify-center gap-1 rounded-2xl border px-2 text-[13.5px] leading-tight font-semibold transition-colors ${active ? "border-ink bg-ink text-white" : "border-ink/15 bg-paper text-ink hover:border-ink/40"}`}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}
