import { type ReactNode, useCallback, useState } from "react";
import { AccessBanner } from "../features/billing/AccessBanner.js";
import { AccessProvider } from "../features/billing/access-context.js";
import { PlanRequiredDialog } from "../features/billing/PlanRequiredDialog.js";
import { PlanSelectionBanner } from "../features/billing/PlanSelectionBanner.js";
import { HelpProvider } from "../features/help/HelpProvider.js";
import { NotificationsProvider } from "../features/notifications/NotificationsProvider.js";
import { FirstStepsLauncher } from "../features/onboarding/FirstStepsLauncher.js";
import { KardoTourHost } from "../features/onboarding/HowKardoWorks.js";
import {
  FirstStepsProvider,
  useFirstSteps,
} from "../features/onboarding/use-first-steps.js";
import { type Route, useRouter } from "../lib/router.js";
import { MobileNav } from "./MobileNav.js";
import { Sidebar } from "./Sidebar.js";
import { Topbar } from "./Topbar.js";
import { useWorkspace } from "./WorkspaceContext.js";

/** Layout of the signed-in panel: sidebar, top bar, page and help drawer. */
export function WorkspaceShell({ children }: { children: ReactNode }) {
  const { route } = useRouter();
  const { workspace } = useWorkspace();
  // The mobile menu belongs to the route it was opened on: navigating closes it.
  const [navRoute, setNavRoute] = useState<Route | null>(null);
  const isNavOpen = navRoute === route;
  const openNav = useCallback(() => setNavRoute(route), [route]);
  const closeNav = useCallback(() => setNavRoute(null), []);
  const firstSteps = useFirstSteps();

  // Primeros pasos is a focused screen without the sidebar (owner,
  // 2026-10-03); the page brings its own bar.
  if (route.name === "first-steps")
    return (
      <AccessProvider workspaceId={workspace.id}>
        <HelpProvider>
          <FirstStepsProvider value={firstSteps}>{children}</FirstStepsProvider>
          <KardoTourHost firstStepsPending={false} />
          <PlanRequiredDialog />
        </HelpProvider>
      </AccessProvider>
    );

  return (
    <AccessProvider workspaceId={workspace.id}>
      <FirstStepsProvider value={firstSteps}>
        <HelpProvider>
          <NotificationsProvider>
            <div className="app-shell">
              <a className="skip-link" href="#main-content">
                Ir al contenido
              </a>
              <Sidebar />
              <MobileNav onClose={closeNav} open={isNavOpen} />
              <div className="workspace-column">
                <Topbar isNavOpen={isNavOpen} onOpenNav={openNav} />
                {/* A personal space without sign up has no plan to talk about. */}
                {workspace.setupPending ? null : <AccessBanner />}
                {workspace.setupPending ? null : <PlanSelectionBanner />}
                <main
                  className="workspace-main"
                  id="main-content"
                  tabIndex={-1}
                >
                  {children}
                </main>
              </div>
              <PlanRequiredDialog />
              {workspace.setupPending ? null : (
                <FirstStepsLauncher steps={firstSteps} />
              )}
              <KardoTourHost firstStepsPending={firstSteps.isPending} />
            </div>
          </NotificationsProvider>
        </HelpProvider>
      </FirstStepsProvider>
    </AccessProvider>
  );
}
