import { type DesignBrand, designBrands } from "@kardo/contracts";
import { designBrandInfo } from "@kardo/page-render";

/**
 * Display name of the brand a "Botón de red o app" carries, for short
 * messages ("Falta el enlace del botón de WhatsApp"). @kardo/page-render
 * owns each brand's name, logo and color.
 */
export function brandName(brand: DesignBrand): string {
  // A stored design may carry a brand this version does not know.
  return (designBrands as readonly string[]).includes(brand)
    ? designBrandInfo(brand).label
    : "la app";
}
