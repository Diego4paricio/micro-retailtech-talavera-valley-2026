import {
  type ExperienceType,
  formatPieceCode,
  isPieceCodeShape,
  normalizePieceCode,
  touchpointExperienceTypes,
} from "@kardo/contracts";
import {
  createContext,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { LeaveDialog } from "../components/LeaveDialog.js";

/**
 * A deliberately small History API router: the panel has a fixed, flat set of
 * sections, so a dependency-free matcher keeps the bundle and supply chain lean
 * while still giving customers deep links and a working back button.
 */
/** Settings levels (Configuración). */
export const settingsSections = [
  "cuenta",
  "preferencias",
  "seguridad",
  "datos",
  "organizacion",
  "marca",
  "equipo",
  "plan",
] as const;
export type SettingsSection = (typeof settingsSections)[number];

/** Views of one Experience besides Diseño (the default, at its bare URL). */
export const experienceViews = ["destinos", "historial"] as const;
export type ExperienceView = (typeof experienceViews)[number];

export type Route =
  | { name: "overview" }
  | { name: "touchpoints" }
  /** «Producto de Kardo» open on QR y etiquetas (ADR 026): the activation
   * card's QR lands here through the site's /activar/. */
  | { name: "activate-piece"; code?: string }
  | { name: "touchpoint"; id: string }
  /** Dedicated QR design studio for a QR Touchpoint, or the backup QR of
   * an NFC (relevo 38). `download` opens it in its download dialog. */
  | { name: "qr-studio"; id: string; download?: boolean }
  /** Estudio QR: the organization's design library, groups and QR codes. */
  | { name: "qr" }
  /** Editor of one library design. */
  | { name: "qr-design"; id: string }
  /** Shareable Links (link-in-bio pages) — a separate product. */
  | { name: "links" }
  | { name: "link"; id: string }
  /** Estudio de Experiences of a Link's página de enlaces. */
  | { name: "experiences" }
  | { name: "experience-scan" }
  | {
      name: "experience-new";
      touchpointId: string | null;
      groupId?: string | null;
      /** The chosen type: present only once the flow reaches its second
       * step ("Nueva Experience" two-step creation). */
      type?: ExperienceType | null;
      /** A file from Archivos to start the page with («Crear página con
       * este archivo», domain audit A2-47). */
      assetId?: string | null;
    }
  /** One Experience: Diseño (no `view`), Destinos or Historial. */
  | { name: "experience"; id: string; view?: ExperienceView }
  /** Estudio de Experiences: full-page designer of one Experience. */
  | { name: "experience-studio"; id: string }
  /** Disponibilidad: live state of Menu/Catalog items, optionally focused
   * on one Experience. */
  | { name: "availability"; experienceId?: string }
  | { name: "assets" }
  | { name: "analytics" }
  /** `leadId`: the request to highlight («Ver solicitud» from the bell);
   * kept in the address, so it survives a new tab (domain audit A2-73). */
  | { name: "leads"; leadId?: string }
  | { name: "organization" }
  | { name: "settings"; section?: SettingsSection }
  | { name: "invitation" }
  /** «Ver todas» from the bell (ADR 022). */
  | { name: "notifications" }
  /** "Crear mi propio negocio": the sign-up step a person who joined by
   * invitation skipped (relevo 20, T3). */
  | { name: "create-business" }
  /** Primeros pasos: five guided steps to a first page with its QR
   * (relevo 31, approved 2026-10-03), optionally opened on one step. */
  | { name: "first-steps"; step?: FirstStepParam }
  | { name: "not-found" };

const uuid = "[0-9a-fA-F-]{36}";

/** The steps of Primeros pasos, as `/primeros-pasos?paso=` says them. */
const firstStepParams = ["business", "content", "look", "qr", "try"] as const;
export type FirstStepParam = (typeof firstStepParams)[number];

/**
 * Public entry points linked from the Kardo Website (apps/website). The
 * address only tells the access screen what to open; the app then shows the
 * normal route and replaces the address with it.
 */
const entryPaths = { "/registro": "sign-up" } as const;
export type EntryIntent = (typeof entryPaths)[keyof typeof entryPaths];

export function entryIntent(pathname: string): EntryIntent | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  return Object.hasOwn(entryPaths, path)
    ? entryPaths[path as keyof typeof entryPaths]
    : null;
}

export function parseRoute(location: {
  pathname: string;
  search: string;
}): Route {
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const query = new URLSearchParams(location.search);
  if (path === "/" || entryIntent(path)) return { name: "overview" };
  if (path === "/touchpoints") return { name: "touchpoints" };
  if (path === "/activar") {
    const code = query.get("codigo") ?? "";
    return isPieceCodeShape(code)
      ? { name: "activate-piece", code: normalizePieceCode(code) }
      : { name: "activate-piece" };
  }
  const touchpoint = new RegExp(`^/touchpoints/(${uuid})$`).exec(path);
  if (touchpoint?.[1]) return { name: "touchpoint", id: touchpoint[1] };
  const studio = new RegExp(`^/touchpoints/(${uuid})/qr$`).exec(path);
  if (studio?.[1])
    return query.has("descargar")
      ? { name: "qr-studio", id: studio[1], download: true }
      : { name: "qr-studio", id: studio[1] };
  if (path === "/qr") return { name: "qr" };
  const qrDesign = new RegExp(`^/qr/designs/(${uuid})$`).exec(path);
  if (qrDesign?.[1]) return { name: "qr-design", id: qrDesign[1] };
  if (path === "/links") return { name: "links" };
  const link = new RegExp(`^/links/(${uuid})$`).exec(path);
  if (link?.[1]) return { name: "link", id: link[1] };
  // The old «Estudio de Link» is gone (domain audit A9-18): a link shows a
  // page, designed in that page's Estudio. Old addresses open the link.
  const linkStudio = new RegExp(`^/links/(${uuid})/estudio$`).exec(path);
  if (linkStudio?.[1]) return { name: "link", id: linkStudio[1] };
  if (path === "/experiences") return { name: "experiences" };
  if (path === "/experiences/scan") return { name: "experience-scan" };
  if (path === "/experiences/new") {
    const valid = (value: string | null) =>
      value && new RegExp(`^${uuid}$`).test(value) ? value : null;
    const groupId = valid(query.get("group"));
    const typeParam = query.get("type");
    const type =
      typeParam &&
      (touchpointExperienceTypes as readonly string[]).includes(typeParam)
        ? (typeParam as ExperienceType)
        : null;
    const assetId = valid(query.get("archivo"));
    return {
      name: "experience-new",
      touchpointId: valid(query.get("touchpoint")),
      ...(groupId ? { groupId } : {}),
      ...(type ? { type } : {}),
      ...(assetId ? { assetId } : {}),
    };
  }
  const experience = new RegExp(`^/experiences/(${uuid})$`).exec(path);
  if (experience?.[1]) return { name: "experience", id: experience[1] };
  const experienceStudio = new RegExp(`^/experiences/(${uuid})/estudio$`).exec(
    path,
  );
  if (experienceStudio?.[1])
    return { name: "experience-studio", id: experienceStudio[1] };
  const experienceView = new RegExp(
    `^/experiences/(${uuid})/(${experienceViews.join("|")})$`,
  ).exec(path);
  if (experienceView?.[1] && experienceView[2])
    return {
      name: "experience",
      id: experienceView[1],
      view: experienceView[2] as ExperienceView,
    };
  if (path === "/availability") return { name: "availability" };
  const availability = new RegExp(`^/availability/(${uuid})$`).exec(path);
  if (availability?.[1])
    return { name: "availability", experienceId: availability[1] };
  if (path === "/assets") return { name: "assets" };
  if (path === "/analytics") return { name: "analytics" };
  if (path === "/leads") {
    const leadId = query.get("lead");
    return leadId && new RegExp(`^${uuid}$`).test(leadId)
      ? { name: "leads", leadId }
      : { name: "leads" };
  }
  if (path === "/notifications") return { name: "notifications" };
  if (path === "/organization") return { name: "organization" };
  if (path === "/settings") return { name: "settings" };
  const settings = /^\/settings\/([a-z]+)$/.exec(path);
  // Equipo lives at /organization (ADR 023): one address, so the sidebar's
  // «Equipo» stays highlighted.
  if (settings?.[1] === "equipo") return { name: "organization" };
  if (
    settings?.[1] &&
    (settingsSections as readonly string[]).includes(settings[1])
  )
    return { name: "settings", section: settings[1] as SettingsSection };
  if (path === "/invite") return { name: "invitation" };
  if (path === "/crear-negocio") return { name: "create-business" };
  if (path === "/primeros-pasos") {
    const step = query.get("paso");
    return step && (firstStepParams as readonly string[]).includes(step)
      ? { name: "first-steps", step: step as FirstStepParam }
      : { name: "first-steps" };
  }
  return { name: "not-found" };
}

export function routePath(route: Route): string {
  switch (route.name) {
    case "overview":
      return "/";
    case "activate-piece":
      return route.code
        ? `/activar?codigo=${encodeURIComponent(formatPieceCode(route.code))}`
        : "/activar";
    case "touchpoint":
      return `/touchpoints/${route.id}`;
    case "qr-studio":
      return route.download
        ? `/touchpoints/${route.id}/qr?descargar`
        : `/touchpoints/${route.id}/qr`;
    case "qr-design":
      return `/qr/designs/${route.id}`;
    case "link":
      return `/links/${route.id}`;
    case "experience-studio":
      return `/experiences/${route.id}/estudio`;
    case "experience-scan":
      return "/experiences/scan";
    case "settings":
      return route.section ? `/settings/${route.section}` : "/settings";
    case "experience":
      return route.view
        ? `/experiences/${route.id}/${route.view}`
        : `/experiences/${route.id}`;
    case "availability":
      return route.experienceId
        ? `/availability/${route.experienceId}`
        : "/availability";
    case "experience-new": {
      const query = new URLSearchParams();
      if (route.touchpointId) query.set("touchpoint", route.touchpointId);
      if (route.groupId) query.set("group", route.groupId);
      if (route.type) query.set("type", route.type);
      if (route.assetId) query.set("archivo", route.assetId);
      const search = query.toString();
      return search ? `/experiences/new?${search}` : "/experiences/new";
    }
    case "leads":
      return route.leadId ? `/leads?lead=${route.leadId}` : "/leads";
    case "invitation":
      return "/invite";
    case "create-business":
      return "/crear-negocio";
    case "first-steps":
      return route.step
        ? `/primeros-pasos?paso=${route.step}`
        : "/primeros-pasos";
    case "not-found":
      return "/";
    default:
      return `/${route.name}`;
  }
}

/**
 * A screen with unsaved work. While it is registered the router asks before
 * leaving it, with Kardo's own dialog for in-app navigation and the
 * browser's dialog when the tab is closed or reloaded (the only one a page
 * may show there).
 */
export type LeaveGuard = {
  /** Destinations that stay in the same screen (its own views): no need to
   * ask. */
  allows?: ((next: Route) => boolean) | undefined;
  /** What is lost, in one sentence. */
  message: string;
  /** Saves in one step and resolves `true` when it worked; offers
   * "Guardar y salir". Omit when saving may need more questions. */
  save?: (() => Promise<boolean>) | undefined;
};

type RouterValue = {
  route: Route;
  navigate: (route: Route, options?: { replace?: boolean }) => void;
  /** Registers the guard of a screen with unsaved work, or clears it. */
  setGuard: (guard: LeaveGuard | null) => void;
};

type PendingLeave = { next: Route; replace: boolean; guard: LeaveGuard };

const RouterContext = createContext<RouterValue | null>(null);

export function RouterProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location));
  const guardRef = useRef<LeaveGuard | null>(null);
  const [guarded, setGuarded] = useState(false);
  const [leaving, setLeaving] = useState<PendingLeave | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  /** Set when the last "Guardar y salir" failed (relevo 37, B3f: it used
   * to close anyway, and Javier lost his design not knowing why). Stays
   * open with it until "Reintentar" works or the person picks another
   * button. */
  const [saveError, setSaveError] = useState<string | null>(null);

  /** The registered guard, unless it lets this destination through. */
  const blocks = useCallback((next: Route): LeaveGuard | null => {
    const guard = guardRef.current;
    return guard && !guard.allows?.(next) ? guard : null;
  }, []);

  // Runs after the first render, once the access screen has read the intent
  // of a Website entry point: from here on the address is the real route.
  useEffect(() => {
    if (entryIntent(window.location.pathname)) {
      window.history.replaceState(
        null,
        "",
        routePath(parseRoute(window.location)),
      );
    }
  }, []);

  useEffect(() => {
    const onPopState = () => {
      const next = parseRoute(window.location);
      const guard = blocks(next);
      if (guard) {
        // Restore the URL of the protected screen, then ask.
        window.history.pushState(null, "", routePath(route));
        setLeaving({ next, replace: false, guard });
        return;
      }
      guardRef.current = null;
      setRoute(next);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [route, blocks]);

  const go = useCallback((next: Route, replace: boolean) => {
    guardRef.current = null;
    setGuarded(false);
    const path = routePath(next);
    if (replace) window.history.replaceState(null, "", path);
    else window.history.pushState(null, "", path);
    setRoute(parseRoute(window.location));
    window.scrollTo({ top: 0 });
  }, []);

  const navigate = useCallback(
    (next: Route, options?: { replace?: boolean }) => {
      const guard = blocks(next);
      if (guard) {
        setLeaving({ next, replace: Boolean(options?.replace), guard });
        return;
      }
      go(next, Boolean(options?.replace));
    },
    [blocks, go],
  );

  const setGuard = useCallback((guard: LeaveGuard | null) => {
    guardRef.current = guard;
    setGuarded(guard !== null);
  }, []);

  // Closing or reloading the tab can only use the browser's own dialog.
  useEffect(() => {
    if (!guarded) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [guarded]);

  async function saveAndLeave(pending: PendingLeave) {
    if (!pending.guard.save) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const saved = await pending.guard.save();
      if (saved) {
        setLeaving(null);
        go(pending.next, pending.replace);
        return;
      }
      // Stays open: leaving now would lose the very thing that failed to
      // save, and "Reintentar" in one tap is the only way out besides
      // discarding it ("Salir sin guardar").
      setSaveError("No se guardó. Toca «Reintentar».");
    } catch {
      setSaveError("No se guardó. Toca «Reintentar».");
    } finally {
      setIsSaving(false);
    }
  }

  const value = useMemo(
    () => ({ route, navigate, setGuard }),
    [route, navigate, setGuard],
  );
  return (
    <RouterContext.Provider value={value}>
      {children}
      <LeaveDialog
        canSave={Boolean(leaving?.guard.save)}
        isSaving={isSaving}
        message={leaving?.guard.message ?? ""}
        onLeave={() => {
          if (!leaving) return;
          setLeaving(null);
          setSaveError(null);
          go(leaving.next, leaving.replace);
        }}
        onSave={() => {
          if (leaving) void saveAndLeave(leaving);
        }}
        onStay={() => {
          setLeaving(null);
          setSaveError(null);
        }}
        open={leaving !== null}
        saveError={saveError}
      />
    </RouterContext.Provider>
  );
}

export function useRouter(): RouterValue {
  const value = useContext(RouterContext);
  if (!value) throw new Error("useRouter must be used inside RouterProvider.");
  return value;
}

/** An accessible in-app link that still supports open-in-new-tab. */
export function Link({
  to,
  className,
  children,
  ariaCurrent,
  ariaLabel,
  ariaDescription,
  title,
}: {
  to: Route;
  className?: string | undefined;
  children: ReactNode;
  ariaCurrent?: "page" | undefined;
  ariaLabel?: string | undefined;
  /** Extra context for screen readers, without changing the visible layout. */
  ariaDescription?: string | undefined;
  title?: string | undefined;
}) {
  const { navigate } = useRouter();
  const href = routePath(to);
  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    navigate(to);
  }
  return (
    <a
      aria-current={ariaCurrent}
      aria-description={ariaDescription}
      aria-label={ariaLabel}
      className={className}
      href={href}
      onClick={onClick}
      title={title}
    >
      {children}
    </a>
  );
}
