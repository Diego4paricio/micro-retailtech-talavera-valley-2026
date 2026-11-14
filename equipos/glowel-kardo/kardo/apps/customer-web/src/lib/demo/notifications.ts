import type {
  Notification,
  NotificationInbox,
  ServiceStatus,
} from "@kardo/contracts";
import { statusComponentIds } from "@kardo/contracts";

// Demo mode (VITE_DEMO_MODE): the bell and the service status with sample
// data. Every text describes something the platform really does.

const hour = 3_600_000;
const day = 24 * hour;

function at(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

/** Next Sunday at 2:00 (local time), at least a day away. */
function nextSundayAt2(): Date {
  const date = new Date(Date.now() + day);
  date.setHours(2, 0, 0, 0);
  while (date.getDay() !== 0) date.setDate(date.getDate() + 1);
  return date;
}

function maintenanceText(): string {
  const start = nextSundayAt2();
  const when = new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(start);
  return `El ${when}, de 2:00 a 3:00 a. m., guardar cambios en el panel puede tardar unos segundos más. Tus QR, NFC y Links siguen funcionando todo el tiempo.`;
}

let read = new Set<string>(["demo-n4", "demo-n5"]);
let openedAt = 0;

function notifications(): Notification[] {
  const sample: Notification[] = [
    {
      id: "demo-n1",
      category: "maintenance",
      title: "Mantenimiento programado este domingo",
      body: maintenanceText(),
      action: null,
      pinned: true,
      publishedAt: at(-3 * hour),
      editedAt: null,
      expiresAt: null,
      readAt: null,
      workspace: null,
    },
    {
      id: "demo-n2",
      category: "news",
      title: "Nuevo: Visor de PDF",
      body: "Ahora puedes mostrar un PDF página por página dentro de tu página: el menú de un restaurante, el catálogo de una florería o la lista de precios de un salón.\n\nLo encuentras al crear una página, en «Visor de PDF».",
      action: { label: "Ver páginas", url: "/experiences" },
      pinned: false,
      publishedAt: at(-26 * hour),
      editedAt: null,
      expiresAt: null,
      readAt: null,
      workspace: null,
    },
    {
      id: "demo-n3",
      category: "tip",
      title: "Ordena tus QR y etiquetas por local, zona y mesa",
      body: "Con los grupos puedes anidar hasta cuatro niveles, como «Local Centro › Terraza › Mesa 12», y publicar en todo un local de una vez. También sirve para los pisos de un hotel o los consultorios de una clínica.",
      action: { label: "Ir a QR y etiquetas", url: "/touchpoints" },
      pinned: false,
      publishedAt: at(-3 * day),
      editedAt: null,
      expiresAt: null,
      readAt: null,
      workspace: null,
    },
    {
      id: "demo-n4",
      category: "account",
      title: "Revisamos el QR de la entrada",
      body: "Hola, equipo de Café Nube. El QR «Entrada» todavía no muestra ninguna página. Cuando quieras, asígnale una desde QR y etiquetas y quedará lista sin reimprimir.",
      action: { label: "Ir a QR y etiquetas", url: "/touchpoints" },
      pinned: false,
      publishedAt: at(-6 * day),
      editedAt: at(-6 * day + 2 * hour),
      expiresAt: null,
      readAt: at(-5 * day),
      workspace: { id: "demo-workspace", name: "Café Nube" },
    },
    {
      id: "demo-n5",
      category: "news",
      title: "Disponibilidad en vivo para Menús y Catálogos",
      body: "Marca un platillo o un producto como Agotado u Oculto desde tu teléfono, sin volver a publicar. Sirve igual para un restaurante que para una florería o una tienda.",
      action: { label: "Abrir Disponibilidad", url: "/availability" },
      pinned: false,
      publishedAt: at(-12 * day),
      editedAt: null,
      expiresAt: null,
      readAt: at(-11 * day),
      workspace: null,
    },
  ];
  return sample.map((item) => ({
    ...item,
    readAt: read.has(item.id) ? (item.readAt ?? at(-1 * hour)) : null,
  }));
}

export function demoNotificationInbox(query: {
  unread: boolean;
}): NotificationInbox {
  const all = notifications();
  const items = query.unread ? all.filter((item) => !item.readAt) : all;
  const unread = all.filter((item) => !item.readAt);
  return {
    items,
    unreadCount: unread.length,
    autoOpen: unread.some(
      (item) => new Date(item.publishedAt).getTime() > openedAt,
    ),
    nextCursor: null,
  };
}

/** Returns `undefined` when the path is not a notification route. */
export function handleNotificationsDemo(path: string, method: string): unknown {
  const [pathname, search = ""] = path.split("?");
  if (pathname === "/v1/notifications" && method === "GET") {
    return demoNotificationInbox({
      unread: new URLSearchParams(search).get("unread") === "true",
    });
  }
  if (pathname === "/v1/notifications/read-all" && method === "POST") {
    read = new Set(notifications().map((item) => item.id));
    return null;
  }
  if (pathname === "/v1/notifications/opened" && method === "POST") {
    openedAt = Date.now();
    return null;
  }
  const one = /^\/v1\/notifications\/([^/]+)\/read$/.exec(pathname ?? "");
  if (one?.[1] && method === "POST") {
    read = new Set([...read, one[1]]);
    return null;
  }
  return undefined;
}

export function demoServiceStatus(): ServiceStatus {
  const start = nextSundayAt2();
  return {
    overall: "operational",
    checkedAt: at(-40_000),
    components: statusComponentIds.map((id) => ({
      id,
      level: "operational",
      provider: false,
    })),
    incidents: [],
    upcoming: [
      {
        id: "demo-maintenance",
        kind: "maintenance",
        title: "Mantenimiento de la base de datos",
        impact: "maintenance",
        components: ["panel", "publishing"],
        startsAt: start.toISOString(),
        endsAt: new Date(start.getTime() + hour).toISOString(),
        resolvedAt: null,
        updates: [
          {
            status: "scheduled",
            message:
              "Guardar y publicar cambios puede tardar unos segundos más. Las páginas públicas no se detienen.",
            at: at(-3 * hour),
          },
        ],
      },
    ],
  };
}
