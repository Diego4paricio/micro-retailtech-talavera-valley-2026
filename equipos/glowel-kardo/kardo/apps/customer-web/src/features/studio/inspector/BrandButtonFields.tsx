import type { DesignBlock, DesignBrand } from "@kardo/contracts";
import {
  brandLabelColor,
  designBrandInfo,
  designBrandList,
} from "@kardo/page-render";
import { RadioGroup } from "radix-ui";
import { useId, useState } from "react";
import { Icon } from "../../../components/Icon.js";
import {
  brandLinkKind,
  buildPlainLink,
  buildProfileLink,
  isProfileHandleBrand,
  parseProfileLink,
  suggestedBrandLabel as suggestedLabel,
} from "../model/brand-links.js";
import { FieldIssue } from "./controls.js";
import { WhatsAppNumberField } from "./WhatsAppNumberField.js";

type BrandButtonBlock = Extract<DesignBlock, { kind: "brandButton" }>;

const linkHint: Record<DesignBrand, string> = {
  whatsapp: "",
  instagram: "Tu @usuario o el enlace completo de tu perfil.",
  facebook: "Tu @usuario o el enlace completo de tu página.",
  messenger: "El enlace completo para escribirte (m.me/tu-página).",
  tiktok: "Tu @usuario o el enlace completo de tu perfil.",
  youtube: "Tu @usuario o el enlace completo de tu canal.",
  x: "Tu @usuario o el enlace completo de tu perfil.",
  threads: "Tu @usuario o el enlace completo de tu perfil.",
  pinterest: "El enlace completo de tu perfil o tablero.",
  telegram: "Tu @usuario o el enlace completo de tu canal.",
  spotify: "El enlace completo de tu perfil, álbum o pódcast.",
  waze: "El enlace completo de tu ubicación en Waze.",
  ubereats: "El enlace completo de tu negocio en Uber Eats.",
  mercadopago: "El enlace completo de tu link de pago.",
  tripadvisor: "El enlace completo de tu negocio en Tripadvisor.",
  booking: "El enlace completo de tu propiedad en Booking.com.",
  calendly: "El enlace completo de tu página de Calendly.",
};

/**
 * Fields for a `brandButton` block: pick the brand (a searchable grid of
 * real logos), the label, the link (built from what the owner has at hand —
 * a phone number, an "@usuario", or a full URL, depending on the brand) and
 * the look. Mirrors `Inspector.tsx`'s own `button`-block fields (same
 * `TextField`/`Segmented` conventions) but stays self-contained: the caller
 * owns `useStudio()`/`updateBlock` and only ever gets a partial patch back.
 */
export function BrandButtonFields({
  block,
  onChange,
  issueOf,
}: {
  block: BrandButtonBlock;
  /** A partial update to merge into the block (mirrors `updateBlock`'s
   * recipe pattern one level up, at the field's granularity). */
  onChange: (patch: Partial<BrandButtonBlock>) => void;
  /** Optional: validation messages ("label"/"href") from the design's own
   * issue list, shown the same way `Inspector.tsx`'s fields do. */
  issueOf?: ((field: string) => string | undefined) | undefined;
}) {
  const labelId = useId();
  // Same scheme as `Inspector.tsx`'s own `fieldId` for a plain "button"
  // block's href (`es-${block.id}-href`): the Falta completar notice (C5e)
  // focuses this field by that id regardless of which block kind it is.
  const hrefId = `es-${block.id}-href`;

  return (
    <div className="es-fields">
      <BrandPicker
        onChange={(brand) => {
          const wasSuggested =
            block.label.trim() === "" ||
            Object.values(suggestedLabel).includes(block.label);
          onChange({
            brand,
            href: "",
            ...(wasSuggested ? { label: suggestedLabel[brand] } : {}),
          });
        }}
        value={block.brand}
      />
      <div className="qrs-control">
        <div className="qrs-control-head">
          <label className="qrs-control-label" htmlFor={labelId}>
            Texto del botón
          </label>
          <span
            className={
              block.label.length > 60
                ? "qrs-counter qrs-counter-full"
                : "qrs-counter"
            }
          >
            {block.label.length} / 60
          </span>
        </div>
        <input
          aria-describedby={issueOf?.("label") ? `${labelId}-error` : undefined}
          aria-invalid={Boolean(issueOf?.("label")) || undefined}
          className="input"
          id={labelId}
          maxLength={80}
          onChange={(event) => onChange({ label: event.target.value })}
          value={block.label}
        />
        <div id={`${labelId}-error`}>
          <FieldIssue message={issueOf?.("label")} />
        </div>
        {block.label !== suggestedLabel[block.brand] ? (
          <button
            className="link-button es-brand-suggestion"
            onClick={() => onChange({ label: suggestedLabel[block.brand] })}
            type="button"
          >
            Usar sugerencia: “{suggestedLabel[block.brand]}”
          </button>
        ) : null}
        {block.look === "circle" ? (
          <p className="qrs-hint">
            No se ve en el círculo; lo leen los lectores de pantalla.
          </p>
        ) : null}
      </div>
      <BrandLinkField
        block={block}
        error={issueOf?.("href")}
        id={hrefId}
        onChange={(href) => onChange({ href })}
      />
      <LookField block={block} onChange={(look) => onChange({ look })} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Brand picker: a search box + a grid of chips, each with the real logo in
// its own official color (from `@kardo/page-render`'s registry — never the
// panel's own token colors, per the owner's brand-guideline rule).
// ---------------------------------------------------------------------------

function BrandPicker({
  value,
  onChange,
}: {
  value: DesignBrand;
  onChange: (brand: DesignBrand) => void;
}) {
  const labelId = useId();
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const options = normalizedQuery
    ? designBrandList.filter((entry) =>
        entry.label.toLowerCase().includes(normalizedQuery),
      )
    : designBrandList;

  return (
    <div className="qrs-control">
      <div className="qrs-control-head">
        <span className="qrs-control-label" id={labelId}>
          Red o app
        </span>
      </div>
      <div className="es-brand-search">
        <Icon name="search" size={15} />
        <input
          aria-label="Buscar red o app"
          className="input"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar…"
          type="text"
          value={query}
        />
      </div>
      <RadioGroup.Root
        aria-labelledby={labelId}
        className="qrs-tiles es-brand-grid"
        loop
        onValueChange={(next) => {
          if (next) onChange(next as DesignBrand);
        }}
        value={value}
      >
        {options.map((entry) => (
          <RadioGroup.Item
            className="qrs-tile"
            key={entry.brand}
            title={entry.label}
            value={entry.brand}
          >
            <span
              aria-hidden="true"
              className="es-brand-swatch"
              style={{ background: entry.brandBackground }}
            >
              <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
                <path d={entry.path} fill={entry.glyphOnBrand} />
              </svg>
            </span>
            <span className="qrs-tile-label">{entry.label}</span>
          </RadioGroup.Item>
        ))}
        {options.length === 0 ? (
          <p className="qrs-hint">No encontramos esa red o app.</p>
        ) : null}
      </RadioGroup.Root>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The link: a per-brand editor (phone, handle/URL or plain URL) that builds
// `block.href` through `model/brand-links.ts`'s pure helpers.
// ---------------------------------------------------------------------------

function BrandLinkField({
  block,
  onChange,
  error,
  id,
}: {
  block: BrandButtonBlock;
  onChange: (href: string) => void;
  error?: string | undefined;
  id: string;
}) {
  const kind = brandLinkKind(block.brand);

  if (kind === "whatsapp")
    return (
      <WhatsAppNumberField
        error={error}
        href={block.href}
        id={id}
        onChange={onChange}
      />
    );

  if (isProfileHandleBrand(block.brand)) {
    const brand = block.brand;
    const draft = parseProfileLink(brand, block.href);
    return (
      <div className="qrs-control">
        <div className="qrs-control-head">
          <label className="qrs-control-label" htmlFor={id}>
            A dónde lleva
          </label>
        </div>
        <input
          aria-describedby={error ? `${id}-error` : `${id}-hint`}
          aria-invalid={Boolean(error) || undefined}
          autoComplete="off"
          className="input"
          id={id}
          onChange={(event) =>
            onChange(buildProfileLink(brand, event.target.value))
          }
          placeholder="@tu-negocio"
          type="text"
          value={draft}
        />
        <div id={`${id}-error`}>
          <FieldIssue message={error} />
        </div>
        {!error ? (
          <p className="qrs-hint" id={`${id}-hint`}>
            {linkHint[brand]}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="qrs-control">
      <div className="qrs-control-head">
        <label className="qrs-control-label" htmlFor={id}>
          A dónde lleva
        </label>
      </div>
      <input
        aria-describedby={error ? `${id}-error` : `${id}-hint`}
        aria-invalid={Boolean(error) || undefined}
        autoComplete="off"
        className="input"
        id={id}
        onChange={(event) => onChange(buildPlainLink(event.target.value))}
        placeholder="https://"
        type="url"
        value={block.href}
      />
      <div id={`${id}-error`}>
        <FieldIssue message={error} />
      </div>
      {!error ? (
        <p className="qrs-hint" id={`${id}-hint`}>
          {linkHint[block.brand]}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Look: Marca, Neutro, Contorno or Círculo (addendum: "forma"), each as a
// tile with its own small round miniature (the look's real colors, from
// `@kardo/page-render`'s registry — never the panel's own token colors),
// plus a bigger live preview of the chosen one below.
// ---------------------------------------------------------------------------

const lookOptions: { value: BrandButtonBlock["look"]; label: string }[] = [
  { value: "brand", label: "Color de la marca" },
  { value: "neutral", label: "Neutro" },
  { value: "outline", label: "Contorno" },
  { value: "circle", label: "Círculo" },
];

/** The look's own colors (background, text/icon color) for `brand` — shared
 * by each tile's tiny miniature and the bigger preview below. */
function lookStyle(
  brand: DesignBrand,
  look: BrandButtonBlock["look"],
): { box: React.CSSProperties; glyphFill: string } {
  const info = designBrandInfo(brand);
  if (look === "brand" || look === "circle")
    return {
      box: {
        background: info.brandBackground,
        color: brandLabelColor(info.brandBackground),
        border: "2px solid transparent",
      },
      glyphFill: info.glyphOnBrand,
    };
  if (look === "neutral")
    return {
      box: {
        background: "var(--surface)",
        color: "var(--ink)",
        border: "1px solid var(--line-input)",
      },
      glyphFill:
        brand === "tiktok" || brand === "x" || brand === "threads"
          ? "currentColor"
          : info.color,
    };
  return {
    box: {
      background: "transparent",
      color: "var(--ink)",
      border: "1.5px solid var(--ink)",
    },
    glyphFill: "currentColor",
  };
}

function LookField({
  block,
  onChange,
}: {
  block: BrandButtonBlock;
  onChange: (look: BrandButtonBlock["look"]) => void;
}) {
  const labelId = useId();
  const info = designBrandInfo(block.brand);
  return (
    <div className="qrs-control">
      <span className="qrs-control-label" id={labelId}>
        Estilo del botón
      </span>
      <RadioGroup.Root
        aria-labelledby={labelId}
        className="qrs-tiles"
        loop
        onValueChange={(next) => {
          if (next) onChange(next as BrandButtonBlock["look"]);
        }}
        value={block.look}
      >
        {lookOptions.map((option) => {
          const { box, glyphFill } = lookStyle(block.brand, option.value);
          return (
            <RadioGroup.Item
              className="qrs-tile"
              key={option.value}
              title={option.label}
              value={option.value}
            >
              <span aria-hidden="true" className="es-brand-swatch" style={box}>
                <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
                  <path d={info.path} fill={glyphFill} />
                </svg>
              </span>
              <span className="qrs-tile-label">{option.label}</span>
            </RadioGroup.Item>
          );
        })}
      </RadioGroup.Root>
      <BrandButtonPreview block={block} />
    </div>
  );
}

function BrandButtonPreview({ block }: { block: BrandButtonBlock }) {
  const info = designBrandInfo(block.brand);
  const { box, glyphFill } = lookStyle(block.brand, block.look);

  return (
    <div
      aria-hidden="true"
      className="es-brand-preview"
      data-look={block.look}
      style={box}
    >
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
        <path d={info.path} fill={glyphFill} />
      </svg>
      {block.look === "circle" ? null : (
        <span>{block.label || suggestedLabel[block.brand]}</span>
      )}
    </div>
  );
}
