export type SiteEnvironment = "development" | "test" | "production";

export interface SiteEnv {
  environment: SiteEnvironment;
  websiteUrl: string;
  customerAppUrl: string;
  contactEmail: string | null;
  whatsapp: string;
}

export function readSiteEnv(
  source: Record<string, string | undefined>,
): SiteEnv;
