import type { ReactNode } from "react";
import type { PieceId } from "@/content/pieces";
import {
  KARDO_ICON_WIDTH,
  KARDO_LOGO_HEIGHT,
  KARDO_LOGO_WIDTH,
  kardoIconOutlines,
  kardoLogoOutlines,
} from "../brand-paths";
import {
  accentOnTile,
  type Brand,
  contrast,
  type Design,
  textOn,
  tileColors,
} from "./design";
import { type FittedText, fitText, qrPath, textWidth } from "./fit";

/*
  The print face of each piece, drawn in millimeters (the viewBox is the
  real size), from the designs in Docs/renders/DiseñosImprimir. The same
  drawing is the preview in /personalizar/, the pieces on the home and the
  downloaded image. Rules kept from KARDO_PRODUCTOS_FISICOS.md §4: the tap
  mark is Kardo's symbol alone and always goes with «Acerca tu celular»;
  the QR sits on a light square so any phone reads it.
*/

export type Side = "front" | "back";

export const pieceSize: Record<PieceId, { width: number; height: number }> = {
  stand: { width: 100, height: 150 },
  card: { width: 85.6, height: 54 },
  magnet: { width: 90, height: 50 },
  sticker: { width: 100, height: 100 },
};

export interface Families {
  /** The brand's typeface (name, titles). */
  brand: string;
  /** DM Sans, for the small texts. */
  ui: string;
}

interface Props {
  design: Design;
  piece?: PieceId;
  side?: Side;
  families: Families;
  /** What the sample QR opens. The real one is made with the piece. */
  qrText: string;
  /** Unique per drawing on the page, for the clip path. */
  id: string;
  className?: string;
  title?: string;
}

interface Palette {
  bg: string;
  text: string;
  accent: string;
  tile: ReturnType<typeof tileColors>;
  /** Waves of the symbol where it sits on the light tile. */
  tileAccent: string;
  /** Waves of the symbol where it sits on the piece's color. */
  bgAccent: string;
}

function palette(brand: Brand): Palette {
  const tile = tileColors(brand.background);
  const text = textOn(brand.background, brand.textTone);
  return {
    bg: brand.background,
    text,
    accent: brand.accent,
    tile,
    tileAccent: accentOnTile(brand.accent, brand.background, tile.ink),
    bgAccent:
      contrast(brand.accent, brand.background) >= 1.6 ? brand.accent : text,
  };
}

// Small drawing pieces --------------------------------------------------------

function Lines({
  fitted,
  x,
  y,
  family,
  font,
  weight,
  fill,
  anchor = "middle",
  lineHeight = 1.18,
  letterSpacing = 0,
  opacity,
}: {
  fitted: FittedText;
  x: number;
  /** Baseline of the first line. */
  y: number;
  family: string;
  font: "brand" | "ui";
  weight: 400 | 600;
  fill: string;
  anchor?: "start" | "middle" | "end";
  lineHeight?: number;
  letterSpacing?: number;
  opacity?: number;
}) {
  if (fitted.lines.length === 0) return null;
  return (
    <text
      data-font={font}
      fill={fill}
      fontSize={fitted.size}
      fontWeight={weight}
      letterSpacing={letterSpacing ? letterSpacing * fitted.size : undefined}
      opacity={opacity}
      style={{ fontFamily: family }}
      textAnchor={anchor}
    >
      {fitted.lines.map((line, index) => (
        <tspan
          // biome-ignore lint/suspicious/noArrayIndexKey: lines repeat.
          key={index}
          x={x}
          y={y + index * fitted.size * lineHeight}
        >
          {line}
        </tspan>
      ))}
    </text>
  );
}

/** Height a block of fitted lines takes, from cap to last baseline. */
function blockHeight(fitted: FittedText, lineHeight = 1.18): number {
  if (fitted.lines.length === 0) return 0;
  return fitted.size * (0.74 + (fitted.lines.length - 1) * lineHeight);
}

function KardoSymbol({
  x,
  y,
  height,
  ring,
  wave,
}: {
  x: number;
  y: number;
  height: number;
  ring: string;
  wave: string;
}) {
  const scale = height / KARDO_LOGO_HEIGHT;
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path d={kardoIconOutlines.ring} fill={ring} />
      <path d={kardoIconOutlines.dot} fill={ring} />
      <path d={kardoIconOutlines.outer} fill={wave} />
      <path d={kardoIconOutlines.inner} fill={wave} opacity={0.62} />
    </g>
  );
}

function symbolWidth(height: number): number {
  return (KARDO_ICON_WIDTH / KARDO_LOGO_HEIGHT) * height;
}

/** Kardo's full logo in one color, small, like the Estudio QR exports. */
function KardoMark({
  cx,
  y,
  width,
  color,
}: {
  cx: number;
  y: number;
  width: number;
  color: string;
}) {
  const scale = width / KARDO_LOGO_WIDTH;
  return (
    <g
      opacity={0.55}
      transform={`translate(${cx - width / 2} ${y}) scale(${scale})`}
    >
      {kardoLogoOutlines.letters.map((d) => (
        <path d={d} fill={color} key={d.slice(0, 24)} />
      ))}
      <path d={kardoLogoOutlines.ring} fill={color} />
      <path d={kardoLogoOutlines.dot} fill={color} />
      <path d={kardoLogoOutlines.outer} fill={color} />
      <path d={kardoLogoOutlines.inner} fill={color} />
    </g>
  );
}

function markHeight(width: number): number {
  return (KARDO_LOGO_HEIGHT / KARDO_LOGO_WIDTH) * width;
}

function QrTile({
  x,
  y,
  size,
  radius,
  colors,
  text,
}: {
  x: number;
  y: number;
  size: number;
  radius: number;
  colors: Palette["tile"];
  text: string;
}) {
  const { d, modules } = qrPath(text);
  const pad = size * 0.11;
  const scale = (size - pad * 2) / modules;
  return (
    <g>
      <rect
        fill={colors.fill}
        height={size}
        rx={radius}
        stroke={colors.stroke}
        strokeWidth={colors.stroke === "none" ? undefined : 0.3}
        width={size}
        x={x}
        y={y}
      />
      <path
        d={d}
        fill={colors.ink}
        shapeRendering="crispEdges"
        transform={`translate(${x + pad} ${y + pad}) scale(${scale})`}
      />
    </g>
  );
}

/** The logo inside a box, centered on (cx, cy), never distorted. */
function logoBox(brand: Brand, maxWidth: number, maxHeight: number) {
  const ratio = brand.logoRatio > 0 ? brand.logoRatio : 1;
  const w = Math.min(maxWidth, maxHeight * ratio) * brand.logoScale;
  return { width: w, height: w / ratio };
}

function LogoImage({
  brand,
  cx,
  top,
  width,
  height,
  plate,
  anchor = "middle",
}: {
  brand: Brand;
  cx: number;
  top: number;
  width: number;
  height: number;
  plate: string;
  anchor?: "start" | "middle";
}) {
  if (!brand.logo) return null;
  const x = anchor === "middle" ? cx - width / 2 : cx;
  const pad = Math.max(1.6, height * 0.16);
  return (
    <g>
      {brand.logoPlate ? (
        <rect
          fill={plate}
          height={height + pad * 2}
          rx={pad}
          width={width + pad * 2}
          x={x - pad}
          y={top - pad}
        />
      ) : null}
      <image
        height={height}
        href={brand.logo}
        preserveAspectRatio="xMidYMid meet"
        width={width}
        x={x}
        y={top}
      />
    </g>
  );
}

function nameText(brand: Brand): string {
  return brand.upper ? brand.name.toLocaleUpperCase("es-MX") : brand.name;
}

// The four pieces ---------------------------------------------------------------

function Stand({ design, families, qrText }: Omit<Props, "id">) {
  const { brand } = design;
  const t = design.texts.stand;
  const p = palette(brand);
  const pill = t.layout === "pill";
  const nameSpacing = brand.upper ? 0.08 : -0.01;

  const logo = brand.logo
    ? logoBox(brand, pill ? 56 : 48, pill ? 30 : 24)
    : { width: 0, height: 0 };
  const name = fitText({
    text: nameText(brand),
    family: families.brand,
    weight: 600,
    size: brand.logo ? 7.6 : 10,
    minSize: 4.2,
    maxWidth: 80,
    maxLines: 2,
    letterSpacing: nameSpacing,
  });
  const tagline = fitText({
    text: t.tagline,
    family: families.ui,
    weight: 400,
    size: 3.6,
    minSize: 2.8,
    maxWidth: 76,
    maxLines: 2,
  });
  const call = fitText({
    text: t.call,
    family: families.ui,
    weight: 400,
    size: pill ? 3.9 : 3.5,
    minSize: 2.8,
    maxWidth: 78,
    maxLines: 2,
  });

  // Logo, name and tagline as one block, centered in the top area.
  const platePad =
    brand.logo && brand.logoPlate ? Math.max(1.6, logo.height * 0.16) : 0;
  const gapLogo = brand.logo && name.lines.length ? 6 + platePad : 0;
  const gapTag = tagline.lines.length ? 4.2 : 0;
  const nameH = blockHeight(name);
  const tagH = blockHeight(tagline);
  const total = logo.height + gapLogo + nameH + gapTag + tagH;
  const areaTop = 12;
  const areaBottom = pill ? 82 : t.call.trim() ? 72 : 78;
  const top = areaTop + Math.max(0, (areaBottom - areaTop - total) / 2);
  const nameBaseline = top + logo.height + gapLogo + name.size * 0.74;
  const tagBaseline =
    top + logo.height + gapLogo + nameH + gapTag + tagline.size * 0.74;

  const markW = 15;
  return (
    <>
      <rect fill={p.bg} height={150} width={100} />
      <LogoImage
        brand={brand}
        cx={50}
        height={logo.height}
        plate={p.tile.fill}
        top={top}
        width={logo.width}
      />
      <Lines
        family={families.brand}
        fill={p.text}
        fitted={name}
        letterSpacing={nameSpacing}
        font="brand"
        weight={600}
        x={50}
        y={nameBaseline}
      />
      <Lines
        family={families.ui}
        fill={p.text}
        fitted={tagline}
        opacity={0.82}
        font="ui"
        weight={400}
        x={50}
        y={tagBaseline}
      />
      {pill ? (
        <>
          <rect
            fill={p.tile.fill}
            height={36}
            rx={18}
            stroke={p.tile.stroke}
            strokeWidth={p.tile.stroke === "none" ? undefined : 0.3}
            width={80}
            x={10}
            y={88}
          />
          <QrTile
            colors={{ ...p.tile, stroke: "none" }}
            radius={2}
            size={30}
            text={qrText}
            x={20}
            y={91}
          />
          <KardoSymbol
            height={21}
            ring={p.tile.ink}
            wave={p.tileAccent}
            x={67 - symbolWidth(21) / 2}
            y={95.5}
          />
          <Lines
            family={families.ui}
            fill={p.text}
            fitted={call}
            font="ui"
            weight={400}
            x={50}
            y={132}
          />
        </>
      ) : (
        <>
          <Lines
            family={families.ui}
            fill={p.text}
            fitted={call}
            opacity={0.9}
            font="ui"
            weight={400}
            x={50}
            y={call.lines.length > 1 ? 75.5 : 78.5}
          />
          <QrTile
            colors={p.tile}
            radius={4}
            size={34}
            text={qrText}
            x={12}
            y={84}
          />
          <rect
            fill={p.tile.fill}
            height={34}
            rx={4}
            stroke={p.tile.stroke}
            strokeWidth={p.tile.stroke === "none" ? undefined : 0.3}
            width={34}
            x={54}
            y={84}
          />
          <KardoSymbol
            height={19}
            ring={p.tile.ink}
            wave={p.tileAccent}
            x={71 - symbolWidth(19) / 2}
            y={91.5}
          />
          <text
            data-font="ui"
            fill={p.text}
            fontSize={3}
            opacity={0.85}
            style={{ fontFamily: families.ui }}
            textAnchor="middle"
          >
            <tspan x={29} y={124}>
              Escanea
            </tspan>
            <tspan x={71} y={124}>
              Acerca tu celular
            </tspan>
          </text>
        </>
      )}
      <KardoMark
        color={p.text}
        cx={50}
        width={markW}
        y={150 - 8.5 - markHeight(markW)}
      />
    </>
  );
}

function Card({ design, families, qrText, side }: Omit<Props, "id">) {
  const { brand } = design;
  const t = design.texts.card;
  const p = palette(brand);
  const W = 85.6;
  const H = 54;

  if (side === "back") {
    const call = fitText({
      text: t.call,
      family: families.ui,
      weight: 400,
      size: 3.4,
      minSize: 2.5,
      maxWidth: 28,
      maxLines: 4,
    });
    const markW = 13;
    return (
      <>
        <rect fill={p.bg} height={H} width={W} />
        <QrTile
          colors={p.tile}
          radius={3}
          size={38}
          text={qrText}
          x={7}
          y={8}
        />
        <KardoSymbol
          height={8}
          ring={p.text}
          wave={p.bgAccent}
          x={51.5}
          y={10}
        />
        <Lines
          anchor="start"
          family={families.ui}
          fill={p.text}
          fitted={call}
          font="ui"
          weight={400}
          x={51.5}
          y={25}
        />
        <KardoMark
          color={p.text}
          cx={51.5 + markW / 2}
          width={markW}
          y={H - 7.5 - markHeight(markW)}
        />
      </>
    );
  }

  const center = t.layout === "center";
  const nameSpacing = brand.upper ? 0.06 : -0.01;
  const logo = brand.logo
    ? logoBox(brand, center ? 36 : 32, center ? 16 : 13)
    : { width: 0, height: 0 };
  const name = fitText({
    text: nameText(brand),
    family: families.brand,
    weight: 600,
    size: brand.logo ? 5.4 : 6.4,
    minSize: 3.2,
    maxWidth: center ? 70 : 62,
    maxLines: 2,
    letterSpacing: nameSpacing,
  });
  const role = fitText({
    text: t.role,
    family: families.ui,
    weight: 400,
    size: 2.9,
    minSize: 2.3,
    maxWidth: center ? 70 : 64,
    maxLines: 1,
  });
  const person = fitText({
    text: t.person,
    family: families.ui,
    weight: 600,
    size: 2.7,
    minSize: 2.2,
    maxWidth: center ? 70 : 64,
    maxLines: 1,
  });
  const symbolH = 6;

  if (center) {
    const nameH = blockHeight(name);
    const gap = brand.logo ? 4.5 : 0;
    const total =
      logo.height +
      gap +
      nameH +
      (role.lines.length ? 4.6 : 0) +
      (person.lines.length ? 5.6 : 0);
    const top = Math.max(6, (H - total) / 2);
    const nameBase = top + logo.height + gap + name.size * 0.74;
    const roleBase = top + logo.height + gap + nameH + 4.6;
    const personBase = roleBase + (role.lines.length ? 5.6 : 0.6);
    return (
      <>
        <rect fill={p.bg} height={H} width={W} />
        <KardoSymbol
          height={symbolH}
          ring={p.text}
          wave={p.bgAccent}
          x={W - 6 - symbolWidth(symbolH)}
          y={5.5}
        />
        <LogoImage
          brand={brand}
          cx={W / 2}
          height={logo.height}
          plate={p.tile.fill}
          top={top}
          width={logo.width}
        />
        <Lines
          family={families.brand}
          fill={p.text}
          fitted={name}
          letterSpacing={nameSpacing}
          font="brand"
          weight={600}
          x={W / 2}
          y={nameBase}
        />
        <Lines
          family={families.ui}
          fill={p.text}
          fitted={role}
          opacity={0.85}
          font="ui"
          weight={400}
          x={W / 2}
          y={roleBase}
        />
        <Lines
          family={families.ui}
          fill={p.text}
          fitted={person}
          opacity={0.75}
          font="ui"
          weight={600}
          x={W / 2}
          y={personBase}
        />
      </>
    );
  }

  // Left layout: logo top left, name low, then the role and the person.
  const personBase = H - 6.5;
  const roleBase = person.lines.length ? personBase - 5.4 : personBase;
  const lastNameBase = role.lines.length ? roleBase - 5.6 : roleBase - 1;
  const nameBase = lastNameBase - (name.lines.length - 1) * name.size * 1.18;
  return (
    <>
      <rect fill={p.bg} height={H} width={W} />
      <KardoSymbol
        height={symbolH}
        ring={p.text}
        wave={p.bgAccent}
        x={W - 6.5 - symbolWidth(symbolH)}
        y={6.5}
      />
      <LogoImage
        anchor="start"
        brand={brand}
        cx={7.5}
        height={logo.height}
        plate={p.tile.fill}
        top={7.5}
        width={logo.width}
      />
      <Lines
        anchor="start"
        family={families.brand}
        fill={p.text}
        fitted={name}
        letterSpacing={nameSpacing}
        font="brand"
        weight={600}
        x={7.5}
        y={nameBase}
      />
      <Lines
        anchor="start"
        family={families.ui}
        fill={p.text}
        fitted={role}
        opacity={0.85}
        font="ui"
        weight={400}
        x={7.5}
        y={roleBase}
      />
      <Lines
        anchor="start"
        family={families.ui}
        fill={p.text}
        fitted={person}
        opacity={0.72}
        font="ui"
        weight={600}
        x={7.5}
        y={personBase}
      />
    </>
  );
}

const whatsappPath =
  "M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.21 3.08.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35ZM12.05 21.8h-.01a9.85 9.85 0 0 1-5.02-1.37l-.36-.21-3.73.98 1-3.64-.24-.37a9.86 9.86 0 0 1-1.51-5.24C2.18 6.5 6.61 2.08 12.06 2.08c2.64 0 5.12 1.03 6.98 2.9a9.8 9.8 0 0 1 2.89 6.98c0 5.45-4.43 9.84-9.88 9.84Zm8.41-18.25A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.9c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.9 11.9 0 0 0 5.69 1.45h.01c6.55 0 11.89-5.34 11.89-11.9 0-3.18-1.24-6.17-3.49-8.42Z";

function Contact({
  text,
  cx,
  y,
  family,
  fill,
  size = 3.6,
}: {
  text: string;
  cx: number;
  y: number;
  family: string;
  fill: string;
  size?: number;
}) {
  const fitted = fitText({
    text,
    family,
    weight: 600,
    size,
    minSize: 2.6,
    maxWidth: 30,
    maxLines: 1,
  });
  if (!fitted.lines.length) return null;
  const icon = fitted.size * 1.05;
  const width =
    textWidth(fitted.lines[0] ?? "", fitted.size, 600, family) + icon + 1.2;
  const left = cx - width / 2;
  return (
    <g>
      <path
        d={whatsappPath}
        fill={fill}
        transform={`translate(${left} ${y - icon * 0.86}) scale(${icon / 24})`}
      />
      <Lines
        anchor="start"
        family={family}
        fill={fill}
        fitted={fitted}
        font="ui"
        weight={600}
        x={left + icon + 1.2}
        y={y}
      />
    </g>
  );
}

function Magnet({ design, families, qrText }: Omit<Props, "id">) {
  const { brand } = design;
  const t = design.texts.magnet;
  const p = palette(brand);
  const W = 90;
  const H = 50;
  const nameSpacing = brand.upper ? 0.04 : -0.01;

  if (t.layout === "full") {
    const logo = brand.logo ? logoBox(brand, 34, 12) : { width: 0, height: 0 };
    const name = fitText({
      text: nameText(brand),
      family: families.brand,
      weight: 600,
      size: 5,
      minSize: 3,
      maxWidth: 44,
      maxLines: 3,
      letterSpacing: nameSpacing,
    });
    const line = fitText({
      text: t.line,
      family: families.ui,
      weight: 400,
      size: 2.8,
      minSize: 2.3,
      maxWidth: 44,
      maxLines: 2,
    });
    const call = fitText({
      text: t.call,
      family: families.ui,
      weight: 400,
      size: 2.5,
      minSize: 2.1,
      maxWidth: 30,
      maxLines: 2,
    });
    const hasContact = t.contact.trim().length > 0;
    const nameH = blockHeight(name);
    const gapLogo = brand.logo ? 3.6 : 0;
    const gapLine = line.lines.length ? 3.2 : 0;
    const total = logo.height + gapLogo + nameH + gapLine + blockHeight(line);
    const bottom = hasContact ? 38 : 45;
    const top = 5 + Math.max(0, (bottom - 5 - total) / 2);
    const nameBase = top + logo.height + gapLogo + name.size * 0.74;
    const lineBase =
      top + logo.height + gapLogo + nameH + gapLine + line.size * 0.74;
    const markW = 10;
    return (
      <>
        <rect fill={p.bg} height={H} width={W} />
        <LogoImage
          anchor="start"
          brand={brand}
          cx={6}
          height={logo.height}
          plate={p.tile.fill}
          top={top}
          width={logo.width}
        />
        <Lines
          anchor="start"
          family={families.brand}
          fill={p.text}
          fitted={name}
          letterSpacing={nameSpacing}
          font="brand"
          weight={600}
          x={6}
          y={nameBase}
        />
        <Lines
          anchor="start"
          family={families.ui}
          fill={p.text}
          fitted={line}
          opacity={0.85}
          font="ui"
          weight={400}
          x={6}
          y={lineBase}
        />
        {hasContact ? (
          <Contact
            cx={6 + 16}
            family={families.ui}
            fill={p.text}
            text={t.contact}
            y={44.5}
          />
        ) : null}
        <QrTile
          colors={p.tile}
          radius={2.6}
          size={28}
          text={qrText}
          x={56}
          y={5.5}
        />
        <Lines
          family={families.ui}
          fill={p.text}
          fitted={call}
          font="ui"
          weight={400}
          x={70}
          y={call.lines.length > 1 ? 38 : 39.5}
        />
        <KardoMark
          color={p.text}
          cx={70}
          width={markW}
          y={H - 3.4 - markHeight(markW)}
        />
      </>
    );
  }

  // Split, in the proportions of the approved print artwork
  // (Docs/renders/DiseñosImprimir/kardo_magnet.jpg): the business big on a
  // light 40 % panel, the tap mark and the QR big on the brand's color.
  const splitX = 40;
  const leftText =
    contrast(p.bg, p.tile.fill) >= 4.5 ? p.bg : textOn(p.tile.fill);
  const logo = brand.logo ? logoBox(brand, 30, 16) : { width: 0, height: 0 };
  const name = fitText({
    text: nameText(brand),
    family: families.brand,
    weight: 600,
    size: brand.logo ? 4.4 : 5.4,
    minSize: 2.8,
    maxWidth: 34,
    maxLines: 3,
    letterSpacing: nameSpacing,
  });
  const line = fitText({
    text: t.line,
    family: families.ui,
    weight: 400,
    size: 2.6,
    minSize: 2.1,
    maxWidth: 34,
    maxLines: 2,
  });
  const call = fitText({
    text: t.call,
    family: families.ui,
    weight: 400,
    size: 2.4,
    minSize: 2,
    maxWidth: 27,
    maxLines: 2,
  });
  const hasContact = t.contact.trim().length > 0;
  const nameH = blockHeight(name, 1.12);
  const gapLogo = brand.logo ? 3.6 : 0;
  const gapLine = line.lines.length ? 2.6 : 0;
  const total = logo.height + gapLogo + nameH + gapLine + blockHeight(line);
  const bottom = hasContact ? 39.5 : 46;
  const top = 3.8 + Math.max(0, (bottom - 3.8 - total) / 2);
  const nameBase = top + logo.height + gapLogo + name.size * 0.74;
  const lineBase =
    top + logo.height + gapLogo + nameH + gapLine + line.size * 0.74;
  const cx = splitX / 2;
  const qrSize = 19.5;
  const qrX = W - 5 - qrSize;
  const qrCx = qrX + qrSize / 2;
  const symbolH = 19;
  const markW = 9;
  return (
    <>
      <rect fill={p.bg} height={H} width={W} />
      <rect fill={p.tile.fill} height={H} width={splitX} />
      <LogoImage
        brand={{ ...brand, logoPlate: false }}
        cx={cx}
        height={logo.height}
        plate={p.tile.fill}
        top={top}
        width={logo.width}
      />
      <Lines
        family={families.brand}
        fill={leftText}
        fitted={name}
        font="brand"
        letterSpacing={nameSpacing}
        lineHeight={1.12}
        weight={600}
        x={cx}
        y={nameBase}
      />
      <Lines
        family={families.ui}
        fill={leftText}
        fitted={line}
        font="ui"
        opacity={0.85}
        weight={400}
        x={cx}
        y={lineBase}
      />
      {hasContact ? (
        <Contact
          cx={cx}
          family={families.ui}
          fill={leftText}
          size={3.8}
          text={t.contact}
          y={45}
        />
      ) : null}
      <KardoSymbol
        height={symbolH}
        ring={p.text}
        wave={p.bgAccent}
        x={splitX + (qrX - splitX - symbolWidth(symbolH)) / 2}
        y={13.5}
      />
      <QrTile
        colors={p.tile}
        radius={2.2}
        size={qrSize}
        text={qrText}
        x={qrX}
        y={12.5}
      />
      <Lines
        family={families.ui}
        fill={p.text}
        fitted={call}
        font="ui"
        weight={400}
        x={qrCx}
        y={37.4}
      />
      <KardoMark
        color={p.text}
        cx={qrCx}
        width={markW}
        y={H - 3.2 - markHeight(markW)}
      />
    </>
  );
}

function Sticker({
  design,
  families,
  qrText,
  id,
}: Omit<Props, "id"> & { id: string }) {
  const { brand } = design;
  const t = design.texts.sticker;
  const p = palette(brand);
  const ringLayout = t.layout === "ring";
  const radius = 38.5;
  const arc = `M ${50 - radius} 50 A ${radius} ${radius} 0 0 1 ${50 + radius} 50`;
  const ring = fitText({
    text: t.ring.toLocaleUpperCase("es-MX"),
    family: families.brand,
    weight: 600,
    size: 6.6,
    minSize: 3.6,
    maxWidth: 0.62 * Math.PI * radius,
    maxLines: 1,
    letterSpacing: 0.1,
  });
  const call = fitText({
    text: t.call,
    family: families.ui,
    weight: 400,
    size: 3.9,
    minSize: 3,
    maxWidth: 60,
    maxLines: 2,
  });
  const logo = brand.logo ? logoBox(brand, 40, 17) : { width: 0, height: 0 };
  const name = fitText({
    text: nameText(brand),
    family: families.brand,
    weight: 600,
    size: 6,
    minSize: 3.4,
    maxWidth: 54,
    maxLines: 2,
    letterSpacing: brand.upper ? 0.06 : -0.01,
  });
  const markW = 15;
  const nameH = blockHeight(name);
  return (
    <>
      <circle cx={50} cy={50} fill={p.bg} r={50} />
      {ringLayout ? (
        <>
          <path d={arc} fill="none" id={`${id}-arc`} />
          <text
            data-font="brand"
            fill={p.text}
            fontSize={ring.size}
            fontWeight={600}
            letterSpacing={0.1 * ring.size}
            style={{ fontFamily: families.brand }}
            textAnchor="middle"
          >
            <textPath href={`#${id}-arc`} startOffset="50%">
              {ring.lines[0] ?? ""}
            </textPath>
          </text>
        </>
      ) : brand.logo ? (
        <LogoImage
          brand={brand}
          cx={50}
          height={logo.height}
          plate={p.tile.fill}
          top={Math.max(9, 31 - logo.height)}
          width={logo.width}
        />
      ) : (
        <Lines
          family={families.brand}
          fill={p.text}
          fitted={name}
          letterSpacing={brand.upper ? 0.06 : -0.01}
          font="brand"
          weight={600}
          x={50}
          y={30.5 - nameH + name.size * 0.74}
        />
      )}
      <rect
        fill={p.tile.fill}
        height={28}
        rx={14}
        stroke={p.tile.stroke}
        strokeWidth={p.tile.stroke === "none" ? undefined : 0.3}
        width={70}
        x={15}
        y={36}
      />
      <QrTile
        colors={{ ...p.tile, stroke: "none" }}
        radius={1.6}
        size={24}
        text={qrText}
        x={23}
        y={38}
      />
      <KardoSymbol
        height={17}
        ring={p.tile.ink}
        wave={p.tileAccent}
        x={64 - symbolWidth(17) / 2}
        y={41.5}
      />
      <Lines
        family={families.ui}
        fill={p.text}
        fitted={call}
        font="ui"
        weight={400}
        x={50}
        y={call.lines.length > 1 ? 71 : 73}
      />
      <KardoMark color={p.text} cx={50} width={markW} y={83} />
    </>
  );
}

const clipShapes: Record<PieceId, (id: string) => ReactNode> = {
  stand: () => <rect height={150} rx={2} width={100} />,
  card: () => <rect height={54} rx={3.18} width={85.6} />,
  magnet: () => <rect height={50} rx={2} width={90} />,
  sticker: () => <circle cx={50} cy={50} r={50} />,
};

/** One face of one piece. */
export function PieceArt({
  design,
  piece = design.piece,
  side = "front",
  families,
  qrText,
  id,
  className,
  title,
}: Props) {
  const size = pieceSize[piece];
  const clip = `${id}-clip`;
  const shared = { design, families, qrText, side };
  return (
    <svg
      aria-label={title}
      className={className}
      role={title ? "img" : undefined}
      viewBox={`0 0 ${size.width} ${size.height}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <clipPath id={clip}>{clipShapes[piece](id)}</clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        {piece === "stand" ? <Stand {...shared} /> : null}
        {piece === "card" ? <Card {...shared} /> : null}
        {piece === "magnet" ? <Magnet {...shared} /> : null}
        {piece === "sticker" ? <Sticker {...shared} id={id} /> : null}
      </g>
    </svg>
  );
}

/** The faces each piece prints. */
export function sidesOf(piece: PieceId): Side[] {
  return piece === "card" ? ["front", "back"] : ["front"];
}
