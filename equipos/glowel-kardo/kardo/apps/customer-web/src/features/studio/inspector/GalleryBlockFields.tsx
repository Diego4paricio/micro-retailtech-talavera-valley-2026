import type { DesignBlock } from "@kardo/contracts";
import { Segmented } from "../../../components/controls/index.js";
import { Icon } from "../../../components/Icon.js";
import { Notice } from "../../../components/Notice.js";
import { Tooltip } from "../../../components/Tooltip.js";
import { galleryLayoutLabels } from "../labels.js";
import { ImageField, TextField } from "./controls.js";

type GalleryBlock = Extract<DesignBlock, { kind: "gallery" }>;
type GalleryImage = GalleryBlock["images"][number];

export type GalleryPatch = {
  images?: GalleryBlock["images"];
  layout?: GalleryBlock["layout"];
  aspect?: GalleryBlock["aspect"];
  columns?: GalleryBlock["columns"] | undefined;
};

type GalleryImagePatch = {
  imageRef?: string | undefined;
  alt?: string;
};

const MIN_IMAGES = 2;
const MAX_IMAGES = 12;

/** Same convention as `Inspector.tsx`'s own `withPatch`, applied to one
 * photo of the list: a key the patch sets to `undefined` (e.g. "Sin
 * imagen") is dropped, never kept as an explicit `undefined`. */
function withImagePatch(
  current: GalleryImage,
  patch: GalleryImagePatch,
): GalleryImage {
  const next: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  return next as GalleryImage;
}

/**
 * Fields of a `gallery` block ("Galería", motor de 3 bloques): a list of 2
 * to 12 photos (addable, removable, reorderable), each with its own image
 * and alt text, plus the block's layout, aspect ratio and columns.
 */
export function GalleryBlockFields({
  block,
  onChange,
}: {
  block: GalleryBlock;
  onChange: (patch: GalleryPatch) => void;
}) {
  const images = block.images;

  const update = (index: number, patch: GalleryImagePatch) =>
    onChange({
      images: images.map((image, i) =>
        i === index ? withImagePatch(image, patch) : image,
      ),
    });
  const remove = (index: number) =>
    onChange({ images: images.filter((_, i) => i !== index) });
  const add = () => {
    if (images.length >= MAX_IMAGES) return;
    onChange({ images: [...images, { alt: "" }] });
  };
  const reorder = (from: number, to: number) => {
    const next = images.slice();
    const [item] = next.splice(from, 1);
    if (item !== undefined) next.splice(to, 0, item);
    onChange({ images: next });
  };
  const atMax = images.length >= MAX_IMAGES;

  return (
    <div className="es-fields">
      {images.length < MIN_IMAGES ? (
        <Notice title="Faltan fotos" tone="warning">
          Agrega al menos {MIN_IMAGES} fotos a la galería.
        </Notice>
      ) : null}
      <div className="es-gallery-list">
        {images.map((image, index) => (
          <div
            className="es-gallery-item"
            // biome-ignore lint/suspicious/noArrayIndexKey: a photo slot has no id of its own; reordering replaces the whole list
            key={index}
          >
            <div className="es-gallery-item-head">
              <span className="es-gallery-item-number">Foto {index + 1}</span>
              <span className="es-gallery-item-actions">
                <button
                  aria-label={`Mover arriba foto ${index + 1}`}
                  className="icon-button"
                  disabled={index === 0}
                  onClick={() => reorder(index, index - 1)}
                  type="button"
                >
                  <Icon name="arrow-up" size={14} />
                </button>
                <button
                  aria-label={`Mover abajo foto ${index + 1}`}
                  className="icon-button"
                  disabled={index === images.length - 1}
                  onClick={() => reorder(index, index + 1)}
                  type="button"
                >
                  <Icon name="arrow-down" size={14} />
                </button>
                <button
                  aria-label={`Quitar foto ${index + 1}`}
                  className="icon-button"
                  disabled={images.length <= MIN_IMAGES}
                  onClick={() => remove(index)}
                  type="button"
                >
                  <Icon name="trash" size={14} />
                </button>
              </span>
            </div>
            <ImageField
              id={`es-${block.id}-image-${index}`}
              label="Foto"
              onChange={(imageRef) =>
                update(index, { imageRef: imageRef || undefined })
              }
              optional
              value={image.imageRef}
            />
            <p className="qrs-hint">
              Elige “Sin imagen” para dejar un espacio que llenarás después.
            </p>
            <TextField
              hint="Describe la foto para quien no la ve."
              id={`es-${block.id}-alt-${index}`}
              label="Qué muestra la foto"
              max={200}
              onChange={(alt) => update(index, { alt })}
              optional
              value={image.alt}
            />
          </div>
        ))}
      </div>
      <Tooltip
        content={
          atMax ? `Llegaste al máximo de ${MAX_IMAGES} fotos.` : "Agregar"
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
          <Icon name="plus" size={15} /> Agregar foto
        </button>
      </Tooltip>

      <h4 className="es-group-title">Diseño</h4>
      <Segmented
        fill
        label="Acomodo"
        onChange={(layout) => onChange({ layout })}
        options={(
          Object.keys(galleryLayoutLabels) as GalleryBlock["layout"][]
        ).map((value) => ({ value, label: galleryLayoutLabels[value] }))}
        value={block.layout}
      />
      <Segmented
        fill
        label="Proporción"
        onChange={(aspect) => onChange({ aspect })}
        options={[
          { value: "1:1", label: "1:1" },
          { value: "4:3", label: "4:3" },
          { value: "3:4", label: "3:4" },
          { value: "16:9", label: "16:9" },
        ]}
        value={block.aspect}
      />
      {block.layout !== "carousel" ? (
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
