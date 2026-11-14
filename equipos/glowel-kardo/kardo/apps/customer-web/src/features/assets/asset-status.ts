import type { Asset } from "@kardo/contracts";
import type { StatusTone } from "../../lib/format.js";

/**
 * What the library says about a file's state, in plain Spanish. The Assets
 * Worker rejects with a small, fixed set of English reasons
 * (services/assets-worker); each one maps to what happened and what to do.
 * An unknown reason still gets an honest, generic explanation.
 */
export type AssetStatusExplanation = {
  label: string;
  tone: StatusTone;
  title: string;
  body: string;
  /** What the customer can do about it (rejected files only). */
  fix?: string;
};

type Rejection = { match: RegExp; body: string; fix: string };

const rejections: readonly Rejection[] = [
  {
    match: /active content/i,
    body: "Tu PDF trae formularios para llenar, botones que hacen algo solos o archivos pegados. Por seguridad no lo publicamos.",
    fix: "En el programa donde lo hiciste, quítale esos formularios, botones o archivos pegados, guárdalo otra vez y súbelo.",
  },
  {
    match: /page limit/i,
    body: "El PDF tiene más de 20 páginas.",
    fix: "Divídelo en varios archivos o quita páginas, y súbelo otra vez.",
  },
  {
    match: /stream|inspect/i,
    body: "No pudimos revisar todo tu PDF, así que no lo publicamos.",
    fix: "Guárdalo otra vez como PDF desde el programa donde lo hiciste y súbelo. Si se repite, sube sus páginas como imágenes.",
  },
  {
    match: /not a valid PDF/i,
    body: "El archivo no es un PDF válido o está dañado.",
    fix: "Ábrelo en tu editor, expórtalo otra vez como PDF y súbelo.",
  },
  {
    match: /dimensions/i,
    body: "La imagen es demasiado grande (más de 40 megapíxeles o más de 10,000 px por lado) o sus medidas no son válidas.",
    fix: "Redúcela, por ejemplo a 3,000 px por lado, y súbela otra vez.",
  },
  {
    match: /unsupported encoding/i,
    body: "La imagen usa un tipo de JPEG que no aceptamos (por ejemplo, en CMYK).",
    fix: "Expórtala como JPEG RGB estándar o como PNG y súbela otra vez.",
  },
  {
    match: /animated/i,
    body: "Las imágenes WebP animadas no se aceptan.",
    fix: "Usa una imagen fija en PNG, JPEG o WebP.",
  },
  {
    match: /does not match its authorization/i,
    body: "El archivo que llegó no coincide con el que se anunció (tamaño o tipo).",
    fix: "Súbelo otra vez; si se repite, revisa que la extensión corresponda al tipo real del archivo.",
  },
  {
    match:
      /not a valid (PNG|JPEG|WebP)|truncated|malformed|missing|header|RIFF/i,
    body: "La imagen está dañada o su extensión no corresponde a su contenido.",
    fix: "Ábrela en un editor de imágenes, expórtala otra vez como PNG, JPEG o WebP y súbela.",
  },
];

const genericRejection: Rejection = {
  match: /./,
  body: "El archivo no pasó nuestra revisión de seguridad.",
  fix: "Revisa que sea una imagen PNG, JPEG o WebP, o un PDF simple de hasta 20 páginas, y súbelo otra vez.",
};

export function rejectionFor(reason: string | undefined): {
  body: string;
  fix: string;
} {
  const found = reason
    ? (rejections.find((item) => item.match.test(reason)) ?? genericRejection)
    : genericRejection;
  return { body: found.body, fix: found.fix };
}

export function assetStatusExplanation(
  asset: Pick<Asset, "status" | "rejectedReason">,
): AssetStatusExplanation {
  if (asset.status === "validated") {
    return {
      label: "Validado",
      tone: "success",
      title: "Listo para usar",
      body: "Pasó la revisión de seguridad. Puedes usarlo en tus páginas.",
    };
  }
  if (asset.status === "quarantined") {
    return {
      label: "En revisión",
      tone: "info",
      title: "Lo estamos revisando",
      body: "Todo archivo nuevo pasa por una revisión de seguridad antes de usarse. Suele tardar unos segundos; si se queda así, súbelo otra vez.",
    };
  }
  const rejection = rejectionFor(asset.rejectedReason);
  return {
    label: "Rechazado",
    tone: "danger",
    title: "No pasó la revisión",
    body: rejection.body,
    fix: rejection.fix,
  };
}
