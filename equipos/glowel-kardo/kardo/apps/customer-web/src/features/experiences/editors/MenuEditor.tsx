import type { MenuSection } from "@kardo/contracts";
import { Field } from "../../../components/Field.js";
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
import { type ContentOf, currencies, limits, newItemId } from "../content.js";
import type { EditorProps } from "./fields.js";

export function CurrencySelect({
  id,
  value,
  onChange,
  readOnly,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  readOnly: boolean;
}) {
  return (
    <Field id={id} label="Moneda">
      <select
        disabled={readOnly}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {currencies.map(([code, label]) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function MenuEditor({
  content,
  onChange,
  errors,
  assets,
  readOnly,
  onAssetUploaded,
}: EditorProps<ContentOf<"menu">>) {
  const totalItems = content.sections.reduce(
    (sum, section) => sum + section.items.length,
    0,
  );
  const setSections = (sections: MenuSection[]) =>
    onChange({ ...content, sections });

  return (
    <>
      <div className="form-grid-2">
        <TextInput
          error={errors.title}
          id="menu-title"
          label="Título"
          max={limits.title}
          onChange={(title) => onChange({ ...content, title })}
          placeholder="Ej. Carta de temporada"
          readOnly={readOnly}
          value={content.title}
        />
        <CurrencySelect
          id="menu-currency"
          onChange={(currency) => onChange({ ...content, currency })}
          readOnly={readOnly}
          value={content.currency}
        />
      </div>
      <TextInput
        error={errors.description}
        id="menu-description"
        label="Descripción"
        max={limits.description}
        multiline
        onChange={(description) => onChange({ ...content, description })}
        optional
        readOnly={readOnly}
        value={content.description}
      />
      <p className="field-hint">
        {content.sections.length}/{limits.menuSections} secciones · {totalItems}
        /{limits.menuItemsTotal} productos
      </p>
      {errors.sections ? (
        <p className="field-error">{errors.sections}</p>
      ) : null}
      <ol className="section-list">
        {content.sections.map((section, sectionIndex) => (
          <li className="section-block" key={section.id}>
            <div className="section-block-header">
              <TextInput
                error={errors[`sections.${sectionIndex}.name`]}
                id={`section-${section.id}-name`}
                label={`Sección ${sectionIndex + 1}`}
                max={limits.title}
                onChange={(name) =>
                  setSections(
                    replaceAt(content.sections, sectionIndex, {
                      ...section,
                      name,
                    }),
                  )
                }
                placeholder="Ej. Bebidas calientes"
                readOnly={readOnly}
                value={section.name}
              />
              <ItemControls
                count={content.sections.length}
                index={sectionIndex}
                label={`sección ${sectionIndex + 1}`}
                minItems={1}
                onMove={(from, to) =>
                  setSections(moveItem(content.sections, from, to))
                }
                onRemove={(at) =>
                  setSections(
                    content.sections.filter((_, position) => position !== at),
                  )
                }
                readOnly={readOnly}
              />
            </div>
            {errors[`sections.${sectionIndex}.items`] ? (
              <p className="field-error">
                {errors[`sections.${sectionIndex}.items`]}
              </p>
            ) : null}
            <ol className="repeatable-list">
              {section.items.map((item, itemIndex) => {
                const path = `sections.${sectionIndex}.items.${itemIndex}`;
                const updateItem = (patch: Loose<typeof item>) =>
                  setSections(
                    replaceAt(content.sections, sectionIndex, {
                      ...section,
                      items: replaceAt(
                        section.items,
                        itemIndex,
                        merge(item, patch),
                      ),
                    }),
                  );
                return (
                  <li className="repeatable-item" key={item.id}>
                    <div className="repeatable-item-header">
                      <span className="repeatable-index">{itemIndex + 1}</span>
                      {item.name.trim() ? (
                        <strong className="repeatable-name">
                          {item.name.trim()}
                        </strong>
                      ) : null}
                      <ItemControls
                        count={section.items.length}
                        index={itemIndex}
                        label={
                          item.name.trim()
                            ? `«${item.name.trim()}»`
                            : `platillo ${itemIndex + 1}`
                        }
                        minItems={1}
                        onMove={(from, to) =>
                          setSections(
                            replaceAt(content.sections, sectionIndex, {
                              ...section,
                              items: moveItem(section.items, from, to),
                            }),
                          )
                        }
                        onRemove={(at) =>
                          setSections(
                            replaceAt(content.sections, sectionIndex, {
                              ...section,
                              items: section.items.filter(
                                (_, position) => position !== at,
                              ),
                            }),
                          )
                        }
                        readOnly={readOnly}
                      />
                    </div>
                    <div className="form-grid-item">
                      <TextInput
                        error={errors[`${path}.name`]}
                        id={`item-${item.id}-name`}
                        label="Nombre"
                        max={limits.title}
                        onChange={(name) => updateItem({ name })}
                        placeholder="Ej. Latte"
                        readOnly={readOnly}
                        value={item.name}
                      />
                      <PriceInput
                        error={errors[`${path}.price`]}
                        id={`item-${item.id}-price`}
                        label="Precio"
                        onChange={(price) => updateItem({ price })}
                        readOnly={readOnly}
                        value={item.price}
                      />
                    </div>
                    <TextInput
                      error={errors[`${path}.description`]}
                      id={`item-${item.id}-description`}
                      label="Descripción"
                      max={limits.menuItemDescription}
                      onChange={(description) => updateItem({ description })}
                      optional
                      readOnly={readOnly}
                      value={item.description}
                    />
                    <details
                      className="item-photo"
                      open={Boolean(item.imageAssetId)}
                    >
                      <summary className="item-photo-summary">
                        <Icon name="asset" size={14} />
                        {item.imageAssetId
                          ? photoLabel(item.name)
                          : photoLabel(item.name, "Añadir")}
                        <Icon
                          className="item-photo-chevron"
                          name="chevron-down"
                          size={14}
                        />
                      </summary>
                      <div className="item-photo-body">
                        <AssetSelect
                          assets={assets}
                          id={`item-${item.id}-image`}
                          kind="image"
                          label={photoLabel(item.name)}
                          onAssetUploaded={onAssetUploaded}
                          onChange={(imageAssetId) =>
                            updateItem({
                              imageAssetId: imageAssetId || undefined,
                            })
                          }
                          optional
                          readOnly={readOnly}
                          uploadLabel={photoLabel(item.name, "Subir")}
                          value={item.imageAssetId}
                        />
                      </div>
                    </details>
                  </li>
                );
              })}
            </ol>
            {!readOnly ? (
              <button
                className="button button-secondary button-small"
                disabled={
                  section.items.length >= limits.menuItemsPerSection ||
                  totalItems >= limits.menuItemsTotal
                }
                onClick={() =>
                  setSections(
                    replaceAt(content.sections, sectionIndex, {
                      ...section,
                      items: [...section.items, { id: newItemId(), name: "" }],
                    }),
                  )
                }
                type="button"
              >
                <Icon name="plus" size={16} /> Añadir producto
              </button>
            ) : null}
          </li>
        ))}
      </ol>
      {!readOnly ? (
        <button
          className="button button-secondary"
          disabled={
            content.sections.length >= limits.menuSections ||
            totalItems >= limits.menuItemsTotal
          }
          onClick={() =>
            setSections([
              ...content.sections,
              {
                id: newItemId(),
                name: "",
                items: [{ id: newItemId(), name: "" }],
              },
            ])
          }
          type="button"
        >
          <Icon name="plus" size={16} /> Añadir sección
        </button>
      ) : null}
    </>
  );
}
