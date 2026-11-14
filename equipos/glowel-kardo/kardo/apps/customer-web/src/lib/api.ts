import { customerApiUrl, supabase } from "../supabase.js";
import { demoRequest, isDemoMode } from "./demo.js";
import { notifyPlanLimit, notifyPlanRequired } from "./plan-required.js";
import { requestSecondFactor } from "./second-factor.js";

/** A failed Customer API call. `message` is always safe, customer-facing Spanish. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
    readonly requestId: string | null = null,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string> | undefined;
  signal?: AbortSignal | undefined;
  /** Return the raw response body as text (CSV exports). */
  responseType?: "json" | "text" | "blob" | undefined;
};

const messagesByCode: Record<string, string> = {
  AUTH_REQUIRED: "Tu sesión expiró. Vuelve a iniciar sesión.",
  MFA_REQUIRED: "Confirma el código de tu app de autenticación para continuar.",
  REAUTHENTICATION_REQUIRED:
    "Por seguridad, confirma que eres tú otra vez antes de borrar tu cuenta.",
  ACCOUNT_DELETION_BLOCKED:
    "Antes de borrar tu cuenta hay algo que resolver. Revisa la lista.",
  PLAN_SELECTION_OVER_LIMIT:
    "Elegiste más de lo que incluye tu plan. Quita algunos y vuelve a guardar.",
  WORKSPACE_ACCESS_DENIED:
    "Tu rol en este espacio no permite realizar esta acción.",
  INVALID_REDIRECT_DESTINATION:
    "La URL debe empezar con https:// y no puede incluir usuario ni contraseña.",
  INVALID_EXPERIENCE_CONTENT:
    "Revisa el contenido: hay campos incompletos o con un formato no permitido.",
  ASSET_STORAGE_UNAVAILABLE:
    "El almacenamiento de archivos no está disponible en este momento.",
  TOUCHPOINT_AVAILABILITY_UNAVAILABLE:
    "No pudimos actualizar el acceso público del QR o etiqueta. Intenta de nuevo.",
  STORAGE_UNAVAILABLE:
    "El servicio no está disponible en este momento. Intenta de nuevo en unos minutos.",
  RATE_LIMITED: "Hiciste demasiadas solicitudes. Espera un momento.",
  NOT_FOUND: "No encontramos este elemento en tu espacio.",
  CONFLICT:
    "El estado cambió mientras trabajabas. Actualiza e intenta de nuevo.",
  INVITATION_INVALID:
    "La invitación no es válida, expiró o pertenece a otro correo.",
  LAST_OWNER: "El espacio necesita al menos una persona con rol de Owner.",
  ORGANIZATION_LIMIT:
    "Tu plan ya no tiene lugar para otra organización. Sube de plan o agrega una organización extra.",
  BILLING_PAYMENT_FAILED:
    "No pudimos cobrar con tu tarjeta. No cambió nada. Revisa tu forma de pago.",
  EXTRAS_NEED_PLAN: "Elige un plan para agregar extras.",
  PLAN_SELECTION_ORGANIZATIONS_REQUIRED:
    "Elige qué organizaciones siguen en tu plan.",
  PLAN_LIMIT:
    "Llegaste al límite de tu plan. Cambia de plan en Configuración, Plan, para seguir.",
  PLAN_REQUIRED:
    "Esta organización no tiene un plan. Elige uno para seguir editando.",
  BILLING_UNAVAILABLE:
    "La facturación no está disponible en este momento. Intenta de nuevo en unos minutos.",
  BILLING_CONFLICT:
    "Ya hay una suscripción en curso para esta organización. Actualiza la página para verla.",
  GROUP_NAME_TAKEN: "Ya existe un grupo con ese nombre en ese mismo lugar.",
  GROUP_CHILD_NAME_TAKEN:
    "Un subgrupo se llama igual que otro grupo del nivel de arriba. Renómbralo antes de eliminar este grupo.",
  GROUP_TOO_DEEP: "Los grupos pueden anidarse hasta 4 niveles.",
  GROUP_CYCLE:
    "Un grupo no puede ir dentro de sí mismo ni de uno de sus subgrupos.",
  TARGETS_REQUIRED:
    "Elige al menos un QR o etiqueta o grupo donde publicar esta página.",
  ORGANIZATION_REQUIRED:
    "Las invitaciones solo están disponibles en espacios de organización.",
  EXPERIENCE_LIVE:
    "Algún QR o etiqueta se quedaría sin nada que mostrar. Publica otra página en esos QR y etiquetas o retíralos.",
  TARGET_STILL_LIVE:
    "Ese QR o link solo muestra esta página. Para quitarla de ahí, publica otra página en ese lugar.",
  ASSET_IN_USE:
    "Este archivo lo usa alguna página. Quítalo de ahí antes de eliminarlo.",
  TARGETS_OVERRIDDEN:
    "Todos los QR y etiquetas elegidos ya muestran otra página asignada directamente: no se publicó nada.",
  REPLACE_NOT_CONFIRMED:
    "Esos QR, etiquetas o links ya muestran otra página y no elegiste reemplazarla: no se publicó nada.",
  OWNER_MUST_TRANSFER:
    "Transfiere la propiedad a otro miembro antes de salir de la organización.",
  HANDLE_TAKEN: "Ese nombre de usuario ya está en uso. Elige otro.",
  HANDLE_RESERVED: "Ese nombre de usuario está reservado. Elige otro.",
  INVALID_TOUCHPOINT_KIND: "Esa acción no aplica a este tipo de QR o etiqueta.",
  TARGETS_INVALID_PRODUCT:
    "Las páginas de enlaces solo van en Links; las demás páginas van en QR y etiquetas físicos.",
  INVALID_WORKSPACE_PROFILE: "Revisa los datos de la organización.",
  INVALID_QR_DESIGN: "Revisa el diseño: algún valor no es válido.",
  TOUCHPOINT_NOT_QR: "Solo un QR, o el QR de respaldo de un NFC, lleva diseño.",
  QR_TEMPLATE_LIMIT:
    "Tu biblioteca ya tiene 50 diseños, el máximo. Borra uno para guardar otro.",
  QR_TEMPLATE_IN_USE:
    "Este diseño todavía lo usan QR y etiquetas o grupos. Aplícales otro antes de borrarlo.",
  HELP_ASSISTANT_UNAVAILABLE:
    "El asistente no está disponible ahora. Consulta la guía de esta sección.",
  ITEM_AVAILABILITY_UNAVAILABLE:
    "No pudimos confirmar el cambio en tu página pública, así que no se aplicó. Intenta de nuevo.",
  AVAILABILITY_NOT_SUPPORTED:
    "La disponibilidad solo aplica a Menús y Catálogos.",
  EXPERIENCE_ARCHIVED:
    "Esta página está archivada. Restáurala para cambiar su disponibilidad.",
  UNKNOWN_AVAILABILITY_ITEM:
    "Algunos artículos ya no están en esta página. Actualiza la vista e intenta de nuevo.",
  // Domain audit 2026-10-13 (kardo-a2).
  EXPERIENCE_CHANGED:
    "Alguien más guardó cambios en esta página. Recarga para ver la versión más reciente.",
  ALREADY_MEMBER: "Esa persona ya es parte del equipo.",
  INVALID_WEBHOOK_URL:
    "La URL del webhook debe empezar con https:// y ser de un servidor público.",
  INVALID_LEAD_DELIVERY_SETTINGS:
    "Revisa a quién avisamos: solo pueden ser personas de tu equipo.",
  WEBHOOK_UNAVAILABLE:
    "El webhook no está disponible en este momento. Intenta de nuevo más tarde.",
  // Domain audit 2026-10-13 (kardo-a9, A9-11).
  TOUCHPOINT_SUSPENDED:
    "Kardo pausó este QR. Escríbenos si crees que es un error.",
  TOUCHPOINT_PLAN_EXCLUDED:
    "Este QR quedó fuera de tu plan. Actívalo en Plan y facturación.",
  // Piezas de Kardo (ADR 026).
  PIECE_CODE_INVALID:
    "Ese código no abre ninguna pieza. Revísalo letra por letra: viene en la tarjeta de activación de tu pedido y atrás de cada pieza.",
  PIECE_CODE_USED:
    "Ya activaste las piezas de este código. Las encuentras en QR y etiquetas.",
  PIECE_CODE_RATE_LIMITED:
    "Probaste muchos códigos seguidos. Espera una hora y vuelve a intentarlo, o escríbenos.",
  PIECE_NOT_CLAIMABLE:
    "Alguna de esas piezas ya se activó. Revisa el código otra vez para ver las que quedan.",
  PIECE_KIND_FIXED:
    "Una pieza de Kardo ya trae su QR y su NFC: no cambia de formato.",
};

/**
 * `403 PLAN_LIMIT` names the limit it hit (domain audit A2-60): each one
 * says what ran out and, for QR y etiquetas and Links, that an extra adds
 * room without changing plan (ADR 024).
 */
const planLimitMessages: Record<string, string> = {
  "touchpoints.max":
    "Llegaste al tope de QR y etiquetas de tu plan. Agrega 10 más como extra o cambia de plan, en Configuración → Plan y facturación.",
  "links.max":
    "Llegaste al tope de links de tu plan. Agrega 5 más como extra o cambia de plan, en Configuración → Plan y facturación.",
  "members.max":
    "Tu plan ya no tiene lugar para otra persona en el equipo. Cambia de plan en Configuración → Plan y facturación.",
  "qr_designs.max":
    "Tu plan ya no tiene lugar para otro diseño de QR. Borra uno o cambia de plan.",
  "assets.storage_mb":
    "Se llenó el espacio para archivos de tu plan. Borra archivos que ya no uses o cambia de plan.",
  "ai.generations_month":
    "Ya usaste los diseños con IA de este mes (son de tu cuenta, para todas tus organizaciones).",
  "ai.spend_cents_month":
    "Ya se usó la IA incluida este mes en tu cuenta. Vuelve el próximo mes o cambia de plan.",
  "custom_html.enabled": "Tu plan no incluye el modo HTML del Estudio.",
  "leads.export": "Tu plan no incluye exportar solicitudes.",
  "leads.webhook": "Tu plan no incluye enviar solicitudes por webhook.",
};

export function planLimitMessage(key: string | null | undefined): string {
  return (
    (key ? planLimitMessages[key] : undefined) ??
    messagesByCode.PLAN_LIMIT ??
    ""
  );
}

// These codes carry a dynamic, already customer-safe message from the server
// (e.g. naming the specific Experiences involved): prefer it over the static
// dictionary above, which only covers the generic case.
const dynamicMessageCodes = new Set([
  "EXPERIENCE_LIVE",
  "TARGET_STILL_LIVE",
  "ASSET_IN_USE",
  "TARGETS_OVERRIDDEN",
  "OWNER_MUST_TRANSFER",
  "HANDLE_TAKEN",
  "HANDLE_RESERVED",
  "INVALID_TOUCHPOINT_KIND",
  "TARGETS_INVALID_PRODUCT",
  "INVALID_WORKSPACE_PROFILE",
  "INVALID_QR_DESIGN",
  "QR_TEMPLATE_LIMIT",
  "QR_TEMPLATE_IN_USE",
  "EXPERIENCE_CHANGED",
  "INVALID_WEBHOOK_URL",
  "INVALID_LEAD_DELIVERY_SETTINGS",
  "WEBHOOK_UNAVAILABLE",
]);

export function resolveErrorMessage(
  status: number,
  code: string | null,
  rawMessage: string | null = null,
): string {
  if (code && dynamicMessageCodes.has(code) && rawMessage) return rawMessage;
  if (code && messagesByCode[code]) return messagesByCode[code];
  if (status === 400) return "Revisa los campos: algún valor no es válido.";
  if (status === 401) return messagesByCode.AUTH_REQUIRED ?? "";
  if (status === 403) return messagesByCode.WORKSPACE_ACCESS_DENIED ?? "";
  if (status === 404) return messagesByCode.NOT_FOUND ?? "";
  if (status === 409) return messagesByCode.CONFLICT ?? "";
  if (status === 429) return messagesByCode.RATE_LIMITED ?? "";
  return "No pudimos completar esta acción. Intenta de nuevo.";
}

async function accessToken(): Promise<string | null> {
  if (!supabase) return null;
  // Read the current session on every request so a silently refreshed token
  // is used without re-rendering (and re-fetching) the whole workspace.
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  if (isDemoMode) return demoRequest<T>(path, options);

  const headers = new Headers(options.headers);
  const token = await accessToken();
  if (!token)
    throw new ApiRequestError(resolveErrorMessage(401, null), 401, null);
  headers.set("Authorization", `Bearer ${token}`);
  if (options.body !== undefined)
    headers.set("Content-Type", "application/json");

  let response: Response;
  try {
    response = await fetch(`${customerApiUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? null : JSON.stringify(options.body),
      signal: options.signal ?? null,
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new ApiRequestError(
      "No pudimos conectar con Kardo. Revisa tu conexión.",
      0,
      "NETWORK",
    );
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      code?: unknown;
      message?: unknown;
      requestId?: unknown;
      key?: unknown;
    } | null;
    const code = typeof body?.code === "string" ? body.code : null;
    const rawMessage = typeof body?.message === "string" ? body.message : null;
    const requestId =
      typeof body?.requestId === "string" ? body.requestId : null;
    if (response.status === 401 && code === "MFA_REQUIRED") {
      // The session is valid but stops at the password: ask for the code.
      requestSecondFactor();
    } else if (response.status === 401 && supabase) {
      // An expired or revoked session cannot be repaired from the page.
      void supabase.auth.signOut({ scope: "local" });
    }
    // Any write on a limited or paused organization: the shell opens its
    // "Elige un plan" dialog instead of each screen showing a generic error.
    notifyPlanRequired(response.status, code);
    // Which limit it hit: the shell may offer the extra that fits (A2-60).
    notifyPlanLimit(response.status, code, body);
    throw new ApiRequestError(
      code === "PLAN_LIMIT"
        ? planLimitMessage(typeof body?.key === "string" ? body.key : null)
        : resolveErrorMessage(response.status, code, rawMessage),
      response.status,
      code,
      requestId,
    );
  }
  if (response.status === 204) return undefined as T;
  if (options.responseType === "text") return (await response.text()) as T;
  if (options.responseType === "blob") return (await response.blob()) as T;
  return (await response.json()) as T;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  return "No pudimos completar esta acción. Intenta de nuevo.";
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function idempotencyHeaders(): Record<string, string> {
  return { "Idempotency-Key": crypto.randomUUID() };
}
