import type { CustomerWorkspace } from "@kardo/contracts";
import type { Session } from "@supabase/supabase-js";
import {
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { workspacesApi } from "../api/workspaces.js";
import { Skeleton } from "../components/Skeleton.js";
import { TermsGate } from "../features/legal/TermsGate.js";
// Static on purpose: the shell already needs the form (no organization yet),
// so a lazy import of the same module only pretended to split it (A2-71).
import {
  CreateBusinessForm,
  CreateBusinessPage,
} from "../features/organization/CreateBusinessPage.js";
import { readFilters } from "../features/overview/filters.js";
import { OverviewPage } from "../features/overview/OverviewPage.js";
import { prefetchSummary } from "../features/overview/summary-store.js";
import { loadAccountProfile } from "../lib/account-profile.js";
import { errorMessage } from "../lib/api.js";
import { readPendingInvitation } from "../lib/pending-invitation.js";
import { readPendingPieceCode } from "../lib/pending-piece-code.js";
import { useRouter } from "../lib/router.js";
import { WorkspaceProvider } from "./WorkspaceContext.js";
import { WorkspaceShell } from "./WorkspaceShell.js";

// Each section is its own chunk: the first paint only loads what it shows.
// Resumen is the home page, so it ships with the shell instead of waiting on
// a second round trip for its chunk.
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
const ExperiencesPage = lazy(() =>
  import("../features/experiences/ExperiencesPage.js").then((m) => ({
    default: m.ExperiencesPage,
  })),
);
const ExperienceEditorPage = lazy(() =>
  import("../features/experiences/ExperienceEditorPage.js").then((m) => ({
    default: m.ExperienceEditorPage,
  })),
);
const NewExperiencePage = lazy(() =>
  import("../features/experiences/NewExperiencePage.js").then((m) => ({
    default: m.NewExperiencePage,
  })),
);
const QuickScanPage = lazy(() =>
  import("../features/experiences/QuickScanPage.js").then((m) => ({
    default: m.QuickScanPage,
  })),
);
const AvailabilityPage = lazy(() =>
  import("../features/availability/AvailabilityPage.js").then((m) => ({
    default: m.AvailabilityPage,
  })),
);
const NotificationsPage = lazy(() =>
  import("../features/notifications/NotificationsPage.js").then((m) => ({
    default: m.NotificationsPage,
  })),
);
const AssetsPage = lazy(() =>
  import("../features/assets/AssetsPage.js").then((m) => ({
    default: m.AssetsPage,
  })),
);
const AnalyticsPage = lazy(() =>
  import("../features/analytics/AnalyticsPage.js").then((m) => ({
    default: m.AnalyticsPage,
  })),
);
const LeadsPage = lazy(() =>
  import("../features/leads/LeadsPage.js").then((m) => ({
    default: m.LeadsPage,
  })),
);
const FirstStepsPage = lazy(() =>
  import("../features/onboarding/FirstStepsPage.js").then((m) => ({
    default: m.FirstStepsPage,
  })),
);
const InvitationPage = lazy(() =>
  import("../features/organization/InvitationPage.js").then((m) => ({
    default: m.InvitationPage,
  })),
);
const QrStudioPage = lazy(() =>
  import("../features/touchpoints/qr/QrStudioPage.js").then((m) => ({
    default: m.QrStudioPage,
  })),
);
const QrLibraryPage = lazy(() =>
  import("../features/touchpoints/qr/library/QrLibraryPage.js").then((m) => ({
    default: m.QrLibraryPage,
  })),
);
const QrDesignPage = lazy(() =>
  import("../features/touchpoints/qr/library/QrDesignPage.js").then((m) => ({
    default: m.QrDesignPage,
  })),
);
const LinksPage = lazy(() =>
  import("../features/links/LinksPage.js").then((m) => ({
    default: m.LinksPage,
  })),
);
const LinkDetailPage = lazy(() =>
  import("../features/links/LinkDetailPage.js").then((m) => ({
    default: m.LinkDetailPage,
  })),
);
const ExperienceStudioPage = lazy(() =>
  import("../features/studio/pages/ExperienceStudioPage.js").then((m) => ({
    default: m.ExperienceStudioPage,
  })),
);
const SettingsPage = lazy(() =>
  import("../features/settings/SettingsPage.js").then((m) => ({
    default: m.SettingsPage,
  })),
);

const selectedWorkspaceKey = "kardo.workspace";

function readSelectedWorkspace(): string | null {
  try {
    return window.localStorage.getItem(selectedWorkspaceKey);
  } catch {
    return null;
  }
}

export function WorkspaceApp({ session }: { session: Session }) {
  const [workspaces, setWorkspaces] = useState<CustomerWorkspace[] | null>(
    null,
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    readSelectedWorkspace,
  );
  const [error, setError] = useState<string | null>(null);
  const { route, navigate } = useRouter();

  // Opening on Resumen: ask for its numbers while the workspace list is still
  // loading instead of after it (the summary is the slowest read). A stale or
  // foreign workspace id simply fails and is ignored.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only on the first render
  useEffect(() => {
    if (route.name === "overview" && selectedId)
      prefetchSummary(selectedId, readFilters(selectedId));
  }, []);

  const loadWorkspaces = useCallback(async (signal?: AbortSignal) => {
    try {
      setError(null);
      setWorkspaces(await workspacesApi.list(signal));
    } catch (requestError) {
      if (!signal?.aborted) setError(errorMessage(requestError));
    }
  }, []);

  // Only the user identity (not every token refresh) reloads the workspace list.
  const userId = session.user.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload only when the signed-in identity changes
  useEffect(() => {
    const controller = new AbortController();
    void loadWorkspaces(controller.signal);
    return () => controller.abort();
  }, [loadWorkspaces, userId]);

  // Preferences (zone, hour format, preferred name) apply on every screen,
  // not only after visiting Configuración (ADR 023).
  useEffect(() => {
    void loadAccountProfile(userId);
  }, [userId]);

  const selectWorkspace = useCallback((workspaceId: string) => {
    setSelectedId(workspaceId);
    try {
      window.localStorage.setItem(selectedWorkspaceKey, workspaceId);
    } catch {
      // Selection still applies for this page view.
    }
  }, []);
  const reloadWorkspaces = useCallback(
    () => loadWorkspaces(),
    [loadWorkspaces],
  );

  // An invitation opened before signing in (or through Google) is answered
  // first, wherever the sign in landed (T3).
  const invitationShown = useRef(false);
  useEffect(() => {
    if (invitationShown.current || !workspaces) return;
    invitationShown.current = true;
    if (readPendingInvitation() && route.name !== "invitation")
      navigate({ name: "invitation" }, { replace: true });
  }, [workspaces, route.name, navigate]);

  if (error)
    return (
      <StateScreen
        action={
          <button
            className="button button-primary"
            onClick={() => void loadWorkspaces()}
            type="button"
          >
            Reintentar
          </button>
        }
        eyebrow="Conexión pendiente"
        title="No pudimos abrir tu espacio."
      >
        {error}
      </StateScreen>
    );
  if (!workspaces) return <LoadingScreen />;
  // T3: a personal space without sign up (joined by invitation) stays out of
  // the switcher; "Crear mi propio negocio" sets it up.
  const pendingSetup = workspaces.find((item) => item.setupPending) ?? null;
  const usable = workspaces.filter((item) => !item.setupPending);
  const answeringInvitation =
    route.name === "invitation" || readPendingInvitation() !== null;
  if (usable.length === 0 && pendingSetup && !answeringInvitation)
    return (
      <main className="onboarding-layout">
        <header className="onboarding-header">
          <img alt="Kardo" src="/kardo-logo.svg" />
          <span>Tu negocio</span>
        </header>
        <CreateBusinessForm
          invited={false}
          onCreated={(created) => {
            selectWorkspace(created.id);
            void loadWorkspaces();
          }}
          trialAvailable={pendingSetup.trialAvailable ?? false}
          workspace={pendingSetup}
        />
      </main>
    );
  // Answering an invitation before having any space of their own: no shell
  // (its banner and menu belong to a business the person does not have).
  if (usable.length === 0 && pendingSetup)
    return (
      <WorkspaceProvider
        loadLists={false}
        pendingSetup={pendingSetup}
        reloadWorkspaces={reloadWorkspaces}
        selectWorkspace={selectWorkspace}
        session={session}
        workspace={pendingSetup}
        workspaces={workspaces}
      >
        <main className="onboarding-layout">
          <header className="onboarding-header">
            <img alt="Kardo" src="/kardo-logo.svg" />
            <span>Invitación</span>
          </header>
          <Suspense fallback={<PageFallback />}>
            <InvitationPage />
          </Suspense>
        </main>
      </WorkspaceProvider>
    );
  const workspace = usable.find((item) => item.id === selectedId) ?? usable[0];
  if (!workspace)
    return (
      <StateScreen
        action={
          <button
            className="button button-primary"
            onClick={() => void loadWorkspaces()}
            type="button"
          >
            Actualizar
          </button>
        }
        eyebrow="Un momento"
        title="Tu espacio personal se está preparando."
      >
        Vuelve a intentarlo en unos segundos.
      </StateScreen>
    );

  return (
    <WorkspaceProvider
      key={workspace.id}
      reloadWorkspaces={reloadWorkspaces}
      selectWorkspace={selectWorkspace}
      pendingSetup={pendingSetup}
      session={session}
      workspace={workspace}
      workspaces={usable.length > 0 ? usable : workspaces}
    >
      <TermsGate />
      <WorkspaceShell>
        <Suspense fallback={<PageFallback />}>
          <CurrentPage />
        </Suspense>
      </WorkspaceShell>
    </WorkspaceProvider>
  );
}

function CurrentPage() {
  const { route } = useRouter();
  switch (route.name) {
    case "overview":
      return <OverviewPage />;
    case "touchpoints":
      return <TouchpointsPage />;
    case "activate-piece":
      return (
        <TouchpointsPage
          activating
          activationCode={route.code ?? readPendingPieceCode()}
        />
      );
    case "touchpoint":
      return <TouchpointDetailPage touchpointId={route.id} />;
    case "qr-studio":
      return (
        <QrStudioPage
          download={route.download === true}
          key={route.id}
          touchpointId={route.id}
        />
      );
    case "qr":
      return <QrLibraryPage />;
    case "qr-design":
      return <QrDesignPage key={route.id} templateId={route.id} />;
    case "links":
      return <LinksPage />;
    case "link":
      return <LinkDetailPage key={route.id} linkId={route.id} />;
    case "experiences":
      return <ExperiencesPage />;
    case "experience-scan":
      return <QuickScanPage />;
    case "experience-new":
      return (
        <NewExperiencePage
          groupId={route.groupId ?? null}
          touchpointId={route.touchpointId}
        />
      );
    case "experience":
      // Keyed by id only: switching Diseño / Destinos / Historial keeps the
      // page (and its unsaved draft) mounted.
      return (
        <ExperienceEditorPage
          experienceId={route.id}
          key={route.id}
          view={route.view ?? null}
        />
      );
    case "experience-studio":
      return <ExperienceStudioPage experienceId={route.id} key={route.id} />;
    case "availability":
      return <AvailabilityPage experienceId={route.experienceId ?? null} />;
    case "notifications":
      return <NotificationsPage />;
    case "assets":
      return <AssetsPage />;
    case "analytics":
      return <AnalyticsPage />;
    case "leads":
      return <LeadsPage />;
    case "organization":
      // Equipo is a section of Configuración (ADR 023).
      return <SettingsPage section="equipo" />;
    case "invitation":
      return <InvitationPage />;
    case "create-business":
      return <CreateBusinessPage />;
    case "first-steps":
      return <FirstStepsPage />;
    case "settings":
      return <SettingsPage section={route.section ?? "cuenta"} />;
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

/** Placeholder while a section's code chunk loads. */
function PageFallback() {
  return (
    <div className="page page-fallback">
      <Skeleton label="Cargando la sección…" lines={4} />
    </div>
  );
}

export function LoadingScreen() {
  return (
    <main className="state-screen state-screen-loading" aria-busy="true">
      <img alt="Kardo" className="state-screen-logo" src="/kardo-logo.svg" />
      <span aria-hidden="true" className="state-screen-progress" />
      <p role="status">Preparando tu espacio…</p>
    </main>
  );
}

function StateScreen({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow: string;
  title: string;
  children: string;
  action?: ReactNode;
}) {
  return (
    <main className="state-screen">
      <img alt="Kardo" className="state-screen-logo" src="/kardo-logo.svg" />
      <section className="state-panel state-panel-error">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{children}</p>
        {action}
      </section>
    </main>
  );
}
