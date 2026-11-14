import {
  type DesignBlock,
  type FeatureIcon,
  featureIcons,
} from "@kardo/contracts";
import { featureIconSvg } from "@kardo/page-render";
import { Popover, RadioGroup } from "radix-ui";
import { useId, useState } from "react";
import { Segmented } from "../../../components/controls/index.js";
import { Icon } from "../../../components/Icon.js";
import { Tooltip } from "../../../components/Tooltip.js";
import {
  featureIconLabels,
  featureIconStyleLabels,
  featureLayoutLabels,
} from "../labels.js";
import { TextField } from "./controls.js";

type FeaturesBlock = Extract<DesignBlock, { kind: "features" }>;
type FeatureItem = FeaturesBlock["items"][number];

export type FeaturesPatch = {
  items?: FeaturesBlock["items"];
  layout?: FeaturesBlock["layout"];
  iconStyle?: FeaturesBlock["iconStyle"] | undefined;
  columns?: FeaturesBlock["columns"] | undefined;
};

type FeatureItemPatch = {
  icon?: FeatureItem["icon"];
  title?: string;
  text?: string | undefined;
};

const MAX_ITEMS = 8;

/** Drops a key a per-item patch sets to `undefined` instead of leaving it in
 * place, same as `Inspector.tsx`'s own `withPatch` one level up (the block's
 * optional fields never carry an explicit `undefined`, per the contract's
 * `additionalProperties: false`). */
function withItemPatch(
  current: FeatureItem,
  patch: FeatureItemPatch,
): FeatureItem {
  const next: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  return next as FeatureItem;
}

/**
 * Fields of a `features` block ("Datos clave", motor de 3 bloques): a list
 * of 1 to 8 items (icon, title, optional note), each addable, removable and
 * reorderable, plus the block's own layout, icon style and columns.
 */
export function FeaturesBlockFields({
  block,
  onChange,
}: {
  block: FeaturesBlock;
  onChange: (patch: FeaturesPatch) => void;
}) {
  const items = block.items;

  const update = (index: number, patch: FeatureItemPatch) =>
    onChange({
      items: items.map((item, i) =>
        i === index ? withItemPatch(item, patch) : item,
      ),
    });
  const remove = (index: number) =>
    onChange({ items: items.filter((_, i) => i !== index) });
  const add = () => {
    if (items.length >= MAX_ITEMS) return;
    onChange({
      items: [...items, { icon: "star", title: "Dato clave" }],
    });
  };
  const reorder = (from: number, to: number) => {
    const next = items.slice();
    const [item] = next.splice(from, 1);
    if (item !== undefined) next.splice(to, 0, item);
    onChange({ items: next });
  };
  const atMax = items.length >= MAX_ITEMS;

  return (
    <div className="es-fields">
      <div className="es-feature-list">
        {items.map((item, index) => (
          <FeatureItemEditor
            index={index}
            item={item}
            // biome-ignore lint/suspicious/noArrayIndexKey: an item has no id of its own; reordering replaces the whole list
            key={index}
            onChange={(patch) => update(index, patch)}
            onMoveDown={
              index < items.length - 1 ? () => reorder(index, index + 1) : null
            }
            onMoveUp={index > 0 ? () => reorder(index, index - 1) : null}
            onRemove={items.length > 1 ? () => remove(index) : null}
          />
        ))}
      </div>
      <Tooltip
        content={
          atMax ? `Llegaste al máximo de ${MAX_ITEMS} datos clave.` : "Agregar"
        }
      >
        <button
          aria-disabled={atMax || undefined}
          className="button button-secondary button-small"
          onClick={() => {
            if (!atMax) add();
          }}
          type="button"
        >
          <Icon name="plus" size={15} /> Agregar dato
        </button>
      </Tooltip>

      <h4 className="es-group-title">Diseño</h4>
      <Segmented
        fill
        label="Acomodo"
        onChange={(layout) => onChange({ layout })}
        options={(
          Object.keys(featureLayoutLabels) as FeaturesBlock["layout"][]
        ).map((value) => ({ value, label: featureLayoutLabels[value] }))}
        value={block.layout}
      />
      <Segmented
        fill
        label="Estilo del ícono"
        onChange={(iconStyle) => onChange({ iconStyle })}
        options={(
          Object.keys(featureIconStyleLabels) as NonNullable<
            FeaturesBlock["iconStyle"]
          >[]
        ).map((value) => ({ value, label: featureIconStyleLabels[value] }))}
        value={block.iconStyle ?? "circle"}
      />
      {block.layout === "grid" ? (
        <Segmented
          fill
          label="Columnas"
          onChange={(value) => onChange({ columns: Number(value) as 2 | 3 })}
          options={[
            { value: "2", label: "2" },
            { value: "3", label: "3" },
          ]}
          value={String(block.columns ?? 2)}
        />
      ) : null}
    </div>
  );
}

function FeatureItemEditor({
  item,
  index,
  onChange,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  item: FeatureItem;
  index: number;
  onChange: (patch: FeatureItemPatch) => void;
  onMoveUp: (() => void) | null;
  onMoveDown: (() => void) | null;
  onRemove: (() => void) | null;
}) {
  return (
    <div className="es-feature-item">
      <div className="es-feature-item-head">
        <FeatureIconPicker
          onChange={(icon) => onChange({ icon })}
          value={item.icon}
        />
        <span className="es-feature-item-number">Dato {index + 1}</span>
        <span className="es-feature-item-actions">
          <button
            aria-label={`Mover arriba dato ${index + 1}`}
            className="icon-button"
            disabled={!onMoveUp}
            onClick={() => onMoveUp?.()}
            type="button"
          >
            <Icon name="arrow-up" size={14} />
          </button>
          <button
            aria-label={`Mover abajo dato ${index + 1}`}
            className="icon-button"
            disabled={!onMoveDown}
            onClick={() => onMoveDown?.()}
            type="button"
          >
            <Icon name="arrow-down" size={14} />
          </button>
          <button
            aria-label={`Quitar dato ${index + 1}`}
            className="icon-button"
            disabled={!onRemove}
            onClick={() => onRemove?.()}
            type="button"
          >
            <Icon name="trash" size={14} />
          </button>
        </span>
      </div>
      <TextField
        id={`es-feature-${index}-title`}
        label="Título"
        max={40}
        onChange={(title) => onChange({ title })}
        value={item.title}
      />
      <TextField
        hint="Una línea corta, por ejemplo el horario exacto."
        id={`es-feature-${index}-text`}
        label="Texto"
        max={120}
        onChange={(text) => onChange({ text: text || undefined })}
        optional
        value={item.text ?? ""}
      />
    </div>
  );
}

/** A compact, keyboard-accessible grid of the 48 closed icons, in a popover
 * (the trigger shows the chosen icon; each option's accessible name is its
 * Spanish `featureIconLabels` entry). */
function FeatureIconPicker({
  value,
  onChange,
}: {
  value: FeatureIcon;
  onChange: (icon: FeatureIcon) => void;
}) {
  const labelId = useId();
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root onOpenChange={setOpen} open={open}>
      <Tooltip content={`Ícono: ${featureIconLabels[value]}`}>
        <Popover.Trigger asChild>
          <button
            aria-label={`Ícono: ${featureIconLabels[value]}. Cambiar.`}
            className="es-feature-icon-trigger"
            type="button"
          >
            <span
              aria-hidden="true"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: static, Kardo-owned SVG markup (featureIconSvg)
              dangerouslySetInnerHTML={{ __html: featureIconSvg(value) }}
            />
          </button>
        </Popover.Trigger>
      </Tooltip>
      <Popover.Portal>
        <Popover.Content
          align="start"
          aria-label="Elegir ícono"
          className="es-feature-icon-popover"
          collisionPadding={12}
          sideOffset={8}
        >
          <span className="visually-hidden" id={labelId}>
            Ícono
          </span>
          <RadioGroup.Root
            aria-labelledby={labelId}
            className="es-feature-icon-grid"
            loop
            onValueChange={(next) => {
              if (next) {
                onChange(next as FeatureIcon);
                setOpen(false);
              }
            }}
            value={value}
          >
            {featureIcons.map((icon) => (
              <RadioGroup.Item
                aria-label={featureIconLabels[icon]}
                className="es-feature-icon-option"
                key={icon}
                title={featureIconLabels[icon]}
                value={icon}
              >
                <span
                  aria-hidden="true"
                  // biome-ignore lint/security/noDangerouslySetInnerHtml: static, Kardo-owned SVG markup (featureIconSvg)
                  dangerouslySetInnerHTML={{ __html: featureIconSvg(icon) }}
                />
              </RadioGroup.Item>
            ))}
          </RadioGroup.Root>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
