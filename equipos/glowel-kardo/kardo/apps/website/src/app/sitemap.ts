import type { MetadataRoute } from "next";
import { publishedLegalSlugs } from "@/lib/legal";
import { loadPricing } from "@/lib/pricing";
import { absoluteUrl } from "@/lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: absoluteUrl("/"), changeFrequency: "monthly", priority: 1 },
    {
      url: absoluteUrl("/plataforma/"),
      changeFrequency: "monthly",
      priority: 0.9,
    },
    { url: absoluteUrl("/piezas/"), changeFrequency: "monthly", priority: 0.9 },
    {
      url: absoluteUrl("/personalizar/"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    // Prices only once the owner approved the catalog (not a draft).
    ...(loadPricing().approved
      ? [
          {
            url: absoluteUrl("/precios/"),
            changeFrequency: "monthly" as const,
            priority: 0.8,
          },
        ]
      : []),
    // Legal pages only once their titular data is filled (not drafts).
    ...publishedLegalSlugs().map((slug) => ({
      url: absoluteUrl(`/${slug}/`),
      changeFrequency: "yearly" as const,
      priority: 0.3,
    })),
  ];
}
