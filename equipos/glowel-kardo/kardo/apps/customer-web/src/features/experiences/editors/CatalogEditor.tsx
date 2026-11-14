import type { CatalogItem } from "@kardo/contracts";
import {
  AssetSelect,
  ItemControls,
  type Loose,
  merge,
  moveItem,
  PriceInput,
  photoLabel,
  replaceAt,
  TextInput,
} from "../../../components/FormFields.js";
import { Icon } from "../../../components/Icon.js";
import { type ContentOf, limits, newItemId } from "../content.js";
import type { EditorProps } from "./fields.js";
import { CurrencySelect } from "./MenuEditor.js";

export function CatalogEditor({
  content,
  onChange,
  errors,
  assets,
  readOnly,
  onAssetUploaded,
}: EditorProps<ContentOf<"catalog">>) {
  const setItems = (items: CatalogItem[]) => onChange({ ...content, items });
  return (
    <>
      <div className="form-grid-2">
        <TextInput
          error={errors.title}
          id="catalog-title"
          label="Título"
          max={limits.title}
          onChange={(title) => onChange({ ...content, title })}
          placeholder="Ej. Colección otoño"
          readOnly={readOnly}
          value={content.title}
        />
        <CurrencySelect
          id="catalog-currency"
          onChange={(currency) => onChange({ ...content, currency })}
          readOnly={readOnly}
          value={content.currency}
        />
      </div>
      <TextInput
        error={errors.description}
        id="catalog-description"
        label="Descripción"
        max={limits.description}
        multiline
        onChange={(description) => onChange({ ...content, description })}
        optional
        readOnly={readOnly}
        value={content.description}
      />
      <fieldset className="repeatable">
        <legend>
          Productos{" "}
          <span className="optional-label">
            ({content.items.length}/{limits.catalogItems})
          </span>
        </legend>
        {errors.items ? <p className="field-error">{errors.items}</p> : null}
        <ol className="repeatable-list">
          {content.items.map((item, index) => {
            const updateItem = (patch: Loose<CatalogItem>) =>
              setItems(replaceAt(content.items, index, merge(item, patch)));
            return (
              <li className="repeatable-item" key={item.id}>
                <div className="repeatable-item-header">
                  <span className="repeatable-index">{index + 1}</span>
                  {item.name.trim() ? (
                    <strong className="repeatable-name">
                      {item.name.trim()}
                    </strong>
                  ) : null}
                  <ItemControls
                    count={content.items.length}
                    index={index}
                    label={
                      item.name.trim()
                        ? `«${item.name.trim()}»`
                        : `producto ${index + 1}`
                    }
                    minItems={1}
                    onMove={(from, to) =>
                      setItems(moveItem(content.items, from, to))
                    }
                    onRemove={(at) =>
                      setItems(
                        content.items.filter((_, position) => position !== at),
                      )
                    }
                    readOnly={readOnly}
                  />
                </div>
                {/* The photo right under its own product's name, saying
                    whose it is (relevo 37, round 3, second pass: at the
                    bottom of each card it sat right above the next
                    product's name, and Javier's «Pan de muerto chico»
                    photo went to «Bolillo»). */}
                <AssetSelect
                  assets={assets}
                  id={`catalog-${item.id}-image`}
                  kind="image"
                  label={photoLabel(item.name)}
                  onAssetUploaded={onAssetUploaded}
                  onChange={(imageAssetId) =>
                    updateItem({ imageAssetId: imageAssetId || undefined })
                  }
                  optional
                  readOnly={readOnly}
                  uploadLabel={photoLabel(item.name, "Subir")}
                  value={item.imageAssetId}
                />
                <div className="form-grid-item">
                  <TextInput
                    error={errors[`items.${index}.name`]}
                    id={`catalog-${item.id}-name`}
                    label="Nombre"
                    max={limits.title}
                    onChange={(name) => updateItem({ name })}
                    readOnly={readOnly}
                    value={item.name}
                  />
                  <PriceInput
                    error={errors[`items.${index}.price`]}
                    id={`catalog-${item.id}-price`}
                    label="Precio"
                    onChange={(price) => updateItem({ price })}
                    readOnly={readOnly}
                    value={item.price}
                  />
                </div>
                <TextInput
                  error={errors[`items.${index}.description`]}
                  id={`catalog-${item.id}-description`}
                  label="Descripción"
                  max={limits.catalogDescription}
                  multiline
                  onChange={(description) => updateItem({ description })}
                  optional
                  readOnly={readOnly}
                  value={item.description}
                />
                <TextInput
                  error={errors[`items.${index}.url`]}
                  id={`catalog-${item.id}-url`}
                  label="Enlace «Ver más»"
                  max={2048}
                  onChange={(url) => updateItem({ url })}
                  optional
                  placeholder="https://"
                  readOnly={readOnly}
                  type="url"
                  value={item.url}
                />
              </li>
            );
          })}
        </ol>
        {!readOnly ? (
          <button
            className="button button-secondary button-small"
            disabled={content.items.length >= limits.catalogItems}
            onClick={() =>
              setItems([...content.items, { id: newItemId(), name: "" }])
            }
            type="button"
          >
            <Icon name="plus" size={16} /> Añadir producto
          </button>
        ) : null}
      </fieldset>
    </>
  );
}
