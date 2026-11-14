import {
  type CreateStaffNotification,
  checkNotificationAudience,
  NOTIFICATION_LIMITS,
  type NotificationAudience,
  type NotificationBillingState,
  type NotificationCategory,
  normalizeNotificationActionUrl,
  type StaffNotification,
  type UpdateStaffNotification,
} from "@kardo/contracts";
import type { RoleValue } from "./format.js";

export type AudienceKind = NotificationAudience["kind"];
export type AccountType = "personal" | "business";

export type NotificationForm = {
  category: NotificationCategory;
  title: string;
  body: string;
  actionLabel: string;
  actionUrl: string;
  audienceKind: AudienceKind;
  planCodes: string[];
  billingStates: NotificationBillingState[];
  accountTypes: AccountType[];
  roles: RoleValue[];
  workspace: { id: string; name: string } | null;
  profile: { id: string; email: string } | null;
  pinned: boolean;
  publishMode: "now" | "later";
  /** `datetime-local` value (local time), empty when not set. */
  publishAt: string;
  expiresAt: string;
};

export type FormErrors = Partial<
  Record<
    "title" | "body" | "action" | "audience" | "publishAt" | "expiresAt",
    string
  >
>;

export function emptyForm(
  audienceKind: AudienceKind = "workspace",
): NotificationForm {
  return {
    category: "news",
    title: "",
    body: "",
    actionLabel: "",
    actionUrl: "",
    audienceKind,
    planCodes: [],
    billingStates: [],
    accountTypes: [],
    roles: [],
    workspace: null,
    profile: null,
    pinned: false,
    publishMode: "now",
    publishAt: "",
    expiresAt: "",
  };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** ISO instant to the `datetime-local` format, in the browser's time zone. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** `datetime-local` value to an ISO instant, or null if empty or invalid. */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Builds the audience the API expects from the form's current choices. */
export function buildAudience(form: NotificationForm): NotificationAudience {
  const roles = form.roles.length > 0 ? { roles: form.roles } : {};
  switch (form.audienceKind) {
    case "all":
      return { kind: "all", ...roles };
    case "segment":
      return {
        kind: "segment",
        ...(form.planCodes.length > 0 ? { planCodes: form.planCodes } : {}),
        ...(form.billingStates.length > 0
          ? { billingStates: form.billingStates }
          : {}),
        ...(form.accountTypes.length > 0
          ? { accountTypes: form.accountTypes }
          : {}),
        ...roles,
      };
    case "workspace":
      return {
        kind: "workspace",
        ...(form.workspace ? { workspaceId: form.workspace.id } : {}),
        ...roles,
      };
    case "profile":
      return {
        kind: "profile",
        ...(form.profile ? { profileId: form.profile.id } : {}),
      };
  }
}

export function audienceIssue(form: NotificationForm): string | null {
  if (form.audienceKind === "segment") {
    if (
      form.planCodes.length === 0 &&
      form.billingStates.length === 0 &&
      form.accountTypes.length === 0
    )
      return "Elige al menos un filtro: plan, estado de cobro o tipo de cuenta.";
  }
  if (form.audienceKind === "workspace" && !form.workspace)
    return "Busca y elige una organización.";
  if (form.audienceKind === "profile" && !form.profile)
    return "Busca y elige a una persona.";
  return checkNotificationAudience(buildAudience(form))
    ? "La audiencia no es válida. Revisa lo que elegiste."
    : null;
}

export const actionUrlError =
  "Escribe una ruta del panel, como /billing, o una dirección que empiece con https://.";

/** Error for the optional button, or null when it is empty or valid. */
export function actionIssue(label: string, url: string): string | null {
  const hasLabel = label.trim() !== "";
  const hasUrl = url.trim() !== "";
  if (!hasLabel && !hasUrl) return null;
  if (!hasLabel) return "Escribe el texto del botón.";
  if (!hasUrl) return "Escribe a dónde lleva el botón.";
  if (label.trim().length > NOTIFICATION_LIMITS.actionLabel)
    return `El texto del botón admite hasta ${NOTIFICATION_LIMITS.actionLabel} caracteres.`;
  return normalizeNotificationActionUrl(url) === null ? actionUrlError : null;
}

export function validateForm(
  form: NotificationForm,
  now: Date = new Date(),
  options: { withAudience?: boolean; withPublish?: boolean } = {},
): FormErrors {
  const { withAudience = true, withPublish = true } = options;
  const errors: FormErrors = {};
  if (form.title.trim() === "") errors.title = "Escribe un título.";
  else if (form.title.trim().length > NOTIFICATION_LIMITS.title)
    errors.title = `El título admite hasta ${NOTIFICATION_LIMITS.title} caracteres.`;
  if (form.body.trim() === "") errors.body = "Escribe el mensaje.";
  else if (form.body.length > NOTIFICATION_LIMITS.body)
    errors.body = `El mensaje admite hasta ${NOTIFICATION_LIMITS.body} caracteres.`;
  const action = actionIssue(form.actionLabel, form.actionUrl);
  if (action) errors.action = action;
  if (withAudience) {
    const audience = audienceIssue(form);
    if (audience) errors.audience = audience;
  }

  let start: Date | null = null;
  if (withPublish && form.publishMode === "later") {
    const iso = localInputToIso(form.publishAt);
    if (!iso) errors.publishAt = "Elige la fecha y la hora de publicación.";
    else {
      start = new Date(iso);
      if (start.getTime() <= now.getTime())
        errors.publishAt = "La fecha de publicación debe ser futura.";
    }
  }
  if (form.expiresAt) {
    const iso = localInputToIso(form.expiresAt);
    if (!iso) errors.expiresAt = "La fecha de caducidad no es válida.";
    else {
      const expires = new Date(iso);
      const floor = start ?? now;
      if (expires.getTime() <= floor.getTime())
        errors.expiresAt = start
          ? "Debe caducar después de publicarse."
          : "La fecha de caducidad debe ser futura.";
    }
  }
  return errors;
}

export function hasErrors(errors: FormErrors): boolean {
  return Object.keys(errors).length > 0;
}

function actionFrom(form: NotificationForm) {
  if (form.actionLabel.trim() === "" && form.actionUrl.trim() === "")
    return null;
  const url = normalizeNotificationActionUrl(form.actionUrl);
  return url ? { label: form.actionLabel.trim(), url } : null;
}

/** Form to the create body. Call `validateForm` first. */
export function toCreateBody(form: NotificationForm): CreateStaffNotification {
  const publishAt =
    form.publishMode === "later" ? localInputToIso(form.publishAt) : null;
  const expiresAt = localInputToIso(form.expiresAt);
  return {
    category: form.category,
    title: form.title.trim(),
    body: form.body.trim(),
    action: actionFrom(form),
    audience: buildAudience(form),
    pinned: form.pinned,
    ...(publishAt ? { publishAt } : {}),
    ...(expiresAt ? { expiresAt } : {}),
  };
}

/** Form values for editing an existing notification (audience is fixed). */
export function formFromNotification(
  notification: StaffNotification,
): NotificationForm {
  return {
    ...emptyForm(notification.audience.kind),
    category: notification.category,
    title: notification.title,
    body: notification.body,
    actionLabel: notification.action?.label ?? "",
    actionUrl: notification.action?.url ?? "",
    pinned: notification.pinned,
    publishMode: notification.state === "scheduled" ? "later" : "now",
    publishAt: isoToLocalInput(notification.publishAt),
    expiresAt: isoToLocalInput(notification.expiresAt),
  };
}

/** Only the fields that changed, so an untouched save never marks «Editada». */
export function toUpdateBody(
  form: NotificationForm,
  original: StaffNotification,
): UpdateStaffNotification {
  const body: UpdateStaffNotification = {};
  if (form.category !== original.category) body.category = form.category;
  if (form.title.trim() !== original.title) body.title = form.title.trim();
  if (form.body.trim() !== original.body) body.body = form.body.trim();
  const action = actionFrom(form);
  const before = original.action;
  if (action?.label !== before?.label || action?.url !== before?.url)
    body.action = action;
  if (form.pinned !== original.pinned) body.pinned = form.pinned;
  if (original.state === "scheduled") {
    const iso = localInputToIso(form.publishAt);
    // Compared at the input's minute precision, so an untouched date is not "changed".
    if (iso && form.publishAt !== isoToLocalInput(original.publishAt))
      body.publishAt = iso;
  }
  if (form.expiresAt !== isoToLocalInput(original.expiresAt))
    body.expiresAt = localInputToIso(form.expiresAt);
  return body;
}
