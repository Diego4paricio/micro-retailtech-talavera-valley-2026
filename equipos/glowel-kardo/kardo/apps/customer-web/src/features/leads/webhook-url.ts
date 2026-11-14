/**
 * Las mismas reglas que aplica el API a la dirección del webhook
 * (`services/customer-api/src/webhook-url.ts`), para avisar antes de
 * guardar y en español: solo https, sin usuario ni contraseña, un nombre de
 * sitio real (nunca una IP, `localhost`, `.local` ni `.internal`) y el
 * puerto 443. Es solo una ayuda: el API sigue siendo quien decide.
 */

const blockedSuffixes = [".local", ".internal"];

function isIpv4(host: string): boolean {
  const parts = host.split(".");
  return (
    parts.length === 4 &&
    parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
  );
}

/** El problema de una dirección de webhook, o `null` si está bien o vacía
 * (el webhook es opcional). */
export function webhookUrlProblem(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  if (text.length > 2048 || /\s/.test(text))
    return "La dirección del webhook no puede llevar espacios y debe ser más corta.";
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return "Escribe la dirección completa del webhook, por ejemplo https://hooks.miempresa.com/kardo.";
  }
  if (url.protocol !== "https:")
    return "La dirección del webhook debe empezar con https://.";
  if (url.username || url.password)
    return "La dirección del webhook no puede llevar usuario ni contraseña.";
  const hostname = url.hostname.toLowerCase();
  if (!hostname || hostname.endsWith("."))
    return "Escribe la dirección completa del webhook.";
  if (isIpv4(hostname) || hostname.startsWith("[") || hostname.includes(":"))
    return "La dirección del webhook no puede ser una IP. Usa el nombre del sitio.";
  if (
    hostname === "localhost" ||
    blockedSuffixes.some((suffix) => hostname.endsWith(suffix))
  )
    return "Esa dirección no está permitida: el webhook debe estar en un sitio público de internet.";
  if (url.port && url.port !== "443")
    return "El webhook debe usar el puerto normal de https (443).";
  return null;
}
