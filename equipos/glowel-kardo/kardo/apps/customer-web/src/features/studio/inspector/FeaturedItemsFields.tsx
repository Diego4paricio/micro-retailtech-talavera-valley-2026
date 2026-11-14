import type { DesignBlock } from "@kardo/contracts";
import { Segmented, SwitchField } from "../../../components/controls/index.js";
import { Icon } from "../../../components/Icon.js";
import { Notice } from "../../../components/Notice.js";
import { useAssetImage } from "../../../lib/asset-images.js";
import { formatPrice } from "../../../lib/format.js";
import { featuredItemsLayoutLabels } from "../labels.js";
import {
  contentFeaturableItems,
  type FeaturableItem,
} from "../model/content.js";
import { useStudio } from "../StudioContext.js";
import { TextField } from "./controls.js";

type FeaturedBlock = Extract<DesignBlock, { kind: "featuredItems" }>;

export type FeaturedItemsPatch = {
  itemIds?: string[];
  layout?: FeaturedBlock["layout"];
  label?: string | undefined;
  descriptions?: boolean | undefined;
};

const MAX_ITEMS = 6;

/**
 * Fields of a `featuredItems` block ("Destacados", motor de 3 bloques): a
 * short label, layout, descriptions, and a picker of the Menú's dishes or
 * the Catálogo's products (checkboxes, up to 6; the order is the order
 * they were chosen in, with subir/bajar to change it).
 */
export function FeaturedItemsFields({
  block,
  onChange,
}: {
  block: FeaturedBlock;
  onChange: (patch: FeaturedItemsPatch) => void;
}) {
  const { type, content } = useStudio();
  const available = contentFeaturableItems(type, content);
  const currency = (content as { currency?: string }).currency ?? "MXN";
  const word = type === "menu" ? "platillo" : "producto";
  const wordPlural = type === "menu" ? "platillos" : "productos";
  const chosen = block.itemIds;
  const chosenSet = new Set(chosen);
  const atMax = chosen.length >= MAX_ITEMS;

  const toggle = (id: string, checked: boolean) => {
    if (checked) {
      if (atMax) return;
      onChange({ itemIds: [...chosen, id] });
    } else {
      onChange({ itemIds: chosen.filter((item) => item !== id) });
    }
  };
  const reorder = (from: number, to: number) => {
    const next = chosen.slice();
    const [item] = next.splice(from, 1);
    if (item !== undefined) next.splice(to, 0, item);
    onChange({ itemIds: next });
  };
  const nameOf = (id: string) =>
    available.find((item) => item.id === id)?.name.trim() ||
    "Elemento eliminado";

  return (
    <div className="es-fields">
      <TextField
        hint='Por ejemplo, "Lo más pedido" o "Del día".'
        id={`es-${block.id}-label`}
        label="Etiqueta"
        max={32}
        onChange={(label) => onChange({ label: label || undefined })}
        optional
        value={block.label ?? ""}
      />
      <Segmented
        fill
        label="Diseño"
        onChange={(layout) => onChange({ layout })}
        options={(
          Object.keys(featuredItemsLayoutLabels) as FeaturedBlock["layout"][]
        ).map((value) => ({
          value,
          label: featuredItemsLayoutLabels[value],
        }))}
        value={block.layout}
      />
      <SwitchField
        checked={block.descriptions ?? true}
        description="Muestra la descripción de cada elemento destacado."
        label="Descripciones"
        onChange={(descriptions) => onChange({ descriptions })}
      />

      <h4 className="es-group-title">
        {type === "menu" ? "Qué platillos destaca" : "Qué productos destaca"}
      </h4>
      {chosen.length === 0 ? (
        <Notice title="Falta elegir" tone="warning">
          Elige al menos un {word}.
        </Notice>
      ) : null}
      {available.length === 0 ? (
        <p className="qrs-hint">
          Agrega {wordPlural} a tu {type === "menu" ? "menú" : "catálogo"} para
          poder destacarlos.
        </p>
      ) : (
        <div className="es-featured-picker">
          {available.map((item) => (
            <FeaturedItemRow
              checked={chosenSet.has(item.id)}
              currency={currency}
              disabled={!chosenSet.has(item.id) && atMax}
              item={item}
              key={item.id}
              onToggle={(checked) => toggle(item.id, checked)}
              placeholderName={`${word.charAt(0).toUpperCase()}${word.slice(1)} sin nombre`}
            />
          ))}
        </div>
      )}
      {chosen.length > 1 ? (
        <>
          <p className="qrs-hint">Orden en la página:</p>
          <ol className="es-menu-order">
            {chosen.map((id, index) => (
              <li key={id}>
                <span>{nameOf(id)}</span>
                <span className="es-menu-order-actions">
                  <button
                    aria-label={`Mover arriba ${nameOf(id)}`}
                    className="icon-button"
                    disabled={index === 0}
                    onClick={() => reorder(index, index - 1)}
                    type="button"
                  >
                    <Icon name="arrow-up" size={14} />
                  </button>
                  <button
                    aria-label={`Mover abajo ${nameOf(id)}`}
                    className="icon-button"
                    disabled={index === chosen.length - 1}
                    onClick={() => reorder(index, index + 1)}
                    type="button"
                  >
                    <Icon name="arrow-down" size={14} />
                  </button>
                </span>
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </div>
  );
}

function FeaturedItemRow({
  item,
  checked,
  disabled,
  currency,
  placeholderName,
  onToggle,
}: {
  item: FeaturableItem;
  checked: boolean;
  disabled: boolean;
  currency: string;
  placeholderName: string;
  onToggle: (checked: boolean) => void;
}) {
  const { workspaceId } = useStudio();
  const image = useAssetImage(workspaceId, item.imageRef, "thumb");
  return (
    <label className="es-featured-row" data-disabled={disabled || undefined}>
      <input
        checked={checked}
        disabled={disabled}
        onChange={(event) => onToggle(event.target.checked)}
        type="checkbox"
      />
      <span
        aria-hidden="true"
        className="es-featured-thumb"
        data-state={item.imageRef ? image.status : "empty"}
      >
        {image.url ? (
          <img alt="" src={image.url} />
        ) : (
          <Icon name="asset" size={16} />
        )}
      </span>
      <span className="es-featured-row-text">
        <strong>{item.name.trim() || placeholderName}</strong>
      </span>
      {item.price !== undefined ? (
        <span className="es-featured-row-price">
          {formatPrice(item.price, currency)}
        </span>
      ) : null}
    </label>
  );
}
