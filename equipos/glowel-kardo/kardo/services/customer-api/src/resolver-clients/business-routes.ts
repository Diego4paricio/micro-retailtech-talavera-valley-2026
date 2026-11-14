import { type ResolverCommandInput, resolverCommandPoster } from "./http.js";

/** What kardo.com.mx/<negocio> serves (kardo_core.business_link_routes):
 * the address, its former ones, the main link, every link and every former
 * link address. */
export type BusinessRoutes = {
  slug: string;
  previousSlugs: string[];
  mainPublicId: string | null;
  links: { slug: string; publicId: string }[];
  linkRedirects: { from: string; to: string }[];
};

export type BusinessRoutesClient = {
  setBusiness(routes: BusinessRoutes): Promise<void>;
};

export function createResolverBusinessClient(
  input: ResolverCommandInput,
): BusinessRoutesClient {
  const post = resolverCommandPoster(input);
  return { setBusiness: (value) => post("/internal/business", value) };
}
