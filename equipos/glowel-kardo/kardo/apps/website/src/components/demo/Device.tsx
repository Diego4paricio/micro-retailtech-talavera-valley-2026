import { Link2 } from "lucide-react";
import type { ReactNode } from "react";
import { LogoSymbol } from "../Logo";
import { QrArt } from "../QrArt";

/*
  A phone drawn in CSS for the live demo. The screen is 280 or 300 CSS px
  wide and the page inside is laid out at 390 px (a common phone) and
  zoomed down, so the Resolver's real sizes stay intact.
*/

export function Device({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <figure
      aria-label={label}
      className="relative mx-auto w-fit rounded-[3.1rem] bg-gradient-to-br from-[#2b3e49] via-[#101b22] to-[#060b0e] p-[11px] shadow-[0_40px_80px_-30px_rgba(13,22,29,0.65)] ring-1 ring-white/10"
    >
      <div className="relative h-[580px] w-[280px] overflow-hidden rounded-[2.45rem] bg-black sm:h-[620px] sm:w-[300px]">
        {children}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-[10px] left-1/2 h-[26px] w-[88px] -translate-x-1/2 rounded-full bg-black"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-2 left-1/2 z-10 h-[4px] w-[104px] -translate-x-1/2 rounded-full bg-white opacity-70 mix-blend-difference"
        />
      </div>
    </figure>
  );
}

/** The page viewport: 390 px wide, zoomed to the screen. */
export function Viewport({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[808px] w-[390px] flex-col [zoom:0.7179] sm:[zoom:0.7692]">
      {children}
    </div>
  );
}

export function StatusBar({ tone }: { tone: "light" | "dark" }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-x-0 top-0 z-10 flex h-[46px] items-center justify-between px-7 pt-1 text-[13px] font-semibold ${tone === "light" ? "text-white" : "text-ink"}`}
    >
      <span className="font-display tracking-[-0.01em]">9:41</span>
      <span className="flex items-center gap-1.5">
        <svg
          aria-hidden="true"
          className="h-[10px] w-[16px]"
          fill="currentColor"
          viewBox="0 0 16 10"
        >
          <rect height="4" rx="1" width="3" x="0" y="6" />
          <rect height="6" rx="1" width="3" x="4.3" y="4" />
          <rect height="8" rx="1" width="3" x="8.6" y="2" />
          <rect height="10" rx="1" width="3" x="12.9" y="0" />
        </svg>
        <svg
          aria-hidden="true"
          className="h-[10px] w-[14px]"
          fill="currentColor"
          viewBox="0 0 14 10"
        >
          <path d="M7 10 4.9 7.6a3 3 0 0 1 4.2 0Z" />
          <path d="M2.8 5.5a6 6 0 0 1 8.4 0l-1 1.1a4.5 4.5 0 0 0-6.4 0Z" />
          <path d="M.7 3.4a9 9 0 0 1 12.6 0l-1 1.1a7.5 7.5 0 0 0-10.6 0Z" />
        </svg>
        <span className="relative h-[11px] w-[22px] rounded-[3px] border border-current/60 p-[1.5px]">
          <span className="block h-full w-[70%] rounded-[1.5px] bg-current" />
        </span>
      </span>
    </div>
  );
}

export function LockScreen({
  dimmed = false,
  hint,
}: {
  dimmed?: boolean;
  hint: string;
}) {
  return (
    <div
      className={`absolute inset-0 flex flex-col items-center bg-[radial-gradient(120%_70%_at_50%_0%,#1f5963_0%,#0f2830_45%,#070d11_100%)] px-6 pt-20 text-white transition-[filter] duration-300 ${dimmed ? "brightness-75" : ""}`}
    >
      <p className="text-[15px] font-medium text-white/75">Lunes</p>
      <p className="font-display text-[76px] leading-none font-semibold tracking-[-0.04em]">
        9:41
      </p>
      <div className="mt-auto mb-12 w-full rounded-2xl bg-white/12 p-4 text-center text-[13px] leading-snug text-white/85 backdrop-blur-md">
        {hint}
      </div>
    </div>
  );
}

/** The system banner a phone shows when it reads an NFC tag. */
export function NfcBanner({ name }: { name: string }) {
  return (
    <div className="banner-in absolute inset-x-2.5 top-[50px] z-20 flex items-center gap-3 rounded-[1.1rem] bg-[#f4f6f5]/95 px-3.5 py-3 text-ink shadow-xl backdrop-blur-md">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[0.6rem] bg-ink">
        <LogoSymbol className="h-4 w-auto" decorative tone="dark" />
      </span>
      <span className="grid text-[12.5px] leading-tight">
        <span className="font-semibold">Etiqueta NFC</span>
        <span className="text-muted">Abrir la página de {name}</span>
      </span>
    </div>
  );
}

/** The camera pointed at the printed QR, which is real (it opens the site). */
export function QrCamera({
  url,
  found,
  caption,
  name,
}: {
  url: string;
  found: boolean;
  caption: string;
  name: string;
}) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(90%_60%_at_50%_45%,#6b5a4a_0%,#3a3029_55%,#171310_100%)]">
      <div className="absolute top-1/2 left-1/2 w-[62%] -translate-x-1/2 -translate-y-1/2 -rotate-3 rounded-xl bg-paper p-2.5 shadow-2xl">
        <QrArt className="h-auto w-full" text={url} />
        <p className="mt-1.5 text-center font-display text-[11px] font-semibold text-ink">
          {caption}
        </p>
      </div>
      <div
        aria-hidden="true"
        className={`scan-frame absolute top-1/2 left-1/2 size-[74%] -translate-x-1/2 -translate-y-1/2 ${found ? "scan-found" : ""}`}
      >
        <i className="absolute top-0 left-0 h-7 w-7 rounded-tl-2xl border-t-[3px] border-l-[3px] border-[#ffd60a]" />
        <i className="absolute top-0 right-0 h-7 w-7 rounded-tr-2xl border-t-[3px] border-r-[3px] border-[#ffd60a]" />
        <i className="absolute bottom-0 left-0 h-7 w-7 rounded-bl-2xl border-b-[3px] border-l-[3px] border-[#ffd60a]" />
        <i className="absolute right-0 bottom-0 h-7 w-7 rounded-br-2xl border-r-[3px] border-b-[3px] border-[#ffd60a]" />
      </div>
      {found ? (
        <div className="banner-in absolute inset-x-0 bottom-16 flex justify-center">
          <span className="rounded-full bg-[#ffd60a] px-4 py-2 text-[13px] font-semibold text-black shadow-lg">
            Abrir página de {name}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** Grey lines standing for the text of the page around the ad. */
function TextLines({ widths }: { widths: string[] }) {
  return (
    <div aria-hidden="true" className="grid gap-2">
      {widths.map((width, index) => (
        <span
          className="h-2.5 rounded-full bg-[#dcdfdc]"
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed decoration.
          key={index}
          style={{ width }}
        />
      ))}
    </div>
  );
}

/**
 * "Otro": an ad on a web page whose button opens the ad's own Touchpoint,
 * a point with its own address. Kardo counts its visits as URL directa.
 */
export function AdScreen({
  name,
  tagline,
  button,
  image,
  tapped,
}: {
  name: string;
  tagline: string;
  button: string;
  image: ReactNode;
  tapped: boolean;
}) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#f3f2ee] px-4 pt-[62px] text-ink">
      <TextLines widths={["82%", "94%", "60%"]} />
      <div className="mt-5 rounded-2xl bg-white p-3.5 shadow-[0_10px_28px_-18px_rgba(22,35,46,0.5)] ring-1 ring-black/5">
        <p className="text-[11px] font-semibold text-soft">Anuncio</p>
        <div className="mt-2 flex items-center gap-3">
          <span className="size-16 shrink-0 overflow-hidden rounded-xl">
            {image}
          </span>
          <span className="grid gap-0.5">
            <span className="text-[14px] leading-tight font-semibold">
              {name}
            </span>
            <span className="text-[12.5px] leading-snug text-muted">
              {tagline}
            </span>
          </span>
        </div>
        <span
          className={`mt-3.5 flex h-10 items-center justify-center rounded-full text-[14px] font-semibold text-white motion-safe:transition-transform motion-safe:duration-200 ${tapped ? "scale-95 bg-teal-hover" : "bg-teal"}`}
        >
          {button}
        </span>
      </div>
      <div className="mt-5">
        <TextLines widths={["90%", "76%", "88%", "54%"]} />
      </div>
    </div>
  );
}

/**
 * Links: the social profile where the business shares its @handle. A
 * generic profile, not any network's own screen.
 */
export function ProfileScreen({
  name,
  handle,
  bio,
  photos,
  tapped,
}: {
  name: string;
  handle: string;
  bio: string;
  photos: ReactNode[];
  tapped: boolean;
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("");
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#fbfaf7] px-5 pt-[64px] text-ink">
      <div className="flex items-center gap-4">
        <span className="flex size-[4.25rem] shrink-0 items-center justify-center rounded-full bg-[#f3e3dc] font-display text-[21px] font-semibold ring-2 ring-[#e7a3b8] ring-offset-2 ring-offset-[#fbfaf7]">
          {initials}
        </span>
        <span className="grid">
          <span className="text-[15px] font-semibold">{handle}</span>
          <span className="text-[12.5px] text-soft">{name}</span>
        </span>
      </div>
      <p className="mt-3.5 text-[13px] leading-snug">{bio}</p>
      <span
        className={`mt-2 -ml-1.5 inline-flex items-center gap-1.5 rounded-full px-1.5 py-0.5 text-[13px] font-semibold text-teal motion-safe:transition-colors ${tapped ? "bg-teal/15" : ""}`}
      >
        <Link2 aria-hidden="true" className="size-3.5" />@{handle}
      </span>
      <div aria-hidden="true" className="mt-6 grid grid-cols-3 gap-1">
        {photos.map((photo, index) => (
          <span
            className="aspect-square overflow-hidden"
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed photos.
            key={index}
          >
            {photo}
          </span>
        ))}
      </div>
    </div>
  );
}
