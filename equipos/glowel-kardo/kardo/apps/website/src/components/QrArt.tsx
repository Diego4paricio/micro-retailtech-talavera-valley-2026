import { qrScene, type Tone } from "@/lib/qr-art";
import { SYMBOL_HEIGHT, SYMBOL_WIDTH, SymbolShapes } from "./Logo";

const tones: Record<Tone, string> = {
  dark: "#16232E",
  accent: "#0A6C78",
  light: "#FFFDF8",
};

/**
 * A real, scannable QR styled the way the Estudio QR exports it: dotted data
 * modules, solid function patterns and the Kardo symbol on a plate.
 * test/qr-art.test.ts decodes this exact geometry.
 */
export function QrArt({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const scene = qrScene(text);
  const { plate } = scene;
  const symbolScale = (plate.size * 0.72) / SYMBOL_HEIGHT;
  return (
    <svg
      aria-label={`Código QR de ejemplo que abre ${text}`}
      className={className}
      role="img"
      shapeRendering="geometricPrecision"
      viewBox={`0 0 ${scene.size} ${scene.size}`}
    >
      <rect fill={tones.light} height={scene.size} rx={2} width={scene.size} />
      {scene.shapes.map((shape, index) =>
        shape.kind === "rect" ? (
          <rect
            fill={tones[shape.tone]}
            height={shape.h}
            // biome-ignore lint/suspicious/noArrayIndexKey: static geometry.
            key={index}
            rx={shape.r}
            width={shape.w}
            x={shape.x}
            y={shape.y}
          />
        ) : (
          <circle
            cx={shape.cx}
            cy={shape.cy}
            fill={tones[shape.tone]}
            // biome-ignore lint/suspicious/noArrayIndexKey: static geometry.
            key={index}
            r={shape.r}
          />
        ),
      )}
      {plate.size > 0 ? (
        <g>
          <rect
            fill={tones.light}
            height={plate.size}
            rx={plate.size * 0.22}
            width={plate.size}
            x={plate.x}
            y={plate.y}
          />
          <SymbolShapes
            color={{ ring: tones.dark, signal: tones.accent }}
            offsetX={plate.x + (plate.size - SYMBOL_WIDTH * symbolScale) / 2}
            offsetY={plate.y + (plate.size - SYMBOL_HEIGHT * symbolScale) / 2}
            scale={symbolScale}
          />
        </g>
      ) : null}
    </svg>
  );
}
