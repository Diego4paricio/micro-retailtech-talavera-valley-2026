import type { DesignBlock, PageDesign } from "@kardo/contracts";
import { blockStyleAttr } from "../block-style.js";
import { pick } from "../css.js";
import { escapeHtml } from "../escape.js";
import type {
  DesignableContent,
  DesignableFormField,
  RenderContext,
} from "../types.js";
import { safeHref } from "../url-safety.js";
import { dataId, pageRadius, pageShadow } from "./shared.js";

// ---------------------------------------------------------------------------
// Formulario bound block (`leadForm`, ADR 018 addendum 3): the same fields,
// names and validations as the Resolver's non-designed `renderForm`
// (services/resolver/src/render.ts), so a designed lead form posts and
// validates identically. Fields, consent and the privacy notice always come
// from the Experience's own content — this block only chooses the look.
// `contentTitle` renders the title/description separately.
// ---------------------------------------------------------------------------

type LeadFormBlock = Extract<DesignBlock, { kind: "leadForm" }>;

const formLooks = {
  boxed: "boxed",
  card: "card",
  underline: "underline",
} as const;
const buttonWidths = { full: "full", auto: "auto" } as const;

function fieldHtml(
  setting: DesignableFormField,
  label: string,
  name: string,
  tag: "input" | "textarea",
  type?: "text" | "tel",
): string {
  if (setting === "hidden") return "";
  const required = setting === "required" ? " required" : "";
  const suffix = setting === "required" ? "" : " (opcional)";
  const control =
    tag === "textarea"
      ? `<textarea class="kd-form-textarea" name="${name}" maxlength="2000"${required}></textarea>`
      : `<input class="kd-form-input" type="${type}" name="${name}" maxlength="${type === "tel" ? 40 : 120}"${required}>`;
  return `<label class="kd-form-field"><span class="kd-form-label">${escapeHtml(label)}${suffix}</span>${control}</label>`;
}

export function renderLeadFormBlock(
  block: LeadFormBlock,
  content: DesignableContent,
  ctx: RenderContext,
): string {
  if (content.type !== "form") return "";
  const look = pick(block.look, formLooks, formLooks.boxed);
  const width = pick(block.buttonWidth, buttonWidths, buttonWidths.full);
  // No `ctx.formAction` (the panel's preview) omits `action`: the form still
  // renders, it just does not submit anywhere.
  const actionAttr = ctx.formAction
    ? ` action="${escapeHtml(ctx.formAction)}"`
    : "";
  const privacyHref = content.privacyNoticeUrl
    ? safeHref(content.privacyNoticeUrl, "https")
    : null;
  const turnstile = ctx.turnstileSiteKey
    ? `<div class="cf-turnstile" data-sitekey="${escapeHtml(ctx.turnstileSiteKey)}"></div>`
    : "";
  return `<form${dataId(block.id)} class="kd-form kd-form--${look}" method="post"${actionAttr}${blockStyleAttr(block.style, ctx.px)}><label class="kd-form-field"><span class="kd-form-label">Correo electrónico</span><input class="kd-form-input" type="email" name="email" maxlength="320" required></label>${fieldHtml(content.fields.name, "Nombre", "name", "input", "text")}${fieldHtml(content.fields.phone, "Teléfono", "phone", "input", "tel")}${fieldHtml(content.fields.message, "Mensaje", "message", "textarea")}<label class="kd-hp" aria-hidden="true">No completar este campo<input type="text" name="website" tabindex="-1" autocomplete="off"></label><label class="kd-form-consent"><input type="checkbox" name="consent" value="yes" required><span>${escapeHtml(content.consentText)}</span></label>${privacyHref ? `<p class="kd-form-consent-notice"><a href="${escapeHtml(privacyHref)}" target="_blank" rel="noopener noreferrer">Aviso de privacidad</a></p>` : ""}${turnstile}<button class="kd-btn kd-btn--primary kd-form-submit${width === "auto" ? " kd-form-submit--auto" : ""}" type="submit">${escapeHtml(content.submitLabel)}</button></form>`;
}

/** The submit button reuses the page's own `.kd-btn`/`.kd-btn--primary`
 * classes (defined by render.ts's `pageCss`), so it always matches every
 * other button on the page for free — this only styles the fields. */
export function formCss(design: PageDesign): string {
  const radius = Math.min(pageRadius(design), 14);
  const shadow = pageShadow(design);
  return `
.kd-form{display:flex;flex-direction:column;gap:14px;width:100%}
.kd-form-field{display:flex;flex-direction:column;gap:6px;font-size:.85rem;font-weight:600;color:var(--kd-text)}
.kd-form-input,.kd-form-textarea{font:inherit;font-weight:400;padding:11px 12px;background:var(--kd-surface);color:var(--kd-text);border:1px solid transparent;border-radius:${radius}px}
.kd-form-textarea{resize:vertical;min-height:88px}
.kd-form--boxed .kd-form-input,.kd-form--boxed .kd-form-textarea{border-color:color-mix(in srgb, var(--kd-text) 18%, transparent)}
.kd-form--card .kd-form-input,.kd-form--card .kd-form-textarea{border-color:transparent;box-shadow:${shadow}}
.kd-form--underline .kd-form-input,.kd-form--underline .kd-form-textarea{border:none;border-bottom:2px solid color-mix(in srgb, var(--kd-text) 20%, transparent);border-radius:0;padding-left:2px;padding-right:2px}
.kd-hp{position:absolute;opacity:0;height:0;width:0;overflow:hidden;pointer-events:none}
.kd-form-consent{display:flex;flex-direction:row;align-items:flex-start;gap:8px;font-weight:400;font-size:.85rem;color:var(--kd-muted)}
.kd-form-consent input{margin-top:3px}
.kd-form-consent-notice{margin:-6px 0 0 26px;font-size:.85rem}
.kd-form-consent-notice a{color:var(--kd-accent);text-decoration:underline}
.kd-form-submit--auto{width:auto;align-self:flex-start}
`;
}
