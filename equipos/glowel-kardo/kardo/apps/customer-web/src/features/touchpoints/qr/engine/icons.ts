import type { QrFrameIcon } from "@kardo/contracts";
import {
  circlePath,
  closePath,
  lineTo,
  moveTo,
  rectPath,
  roundedRectPath,
} from "./shapes.js";
import type { PathCommand } from "./types.js";

/**
 * Frame CTA icons: original, solid-fill glyphs in a 24×24 box (no strokes,
 * no third-party icon paths, no brand marks — see engine rules). Sober
 * geometric style, coherent with the rest of the studio.
 */

function polygon(
  points: readonly (readonly [number, number])[],
): PathCommand[] {
  const [first, ...rest] = points;
  if (!first) return [];
  return [
    moveTo(first[0], first[1]),
    ...rest.map(([x, y]) => lineTo(x, y)),
    closePath(),
  ];
}

function rotatePath(
  path: readonly PathCommand[],
  angleDeg: number,
  pivot: readonly [number, number],
): PathCommand[] {
  const theta = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const [px, py] = pivot;
  const rotate = (x: number, y: number): [number, number] => {
    const dx = x - px;
    const dy = y - py;
    return [px + dx * cos - dy * sin, py + dx * sin + dy * cos];
  };
  return path.map((command) => {
    if (command[0] === "Z") return command;
    if (command[0] === "M" || command[0] === "L") {
      const [x, y] = rotate(command[1], command[2]);
      return [command[0], x, y] as PathCommand;
    }
    const [x1, y1] = rotate(command[1], command[2]);
    const [x2, y2] = rotate(command[3], command[4]);
    const [x, y] = rotate(command[5], command[6]);
    return ["C", x1, y1, x2, y2, x, y] as PathCommand;
  });
}

function scan(): PathCommand[] {
  const arm = 6;
  const thickness = 2;
  const inset = 2;
  const far = 24 - inset;
  const corners: (readonly [number, number, number, number])[] = [
    [inset, inset, 1, 1], // top-left, scale x=1, y=1
    [far, inset, -1, 1], // top-right
    [far, far, -1, -1], // bottom-right
    [inset, far, 1, -1], // bottom-left
  ];
  const commands: PathCommand[] = [];
  for (const [x, y, sx, sy] of corners) {
    commands.push(...rectPath(x, y, arm * sx, thickness * sy));
    commands.push(...rectPath(x, y, thickness * sx, arm * sy));
  }
  return commands;
}

function menu(): PathCommand[] {
  const bars = [5, 11, 17];
  const commands: PathCommand[] = [];
  for (const y of bars)
    commands.push(
      ...roundedRectPath(3, y, 18, 2.4, { tl: 1.2, tr: 1.2, br: 1.2, bl: 1.2 }),
    );
  return commands;
}

function star(): PathCommand[] {
  const cx = 12;
  const cy = 12.5;
  const outer = 10;
  const inner = 4;
  const points: [number, number][] = [];
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
  }
  return polygon(points);
}

function phone(): PathCommand[] {
  const capsule = roundedRectPath(9, 2, 6, 20, { tl: 3, tr: 3, br: 3, bl: 3 });
  return rotatePath(capsule, 45, [12, 12]);
}

function wifi(): PathCommand[] {
  const bars = [
    { x: 4, width: 3, height: 5 },
    { x: 10.5, width: 3, height: 10 },
    { x: 17, width: 3, height: 15 },
  ];
  const commands: PathCommand[] = [];
  for (const bar of bars)
    commands.push(
      ...roundedRectPath(bar.x, 21 - bar.height, bar.width, bar.height, {
        tl: 1,
        tr: 1,
        br: 0,
        bl: 0,
      }),
    );
  return commands;
}

function gift(): PathCommand[] {
  const commands: PathCommand[] = [];
  commands.push(...rectPath(4, 11, 16, 10));
  commands.push(
    ...roundedRectPath(3, 7, 18, 4.5, { tl: 1, tr: 1, br: 1, bl: 1 }),
  );
  commands.push(...rectPath(10.6, 7, 2.8, 14));
  commands.push(...circlePath(9, 5.2, 2.1));
  commands.push(...circlePath(15, 5.2, 2.1));
  return commands;
}

function calendar(): PathCommand[] {
  const commands: PathCommand[] = [];
  commands.push(
    ...roundedRectPath(3, 5, 18, 16, { tl: 2, tr: 2, br: 2, bl: 2 }),
  );
  commands.push(
    ...roundedRectPath(6.5, 2, 2.2, 6, { tl: 1, tr: 1, br: 1, bl: 1 }),
  );
  commands.push(
    ...roundedRectPath(15.3, 2, 2.2, 6, { tl: 1, tr: 1, br: 1, bl: 1 }),
  );
  return commands;
}

function cart(): PathCommand[] {
  const commands: PathCommand[] = [];
  commands.push(
    ...polygon([
      [4, 4],
      [21, 4],
      [18, 16],
      [7.5, 16],
    ]),
  );
  commands.push(...circlePath(9, 20, 1.8));
  commands.push(...circlePath(17, 20, 1.8));
  return commands;
}

function heart(): PathCommand[] {
  // Two lobes plus a wedge that fills the gap and tapers to the bottom tip;
  // all three subpaths share the same winding, so they simply union.
  const left = circlePath(8.5, 9, 4.5);
  const right = circlePath(15.5, 9, 4.5);
  const wedge = polygon([
    [4.5, 10],
    [19.5, 10],
    [12, 21.5],
  ]);
  return [...left, ...right, ...wedge];
}

function pointer(): PathCommand[] {
  return polygon([
    [6, 3],
    [6, 19],
    [10, 15.2],
    [13, 21.5],
    [16.3, 20],
    [13.3, 13.6],
    [19, 13],
  ]);
}

function info(): PathCommand[] {
  return [
    ...circlePath(12, 12, 10),
    ...circlePath(12, 7.2, 1.5),
    ...roundedRectPath(10.6, 10, 2.8, 8, {
      tl: 1.2,
      tr: 1.2,
      br: 1.2,
      bl: 1.2,
    }),
  ];
}

/** Icon geometry in a 24×24 box; `fillRule` tells the renderer how to combine subpaths. */
export function iconPath(icon: QrFrameIcon): {
  d: readonly PathCommand[];
  fillRule: "nonzero" | "evenodd";
} {
  switch (icon) {
    case "scan":
      return { d: scan(), fillRule: "nonzero" };
    case "menu":
      return { d: menu(), fillRule: "nonzero" };
    case "star":
      return { d: star(), fillRule: "nonzero" };
    case "phone":
      return { d: phone(), fillRule: "nonzero" };
    case "wifi":
      return { d: wifi(), fillRule: "nonzero" };
    case "gift":
      return { d: gift(), fillRule: "nonzero" };
    case "calendar":
      return { d: calendar(), fillRule: "nonzero" };
    case "cart":
      return { d: cart(), fillRule: "nonzero" };
    case "heart":
      return { d: heart(), fillRule: "nonzero" };
    case "pointer":
      return { d: pointer(), fillRule: "nonzero" };
    case "info":
      return { d: info(), fillRule: "evenodd" };
    default:
      return { d: [], fillRule: "nonzero" };
  }
}
