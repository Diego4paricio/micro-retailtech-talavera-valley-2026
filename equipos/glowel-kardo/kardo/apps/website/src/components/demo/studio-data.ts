import type { PageContent } from "../kardo-page/KardoPage";
import type { PresetName } from "../kardo-page/theme";
import {
  type Channel,
  type OtherPoint,
  type PhoneCopy,
  socialAd,
  type Version,
} from "./demo-data";

/*
  Example data for Estudio Noa, a salon with the plate at its reception
  (NFC and QR) and an ad in social networks, its own "Otro" Touchpoint.
  Both open a Página de enlaces or a Formulario de contacto; the panel
  switches between them and publishes to both.
  A form sent from the phone lands in the panel's Leads with the visitor's
  consent. Leads are read in the panel and exported to CSV, nothing else.
  Limits and field rules follow packages/contracts (LinkItemSchema,
  FormExperienceContentSchema) and the Resolver's renderForm().
*/

export type FieldSetting = "hidden" | "optional" | "required";
export type Opens = "links" | "form";

export interface StudioLink {
  id: string;
  label: string;
  /** https only, no credentials (SafeUrlSchema). */
  url: string;
}

export interface FormSettings {
  title: string;
  description: string;
  name: FieldSetting;
  phone: FieldSetting;
  message: FieldSetting;
  submitLabel: string;
  successMessage: string;
  consentText: string;
}

export interface StudioState {
  opens: Opens;
  themeName: PresetName;
  links: StudioLink[];
  form: FormSettings;
}

export type LeadStatus = "new" | "contacted" | "closed";

export interface Lead {
  id: string;
  /** The Touchpoint whose page the form was sent from. */
  touchpoint: string;
  name: string | null;
  email: string;
  phone: string | null;
  message: string | null;
  /** How the panel prints the date. */
  when: string;
  /** Age in hours, to date the CSV rows. */
  hoursAgo: number;
  status: LeadStatus;
}

export const leadStatusLabels: Record<LeadStatus, string> = {
  new: "Nueva",
  contacted: "Atendida",
  closed: "Cerrada",
};

/** Same limits as the contracts. */
export const limits = {
  label: 120,
  url: 2048,
  links: 12,
  submitLabel: 40,
  successMessage: 200,
  consentText: 300,
} as const;

const whatsapp: StudioLink = {
  id: "whatsapp",
  label: "Escríbenos por WhatsApp",
  url: "https://wa.me/522220000001",
};
const reviews: StudioLink = {
  id: "resenas",
  label: "Reseñas en Google",
  url: "https://g.page/r/estudionoa/review",
};
const directions: StudioLink = {
  id: "llegar",
  label: "Cómo llegar",
  url: "https://maps.google.com/?q=Estudio+Noa+Puebla",
};

const form: FormSettings = {
  title: "Estudio Noa",
  description: "Déjanos tus datos y te contamos de nuestros servicios.",
  name: "required",
  phone: "optional",
  message: "optional",
  submitLabel: "Enviar",
  successMessage: "Gracias. Te escribimos pronto.",
  consentText: "Acepto que Estudio Noa me contacte con estos datos.",
};

export interface StudioBusiness {
  id: "estudio";
  name: string;
  touchpoint: { name: string; summary: string };
  ad: OtherPoint;
  linksPage: { title: string; description: string };
  themeChoices: PresetName[];
  /** Newest first, like the panel's history. */
  versions: Version<StudioState>[];
  leads: Lead[];
  /** Visits today: NFC and QR on the plate, URL directa on the ad. */
  visits: Record<Channel, number>;
  phone: PhoneCopy;
  /** Sample values for the phone's "fill it for me" button. */
  sampleVisitor: {
    email: string;
    name: string;
    phone: string;
    message: string;
  };
}

export const studio: StudioBusiness = {
  id: "estudio",
  name: "Estudio Noa",
  touchpoint: { name: "Recepción", summary: "Placa con NFC y QR" },
  ad: socialAd,
  linksPage: {
    title: "Estudio Noa",
    description: "Uñas y pestañas en Puebla.",
  },
  themeChoices: [
    "Bosque nocturno",
    "Kardo claro",
    "Tinta profunda",
    "Aqua degradado",
  ],
  versions: [
    {
      number: 3,
      label: "La placa abre el formulario",
      when: "Hace 3 días",
      state: {
        opens: "form",
        themeName: "Bosque nocturno",
        links: [whatsapp, reviews, directions],
        form,
      },
    },
    {
      number: 2,
      label: "Botón de reseñas",
      when: "Hace 2 semanas",
      state: {
        opens: "links",
        themeName: "Bosque nocturno",
        links: [whatsapp, reviews, directions],
        form,
      },
    },
    {
      number: 1,
      label: "Primera versión",
      when: "Hace 5 semanas",
      state: {
        opens: "links",
        themeName: "Bosque nocturno",
        links: [whatsapp, directions],
        form,
      },
    },
  ],
  leads: [
    {
      id: "lead-2",
      touchpoint: "Recepción",
      name: "Mariana López",
      email: "mariana.lopez@example.com",
      phone: "222 000 0101",
      message: "¿Qué diseños de uñas tienen para boda?",
      when: "Ayer, 18:20",
      hoursAgo: 20,
      status: "contacted",
    },
    {
      id: "lead-1",
      touchpoint: "Recepción",
      name: "Daniela Ortiz",
      email: "dani.ortiz@example.com",
      phone: null,
      message: "Quiero saber el precio del lifting de pestañas.",
      when: "Hace 2 días",
      hoursAgo: 50,
      status: "new",
    },
  ],
  visits: { nfc: 9, qr: 5, link: 2 },
  phone: {
    place: "a la placa de recepción",
    from: "desde la placa de recepción",
    samePage: "La placa y el anuncio muestran la misma página.",
    qrCaption: "Escanea o acerca tu celular",
    ad: { tagline: "Uñas y pestañas en Puebla.", button: "Ver más" },
    idle: "La placa de recepción tiene NFC y QR. El anuncio es otro punto, con su propia dirección.",
  },
  sampleVisitor: {
    email: "sofia.reyes@example.com",
    name: "Sofía Reyes",
    phone: "222 000 0202",
    message: "¿Tienen lifting de pestañas?",
  },
};

export interface FormControl {
  name: "email" | "name" | "phone" | "message";
  label: string;
  type: "email" | "text" | "tel" | "textarea";
  required: boolean;
  maxLength: number;
}

/**
 * The controls the Resolver's renderForm() draws, in its order: the email
 * always, required; name, phone and message as the panel sets them.
 */
export function formControls(
  settings: Pick<FormSettings, "name" | "phone" | "message">,
): FormControl[] {
  const field = (
    setting: FieldSetting,
    control: Omit<FormControl, "required">,
  ): FormControl[] =>
    setting === "hidden"
      ? []
      : [{ ...control, required: setting === "required" }];
  return [
    {
      name: "email",
      label: "Correo electrónico",
      type: "email",
      required: true,
      maxLength: 320,
    },
    ...field(settings.name, {
      name: "name",
      label: "Nombre",
      type: "text",
      maxLength: 120,
    }),
    ...field(settings.phone, {
      name: "phone",
      label: "Teléfono",
      type: "tel",
      maxLength: 40,
    }),
    ...field(settings.message, {
      name: "message",
      label: "Mensaje",
      type: "textarea",
      maxLength: 2000,
    }),
  ];
}

/** Like SafeUrlSchema and the servers: https, parseable, no credentials. */
export function isHttpsUrl(value: string): boolean {
  if (!value.startsWith("https://") || value.length > limits.url) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Why a draft cannot be published yet, per field id. */
export function studioErrors(state: StudioState): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const link of state.links) {
    const label = link.label.trim();
    if (!label || label.length > limits.label)
      errors[`label-${link.id}`] = "Escribe el texto del botón.";
    if (!isHttpsUrl(link.url.trim()))
      errors[`url-${link.id}`] =
        "Usa una dirección completa que empiece con https://.";
  }
  const texts = [
    ["submitLabel", "Escribe el texto del botón."],
    ["successMessage", "Escribe el mensaje de confirmación."],
    ["consentText", "Escribe el texto de consentimiento."],
  ] as const;
  for (const [key, message] of texts)
    if (!state.form[key].trim()) errors[key] = message;
  return errors;
}

/** The page the plate opens: a Página de enlaces or a Formulario. */
export function buildStudioPage(state: StudioState): PageContent {
  if (state.opens === "links")
    return {
      type: "links",
      title: studio.linksPage.title,
      description: studio.linksPage.description,
      links: state.links.map((link) => link.label),
    };
  return {
    type: "form",
    title: state.form.title,
    description: state.form.description,
    name: state.form.name,
    phone: state.form.phone,
    message: state.form.message,
    consentText: state.form.consentText,
    submitLabel: state.form.submitLabel,
  };
}

/** Human summary of what a publication changes, for the version list. */
export function describeStudioChanges(
  from: StudioState,
  to: StudioState,
): string[] {
  const changes: string[] = [];
  if (from.opens !== to.opens)
    changes.push(
      to.opens === "form"
        ? "La placa abre el formulario"
        : "La placa abre la página de enlaces",
    );
  if (from.themeName !== to.themeName) changes.push(`Tema ${to.themeName}`);
  if (JSON.stringify(from.links) !== JSON.stringify(to.links))
    changes.push("Botones de la página de enlaces");
  const fields = (state: StudioState) =>
    `${state.form.name}|${state.form.phone}|${state.form.message}`;
  if (fields(from) !== fields(to)) changes.push("Campos del formulario");
  const texts = (state: StudioState) =>
    [
      state.form.title,
      state.form.description,
      state.form.submitLabel,
      state.form.successMessage,
      state.form.consentText,
    ].join("|");
  if (texts(from) !== texts(to)) changes.push("Textos del formulario");
  return changes;
}

/* The panel's CSV export (services/customer-api csv.ts and the leads route):
   same columns, UTF-8 BOM, CRLF, and a leading ' before anything a
   spreadsheet would run as a formula. */

const formulaStart = /^[=+\-@\t\r]/;
/** The UTF-8 byte order mark Excel needs to read the accents. */
const bom = String.fromCharCode(0xfeff);

export function csvField(value: string): string {
  const guarded = formulaStart.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(guarded)
    ? `"${guarded.replaceAll('"', '""')}"`
    : guarded;
}

export function leadsCsv(leads: readonly Lead[], now: Date): string {
  const header = [
    "fecha",
    "touchpoint",
    "nombre",
    "email",
    "telefono",
    "mensaje",
  ];
  const rows = leads.map((lead) => [
    new Date(now.getTime() - lead.hoursAgo * 3_600_000).toISOString(),
    lead.touchpoint,
    lead.name ?? "",
    lead.email,
    lead.phone ?? "",
    lead.message ?? "",
  ]);
  const lines = [header, ...rows].map((row) => row.map(csvField).join(","));
  return `${bom}${lines.join("\r\n")}\r\n`;
}
