import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { site } from "@/lib/site";
import { dmSans, geist, lora, playfair, poppins, spaceGrotesk } from "./fonts";
// kardo-page.css and hero-pages.css belong to sections the home no longer
// shows (Pages, HeroPages): not loaded, so they do not block the first paint.
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: "Kardo | Tu negocio, en un solo panel",
    template: "%s | Kardo",
  },
  description: site.description,
  applicationName: "Kardo",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "es_MX",
    siteName: "Kardo",
    title: "Kardo | Tu negocio, en un solo panel",
    description: site.description,
  },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: "#f7f5f0",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      className={`${geist.variable} ${dmSans.variable} ${playfair.variable} ${lora.variable} ${spaceGrotesk.variable} ${poppins.variable}`}
      lang="es-MX"
    >
      <body>
        <a
          className="fixed top-3 left-3 z-[60] -translate-y-24 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white focus:translate-y-0"
          href="#contenido"
        >
          Saltar al contenido
        </a>
        {children}
      </body>
    </html>
  );
}
