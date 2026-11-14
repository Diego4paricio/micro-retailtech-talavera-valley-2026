export interface SiteRedirect {
  slug: string;
  to: string;
  title: string;
  keepQuery: boolean;
}

export const panelActivationPath: string;

export function siteRedirects(customerAppUrl: string): SiteRedirect[];

export function redirectsFile(customerAppUrl: string): string;
