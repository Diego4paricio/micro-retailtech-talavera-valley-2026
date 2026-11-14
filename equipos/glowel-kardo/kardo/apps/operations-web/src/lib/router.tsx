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

/**
 * A deliberately small History API router (same approach as the Customer
 * panel): Operations has a fixed, flat set of sections, so a dependency-free
 * matcher keeps the bundle lean while still giving staff deep links.
 */
export type Route =
  | { name: "overview" }
  | { name: "customers" }
  | { name: "customer"; id: string }
  | { name: "touchpoints" }
  | { name: "touchpoint"; id: string }
  | { name: "publications" }
  | { name: "audit" }
  | { name: "plans" }
  | { name: "billing" }
  | { name: "billing-workspace"; id: string }
  | { name: "billing-events" }
  | { name: "billing-invoices" }
  | { name: "notifications" }
  | { name: "notification-new" }
  | { name: "notification"; id: string }
  | { name: "status" }
  | { name: "pieces" }
  | { name: "piece-batch"; id: string }
  | { name: "staff" }
  | { name: "not-found" };

const uuid = "[0-9a-fA-F-]{36}";

export function parseRoute(location: {
  pathname: string;
  search: string;
}): Route {
  const path = location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return { name: "overview" };
  if (path === "/clientes") return { name: "customers" };
  const customer = new RegExp(`^/clientes/(${uuid})$`).exec(path);
  if (customer?.[1]) return { name: "customer", id: customer[1] };
  if (path === "/touchpoints") return { name: "touchpoints" };
  const touchpoint = new RegExp(`^/touchpoints/(${uuid})$`).exec(path);
  if (touchpoint?.[1]) return { name: "touchpoint", id: touchpoint[1] };
  if (path === "/publicaciones") return { name: "publications" };
  if (path === "/auditoria") return { name: "audit" };
  if (path === "/planes") return { name: "plans" };
  if (path === "/billing") return { name: "billing" };
  if (path === "/billing/events") return { name: "billing-events" };
  if (path === "/billing/facturas") return { name: "billing-invoices" };
  const billingWorkspace = new RegExp(`^/billing/workspaces/(${uuid})$`).exec(
    path,
  );
  if (billingWorkspace?.[1])
    return { name: "billing-workspace", id: billingWorkspace[1] };
  if (path === "/notifications") return { name: "notifications" };
  if (path === "/notifications/new") return { name: "notification-new" };
  const notification = new RegExp(`^/notifications/(${uuid})$`).exec(path);
  if (notification?.[1]) return { name: "notification", id: notification[1] };
  if (path === "/status") return { name: "status" };
  if (path === "/piezas") return { name: "pieces" };
  const pieceBatch = new RegExp(`^/piezas/(${uuid})$`).exec(path);
  if (pieceBatch?.[1]) return { name: "piece-batch", id: pieceBatch[1] };
  if (path === "/equipo") return { name: "staff" };
  return { name: "not-found" };
}

export function routePath(route: Route): string {
  switch (route.name) {
    case "overview":
      return "/";
    case "customers":
      return "/clientes";
    case "customer":
      return `/clientes/${route.id}`;
    case "touchpoints":
      return "/touchpoints";
    case "touchpoint":
      return `/touchpoints/${route.id}`;
    case "publications":
      return "/publicaciones";
    case "audit":
      return "/auditoria";
    case "plans":
      return "/planes";
    case "billing":
      return "/billing";
    case "billing-workspace":
      return `/billing/workspaces/${route.id}`;
    case "billing-events":
      return "/billing/events";
    case "billing-invoices":
      return "/billing/facturas";
    case "notifications":
      return "/notifications";
    case "notification-new":
      return "/notifications/new";
    case "notification":
      return `/notifications/${route.id}`;
    case "status":
      return "/status";
    case "pieces":
      return "/piezas";
    case "piece-batch":
      return `/piezas/${route.id}`;
    case "staff":
      return "/equipo";
    default:
      return "/";
  }
}

type RouterValue = {
  route: Route;
  navigate: (route: Route, options?: { replace?: boolean }) => void;
};

const RouterContext = createContext<RouterValue | null>(null);

export function RouterProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location));
  const routeRef = useRef(route);
  routeRef.current = route;

  useEffect(() => {
    const onPopState = () => setRoute(parseRoute(window.location));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback(
    (next: Route, options?: { replace?: boolean }) => {
      const path = routePath(next);
      if (options?.replace) window.history.replaceState(null, "", path);
      else window.history.pushState(null, "", path);
      setRoute(parseRoute(window.location));
      window.scrollTo({ top: 0 });
    },
    [],
  );

  const value = useMemo(() => ({ route, navigate }), [route, navigate]);
  return (
    <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
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
}: {
  to: Route;
  className?: string | undefined;
  children: ReactNode;
  ariaCurrent?: "page" | undefined;
  ariaLabel?: string | undefined;
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
      aria-label={ariaLabel}
      className={className}
      href={href}
      onClick={onClick}
    >
      {children}
    </a>
  );
}
