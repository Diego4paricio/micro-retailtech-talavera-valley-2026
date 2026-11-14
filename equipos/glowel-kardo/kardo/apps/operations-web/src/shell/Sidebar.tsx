import { Icon, type IconName } from "../components/Icon.js";
import { filterByPermission, staffPermissions } from "../lib/permissions.js";
import { Link, type Route, useRouter } from "../lib/router.js";
import { useStaff } from "./StaffContext.js";

type NavItem = {
  route: Route;
  label: string;
  icon: IconName;
  permission?: (typeof staffPermissions)[keyof typeof staffPermissions];
  matches: Route["name"][];
};

const navItems: NavItem[] = [
  {
    route: { name: "overview" },
    label: "Resumen",
    icon: "overview",
    permission: staffPermissions.metricsRead,
    matches: ["overview"],
  },
  {
    route: { name: "customers" },
    label: "Clientes",
    icon: "customers",
    permission: staffPermissions.customersRead,
    matches: ["customers", "customer"],
  },
  {
    route: { name: "touchpoints" },
    label: "Touchpoints",
    icon: "touchpoint",
    permission: staffPermissions.touchpointsRead,
    matches: ["touchpoints", "touchpoint"],
  },
  {
    route: { name: "pieces" },
    label: "Piezas",
    icon: "pieces",
    permission: staffPermissions.piecesRead,
    matches: ["pieces", "piece-batch"],
  },
  {
    route: { name: "publications" },
    label: "Publicaciones",
    icon: "publications",
    matches: ["publications"],
  },
  {
    route: { name: "audit" },
    label: "Auditoría",
    icon: "audit",
    permission: staffPermissions.auditRead,
    matches: ["audit"],
  },
  {
    route: { name: "plans" },
    label: "Planes",
    icon: "plans",
    permission: staffPermissions.plansRead,
    matches: ["plans"],
  },
  {
    route: { name: "billing" },
    label: "Suscripciones",
    icon: "billing",
    permission: staffPermissions.billingRead,
    matches: [
      "billing",
      "billing-workspace",
      "billing-events",
      "billing-invoices",
    ],
  },
  {
    route: { name: "notifications" },
    label: "Notificaciones",
    icon: "bell",
    permission: staffPermissions.notificationsRead,
    matches: ["notifications", "notification-new", "notification"],
  },
  {
    route: { name: "status" },
    label: "Estado",
    icon: "status",
    permission: staffPermissions.statusRead,
    matches: ["status"],
  },
  {
    route: { name: "staff" },
    label: "Equipo Kardo",
    icon: "staff",
    permission: staffPermissions.staffManage,
    matches: ["staff"],
  },
];

export function Sidebar() {
  const { route } = useRouter();
  const { staff } = useStaff();
  const items = filterByPermission(navItems, staff.permissions);

  return (
    <aside className="sidebar" aria-label="Navegación de Operations">
      <Link
        ariaLabel="Kardo Operations, ir al resumen"
        className="brand"
        to={{ name: "overview" }}
      >
        <img alt="Kardo" src="/kardo-logo-oscuro.svg" />
        <span className="brand-tag">Operations</span>
      </Link>
      <nav aria-label="Secciones">
        {items.map((item) => {
          const isCurrent = item.matches.includes(route.name);
          return (
            <Link
              ariaCurrent={isCurrent ? "page" : undefined}
              className={isCurrent ? "nav-item nav-item-current" : "nav-item"}
              key={item.label}
              to={item.route}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-bottom">
        <p className="sidebar-footnote">
          Consola interna de Kardo. Toda acción queda registrada en auditoría.
        </p>
      </div>
    </aside>
  );
}
