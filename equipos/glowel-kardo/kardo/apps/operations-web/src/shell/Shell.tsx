import { lazy, Suspense } from "react";
import { Skeleton } from "../components/Skeleton.js";
import { useRouter } from "../lib/router.js";
import { Sidebar } from "./Sidebar.js";
import { TopBar } from "./TopBar.js";

// Each section is its own chunk: the first paint only loads what it shows.
const OverviewPage = lazy(() =>
  import("../features/overview/OverviewPage.js").then((m) => ({
    default: m.OverviewPage,
  })),
);
const CustomersPage = lazy(() =>
  import("../features/customers/CustomersPage.js").then((m) => ({
    default: m.CustomersPage,
  })),
);
const CustomerDetailPage = lazy(() =>
  import("../features/customers/CustomerDetailPage.js").then((m) => ({
    default: m.CustomerDetailPage,
  })),
);
const TouchpointsPage = lazy(() =>
  import("../features/touchpoints/TouchpointsPage.js").then((m) => ({
    default: m.TouchpointsPage,
  })),
);
const TouchpointDetailPage = lazy(() =>
  import("../features/touchpoints/TouchpointDetailPage.js").then((m) => ({
    default: m.TouchpointDetailPage,
  })),
);
const PieceBatchesPage = lazy(() =>
  import("../features/pieces/PieceBatchesPage.js").then((m) => ({
    default: m.PieceBatchesPage,
  })),
);
const PieceBatchPage = lazy(() =>
  import("../features/pieces/PieceBatchPage.js").then((m) => ({
    default: m.PieceBatchPage,
  })),
);
const PublicationsPage = lazy(() =>
  import("../features/publications/PublicationsPage.js").then((m) => ({
    default: m.PublicationsPage,
  })),
);
const AuditPage = lazy(() =>
  import("../features/audit/AuditPage.js").then((m) => ({
    default: m.AuditPage,
  })),
);
const PlansPage = lazy(() =>
  import("../features/plans/PlansPage.js").then((m) => ({
    default: m.PlansPage,
  })),
);
const BillingPage = lazy(() =>
  import("../features/billing/BillingPage.js").then((m) => ({
    default: m.BillingPage,
  })),
);
const WorkspaceBillingPage = lazy(() =>
  import("../features/billing/WorkspaceBillingPage.js").then((m) => ({
    default: m.WorkspaceBillingPage,
  })),
);
const CfdiPage = lazy(() =>
  import("../features/billing/CfdiPage.js").then((m) => ({
    default: m.CfdiPage,
  })),
);
const BillingEventsPage = lazy(() =>
  import("../features/billing/BillingEventsPage.js").then((m) => ({
    default: m.BillingEventsPage,
  })),
);
const StaffPage = lazy(() =>
  import("../features/staff/StaffPage.js").then((m) => ({
    default: m.StaffPage,
  })),
);

const NotificationsPage = lazy(() =>
  import("../features/notifications/NotificationsPage.js").then((m) => ({
    default: m.NotificationsPage,
  })),
);
const NotificationFormPage = lazy(() =>
  import("../features/notifications/NotificationFormPage.js").then((m) => ({
    default: m.NotificationFormPage,
  })),
);
const NotificationDetailPage = lazy(() =>
  import("../features/notifications/NotificationDetailPage.js").then((m) => ({
    default: m.NotificationDetailPage,
  })),
);
const StatusPage = lazy(() =>
  import("../features/status/StatusPage.js").then((m) => ({
    default: m.StatusPage,
  })),
);

export function Shell() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Ir al contenido
      </a>
      <Sidebar />
      <div className="workspace-main">
        <TopBar />
        <main className="op-page-area" id="main-content" tabIndex={-1}>
          <Suspense fallback={<Skeleton lines={4} />}>
            <CurrentPage />
          </Suspense>
        </main>
      </div>
    </div>
  );
}

function CurrentPage() {
  const { route } = useRouter();
  switch (route.name) {
    case "overview":
      return <OverviewPage />;
    case "customers":
      return <CustomersPage />;
    case "customer":
      return <CustomerDetailPage workspaceId={route.id} key={route.id} />;
    case "touchpoints":
      return <TouchpointsPage />;
    case "touchpoint":
      return <TouchpointDetailPage touchpointId={route.id} key={route.id} />;
    case "pieces":
      return <PieceBatchesPage />;
    case "piece-batch":
      return <PieceBatchPage batchId={route.id} key={route.id} />;
    case "publications":
      return <PublicationsPage />;
    case "audit":
      return <AuditPage />;
    case "plans":
      return <PlansPage />;
    case "billing":
      return <BillingPage />;
    case "billing-workspace":
      return <WorkspaceBillingPage key={route.id} workspaceId={route.id} />;
    case "billing-events":
      return <BillingEventsPage />;
    case "billing-invoices":
      return <CfdiPage />;
    case "notifications":
      return <NotificationsPage />;
    case "notification-new":
      return <NotificationFormPage />;
    case "notification":
      return (
        <NotificationDetailPage key={route.id} notificationId={route.id} />
      );
    case "status":
      return <StatusPage />;
    case "staff":
      return <StaffPage />;
    default:
      return <NotFound />;
  }
}

function NotFound() {
  const { navigate } = useRouter();
  return (
    <section className="state-panel">
      <p className="eyebrow">404</p>
      <h2>Esta sección no existe.</h2>
      <button
        className="button button-primary"
        onClick={() => navigate({ name: "overview" })}
        type="button"
      >
        Ir al resumen
      </button>
    </section>
  );
}
