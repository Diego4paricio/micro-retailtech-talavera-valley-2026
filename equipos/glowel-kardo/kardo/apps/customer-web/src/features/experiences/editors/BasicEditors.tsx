import type { FormFieldSetting } from "@kardo/contracts";
import {
  AssetSelect,
  merge,
  TextInput,
} from "../../../components/FormFields.js";
import { Notice } from "../../../components/Notice.js";
import { useWorkspace } from "../../../workspace/WorkspaceContext.js";
import { type ContentOf, limits } from "../content.js";
import { PdfPagesField } from "../pdf/PdfPagesField.js";
import type { EditorProps } from "./fields.js";
import { LinkListEditor } from "./LinkListEditor.js";

export function RedirectEditor({
  content,
  onChange,
  errors,
  readOnly,
}: EditorProps<ContentOf<"redirect">>) {
  return (
    <TextInput
      error={errors.destinationUrl}
      hint="Quien toque o escanee irá directamente a esta dirección."
      id="redirect-url"
      label="URL de destino"
      max={2048}
      onChange={(destinationUrl) => onChange({ destinationUrl })}
      placeholder="https://tu-sitio.com/bienvenida"
      readOnly={readOnly}
      type="url"
      value={content.destinationUrl}
    />
  );
}

export function LinksEditor({
  content,
  onChange,
  errors,
  readOnly,
}: EditorProps<ContentOf<"links">>) {
  return (
    <>
      <TextInput
        error={errors.title}
        id="links-title"
        label="Título"
        max={limits.title}
        onChange={(title) => onChange({ ...content, title })}
        placeholder="Ej. Café Nube"
        readOnly={readOnly}
        value={content.title}
      />
      <TextInput
        error={errors.description}
        id="links-description"
        label="Descripción"
        max={limits.description}
        multiline
        onChange={(description) => onChange({ ...content, description })}
        optional
        readOnly={readOnly}
        value={content.description}
      />
      <LinkListEditor
        errors={errors}
        links={content.links}
        max={limits.links}
        minItems={1}
        onChange={(links) => onChange({ ...content, links })}
        readOnly={readOnly}
      />
    </>
  );
}

export function ProfileEditor({
  content,
  onChange,
  errors,
  assets,
  readOnly,
  onAssetUploaded,
}: EditorProps<ContentOf<"profile">>) {
  return (
    <>
      <TextInput
        error={errors.displayName}
        id="profile-name"
        label="Nombre visible"
        max={limits.title}
        onChange={(displayName) => onChange({ ...content, displayName })}
        placeholder="Ej. Ana Ruiz"
        readOnly={readOnly}
        value={content.displayName}
      />
      <TextInput
        error={errors.headline}
        id="profile-headline"
        label="Cargo o frase corta"
        max={limits.headline}
        onChange={(headline) => onChange({ ...content, headline })}
        optional
        placeholder="Ej. Fundadora · Café Nube"
        readOnly={readOnly}
        value={content.headline}
      />
      <TextInput
        error={errors.biography}
        id="profile-biography"
        label="Sobre mí"
        max={limits.biography}
        multiline
        onChange={(biography) => onChange({ ...content, biography })}
        optional
        readOnly={readOnly}
        value={content.biography}
      />
      <AssetSelect
        assets={assets}
        error={errors.avatarAssetId}
        id="profile-avatar"
        label="Foto o logo"
        kind="image"
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
      <LinkListEditor
        errors={errors}
        links={content.links}
        max={limits.profileLinks}
        minItems={0}
        onChange={(links) => onChange({ ...content, links })}
        readOnly={readOnly}
      />
    </>
  );
}

export function ImageEditor({
  content,
  onChange,
  errors,
  assets,
  readOnly,
  onAssetUploaded,
}: EditorProps<ContentOf<"image">>) {
  return (
    <>
      <AssetSelect
        assets={assets}
        error={errors.assetId}
        id="image-asset"
        label="Imagen"
        kind="image"
        onAssetUploaded={onAssetUploaded}
        onChange={(assetId) => onChange({ ...content, assetId })}
        readOnly={readOnly}
        value={content.assetId}
      />
      <TextInput
        error={errors.alt}
        hint="Describe la imagen para quien usa lector de pantalla."
        id="image-alt"
        label="Texto alternativo"
        max={limits.alt}
        onChange={(alt) => onChange({ ...content, alt })}
        placeholder="Ej. Carta de bebidas de otoño"
        readOnly={readOnly}
        value={content.alt}
      />
    </>
  );
}

export function DocumentEditor({
  content,
  onChange,
  errors,
  assets,
  readOnly,
  onAssetUploaded,
}: EditorProps<ContentOf<"document">>) {
  const isViewer = content.display === "viewer";
  const canOfferDownload = Boolean(content.assetId);
  const { workspace } = useWorkspace();
  return (
    <>
      <TextInput
        error={errors.title}
        id="document-title"
        label="Título"
        max={limits.title}
        onChange={(title) => onChange({ ...content, title })}
        placeholder="Ej. Catálogo 2026"
        readOnly={readOnly}
        value={content.title}
      />
      <TextInput
        error={errors.description}
        id="document-description"
        label="Descripción"
        max={limits.description}
        multiline
        onChange={(description) => onChange({ ...content, description })}
        optional
        readOnly={readOnly}
        value={content.description}
      />
      {isViewer ? (
        <>
          <PdfPagesField
            assetId={content.assetId || undefined}
            error={errors.pages ?? errors.assetId}
            id="document-pdf"
            label="Archivo PDF"
            onAssetUploaded={onAssetUploaded}
            onChange={(next) =>
              onChange(
                merge(content, {
                  assetId: next.assetId,
                  pages: next.pages,
                  // A PDF that just came back without an `assetId` (rejected
                  // or too big to upload) can't be offered for download any
                  // more, even if it could before this re-preparation.
                  allowDownload: next.assetId ? content.allowDownload : false,
                }),
              )
            }
            pages={content.pages}
            readOnly={readOnly}
            workspaceId={workspace.id}
          />
          <label className="pdf-allow-download">
            <input
              checked={canOfferDownload && (content.allowDownload ?? false)}
              disabled={readOnly || !canOfferDownload}
              onChange={(event) =>
                onChange({ ...content, allowDownload: event.target.checked })
              }
              type="checkbox"
            />
            <span>
              <strong>Permitir descargar el PDF</strong>
              <small>
                {canOfferDownload
                  ? "Además del visor, muestra un botón para descargar el archivo original."
                  : "Tu PDF no se puede ofrecer para descargar. Se verá en la página igual."}
              </small>
            </span>
          </label>
        </>
      ) : (
        <>
          <AssetSelect
            assets={assets}
            error={errors.assetId}
            id="document-asset"
            label="Documento PDF"
            kind="pdf"
            onAssetUploaded={onAssetUploaded}
            onChange={(assetId) => onChange({ ...content, assetId })}
            readOnly={readOnly}
            value={content.assetId}
          />
          {!readOnly ? (
            <>
              <Notice tone="info">
                Prepara las páginas para que tu PDF se vea en la página en lugar
                de descargarse.
              </Notice>
              <PdfPagesField
                assetId={undefined}
                id="document-pdf-convert"
                label="Preparar páginas"
                onAssetUploaded={onAssetUploaded}
                onChange={(next) =>
                  onChange(
                    merge(content, {
                      assetId: next.assetId,
                      display: "viewer",
                      pages: next.pages,
                    }),
                  )
                }
                pages={undefined}
                workspaceId={workspace.id}
              />
            </>
          ) : null}
        </>
      )}
    </>
  );
}

const fieldLabels = {
  name: "Nombre",
  phone: "Teléfono",
  message: "Mensaje",
} as const;

const settingLabels: Record<FormFieldSetting, string> = {
  hidden: "Oculto",
  optional: "Opcional",
  required: "Obligatorio",
};

export function FormEditor({
  content,
  onChange,
  errors,
  readOnly,
}: EditorProps<ContentOf<"form">>) {
  return (
    <>
      {/* First (relevo 37, S6a): Luis wanted «Edad» and «Nombre del alumno»
          and never found where the fields are set. */}
      <fieldset className="repeatable">
        <legend>Campos del formulario</legend>
        <p className="field-hint">El correo siempre se pide.</p>
        <div className="field-settings">
          <div className="field-setting">
            <span>Correo electrónico</span>
            <strong>Obligatorio</strong>
          </div>
          {(Object.keys(fieldLabels) as (keyof typeof fieldLabels)[]).map(
            (field) => (
              <div className="field-setting" key={field}>
                <label htmlFor={`form-field-${field}`}>
                  {fieldLabels[field]}
                </label>
                <select
                  disabled={readOnly}
                  id={`form-field-${field}`}
                  onChange={(event) =>
                    onChange({
                      ...content,
                      fields: {
                        ...content.fields,
                        [field]: event.target.value as FormFieldSetting,
                      },
                    })
                  }
                  value={content.fields[field]}
                >
                  {(Object.keys(settingLabels) as FormFieldSetting[]).map(
                    (setting) => (
                      <option key={setting} value={setting}>
                        {settingLabels[setting]}
                      </option>
                    ),
                  )}
                </select>
              </div>
            ),
          )}
        </div>
      </fieldset>
      <TextInput
        error={errors.title}
        id="form-title"
        label="Título"
        max={limits.title}
        onChange={(title) => onChange({ ...content, title })}
        placeholder="Ej. Déjanos tus datos"
        readOnly={readOnly}
        value={content.title}
      />
      <TextInput
        error={errors.description}
        id="form-description"
        label="Descripción"
        max={limits.description}
        multiline
        onChange={(description) => onChange({ ...content, description })}
        optional
        readOnly={readOnly}
        value={content.description}
      />
      <TextInput
        error={errors.submitLabel}
        id="form-submit"
        label="Texto del botón"
        max={limits.submitLabel}
        onChange={(submitLabel) => onChange({ ...content, submitLabel })}
        readOnly={readOnly}
        value={content.submitLabel}
      />
      <TextInput
        error={errors.successMessage}
        id="form-success"
        label="Mensaje de confirmación"
        max={limits.successMessage}
        onChange={(successMessage) => onChange({ ...content, successMessage })}
        readOnly={readOnly}
        value={content.successMessage}
      />
      <TextInput
        error={errors.consentText}
        hint="Aparece junto a la casilla que la persona debe marcar para enviar."
        id="form-consent"
        label="Texto de consentimiento"
        max={limits.consentText}
        multiline
        onChange={(consentText) => onChange({ ...content, consentText })}
        readOnly={readOnly}
        value={content.consentText}
      />
      <TextInput
        error={errors.privacyNoticeUrl}
        hint="Es tu responsabilidad informar a tus visitantes cómo usas sus datos. Si no tienes uno, te recomendamos crearlo."
        id="form-privacy-url"
        label="Enlace a tu aviso de privacidad"
        max={2048}
        onChange={(privacyNoticeUrl) =>
          onChange({ ...content, privacyNoticeUrl })
        }
        optional
        placeholder="https://tunegocio.com/privacidad"
        readOnly={readOnly}
        type="url"
        value={content.privacyNoticeUrl}
      />
    </>
  );
}
