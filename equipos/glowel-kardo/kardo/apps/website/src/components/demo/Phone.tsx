import { AtSign, Globe, Nfc, QrCode } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { absoluteUrl } from "@/lib/site";
import {
  AdScreen,
  Device,
  LockScreen,
  NfcBanner,
  ProfileScreen,
  QrCamera,
  StatusBar,
  Viewport,
} from "./Device";
import type { LinksProduct, PhoneCopy } from "./demo-data";
import type { Screen, Via } from "./hooks";
import { VisitButton } from "./panel";

const channelButtons = [
  {
    via: "nfc",
    label: "Acercar NFC",
    icon: <Nfc aria-hidden="true" className="size-5" />,
  },
  {
    via: "qr",
    label: "Escanear QR",
    icon: <QrCode aria-hidden="true" className="size-5" />,
  },
  {
    via: "link",
    label: "Ver anuncio",
    icon: <Globe aria-hidden="true" className="size-5" />,
  },
] as const;

/**
 * The customer's side of the demo: the phone and the ways to open the
 * page. NFC and QR on the group's points; the ad, an "Otro" point of its
 * own whose visits count as URL directa. Links, a separate product, gets
 * its own button apart.
 */
export function Phone({
  name,
  copy,
  screen,
  page,
  pageTone,
  adImage,
  links,
  caption,
  onVisit,
  children,
}: {
  name: string;
  copy: PhoneCopy;
  screen: Screen;
  /** The page on screen, laid out at 390 px. */
  page: ReactNode;
  /** Status bar text over the page: white on a dark page. */
  pageTone: "light" | "dark";
  adImage: ReactNode;
  links?: { product: LinksProduct; photos: ReactNode[] };
  caption: string;
  onVisit: (via: Via) => void;
  children?: ReactNode;
}) {
  const reading = screen.kind === "reading" ? screen : null;
  const open = screen.kind === "page" || screen.kind === "sent";
  const pageRef = useRef<HTMLElement>(null);

  // Sending the form removes its button: keep the keyboard on the page
  // that replaced it, the Resolver's "¡Listo!".
  useEffect(() => {
    if (screen.kind === "sent") pageRef.current?.focus({ preventScroll: true });
  }, [screen.kind]);

  const tone = open
    ? pageTone
    : reading?.via === "link" || reading?.via === "handle"
      ? "dark"
      : "light";
  return (
    <div className="lg:order-2">
      <Device label={`Celular de ejemplo de un cliente de ${name}`}>
        <StatusBar tone={tone} />
        {open ? (
          <section
            aria-label="Página abierta en el celular"
            className="page-in absolute inset-0 overflow-y-auto overscroll-contain [scrollbar-width:none]"
            key={`${screen.kind}-${screen.via}`}
            ref={pageRef}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be reachable by keyboard.
            tabIndex={0}
          >
            <Viewport>{page}</Viewport>
          </section>
        ) : reading?.via === "qr" ? (
          <QrCamera
            caption={copy.qrCaption}
            found={reading.found}
            name={name}
            url={absoluteUrl("/")}
          />
        ) : reading?.via === "link" ? (
          <AdScreen
            button={copy.ad.button}
            image={adImage}
            name={name}
            tagline={copy.ad.tagline}
            tapped={reading.found}
          />
        ) : reading?.via === "handle" && links ? (
          <ProfileScreen
            bio={links.product.profileBio}
            handle={links.product.handle}
            name={name}
            photos={links.photos}
            tapped={reading.found}
          />
        ) : (
          <>
            <LockScreen
              dimmed={reading !== null}
              hint={`Usa los botones de abajo: acerca el celular ${copy.place}, escanea su QR o toca el anuncio.`}
            />
            {reading?.via === "nfc" && reading.found ? (
              <NfcBanner name={name} />
            ) : null}
          </>
        )}
      </Device>

      <div className="mx-auto mt-6 grid max-w-[322px] grid-cols-3 gap-2">
        {channelButtons.map((button) => (
          <VisitButton
            active={reading?.via === button.via}
            icon={button.icon}
            key={button.via}
            label={button.label}
            onClick={() => onVisit(button.via)}
          />
        ))}
      </div>
      <p className="mx-auto mt-3 max-w-[322px] text-center text-[13px] leading-snug text-soft">
        {caption}
      </p>

      {links ? (
        <div className="mx-auto mt-5 max-w-[322px] border-t border-ink/10 pt-4">
          <p className="text-center text-[13px] leading-snug text-soft">
            Links va aparte: es su página para Instagram.
          </p>
          <button
            aria-pressed={reading?.via === "handle"}
            className={`mt-2.5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border px-4 text-[15px] font-semibold transition-colors ${reading?.via === "handle" ? "border-ink bg-ink text-white" : "border-ink/15 bg-paper text-ink hover:border-ink/40"}`}
            onClick={() => onVisit("handle")}
            type="button"
          >
            <AtSign aria-hidden="true" className="size-[18px]" />
            Abrir @{links.product.handle}
          </button>
        </div>
      ) : null}

      {children}
    </div>
  );
}
