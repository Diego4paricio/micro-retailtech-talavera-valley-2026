import { ArrowRight, Globe, MessageCircle, Star, Store } from "lucide-react";
import type { ReactNode } from "react";
import { type PageKind, pageKinds, pages } from "@/content/landing";
import {
  CafeDeOlla,
  Cappuccino,
  Chilaquiles,
  CoffeeBag,
  Concha,
  ConchaSmall,
  Mug,
  PromoPoster,
} from "../kardo-page/illustrations";
import { KardoPage, type PageContent } from "../kardo-page/KardoPage";
import { type PresetName, presetThemes } from "../kardo-page/theme";
import { Container, Section, SectionTitle } from "../ui";

/*
  The eight Experience types, each drawn with the Resolver's own markup and
  a different preset theme, so the grid shows real pages and real themes.
*/

export const examples: Record<
  Exclude<PageKind["id"], "redirect">,
  { theme: PresetName; content: PageContent }
> = {
  menu: {
    theme: "Papel editorial",
    content: {
      type: "menu",
      title: "Cocina Maru",
      description: "Desayunos de lunes a sábado",
      currency: "MXN",
      sections: [
        {
          id: "desayunos",
          name: "Desayunos",
          items: [
            {
              id: "chilaquiles",
              name: "Chilaquiles verdes",
              description: "Con pollo o huevo estrellado.",
              price: 115,
              image: <Chilaquiles />,
            },
            {
              id: "concha",
              name: "Concha con nata",
              description: "Recién horneada.",
              price: 38,
              image: <ConchaSmall />,
              availability: { soldOut: false, remaining: 3 },
            },
          ],
        },
        {
          id: "bebidas",
          name: "Bebidas",
          items: [
            {
              id: "olla",
              name: "Café de olla",
              description: "Con piloncillo y canela.",
              price: 45,
              image: <CafeDeOlla />,
            },
            {
              id: "capuchino",
              name: "Capuchino",
              price: 52,
              image: <Cappuccino />,
              availability: { soldOut: true, remaining: null },
            },
          ],
        },
      ],
    },
  },
  catalog: {
    theme: "Kardo claro",
    content: {
      type: "catalog",
      title: "Tienda del café",
      description: "Café en grano, tazas y pan para llevar a casa.",
      currency: "MXN",
      items: [
        {
          id: "grano",
          name: "Café de Veracruz en grano",
          description: "Bolsa de 250 g.",
          price: 185,
          image: <CoffeeBag />,
          hasLink: true,
        },
        { id: "taza", name: "Taza Café Central", price: 220, image: <Mug /> },
        {
          id: "conchas",
          name: "Caja de conchas",
          price: 150,
          image: <Concha />,
        },
      ],
    },
  },
  profile: {
    theme: "Kardo oscuro",
    content: {
      type: "profile",
      displayName: "Ana Treviño",
      headline: "Asesora inmobiliaria en Monterrey",
      biography: "Te ayudo a comprar o vender tu casa sin vueltas.",
      links: [
        "Escríbeme por WhatsApp",
        "Ver propiedades",
        "Sígueme en Instagram",
      ],
    },
  },
  links: {
    theme: "Terracota",
    content: {
      type: "links",
      title: "Estudio Nómada",
      description: "Diseño de interiores en Guadalajara.",
      links: ["Escríbenos por WhatsApp", "Ver proyectos", "Cómo llegar"],
    },
  },
  image: {
    theme: "Tinta profunda",
    content: {
      type: "image",
      alt: "Promoción de la tarde",
      image: <PromoPoster />,
    },
  },
  document: {
    theme: "Minimal mono",
    content: {
      type: "document",
      title: "Ficha técnica de Casa Lomas",
      description: "Planos, medidas y acabados.",
    },
  },
  form: {
    theme: "Aqua degradado",
    content: {
      type: "form",
      title: "Pide informes",
      description: "Te contactamos hoy mismo.",
      name: "required",
      phone: "optional",
      message: "hidden",
      consentText: "Acepto que me contacten sobre esta propiedad.",
      submitLabel: "Enviar",
    },
  },
};

export function Pages() {
  return (
    <Section id="paginas" labelledBy="paginas-title" tone="paper">
      <Container>
        <SectionTitle
          id="paginas-title"
          lead={pages.lead}
          title={pages.title}
        />
        <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {pageKinds.map((kind) => {
            const example = kind.id === "redirect" ? null : examples[kind.id];
            return (
              <li
                className="reveal flex flex-col overflow-hidden rounded-3xl border border-ink/8 bg-cream"
                key={kind.id}
              >
                <div className="flex h-[300px] justify-center overflow-hidden bg-[#ece8de] px-5 pt-6">
                  {example ? (
                    <Screen>
                      <KardoPage
                        content={example.content}
                        theme={presetThemes[example.theme]}
                      />
                    </Screen>
                  ) : (
                    <RedirectSketch />
                  )}
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <h3 className="text-xl font-semibold tracking-[-0.02em]">
                    {kind.name}
                  </h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted">
                    {kind.text}
                  </p>
                  {example ? (
                    <p className="mt-auto pt-4 text-[13px] text-soft">
                      Tema {example.theme}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </Container>
    </Section>
  );
}

/** The top of a phone screen: the page at 390 px, zoomed to 218 px. */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className="relative h-[340px] w-[218px] shrink-0 overflow-hidden rounded-t-[1.6rem] shadow-[0_18px_40px_-18px_rgba(22,35,46,0.45)] ring-1 ring-ink/10"
      inert
    >
      <div className="flex min-h-[610px] w-[390px] flex-col [zoom:0.559]">
        {children}
      </div>
    </div>
  );
}

/** A redirect has no page of its own: it sends the visit elsewhere. */
export function RedirectSketch() {
  const targets: { icon: ReactNode; label: string }[] = [
    { icon: <MessageCircle className="size-4" />, label: "Tu WhatsApp" },
    { icon: <Star className="size-4" />, label: "Tus reseñas de Google" },
    { icon: <Store className="size-4" />, label: "Tu tienda en línea" },
  ];
  return (
    <div
      aria-hidden="true"
      className="flex w-full max-w-[16rem] flex-col justify-center gap-3 pb-6"
    >
      <div className="flex items-center gap-2.5 self-start rounded-full bg-ink px-3.5 py-2 text-[13px] font-semibold text-white">
        <Globe className="size-4 text-aqua" />
        Tu QR o tu NFC
      </div>
      <ArrowRight className="ml-6 size-5 rotate-90 text-soft" />
      <ul className="grid gap-2">
        {targets.map((target) => (
          <li
            className="flex items-center gap-2.5 rounded-2xl bg-paper px-3.5 py-3 text-[14px] font-semibold text-ink ring-1 ring-ink/8"
            key={target.label}
          >
            <span className="flex size-7 items-center justify-center rounded-full bg-tint text-teal">
              {target.icon}
            </span>
            {target.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
