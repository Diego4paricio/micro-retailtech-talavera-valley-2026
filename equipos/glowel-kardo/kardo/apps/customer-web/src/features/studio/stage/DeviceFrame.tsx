import type { PageDesign } from "@kardo/contracts";
import type { CSSProperties, ReactNode } from "react";
import { Icon } from "../../../components/Icon.js";
import { relativeLuminance } from "../../../lib/color.js";
import {
  desktopBar,
  phoneBezel,
  phoneHomeBar,
  phoneScreen,
  phoneStatusBar,
  phoneViewport,
  type Viewport,
} from "./viewports.js";

/**
 * The devices the page is shown in. A phone of 390 × 844 with its bezel,
 * its own status bar on top (time, signal, battery and the island, over the
 * page's own color, so the island never covers the page) and the home
 * indicator at the bottom; the page gets the visible area in between. A
 * computer is a browser window at the real width, scaled.
 *
 * `children` is the page at the viewport size, already scaled; `float` is
 * an unclipped layer over the page (quick actions that may stick out of
 * the screen). Shared by the Estudio's stage and the modo HTML.
 */

export type ScreenTone = { background: string; text: string };

/** The status bar's own background and a readable text color on it, from any
 * `#rrggbb` background — shared by `screenTone` (Bloques, which has a
 * `PageDesign` to read) and modo HTML (which only has the rendered page's
 * own `--kd-background`; see `html/HtmlStage.tsx`). */
export function toneFromBackground(background: string): ScreenTone {
  return {
    background,
    text: relativeLuminance(background, 1) > 0.4 ? "#0b0f14" : "#ffffff",
  };
}

/** The status bar takes the page's background, like Safari does. */
export function screenTone(design: PageDesign | null): ScreenTone {
  const background =
    design?.style.background.kind === "solid" && design.style.background.color
      ? design.style.background.color
      : design?.style.background.kind === "gradient" &&
          design.style.background.color
        ? design.style.background.color
        : (design?.style.palette.background ?? "#ffffff");
  return toneFromBackground(background);
}

function StatusIcons() {
  return (
    <svg
      aria-hidden="true"
      className="es-status-icons"
      focusable="false"
      viewBox="0 0 68 12"
    >
      {/* Signal */}
      <rect height="4" rx="1" width="3" x="0" y="8" />
      <rect height="6" rx="1" width="3" x="4.5" y="6" />
      <rect height="8.5" rx="1" width="3" x="9" y="3.5" />
      <rect height="11" rx="1" width="3" x="13.5" y="1" />
      {/* Wi-Fi */}
      <path d="M29 2.6a10.6 10.6 0 0 1 7.4 3l1.3-1.4A12.5 12.5 0 0 0 29 .7a12.5 12.5 0 0 0-8.7 3.5l1.3 1.4A10.6 10.6 0 0 1 29 2.6Zm0 3.9a6.8 6.8 0 0 1 4.7 1.9l1.3-1.4a8.7 8.7 0 0 0-6-2.4 8.7 8.7 0 0 0-6 2.4l1.3 1.4A6.8 6.8 0 0 1 29 6.5Zm0 3.8a3 3 0 0 1 2 .8L29 13l-2-1.9a3 3 0 0 1 2-.8Z" />
      {/* Battery */}
      <rect
        fill="none"
        height="11"
        opacity="0.4"
        rx="3"
        stroke="currentColor"
        strokeWidth="1"
        width="23"
        x="42.5"
        y="0.5"
      />
      <rect height="8" rx="1.8" width="19" x="44.5" y="2" />
      <path d="M66.6 4v4a2.2 2.2 0 0 0 0-4Z" opacity="0.45" />
    </svg>
  );
}

export function PhoneFrame({
  scale,
  tone,
  children,
  float,
  primary,
}: {
  scale: number;
  tone: ScreenTone;
  children: ReactNode;
  float?: ReactNode;
  primary?: boolean | undefined;
}) {
  const style = {
    "--es-scale": scale,
    "--es-status-bg": tone.background,
    "--es-status-fg": tone.text,
  } as CSSProperties;
  return (
    <div
      className="es-device"
      data-device="phone"
      data-primary={primary || undefined}
      style={style}
    >
      <span aria-hidden="true" className="es-phone-key" data-key="action" />
      <span aria-hidden="true" className="es-phone-key" data-key="up" />
      <span aria-hidden="true" className="es-phone-key" data-key="down" />
      <span aria-hidden="true" className="es-phone-key" data-key="power" />
      <div
        className="es-screen"
        style={{
          width: phoneScreen.width * scale,
          height: phoneScreen.height * scale,
        }}
      >
        <div
          aria-hidden="true"
          className="es-status"
          style={{ height: phoneStatusBar * scale }}
        >
          <span className="es-status-time">9:41</span>
          <span className="es-island" />
          <StatusIcons />
        </div>
        <div
          className="es-viewport"
          style={{
            width: phoneViewport.width * scale,
            height: phoneViewport.height * scale,
          }}
        >
          {children}
        </div>
        <div
          aria-hidden="true"
          className="es-home"
          style={{ height: phoneHomeBar * scale }}
        >
          <span />
        </div>
      </div>
      {float ? (
        <div
          className="es-float"
          style={{
            left: phoneBezel * scale,
            top: (phoneBezel + phoneStatusBar) * scale,
            width: phoneViewport.width * scale,
            height: phoneViewport.height * scale,
          }}
        >
          {float}
        </div>
      ) : null}
    </div>
  );
}

export function DesktopFrame({
  scale,
  viewport,
  title,
  children,
  float,
  primary,
}: {
  scale: number;
  viewport: Viewport;
  title: string;
  children: ReactNode;
  float?: ReactNode;
  primary?: boolean | undefined;
}) {
  return (
    <div
      className="es-device"
      data-device="desktop"
      data-primary={primary || undefined}
      style={{ "--es-scale": scale } as CSSProperties}
    >
      <div
        aria-hidden="true"
        className="es-window-bar"
        style={{ height: desktopBar }}
      >
        <span className="es-window-dots">
          <i />
          <i />
          <i />
        </span>
        <span className="es-window-address">
          <Icon name="lock" size={11} />
          <span>{title}</span>
        </span>
        <b>{viewport.width} px</b>
      </div>
      <div
        className="es-viewport"
        style={{
          width: viewport.width * scale,
          height: viewport.height * scale,
        }}
      >
        {children}
      </div>
      {float ? (
        <div
          className="es-float"
          style={{
            left: 0,
            top: desktopBar,
            width: viewport.width * scale,
            height: viewport.height * scale,
          }}
        >
          {float}
        </div>
      ) : null}
    </div>
  );
}
