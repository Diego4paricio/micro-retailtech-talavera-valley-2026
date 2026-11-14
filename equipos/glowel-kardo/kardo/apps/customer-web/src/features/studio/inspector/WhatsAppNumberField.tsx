import { useState } from "react";
import { Segmented } from "../../../components/controls/index.js";
import { Icon } from "../../../components/Icon.js";
import { useToast } from "../../../components/Toast.js";
import { useWorkspace } from "../../../workspace/WorkspaceContext.js";
import { saveWorkspaceProfile } from "../../business-profile/profile-store.js";
import { phoneForProfile } from "../../profile-fields/phone.js";
import { buildWhatsAppLink, parseWhatsAppLink } from "../model/brand-links.js";
import { whatsappNumberLabel } from "../model/business-contact.js";
import { useOrganizationBrand } from "../use-organization-brand.js";
import { FieldIssue, TextField } from "./controls.js";

/**
 * A WhatsApp button's link, asked as what the owner has at hand: the phone
 * number (and an optional message), never a `wa.me` URL. When the business
 * has a phone in Configuración, "Usar el WhatsApp de tu negocio" goes first
 * (relevo 37, S7: Ricardo found it hidden below the number field and typed
 * his own number again). An empty number is a pending item: the Estudio
 * does not save or publish without it (owner's decision, 2026-10-03). With
 * no business number yet, typing one here also offers to save it there
 * (C5e), so the next empty WhatsApp button starts already filled.
 */
export function WhatsAppNumberField({
  id,
  href,
  error,
  onChange,
}: {
  id: string;
  href: string;
  error?: string | undefined;
  onChange: (href: string) => void;
}) {
  const organization = useOrganizationBrand();
  const businessUrl = organization.brand?.whatsappUrl;
  const { workspace, can } = useWorkspace();
  const { notify } = useToast();
  const [saving, setSaving] = useState(false);
  const { phone, message = "" } = parseWhatsAppLink(href);
  const isBusiness = businessUrl !== undefined && href.startsWith(businessUrl);
  // Only a complete Mexican number ("52" + 10 digits, this field's own
  // assumption — see the hint below): the business profile keeps the
  // national number on its own, without the country code.
  // Only once the profile is loaded (never a save over a profile we could
  // not read), only for someone who may change the business's data (an
  // Editor got a 403 here, domain audit A2-7), and only when the business
  // is Mexican or has no country yet.
  const profile = organization.profile;
  const canOfferSave =
    profile !== null &&
    can("workspace.manage") &&
    (!profile.country || profile.country === "MX") &&
    !businessUrl &&
    !isBusiness &&
    /^52\d{10}$/.test(phone);

  async function saveToBusiness() {
    if (saving || !profile) return;
    setSaving(true);
    try {
      // Only the phone (and the country when there is none): never the
      // whole profile, which could erase what another screen saved (A2-1).
      await saveWorkspaceProfile(workspace.id, {
        phone: phoneForProfile(phone.slice(2), "MX"),
        ...(profile.country ? {} : { country: "MX" }),
      });
      notify("Guardamos tu WhatsApp como el de tu negocio.", "success");
    } catch {
      notify("No pudimos guardar tu WhatsApp. Intenta otra vez.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="qrs-control">
        <div className="qrs-control-head">
          <label className="qrs-control-label" htmlFor={id}>
            Número de WhatsApp
          </label>
        </div>
        {businessUrl && !isBusiness ? (
          <button
            className="link-button es-whatsapp-business"
            onClick={() =>
              onChange(
                message.trim()
                  ? `${businessUrl}?text=${encodeURIComponent(message.trim())}`
                  : businessUrl,
              )
            }
            type="button"
          >
            <Icon name="phone" size={14} />
            Usar el WhatsApp de tu negocio ({whatsappNumberLabel(businessUrl)})
          </button>
        ) : null}
        <input
          aria-describedby={error ? `${id}-error` : `${id}-hint`}
          aria-invalid={Boolean(error) || undefined}
          autoComplete="off"
          className="input"
          id={id}
          inputMode="tel"
          onChange={(event) =>
            onChange(buildWhatsAppLink({ phone: event.target.value, message }))
          }
          placeholder="33 1234 5678"
          type="tel"
          value={phone.startsWith("52") ? phone.slice(2) : phone}
        />
        <div id={`${id}-error`}>
          <FieldIssue message={error} />
        </div>
        {canOfferSave ? (
          <button
            className="link-button es-whatsapp-save"
            disabled={saving}
            onClick={() => void saveToBusiness()}
            type="button"
          >
            <Icon name="save" size={14} />
            {saving ? "Guardando…" : "Guardar también en tu negocio"}
          </button>
        ) : null}
        {!error ? (
          <p className="qrs-hint" id={`${id}-hint`}>
            {businessUrl
              ? "Usa México (+52) si no escribes otro código de país."
              : "Usa México (+52) si no escribes otro código de país. Ponlo también en Configuración y las plantillas lo usarán solas."}
          </p>
        ) : null}
      </div>
      <div className="qrs-control">
        <div className="qrs-control-head">
          <label className="qrs-control-label" htmlFor={`${id}-message`}>
            Mensaje sugerido
            <span className="es-optional"> (opcional)</span>
          </label>
        </div>
        <input
          className="input"
          id={`${id}-message`}
          onChange={(event) =>
            onChange(buildWhatsAppLink({ phone, message: event.target.value }))
          }
          placeholder="Hola, quiero más información"
          type="text"
          value={message}
        />
        <p className="qrs-hint">
          Aparece ya escrito cuando abren la conversación.
        </p>
      </div>
    </>
  );
}

/**
 * A plain button's destination: a web page, or a WhatsApp chat asked by
 * its number. A template's WhatsApp button opens on «WhatsApp».
 */
export function ButtonHrefField({
  id,
  href,
  startsAsWhatsApp,
  error,
  onChange,
}: {
  id: string;
  href: string;
  startsAsWhatsApp: boolean;
  error?: string | undefined;
  onChange: (href: string) => void;
}) {
  const [target, setTarget] = useState<"web" | "whatsapp">(
    startsAsWhatsApp ? "whatsapp" : "web",
  );
  return (
    <>
      <Segmented
        fill
        label="Lleva a"
        onChange={setTarget}
        options={[
          { value: "web", label: "Una página" },
          { value: "whatsapp", label: "WhatsApp" },
        ]}
        value={target}
      />
      {target === "whatsapp" ? (
        <WhatsAppNumberField
          error={error}
          href={href}
          id={id}
          onChange={onChange}
        />
      ) : (
        <TextField
          error={error}
          hint="Los clics se cuentan en tu analítica, como los de tus enlaces."
          id={id}
          label="A dónde lleva"
          max={2048}
          onChange={onChange}
          placeholder="https://"
          type="url"
          value={href}
        />
      )}
    </>
  );
}
