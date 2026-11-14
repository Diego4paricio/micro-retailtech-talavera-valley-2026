import {
  AtSign,
  Check,
  Globe,
  Mail,
  MapPin,
  Megaphone,
  MessageCircle,
  Nfc,
  QrCode,
} from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import {
  type Channel,
  channels,
  connect,
  otherExamples,
} from "@/content/landing";
import { absoluteUrl } from "@/lib/site";
import { KardoPage } from "../kardo-page/KardoPage";
import { presetThemes } from "../kardo-page/theme";
import { QrArt } from "../QrArt";
import { Container, Section, SectionTitle } from "../ui";

const icons: Record<Channel["id"], ReactNode> = {
  qr: <QrCode aria-hidden="true" className="size-5" />,
  nfc: <Nfc aria-hidden="true" className="size-5" />,
  other: <Globe aria-hidden="true" className="size-5" />,
};

/** QR, NFC and "Otro" with the same weight; Links apart, as its own product. */
export function Connect() {
  return (
    <Section id="canales" labelledBy="canales-title">
      <Container>
        <SectionTitle
          id="canales-title"
          lead={connect.lead}
          title={connect.title}
        />

        <ul className="mt-14 grid gap-5 md:grid-cols-3">
          {channels.map((channel) => (
            <li
              className="reveal flex flex-col overflow-hidden rounded-3xl border border-ink/8 bg-paper"
              key={channel.id}
            >
              <div className="relative aspect-[3/4] overflow-hidden bg-[#efe9dd] [container-type:inline-size]">
                <Visual id={channel.id} />
              </div>
              <div className="flex flex-1 flex-col p-6">
                <h3 className="flex items-center gap-2.5 text-2xl font-semibold tracking-[-0.03em]">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-ink text-aqua">
                    {icons[channel.id]}
                  </span>
                  {channel.name}
                </h3>
                <p className="mt-3 text-[15px] font-semibold text-teal">
                  {channel.line}
                </p>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">
                  {channel.text}
                </p>
                <ul className="mt-5 grid gap-2">
                  {channel.points.map((point) => (
                    <li
                      className="flex gap-2.5 text-[14px] leading-snug text-ink"
                      key={point}
                    >
                      <Check
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-teal"
                      />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ul>

        <Groups />
        <LinksProduct />
      </Container>
    </Section>
  );
}

function Visual({ id }: { id: Channel["id"] }) {
  if (id === "qr")
    return (
      <>
        <Image
          alt="Base de mesa de Florería Lila con un código QR impreso en una tarjeta blanca"
          className="size-full object-cover"
          height={1200}
          loading="lazy"
          src="/media/qr-mesa.webp"
          width={900}
        />
        {/* The QR on the stand is real: it opens this page. */}
        <div className="absolute top-[38.6%] left-[29.4%] w-[35.2%] mix-blend-multiply">
          <QrArt className="h-auto w-full" text={absoluteUrl("/")} />
        </div>
        <p
          aria-hidden="true"
          className="absolute top-[68.4%] left-[29.4%] w-[35.2%] text-center font-display text-[2.9cqw] leading-tight font-semibold tracking-[-0.01em] text-ink mix-blend-multiply"
        >
          Escanea y ve el catálogo
        </p>
      </>
    );
  if (id === "nfc")
    return (
      <>
        <Image
          alt="Placa NFC de Estudio Noa en azul tinta"
          className="size-full object-cover"
          height={1200}
          loading="lazy"
          src="/media/placa.webp"
          width={900}
        />
        <div className="absolute inset-x-4 bottom-4 grid grid-cols-2 gap-3">
          {[
            {
              src: "/media/tarjeta.webp",
              label: "Tarjeta",
              alt: "Tarjeta NFC de Sofía Ramírez",
            },
            {
              src: "/media/etiquetas.webp",
              label: "Etiqueta",
              alt: "Etiquetas NFC redondas",
            },
          ].map((piece) => (
            <figure
              className="overflow-hidden rounded-2xl bg-paper shadow-lg ring-1 ring-ink/10"
              key={piece.label}
            >
              <Image
                alt={piece.alt}
                className="aspect-[4/3] w-full object-cover"
                height={1200}
                loading="lazy"
                src={piece.src}
                width={900}
              />
              <figcaption className="px-3 py-1.5 text-[12px] font-semibold text-ink">
                {piece.label}
              </figcaption>
            </figure>
          ))}
        </div>
      </>
    );
  return (
    <div
      aria-hidden="true"
      className="flex size-full flex-col justify-center gap-2 bg-[radial-gradient(90%_70%_at_30%_20%,#f7f5f0,#e6dfd1)] p-5"
    >
      <p className="px-1 pb-1 text-[12px] font-semibold text-soft">
        {otherExamples.business}
      </p>
      {otherExamples.items.map((item) => (
        <div
          className="flex items-center gap-3 rounded-2xl bg-paper px-3.5 py-2.5 shadow-[0_10px_24px_-18px_rgba(22,35,46,0.45)] ring-1 ring-ink/8"
          key={item.id}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-tint text-teal">
            {otherIcons[item.id]}
          </span>
          <span className="grid min-w-0 flex-1 leading-tight">
            <span className="truncate text-[11.5px] text-soft">
              {item.place}
            </span>
            <span className="truncate text-[13px] font-semibold text-ink">
              {item.action}
            </span>
          </span>
          <span className="shrink-0 rounded-full bg-cream px-2 py-1 font-display text-[11.5px] font-semibold text-ink ring-1 ring-ink/10">
            {item.visits}
          </span>
        </div>
      ))}
      <p className="pt-1 text-center text-[12px] font-semibold text-soft">
        {otherExamples.note}
      </p>
    </div>
  );
}

const otherIcons: Record<
  (typeof otherExamples.items)[number]["id"],
  ReactNode
> = {
  mapas: <MapPin className="size-4" />,
  whatsapp: <MessageCircle className="size-4" />,
  anuncio: <Megaphone className="size-4" />,
  correo: <Mail className="size-4" />,
  sitio: <Globe className="size-4" />,
};

function Groups() {
  const tables = Array.from({ length: 20 }, (_, index) => index + 1);
  return (
    <div className="reveal mt-5 grid items-center gap-8 rounded-3xl border border-ink/8 bg-paper p-6 sm:p-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12">
      <div>
        <h3 className="text-2xl font-semibold tracking-[-0.03em]">
          {connect.groups.title}
        </h3>
        <p className="mt-3 text-[16px] leading-relaxed text-muted">
          {connect.groups.text}
        </p>
      </div>
      <div aria-hidden="true">
        <div className="flex items-center justify-between text-[13px]">
          <span className="font-semibold text-ink">Mesas terraza</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e6f2ec] px-2.5 py-1 font-semibold text-[#1e6b50]">
            <Check className="size-3.5" />
            Menú de otoño en 19 mesas
          </span>
        </div>
        <ul className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-10">
          {tables.map((table) => {
            const own = table === 7;
            return (
              <li
                className={`flex aspect-square flex-col items-center justify-center rounded-xl text-[12px] font-semibold ${own ? "bg-ink text-white" : "bg-tint text-teal"}`}
                key={table}
              >
                {table}
                {own ? (
                  <span className="text-[9px] font-medium text-aqua">
                    propia
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-[13px] text-soft">
          La mesa 7 tiene su propia página; las demás siguen al grupo.
        </p>
      </div>
    </div>
  );
}

function LinksProduct() {
  return (
    <div className="reveal mt-5 grid items-center gap-10 overflow-hidden rounded-3xl bg-ink p-6 text-white sm:p-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
      <div>
        <span className="inline-flex items-center gap-2 rounded-full bg-aqua/12 px-3 py-1.5 text-[13px] font-semibold text-aqua">
          <AtSign aria-hidden="true" className="size-4" />
          {connect.links.handle}
        </span>
        <h3 className="mt-5 text-3xl leading-tight font-semibold tracking-[-0.03em] sm:text-4xl">
          {connect.links.title}
        </h3>
        <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-ink-text">
          {connect.links.text}
        </p>
      </div>
      <div className="flex justify-center lg:justify-end">
        <div
          aria-hidden="true"
          className="h-[380px] w-[218px] overflow-hidden rounded-t-[1.6rem] ring-1 ring-white/10 [mask-image:linear-gradient(to_bottom,black_80%,transparent)]"
          inert
        >
          <div className="flex min-h-[680px] w-[390px] flex-col [zoom:0.559]">
            <KardoPage
              content={{
                type: "linkpage",
                displayName: "Café Central",
                bio: "Café de especialidad en la Roma. Abrimos de 8 a 21.",
                socials: ["instagram", "tiktok", "whatsapp"],
                links: [
                  { label: "Ver el menú", highlight: true },
                  { label: "Cómo llegar" },
                  { label: "Pide para llevar" },
                ],
              }}
              theme={presetThemes["Kardo claro"]}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
