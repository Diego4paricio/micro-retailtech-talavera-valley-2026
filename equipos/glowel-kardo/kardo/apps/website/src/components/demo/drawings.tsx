import type { ReactNode } from "react";
import {
  Bouquet,
  CafeDeOlla,
  Cappuccino,
  Chilaquiles,
  CoffeeBag,
  Concha,
  ConchaSmall,
  Espresso,
  Mug,
  RoseBox,
  Succulent,
} from "../kardo-page/illustrations";
import type { DrawingKey } from "./demo-data";

/** A salon's ad photo: a bottle of nail polish. */
export function NailPolish() {
  return (
    <svg aria-hidden="true" className="size-full" viewBox="0 0 200 200">
      <rect fill="#f3e6ea" height="200" width="200" />
      <ellipse cx="100" cy="166" fill="#e4cfd6" rx="46" ry="8" />
      <rect fill="#c94f6d" height="74" rx="18" width="68" x="66" y="90" />
      <rect
        fill="#a93f5a"
        height="74"
        rx="18"
        opacity=".45"
        width="30"
        x="104"
        y="90"
      />
      <rect
        fill="#ffffff"
        height="44"
        opacity=".28"
        rx="5"
        width="9"
        x="77"
        y="102"
      />
      <rect fill="#a93f5a" height="14" rx="3" width="30" x="85" y="80" />
      <rect fill="#16232e" height="46" rx="8" width="34" x="83" y="38" />
      <rect
        fill="#ffffff"
        height="34"
        opacity=".18"
        rx="3"
        width="6"
        x="89"
        y="44"
      />
    </svg>
  );
}

/*
  The drawn photos of the demo's products. The landing has no customer
  photos, and a drawing never pretends to be one.
*/
export const drawings: Record<DrawingKey, ReactNode> = {
  espresso: <Espresso />,
  capuchino: <Cappuccino />,
  olla: <CafeDeOlla />,
  concha: <ConchaSmall />,
  chilaquiles: <Chilaquiles />,
  grano: <CoffeeBag />,
  taza: <Mug />,
  conchas: <Concha />,
  ramo: <Bouquet />,
  rosas: <RoseBox />,
  suculenta: <Succulent />,
};
