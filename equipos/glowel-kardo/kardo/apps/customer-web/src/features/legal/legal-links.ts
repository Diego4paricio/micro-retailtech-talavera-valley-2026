/** Public legal documents live on the marketing website, not in the panel. */
export type LegalLinks = {
  terms: string;
  privacy: string;
  cancellation: string;
};

type LinkEnv = { configured?: string | undefined; location: URL };

/** Website origin: VITE_WEBSITE_URL, else localhost:5177, else the panel host without "app.". */
export function websiteBase({ configured, location }: LinkEnv): string {
  const explicit = configured?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const host = location.hostname;
  if (host === "localhost" || host === "127.0.0.1")
    return "http://localhost:5177";
  return `https://${host.replace(/^app\./, "")}`;
}

export function buildLegalLinks(env: LinkEnv): LegalLinks {
  const base = websiteBase(env);
  return {
    terms: `${base}/terminos`,
    privacy: `${base}/privacidad`,
    cancellation: `${base}/cancelacion-y-reembolsos`,
  };
}

export function legalLinks(): LegalLinks {
  return buildLegalLinks({
    configured: import.meta.env.VITE_WEBSITE_URL,
    location: new URL(window.location.href),
  });
}
