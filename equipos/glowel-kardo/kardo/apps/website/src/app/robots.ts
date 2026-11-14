import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

export const dynamic = "force-static";

/** Only a production build may be indexed; previews and local builds are not. */
export default function robots(): MetadataRoute.Robots {
  const production = process.env.KARDO_ENV === "production";
  return production
    ? {
        rules: { userAgent: "*", allow: "/" },
        sitemap: absoluteUrl("/sitemap.xml"),
      }
    : { rules: { userAgent: "*", disallow: "/" } };
}
