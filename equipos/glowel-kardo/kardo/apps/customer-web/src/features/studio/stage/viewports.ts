/**
 * Real screen sizes for the Estudio's previews. The page always renders in
 * an iframe exactly as big as the visible area of that screen (it scrolls
 * inside, like a real one), and the stage only scales it down to fit.
 */

export type Device = "phone" | "desktop" | "both";
export type DesktopWidth = 768 | 1280 | 1440;
export type Viewport = { width: number; height: number };

export const desktopWidths: readonly DesktopWidth[] = [768, 1280, 1440];

/**
 * An iPhone 14/15 screen in CSS px (390 × 844 in total). The Estudio draws
 * its own status bar on top (so the island never covers the page) and the
 * home indicator at the bottom; the page gets the visible area in between,
 * like Safari with its bars tucked away.
 */
export const phoneScreen: Viewport = { width: 390, height: 844 };
export const phoneStatusBar = 50;
export const phoneHomeBar = 30;
export const phoneViewport: Viewport = {
  width: phoneScreen.width,
  height: phoneScreen.height - phoneStatusBar - phoneHomeBar,
};

export function desktopViewport(width: DesktopWidth): Viewport {
  if (width === 768) return { width: 768, height: 1024 };
  if (width === 1440) return { width: 1440, height: 900 };
  return { width: 1280, height: 800 };
}

/** Frame around the screen, in unscaled px: the phone bezel on every side
 * (it scales with the phone) and the browser window's bar on top (it keeps
 * its size, so its text stays readable). */
export const phoneBezel = 12;
export const desktopBar = 34;

/** The phone with its bezel, in unscaled px. */
export const phoneFrame: Viewport = {
  width: phoneScreen.width + phoneBezel * 2,
  height: phoneScreen.height + phoneBezel * 2,
};

type Room = { width: number; height: number };

export const minScale = 0.15;
export const maxScale = 1.5;

function clampScale(value: number, max = 1): number {
  if (!Number.isFinite(value) || value <= 0) return 0.2;
  return Math.max(minScale, Math.min(max, value));
}

/** Scale that fits one device, frame included, in a room (never above 1). */
export function fitScale(
  kind: "phone" | "desktop",
  viewport: Viewport,
  room: Room,
): number {
  if (kind === "phone")
    return clampScale(
      Math.min(room.width / phoneFrame.width, room.height / phoneFrame.height),
    );
  // The window's bar and border keep their size.
  return clampScale(
    Math.min(
      (room.width - 2) / viewport.width,
      (room.height - desktopBar - 2) / viewport.height,
    ),
  );
}

export const bothGap = 24;

/**
 * "Ambos": the computer and the phone side by side, as big as the room
 * allows together. Each one's own best fit is its ceiling; the room's width
 * is split so both reach the same share of it (the phone is never cut to
 * a sliver so the computer can grow, nor the other way around).
 */
export function bothScales(
  desktop: Viewport,
  room: Room,
): { phone: number; desktop: number } {
  const phoneMax = clampScale(room.height / phoneFrame.height);
  const desktopMax = clampScale(
    Math.min(
      (room.width - 2) / desktop.width,
      (room.height - desktopBar - 2) / desktop.height,
    ),
  );
  const width = Math.max(0, room.width - bothGap - 2);
  // phone: k * phoneMax, desktop: k * desktopMax, widths add up to `width`.
  const k = Math.min(
    1,
    width / (phoneFrame.width * phoneMax + desktop.width * desktopMax),
  );
  return {
    phone: clampScale(phoneMax * k),
    desktop: clampScale(desktopMax * k),
  };
}

/** Width and height a device takes on the stage at `scale`. */
export function deviceSize(
  kind: "phone" | "desktop",
  viewport: Viewport,
  scale: number,
): Viewport {
  if (kind === "phone")
    return {
      width: phoneFrame.width * scale,
      height: phoneFrame.height * scale,
    };
  return {
    width: viewport.width * scale + 2,
    height: viewport.height * scale + desktopBar + 2,
  };
}

/** A per-person preference remembered in this browser (never required). */
export function readPreference<T extends string | number | boolean>(
  key: string,
  fallback: T,
  valid: (value: unknown) => value is T,
): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const value: unknown = JSON.parse(raw);
    return valid(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export function writePreference(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private windows or blocked storage: the preference just isn't kept.
  }
}

export function isDesktopWidth(value: unknown): value is DesktopWidth {
  return value === 768 || value === 1280 || value === 1440;
}

export function isDevice(value: unknown): value is Device {
  return value === "phone" || value === "desktop" || value === "both";
}
