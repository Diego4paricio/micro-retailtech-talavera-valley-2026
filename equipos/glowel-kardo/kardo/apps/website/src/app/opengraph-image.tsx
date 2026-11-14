import { readFileSync } from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";
import { logoSvgMarkup } from "@/components/Logo";
import { hero } from "@/content/landing";

export const dynamic = "force-static";
export const alt =
  "Kardo: tu negocio, en un solo panel. El Resumen de una florería junto a la página que abren sus clientes en el celular.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const logo = logoSvgMarkup("dark");

/*
  og-producto.jpg is the hero's drawing (components/hero/HeroVisual.tsx)
  with its first business, captured from the page at 1:1 on the hero's own
  background, so it sits on the card with no seam. If the drawing changes,
  capture it again (Docs/engineering/15-relevo-sitio-web.md, section 4).
*/
const product = { width: 700, height: 560 };

/**
 * Built once at export time. og-geist-600.ttf is Geist (OFL) at weight 600,
 * instanced from @fontsource-variable/geist with fontTools, because next/og
 * cannot read woff2: titles keep the site's Geist 600.
 */
export default function OpengraphImage() {
  const read = (file: string) =>
    readFileSync(path.join(process.cwd(), "src/app", file));
  const picture = read("og-producto.jpg");
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        background: "#0D161D",
      }}
    >
      {/* biome-ignore lint/performance/noImgElement: rendered by next/og, not the browser. */}
      <img
        alt=""
        height={product.height}
        src={`data:image/jpeg;base64,${picture.toString("base64")}`}
        style={{ position: "absolute", right: -46, top: 58 }}
        width={product.width}
      />
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "70px 0 76px 76px",
          width: 560,
        }}
      >
        {/* biome-ignore lint/performance/noImgElement: rendered by next/og, not the browser. */}
        <img
          alt=""
          height={72}
          src={`data:image/svg+xml;base64,${Buffer.from(logo).toString("base64")}`}
          width={214}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontFamily: "Geist",
            fontWeight: 600,
            fontSize: 60,
            lineHeight: 1.04,
            letterSpacing: -2.4,
            color: "#FFFFFF",
          }}
        >
          <span style={{ display: "flex" }}>
            Tu&nbsp;
            <span style={{ color: "#4EC3CE" }}>{hero.genericWord},</span>
          </span>
          <span>{hero.titleEnd}</span>
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        {
          name: "Geist",
          data: read("og-geist-600.ttf"),
          weight: 600,
          style: "normal",
        },
      ],
    },
  );
}
