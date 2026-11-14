import {
  type Asset,
  type SocialNetwork,
  socialNetworks,
} from "@kardo/contracts";
import { Field } from "../../components/Field.js";
import { Icon } from "../../components/Icon.js";
import type { ContentOf, ValidationErrors } from "../experiences/content.js";
import { newItemId } from "../experiences/content.js";
import {
  AssetSelect,
  ItemControls,
  type Loose,
  merge,
  moveItem,
  replaceAt,
  TextInput,
} from "../experiences/editors/fields.js";
import {
  socialNetworkHints,
  socialNetworkIcons,
  socialNetworkLabels,
  socialNetworkPlaceholders,
} from "../experiences/social-networks.js";

type LinkPageContent = ContentOf<"linkpage">;
type LinkPageButton = LinkPageContent["links"][number];
type LinkPageSocial = LinkPageContent["socials"][number];

export const linkPageLimits = {
  displayName: 120,
  bio: 300,
  links: 20,
  socials: 12,
};

/**
 * The link-in-bio content fields: avatar, name, bio, social icon row and
 * buttons. Rendered inside `LinkDetailPage`; `ThemeEditor` is appended by the
 * caller so its stable contract stays in one place (ContentEditor.tsx).
 */
export function LinkPageContentEditor({
  content,
  onChange,
  errors,
  assets,
  readOnly,
  onAssetUploaded,
}: {
  content: LinkPageContent;
  onChange: (content: LinkPageContent) => void;
  errors: ValidationErrors;
  assets: readonly Asset[];
  readOnly: boolean;
  onAssetUploaded: (asset: Asset) => void;
}) {
  return (
    <>
      <div className="avatar-picker">
        <span aria-hidden="true" className="avatar-picker-preview">
          <Icon name="asset" size={22} />
        </span>
        <div className="avatar-picker-fields">
          <AssetSelect
            assets={assets}
            error={errors.avatarAssetId}
            id="linkpage-avatar"
            kind="image"
            label="Foto o logo"
            onAssetUploaded={onAssetUploaded}
            onChange={(avatarAssetId) =>
              onChange(
                merge(content, { avatarAssetId: avatarAssetId || undefined }),
              )
            }
            optional
            readOnly={readOnly}
            value={content.avatarAssetId}
          />
        </div>
      </div>
      <TextInput
        error={errors.displayName}
        id="linkpage-name"
        label="Nombre visible"
        max={linkPageLimits.displayName}
        onChange={(displayName) => onChange({ ...content, displayName })}
        placeholder="Ej. Café Nube"
        readOnly={readOnly}
        value={content.displayName}
      />
      <TextInput
        error={errors.bio}
        hint="Una frase corta debajo de tu nombre."
        id="linkpage-bio"
        label="Bio"
        max={linkPageLimits.bio}
        multiline
        onChange={(bio) => onChange({ ...content, bio })}
        optional
        readOnly={readOnly}
        value={content.bio}
      />

      <SocialsEditor
        errors={errors}
        onChange={(socials) => onChange({ ...content, socials })}
        readOnly={readOnly}
        socials={content.socials}
      />

      <ButtonsEditor
        errors={errors}
        links={content.links}
        onChange={(links) => onChange({ ...content, links })}
        readOnly={readOnly}
      />
    </>
  );
}

function SocialsEditor({
  socials,
  onChange,
  errors,
  readOnly,
}: {
  socials: readonly LinkPageSocial[];
  onChange: (socials: LinkPageSocial[]) => void;
  errors: ValidationErrors;
  readOnly: boolean;
}) {
  return (
    <fieldset className="repeatable">
      <legend>
        Redes sociales{" "}
        <span className="optional-label">
          ({socials.length}/{linkPageLimits.socials})
        </span>
      </legend>
      <ol className="repeatable-list">
        {socials.map((social, index) => {
          const update = (patch: Partial<LinkPageSocial>) =>
            onChange(replaceAt(socials, index, { ...social, ...patch }));
          return (
            <li className="social-row" key={social.id}>
              <div className="social-row-header">
                <Field id={`social-${social.id}-network`} label="Red">
                  <div className="social-network-picker">
                    <Icon name={socialNetworkIcons[social.network]} size={16} />
                    <select
                      disabled={readOnly}
                      id={`social-${social.id}-network`}
                      onChange={(event) =>
                        update({
                          network: event.target.value as SocialNetwork,
                          value: "",
                        })
                      }
                      value={social.network}
                    >
                      {socialNetworks.map((network) => (
                        <option key={network} value={network}>
                          {socialNetworkLabels[network]}
                        </option>
                      ))}
                    </select>
                  </div>
                </Field>
                <ItemControls
                  count={socials.length}
                  index={index}
                  label={`red social ${index + 1}`}
                  minItems={0}
                  onMove={(from, to) => onChange(moveItem(socials, from, to))}
                  onRemove={(at) =>
                    onChange(socials.filter((_, position) => position !== at))
                  }
                  readOnly={readOnly}
                />
              </div>
              <TextInput
                error={errors[`socials.${index}.value`]}
                hint={socialNetworkHints[social.network]}
                id={`social-${social.id}-value`}
                label={socialNetworkLabels[social.network]}
                max={2048}
                onChange={(value) => update({ value })}
                placeholder={socialNetworkPlaceholders[social.network]}
                readOnly={readOnly}
                type={
                  social.network === "email" || social.network === "phone"
                    ? "text"
                    : "url"
                }
                value={social.value}
              />
            </li>
          );
        })}
      </ol>
      {!readOnly ? (
        <button
          className="button button-secondary button-small"
          disabled={socials.length >= linkPageLimits.socials}
          onClick={() =>
            onChange([
              ...socials,
              { id: newItemId(), network: "website", value: "" },
            ])
          }
          type="button"
        >
          <Icon name="plus" size={16} /> Añadir red social
        </button>
      ) : null}
    </fieldset>
  );
}

function ButtonsEditor({
  links,
  onChange,
  errors,
  readOnly,
}: {
  links: readonly LinkPageButton[];
  onChange: (links: LinkPageButton[]) => void;
  errors: ValidationErrors;
  readOnly: boolean;
}) {
  return (
    <fieldset className="repeatable">
      <legend>
        Botones{" "}
        <span className="optional-label">
          ({links.length}/{linkPageLimits.links})
        </span>
      </legend>
      {errors.links ? <p className="field-error">{errors.links}</p> : null}
      <ol className="repeatable-list">
        {links.map((link, index) => {
          const update = (patch: Loose<LinkPageButton>) =>
            onChange(replaceAt(links, index, merge(link, patch)));
          return (
            <li className="repeatable-item" key={link.id}>
              <div className="repeatable-item-header">
                <span className="repeatable-index">{index + 1}</span>
                <ItemControls
                  count={links.length}
                  index={index}
                  label={`botón ${index + 1}`}
                  minItems={0}
                  onMove={(from, to) => onChange(moveItem(links, from, to))}
                  onRemove={(at) =>
                    onChange(links.filter((_, position) => position !== at))
                  }
                  readOnly={readOnly}
                />
              </div>
              <div className="form-grid-2">
                <TextInput
                  error={errors[`links.${index}.label`]}
                  id={`linkpage-button-${link.id}-label`}
                  label="Texto del botón"
                  max={120}
                  onChange={(label) => update({ label })}
                  placeholder="Ej. Reserva una mesa"
                  readOnly={readOnly}
                  value={link.label}
                />
                <TextInput
                  error={errors[`links.${index}.url`]}
                  id={`linkpage-button-${link.id}-url`}
                  label="URL"
                  max={2048}
                  onChange={(url) => update({ url })}
                  placeholder="https://"
                  readOnly={readOnly}
                  type="url"
                  value={link.url}
                />
              </div>
              <label className="checkbox-row">
                <input
                  checked={Boolean(link.highlight)}
                  disabled={readOnly}
                  onChange={(event) =>
                    update({
                      highlight: event.target.checked ? true : undefined,
                    })
                  }
                  type="checkbox"
                />
                Destacar este botón
              </label>
            </li>
          );
        })}
      </ol>
      {!readOnly ? (
        <button
          className="button button-secondary button-small"
          disabled={links.length >= linkPageLimits.links}
          onClick={() =>
            onChange([...links, { id: newItemId(), label: "", url: "" }])
          }
          type="button"
        >
          <Icon name="plus" size={16} /> Añadir botón
        </button>
      ) : null}
    </fieldset>
  );
}
