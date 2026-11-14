import type { LinkItem } from "@kardo/contracts";
import {
  ItemControls,
  moveItem,
  replaceAt,
  TextInput,
} from "../../../components/FormFields.js";
import { Icon } from "../../../components/Icon.js";
import { newItemId, type ValidationErrors } from "../content.js";

export function LinkListEditor({
  links,
  onChange,
  errors,
  max,
  minItems,
  readOnly,
  pathPrefix = "links",
}: {
  links: readonly LinkItem[];
  onChange: (links: LinkItem[]) => void;
  errors: ValidationErrors;
  max: number;
  minItems: number;
  readOnly: boolean;
  pathPrefix?: string;
}) {
  return (
    <fieldset className="repeatable">
      <legend>
        Enlaces{" "}
        <span className="optional-label">
          ({links.length}/{max})
        </span>
      </legend>
      {errors[pathPrefix] ? (
        <p className="field-error">{errors[pathPrefix]}</p>
      ) : null}
      <ol className="repeatable-list">
        {links.map((link, index) => (
          <li className="repeatable-item" key={link.id}>
            <div className="repeatable-item-header">
              <span className="repeatable-index">{index + 1}</span>
              <ItemControls
                count={links.length}
                index={index}
                label={`enlace ${index + 1}`}
                minItems={minItems}
                onMove={(from, to) => onChange(moveItem(links, from, to))}
                onRemove={(at) =>
                  onChange(links.filter((_, position) => position !== at))
                }
                readOnly={readOnly}
              />
            </div>
            <div className="form-grid-2">
              <TextInput
                error={errors[`${pathPrefix}.${index}.label`]}
                id={`link-${link.id}-label`}
                label="Texto del botón"
                max={120}
                onChange={(label) =>
                  onChange(replaceAt(links, index, { ...link, label }))
                }
                placeholder="Ej. Reserva una mesa"
                readOnly={readOnly}
                value={link.label}
              />
              <TextInput
                error={errors[`${pathPrefix}.${index}.url`]}
                id={`link-${link.id}-url`}
                label="URL"
                max={2048}
                onChange={(url) =>
                  onChange(replaceAt(links, index, { ...link, url }))
                }
                placeholder="https://"
                readOnly={readOnly}
                type="url"
                value={link.url}
              />
            </div>
          </li>
        ))}
      </ol>
      {!readOnly ? (
        <button
          className="button button-secondary button-small"
          disabled={links.length >= max}
          onClick={() =>
            onChange([...links, { id: newItemId(), label: "", url: "" }])
          }
          type="button"
        >
          <Icon name="plus" size={16} /> Añadir enlace
        </button>
      ) : null}
    </fieldset>
  );
}
