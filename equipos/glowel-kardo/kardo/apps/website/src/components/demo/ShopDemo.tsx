"use client";

import {
  AtSign,
  History,
  LayoutGrid,
  PackageCheck,
  Palette,
  SquarePen,
  Store,
} from "lucide-react";
import { useId, useState } from "react";
import { KardoPage } from "../kardo-page/KardoPage";
import { isDarkBackground, presetThemes } from "../kardo-page/theme";
import { WhatsAppIcon } from "../ui";
import {
  arrivalCaption,
  buildLinkPage,
  buildShopPage,
  capitalize,
  changedItems,
  channelNames,
  describeChanges,
  type ItemState,
  itemsOf,
  type LinksProduct,
  type ShopBusiness,
  type ShopState,
  type Shows,
  sameState,
  shopTargets,
  type Version,
} from "./demo-data";
import { drawings } from "./drawings";
import { usePhone, usePublisher, useReducedMotion, type Via } from "./hooks";
import { Phone } from "./Phone";
import {
  AvailabilityEditor,
  channelDots,
  type EditorTab,
  EditorTabs,
  PanelCard,
  PanelFooter,
  PanelHeader,
  Stat,
  type StatItem,
  StatusPill,
  Switch,
  ThemePicker,
  VersionList,
} from "./panel";

/*
  A business with one group of Touchpoints that shows a Menú or a Catálogo:
  the café (20 tables) and the florería (counter and shop window, plus its
  Links page apart). The same Experience reaches an ad, its own "Otro"
  Touchpoint. Draft and publish are separate steps, every publication is a
  version you can go back to, and availability is live.
*/

type Tab = "contenido" | "diseno" | "disponibilidad" | "versiones";

const tabs: EditorTab<Tab>[] = [
  {
    id: "contenido",
    label: "Contenido",
    icon: <SquarePen aria-hidden="true" className="size-4" />,
  },
  {
    id: "diseno",
    label: "Diseño",
    icon: <Palette aria-hidden="true" className="size-4" />,
  },
  {
    id: "disponibilidad",
    label: "Disponibilidad",
    icon: <PackageCheck aria-hidden="true" className="size-4" />,
  },
  {
    id: "versiones",
    label: "Versiones",
    icon: <History aria-hidden="true" className="size-4" />,
  },
];

const clone = (state: ShopState): ShopState => ({
  ...state,
  prices: { ...state.prices },
});
const priceText = (value: number | undefined) =>
  value === undefined
    ? ""
    : Number.isInteger(value)
      ? String(value)
      : value.toFixed(2);
const toInputs = (state: ShopState) =>
  Object.fromEntries(
    Object.entries(state.prices).map(([id, value]) => [id, priceText(value)]),
  );

/** Same bounds as the contracts' PriceSchema (0 to 10,000,000). */
function parsePrice(text: string): number | null {
  const normalized = text.trim().replace(",", ".");
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  return value <= 10_000_000 ? value : null;
}

export function ShopDemo({ business }: { business: ShopBusiness }) {
  const first = business.versions[0] as Version<ShopState>;
  const { group } = business;
  const targets = shopTargets(business);
  const [versions, setVersions] = useState(business.versions);
  const [liveNumber, setLiveNumber] = useState(first.number);
  const live =
    versions.find((version) => version.number === liveNumber)?.state ??
    first.state;
  const [draft, setDraft] = useState<ShopState>(() => clone(first.state));
  const [inputs, setInputs] = useState<Record<string, string>>(() =>
    toInputs(first.state),
  );
  const [tab, setTab] = useState<Tab>("contenido");
  const [counts, setCounts] = useState(business.visits);
  const [linkVisits, setLinkVisits] = useState(business.links?.visits ?? 0);
  const [bump, setBump] = useState<{ via: Via; key: number } | null>(null);
  const [flash, setFlash] = useState({ ids: new Set<string>(), key: 0 });
  const [availability, setAvailability] = useState<Record<string, ItemState>>(
    business.availability,
  );
  const [announcement, setAnnouncement] = useState("");
  const reduced = useReducedMotion();
  const phone = usePhone(reduced);
  const publisher = usePublisher(targets.count, reduced);
  const publishing = publisher.progress;
  const id = useId();

  const invalid = Object.entries(inputs)
    .filter(([, text]) => parsePrice(text) === null)
    .map(([itemId]) => itemId);
  const dirty = !sameState(business, live, draft);
  const canPublish = dirty && invalid.length === 0 && publishing === null;

  function visit(via: Via) {
    phone.visit(via, () => {
      if (via === "handle") setLinkVisits((current) => current + 1);
      else setCounts((current) => ({ ...current, [via]: current[via] + 1 }));
      setBump((current) => ({ via, key: (current?.key ?? 0) + 1 }));
      setAnnouncement(
        via === "handle"
          ? `El celular abrió @${business.links?.handle}, su página de Links. Se sumó una visita.`
          : via === "link"
            ? "El celular abrió la página desde el anuncio. Se sumó una visita por URL directa al anuncio."
            : `El celular abrió la página por ${channelNames[via]}. Se sumó un acceso.`,
      );
    });
  }

  function publish() {
    if (!canPublish) return;
    const target = clone(draft);
    const previous = live;
    const changes = describeChanges(business, previous, target);
    const number = Math.max(...versions.map((version) => version.number)) + 1;
    const label =
      changes.length === 1
        ? (changes[0] ?? "Cambios")
        : `${changes.length} cambios`;
    publisher.run(() => {
      setVersions((current) => [
        { number, label, when: "Ahora", state: target },
        ...current,
      ]);
      setLiveNumber(number);
      setFlash((current) => ({
        ids: changedItems(previous, target),
        key: current.key + 1,
      }));
      setAnnouncement(
        `Publicado en ${group.everywhere}: versión ${number}. El celular ya muestra el cambio.`,
      );
    });
  }

  function rollback(version: Version<ShopState>) {
    if (publishing !== null || version.number === liveNumber) return;
    const previous = live;
    publisher.run(() => {
      setLiveNumber(version.number);
      setDraft(clone(version.state));
      setInputs(toInputs(version.state));
      setFlash((current) => ({
        ids: changedItems(previous, version.state),
        key: current.key + 1,
      }));
      setAnnouncement(
        `${capitalize(group.everywhere)} regresaron a la versión ${version.number}.`,
      );
    });
  }

  /** Live: no draft, no version, no publishing (ADR 017). */
  function changeAvailability(itemId: string, name: string, next: ItemState) {
    setAvailability((current) => ({ ...current, [itemId]: next }));
    setFlash((current) => ({ ids: new Set([itemId]), key: current.key + 1 }));
    const state =
      next.status === "hidden"
        ? "oculto"
        : next.status === "sold_out" || next.quantity === 0
          ? "agotado"
          : next.quantity
            ? `quedan ${next.quantity}`
            : "disponible";
    setAnnouncement(
      `${name}: ${state}. ${capitalize(group.everywhere)} ya lo muestran, sin publicar.`,
    );
  }

  function discard() {
    setDraft(clone(live));
    setInputs(toInputs(live));
  }

  function editPrice(itemId: string, text: string) {
    setInputs((current) => ({ ...current, [itemId]: text }));
    const value = parsePrice(text);
    if (value !== null)
      setDraft((current) => ({
        ...current,
        prices: { ...current.prices, [itemId]: value },
      }));
  }

  const screen = phone.screen;
  const linkOpen =
    screen.kind === "page" && screen.via === "handle" ? business.links : null;
  const theme = presetThemes[linkOpen ? linkOpen.theme : live.themeName];
  const page = linkOpen ? (
    <KardoPage content={buildLinkPage(linkOpen)} insetTop={50} theme={theme} />
  ) : (
    <KardoPage
      changed={flash}
      content={buildShopPage(business, live, availability, drawings)}
      insetTop={50}
      theme={theme}
    />
  );
  const caption =
    screen.kind === "page"
      ? screen.via === "handle"
        ? `Abrió @${business.links?.handle} desde su Instagram. Links es otro producto: no usa NFC, QR ni grupos.`
        : arrivalCaption(business.phone, screen.via)
      : business.phone.idle;

  const bumpOf = (via: Via) => (bump?.via === via ? bump.key : undefined);
  const stats: StatItem[] = [
    {
      id: "total",
      label: "Accesos hoy",
      value: counts.nfc + counts.qr + counts.link,
    },
    {
      id: "nfc",
      label: "NFC",
      value: counts.nfc,
      dot: channelDots.nfc,
      bumpKey: bumpOf("nfc"),
    },
    {
      id: "qr",
      label: "QR",
      value: counts.qr,
      dot: channelDots.qr,
      bumpKey: bumpOf("qr"),
    },
    {
      id: "link",
      label: "URL directa del anuncio",
      value: counts.link,
      dot: channelDots.link,
      bumpKey: bumpOf("link"),
    },
  ];

  return (
    <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-14">
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <Phone
        adImage={business.id === "cafe" ? drawings.taza : drawings.ramo}
        caption={caption}
        copy={business.phone}
        links={
          business.links
            ? {
                product: business.links,
                photos: [drawings.ramo, drawings.rosas, drawings.suculenta],
              }
            : undefined
        }
        name={business.name}
        onVisit={visit}
        page={page}
        pageTone={isDarkBackground(theme) ? "light" : "dark"}
        screen={screen}
      />

      <div className="min-w-0 lg:order-1">
        <PanelCard>
          <PanelHeader
            icon={
              business.id === "cafe" ? (
                <LayoutGrid aria-hidden="true" className="size-[18px]" />
              ) : (
                <Store aria-hidden="true" className="size-[18px]" />
              )
            }
            status={
              <StatusPill
                dirty={dirty}
                liveNumber={liveNumber}
                publishing={publishing}
              />
            }
            other={business.ad}
            subtitle={group.summary}
            title={group.name}
          />

          {business.menu ? (
            <Switch
              legend={group.showsLegend}
              name={`${id}-shows`}
              onChange={(shows) =>
                setDraft((current) => ({ ...current, shows }))
              }
              options={[
                ["menu", "Menú"],
                ["catalog", "Catálogo"],
              ]}
              value={draft.shows}
            />
          ) : null}

          <EditorTabs current={tab} id={id} onChange={setTab} tabs={tabs}>
            {tab === "contenido" ? (
              <ContentEditor
                business={business}
                description={draft.description}
                editPrice={editPrice}
                id={id}
                inputs={inputs}
                invalid={invalid}
                onDescription={(description) =>
                  setDraft((current) => ({ ...current, description }))
                }
                shows={draft.shows}
              />
            ) : tab === "diseno" ? (
              <ThemePicker
                choices={business.themeChoices}
                id={id}
                onChange={(themeName) =>
                  setDraft((current) => ({ ...current, themeName }))
                }
                value={draft.themeName}
              />
            ) : tab === "disponibilidad" ? (
              <AvailabilityEditor
                availability={availability}
                everywhere={group.everywhere}
                id={id}
                items={itemsOf(business, live.shows)}
                onChange={changeAvailability}
              />
            ) : (
              <VersionList
                busy={publishing !== null}
                liveBadge={group.liveBadge}
                liveNumber={liveNumber}
                onRollback={rollback}
                versions={versions}
              />
            )}
          </EditorTabs>

          <PanelFooter
            canPublish={canPublish}
            dirty={dirty}
            onDiscard={discard}
            onPublish={publish}
            progressLabel={`${publishing ?? 0} de ${targets.count} puntos`}
            publishLabel={targets.label}
            publishing={publishing}
            stats={stats}
          />
        </PanelCard>

        {business.links ? (
          <LinksCard
            bumpKey={bumpOf("handle")}
            links={business.links}
            visits={linkVisits}
          />
        ) : null}
      </div>
    </div>
  );
}

function ContentEditor({
  business,
  id,
  shows,
  description,
  onDescription,
  inputs,
  invalid,
  editPrice,
}: {
  business: ShopBusiness;
  id: string;
  shows: Shows;
  description: string;
  onDescription: (value: string) => void;
  inputs: Record<string, string>;
  invalid: string[];
  editPrice: (itemId: string, text: string) => void;
}) {
  const menu = shows === "menu" ? business.menu : undefined;
  const rows = menu
    ? menu.sections.map((section) => ({
        title: section.name,
        items: section.items,
      }))
    : [{ title: "Productos", items: business.catalog.items }];
  return (
    <div>
      <p className="text-[13px] text-soft">
        Editando{" "}
        <strong className="font-semibold text-ink">
          {menu ? menu.editorName : business.catalog.editorName}
        </strong>
      </p>
      {shows === business.describes ? (
        <label className="mt-4 grid gap-1.5 text-[13px] font-semibold text-muted">
          Descripción
          <input
            className="h-11 rounded-xl border border-[#b8c6c3] bg-white px-3.5 text-[15px] font-normal text-ink outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
            maxLength={500}
            onChange={(event) => onDescription(event.target.value)}
            value={description}
          />
        </label>
      ) : null}
      {rows.map((section) => (
        <div className="mt-5" key={section.title}>
          <p className="text-[12px] font-semibold tracking-[0.01em] text-soft">
            {section.title}
          </p>
          <ul className="mt-1 divide-y divide-[#e2ded4]">
            {section.items.map((item) => {
              const bad = invalid.includes(item.id);
              return (
                <li
                  className="flex items-center justify-between gap-4 py-2.5"
                  key={item.id}
                >
                  <label
                    className="min-w-0 flex-1"
                    htmlFor={`${id}-price-${item.id}`}
                  >
                    <span className="block truncate text-[15px] font-semibold text-ink">
                      {item.name}
                    </span>
                    <span className="block truncate text-[13px] text-soft">
                      {item.description}
                    </span>
                    {item.link ? (
                      <span className="mt-0.5 flex items-center gap-1.5 text-[12.5px] font-medium text-teal">
                        <WhatsAppIcon className="size-3.5 shrink-0" />
                        Ver más: WhatsApp de la tienda
                      </span>
                    ) : null}
                  </label>
                  <span className="relative">
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[15px] text-soft"
                    >
                      $
                    </span>
                    <input
                      aria-describedby={
                        bad ? `${id}-error-${item.id}` : undefined
                      }
                      aria-invalid={bad || undefined}
                      aria-label={`Precio de ${item.name}`}
                      className={`h-11 w-28 rounded-xl border bg-white pr-3 pl-7 text-right text-[15px] font-semibold text-ink tabular-nums outline-none focus:ring-2 ${bad ? "border-[#9b3530] focus:ring-[#9b3530]/20" : "border-[#b8c6c3] focus:border-teal focus:ring-teal/20"}`}
                      id={`${id}-price-${item.id}`}
                      inputMode="decimal"
                      onChange={(event) =>
                        editPrice(item.id, event.target.value)
                      }
                      value={inputs[item.id] ?? ""}
                    />
                  </span>
                  {bad ? (
                    <span className="sr-only" id={`${id}-error-${item.id}`}>
                      Escribe un precio, por ejemplo 52 o 52.50.
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {invalid.length > 0 ? (
        <p className="mt-3 text-[13px] font-medium text-[#9b3530]" role="alert">
          Revisa los precios marcados: escribe un número, por ejemplo 52 o
          52.50.
        </p>
      ) : null}
    </div>
  );
}

/** Links, apart from the group: its own page, its own visits. */
function LinksCard({
  links,
  visits,
  bumpKey,
}: {
  links: LinksProduct;
  visits: number;
  bumpKey?: number;
}) {
  return (
    <section
      aria-label={`Links @${links.handle}`}
      className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-4 rounded-[1.4rem] bg-ink px-5 py-4 text-white sm:px-6"
    >
      <div className="flex min-w-0 flex-1 basis-64 items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-aqua/15 text-aqua">
          <AtSign aria-hidden="true" className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-[17px] leading-tight font-semibold tracking-[-0.02em]">
            Links <span className="text-aqua">@{links.handle}</span>
          </p>
          <p className="mt-1 text-[13px] leading-snug text-ink-text">
            Su Página de Link para Instagram. Es otro producto: no es un QR ni
            un NFC y no usa grupos. Se edita y se publica aparte.
          </p>
        </div>
      </div>
      <dl>
        <Stat
          bumpKey={bumpKey}
          label="Visitas hoy"
          tone="dark"
          value={visits}
        />
      </dl>
    </section>
  );
}
