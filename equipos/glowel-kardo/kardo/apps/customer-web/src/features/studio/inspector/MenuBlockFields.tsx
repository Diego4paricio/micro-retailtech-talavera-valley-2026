import type { DesignBlock } from "@kardo/contracts";
import { Segmented, SwitchField } from "../../../components/controls/index.js";
import { Icon } from "../../../components/Icon.js";
import { Tooltip } from "../../../components/Tooltip.js";
import {
  menuLayoutLabels,
  menuPhotoLabels,
  photoShapeLabels,
  priceStyleLabels,
  sectionStyleLabels,
} from "../labels.js";
import { contentMenuSectionIds } from "../model/content.js";
import { idFactoryFor } from "../model/ids.js";
import { splitMenuBlocker } from "../model/limits.js";
import { splitMenuBlock } from "../model/operations.js";
import { useStudio } from "../StudioContext.js";

type MenuBlock = Extract<DesignBlock, { kind: "menu" }>;

export type MenuPatch = {
  layout?: MenuBlock["layout"];
  photos?: MenuBlock["photos"];
  photoShape?: MenuBlock["photoShape"] | undefined;
  descriptions?: boolean | undefined;
  sectionStyle?: MenuBlock["sectionStyle"] | undefined;
  priceStyle?: MenuBlock["priceStyle"] | undefined;
  columns?: MenuBlock["columns"] | undefined;
  sectionIds?: string[] | undefined;
};

/** Pieces drawn for each layout's small thumbnail (no icon set has these). */
const layoutGlyphPieces: Record<MenuBlock["layout"], number> = {
  list: 3,
  cards: 2,
  grid: 4,
  compact: 5,
};

function MenuLayoutGlyph({ layout }: { layout: MenuBlock["layout"] }) {
  return (
    <span
      aria-hidden="true"
      className={`es-menu-glyph es-menu-glyph-${layout}`}
    >
      {Array.from({ length: layoutGlyphPieces[layout] }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed, ordered glyph pieces
        <span key={index} />
      ))}
    </span>
  );
}

/**
 * Fields of a `menu` block (addendum 3): layout, photos, section and price
 * look, columns, which of the Menú's own sections it shows (all, or a
 * chosen and ordered subset) and "Partir el menú" (a second block with the
 * sections this one stops showing, so a title or an image can go between
 * them).
 */
export function MenuBlockFields({
  block,
  onChange,
}: {
  block: MenuBlock;
  onChange: (patch: MenuPatch) => void;
}) {
  const { design, content, contentIds, change, select } = useStudio();
  const allSections = contentMenuSectionIds(content) ?? [];
  const sectionNames =
    (content as { sections?: { id: string; name: string }[] }).sections ?? [];
  const nameOf = (id: string) =>
    sectionNames.find((section) => section.id === id)?.name.trim() ||
    "Sección sin nombre";
  const choosing = block.sectionIds !== undefined;
  const chosen = block.sectionIds ?? allSections;
  const splitBlocked = splitMenuBlocker(design, block.id, allSections);

  const reorder = (from: number, to: number) => {
    const next = chosen.slice();
    const [item] = next.splice(from, 1);
    if (item !== undefined) next.splice(to, 0, item);
    onChange({ sectionIds: next });
  };

  return (
    <div className="es-fields">
      <div className="qrs-control">
        <span className="qrs-control-label">Diseño</span>
        <div className="es-menu-layout-grid">
          {(Object.keys(menuLayoutLabels) as MenuBlock["layout"][]).map(
            (layout) => (
              <button
                aria-pressed={block.layout === layout}
                className="es-menu-layout-tile"
                key={layout}
                onClick={() => onChange({ layout })}
                type="button"
              >
                <MenuLayoutGlyph layout={layout} />
                <span>{menuLayoutLabels[layout]}</span>
              </button>
            ),
          )}
        </div>
      </div>
      <Segmented
        fill
        label="Fotos"
        onChange={(photos) => onChange({ photos })}
        options={(Object.keys(menuPhotoLabels) as MenuBlock["photos"][]).map(
          (value) => ({ value, label: menuPhotoLabels[value] }),
        )}
        value={block.photos}
      />
      {block.photos !== "none" ? (
        <Segmented
          fill
          label="Forma de la foto"
          onChange={(photoShape) => onChange({ photoShape })}
          options={(
            Object.keys(photoShapeLabels) as (keyof typeof photoShapeLabels)[]
          ).map((value) => ({ value, label: photoShapeLabels[value] }))}
          value={block.photoShape ?? "rounded"}
        />
      ) : null}
      <SwitchField
        checked={block.descriptions ?? true}
        description="Muestra la descripción de cada platillo."
        label="Descripciones"
        onChange={(descriptions) => onChange({ descriptions })}
      />
      <Segmented
        fill
        label="Estilo del nombre de sección"
        onChange={(sectionStyle) => onChange({ sectionStyle })}
        options={(
          Object.keys(sectionStyleLabels) as (keyof typeof sectionStyleLabels)[]
        ).map((value) => ({ value, label: sectionStyleLabels[value] }))}
        value={block.sectionStyle ?? "line"}
      />
      <Segmented
        fill
        label="Estilo del precio"
        onChange={(priceStyle) => onChange({ priceStyle })}
        options={(
          Object.keys(priceStyleLabels) as (keyof typeof priceStyleLabels)[]
        ).map((value) => ({ value, label: priceStyleLabels[value] }))}
        value={block.priceStyle ?? "accent"}
      />
      <Segmented
        fill
        label="Columnas en computadora"
        onChange={(value) => onChange({ columns: Number(value) as 1 | 2 })}
        options={[
          { value: "1", label: "1" },
          { value: "2", label: "2" },
        ]}
        value={String(block.columns ?? 1)}
      />

      <h4 className="es-group-title">Qué secciones muestra</h4>
      <SwitchField
        checked={choosing}
        description="Apagado: muestra todas las secciones de tu menú, en su orden."
        label="Elegir y ordenar secciones"
        onChange={(checked) =>
          onChange({ sectionIds: checked ? allSections : undefined })
        }
      />
      {choosing ? (
        <div className="es-menu-sections">
          {allSections.map((id) => (
            <label className="checkbox-row" key={id}>
              <input
                checked={chosen.includes(id)}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...chosen, id]
                    : chosen.filter((sectionId) => sectionId !== id);
                  onChange({ sectionIds: next });
                }}
                type="checkbox"
              />
              {nameOf(id)}
            </label>
          ))}
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
      ) : null}

      <Tooltip
        content={
          splitBlocked ??
          "Crea otro bloque de menú con las secciones que este deje de mostrar, para poner algo entre ambos."
        }
      >
        <button
          aria-disabled={splitBlocked ? true : undefined}
          className="button button-secondary"
          onClick={() => {
            if (splitBlocked) return;
            const newId = idFactoryFor(design, contentIds);
            const result = splitMenuBlock(design, block.id, allSections, newId);
            if (!result) return;
            change(() => result.design);
            select({ kind: "block", id: result.id });
          }}
          type="button"
        >
          <Icon name="columns" size={16} /> Partir el menú
        </button>
      </Tooltip>
    </div>
  );
}
