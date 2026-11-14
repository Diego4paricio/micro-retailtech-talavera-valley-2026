import type {
  CustomerWorkspace,
  ExperienceSummary,
  Touchpoint,
  TouchpointGroup,
} from "@kardo/contracts";
import { type CustomerPermission, canCustomer } from "@kardo/domain";
import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from "react";
import { experiencesApi } from "../api/experiences.js";
import { groupsApi } from "../api/groups.js";
import { touchpointsApi } from "../api/touchpoints.js";
import { type Resource, useResource } from "../lib/use-resource.js";

type WorkspaceContextValue = {
  session: Session;
  workspace: CustomerWorkspace;
  workspaces: readonly CustomerWorkspace[];
  /** The personal space of someone who joined by invitation and never set
   * up a business of their own (T3); out of the switcher until they do. */
  pendingSetup: CustomerWorkspace | null;
  selectWorkspace: (workspaceId: string) => void;
  reloadWorkspaces: () => Promise<void>;
  can: (permission: CustomerPermission) => boolean;
  touchpoints: Resource<Touchpoint[]>;
  experiences: Resource<ExperienceSummary[]>;
  groups: Resource<TouchpointGroup[]>;
  upsertTouchpoint: (touchpoint: Touchpoint) => void;
  upsertExperience: (experience: ExperienceSummary) => void;
  /** Refreshes groups and Touchpoints after a membership change. */
  refreshGroups: () => Promise<void>;
  /** Refreshes Touchpoints and Experiences after a publication changes. */
  refreshPublicationState: () => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

const publishingStates = new Set(["pending", "processing"]);

export function WorkspaceProvider({
  session,
  workspace,
  workspaces,
  pendingSetup = null,
  selectWorkspace,
  reloadWorkspaces,
  loadLists = true,
  children,
}: {
  session: Session;
  workspace: CustomerWorkspace;
  workspaces: readonly CustomerWorkspace[];
  pendingSetup?: CustomerWorkspace | null;
  selectWorkspace: (workspaceId: string) => void;
  reloadWorkspaces: () => Promise<void>;
  /** `false` for a screen that only answers an invitation: it needs the
   * session and the role, not the organization's lists (A2-74). */
  loadLists?: boolean;
  children: ReactNode;
}) {
  const touchpoints = useResource(
    loadLists ? `touchpoints:${workspace.id}` : null,
    (signal) => touchpointsApi.list(workspace.id, signal),
  );
  const experiences = useResource(
    loadLists ? `experiences:${workspace.id}` : null,
    (signal) => experiencesApi.list(workspace.id, signal),
  );

  const groups = useResource(
    loadLists ? `groups:${workspace.id}` : null,
    (signal) => groupsApi.list(workspace.id, signal),
  );

  const { setData: setTouchpoints, reload: reloadTouchpoints } = touchpoints;
  const { reload: reloadGroups } = groups;
  const { setData: setExperiences, reload: reloadExperiences } = experiences;

  const upsertTouchpoint = useCallback(
    (touchpoint: Touchpoint) =>
      setTouchpoints((items) => upsert(items, touchpoint)),
    [setTouchpoints],
  );
  const upsertExperience = useCallback(
    (experience: ExperienceSummary) =>
      setExperiences((items) => upsert(items, experience)),
    [setExperiences],
  );
  const refreshGroups = useCallback(async () => {
    await Promise.all([reloadGroups(), reloadTouchpoints()]);
  }, [reloadGroups, reloadTouchpoints]);
  const refreshPublicationState = useCallback(async () => {
    await Promise.all([reloadExperiences(), reloadTouchpoints()]);
  }, [reloadExperiences, reloadTouchpoints]);
  // While polling, only the publication fields travel (domain audit
  // A2-30): each page keeps its content and takes the new state.
  const workspaceId = workspace.id;
  const pollPublicationState = useCallback(async () => {
    const [states] = await Promise.all([
      experiencesApi.publicationStates(workspaceId).catch(() => null),
      reloadTouchpoints(),
    ]);
    if (!states) return reloadExperiences();
    const byId = new Map(states.map((state) => [state.id, state]));
    setExperiences((items) =>
      items
        ? items.map((item) => {
            const state = byId.get(item.id);
            return state ? { ...item, ...state } : item;
          })
        : items,
    );
  }, [workspaceId, reloadTouchpoints, reloadExperiences, setExperiences]);

  // The Publisher runs asynchronously. While a publication is in flight, poll
  // with backoff so the customer sees Publishing → Published/Failed live.
  const isPublishing = Boolean(
    experiences.data?.some((item) =>
      publishingStates.has(item.publicationStatus),
    ),
  );
  useEffect(() => {
    if (!isPublishing) return;
    let attempt = 0;
    let timer: number;
    const tick = () => {
      attempt += 1;
      void pollPublicationState().finally(() => {
        if (attempt < 30)
          timer = window.setTimeout(
            tick,
            Math.min(4_000 + attempt * 1_000, 15_000),
          );
      });
    };
    timer = window.setTimeout(tick, 4_000);
    return () => window.clearTimeout(timer);
  }, [isPublishing, pollPublicationState]);

  const can = useCallback(
    (permission: CustomerPermission) => canCustomer(workspace.role, permission),
    [workspace.role],
  );

  const value = useMemo(
    () => ({
      session,
      workspace,
      workspaces,
      pendingSetup,
      selectWorkspace,
      reloadWorkspaces,
      can,
      touchpoints,
      experiences,
      groups,
      upsertTouchpoint,
      upsertExperience,
      refreshGroups,
      refreshPublicationState,
    }),
    [
      session,
      workspace,
      workspaces,
      pendingSetup,
      selectWorkspace,
      reloadWorkspaces,
      can,
      touchpoints,
      experiences,
      groups,
      upsertTouchpoint,
      upsertExperience,
      refreshGroups,
      refreshPublicationState,
    ],
  );
  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value)
    throw new Error("useWorkspace must be used inside WorkspaceProvider.");
  return value;
}

function upsert<T extends { id: string }>(items: T[] | null, item: T): T[] {
  if (!items) return [item];
  const index = items.findIndex((candidate) => candidate.id === item.id);
  if (index === -1) return [item, ...items];
  const next = items.slice();
  next[index] = item;
  return next;
}
