import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { useWorkspaceProfile } from "../business-profile/profile-store.js";
import {
  type FirstStepsState,
  firstStepsState,
  isFirstStepsPending,
} from "./first-steps-model.js";
import type { PendingShare } from "./share-model.js";

/**
 * What this browser remembers of Primeros pasos, per organization: the page
 * chosen in step 2 and where it was published in step 4, that the owner saw
 * it as a customer ("Pruébalo"), published through these steps, or hid the
 * guide. Conveniences only: everything else comes from the organization's
 * real data.
 */
type Memory = {
  tried?: boolean;
  publishedHere?: boolean;
  hidden?: boolean;
  experienceId?: string;
  touchpointId?: string;
  /** «Cómo se ve» already offered the logo (uploaded or «Ahora no»). */
  logoAsked?: boolean;
  /** A QR, tag or link created in step 4 whose publishing failed: a retry
   * (even after a reload) publishes it instead of creating another. */
  pendingShare?: PendingShare | undefined;
};

const key = (workspaceId: string) => `kardo.firstSteps.${workspaceId}`;

function readMemory(workspaceId: string): Memory {
  try {
    const raw = window.localStorage.getItem(key(workspaceId));
    return raw ? (JSON.parse(raw) as Memory) : {};
  } catch {
    return {};
  }
}

function writeMemory(workspaceId: string, memory: Memory) {
  try {
    window.localStorage.setItem(key(workspaceId), JSON.stringify(memory));
  } catch {
    // Private mode or blocked storage: the steps still work, only forget.
  }
}

export type FirstSteps = {
  state: FirstStepsState;
  isLoading: boolean;
  /** Owner, Admin or Editor of a business: may create and publish. */
  canUse: boolean;
  /**
   * Show Primeros pasos (the guide button): something is missing in an
   * organization that is not live yet, or that went live through these
   * steps. One already live before (the demo account, 2026-10-04) is not
   * guided again.
   */
  isPending: boolean;
  hidden: boolean;
  hide: () => void;
  show: () => void;
  markTried: () => void;
  /** Published in step 4, on this Touchpoint. */
  markPublished: (touchpointId: string) => void;
  /** The page step 2 chose or created. */
  chooseExperience: (experienceId: string) => void;
  /** Where step 4 published, for «Pruébalo». */
  touchpointId: string | null;
  /** The logo was offered before the looks (owner, 2026-10-07). */
  logoAsked: boolean;
  markLogoAsked: () => void;
  reloadProfile: () => Promise<void>;
  profile: ReturnType<typeof useWorkspaceProfile>;
  /** Step 4's QR, tag or link that exists but is not published yet. */
  pendingShare: PendingShare | null;
  rememberPendingShare: (pending: PendingShare | null) => void;
  /** May edit the business's data (Owner, Admin): an Editor is asked to
   * have someone who can do it complete step 1. */
  canManageBusiness: boolean;
};

export function useFirstSteps(): FirstSteps {
  const { workspace, experiences, can } = useWorkspace();
  const profile = useWorkspaceProfile();
  const [memory, setMemory] = useState<Memory>(() => readMemory(workspace.id));
  const update = useCallback(
    (patch: Memory) =>
      setMemory((current) => {
        const next = { ...current, ...patch };
        writeMemory(workspace.id, next);
        return next;
      }),
    [workspace.id],
  );
  const canManageBusiness = can("workspace.manage");
  const state = useMemo(
    () =>
      firstStepsState({
        profile: profile.data ?? null,
        experiences: experiences.data ?? [],
        tried: Boolean(memory.tried),
        experienceId: memory.experienceId ?? null,
        canManageBusiness,
      }),
    [
      profile.data,
      experiences.data,
      memory.tried,
      memory.experienceId,
      canManageBusiness,
    ],
  );
  // Only the first load: a refresh keeps the page and the guide on screen.
  const isLoading =
    (profile.isLoading && !profile.data) ||
    (experiences.isLoading && !experiences.data);
  const canUse =
    !workspace.setupPending &&
    can("experiences.edit") &&
    can("touchpoints.manage");
  const isPending =
    canUse &&
    !isLoading &&
    isFirstStepsPending({
      state,
      experiences: experiences.data ?? [],
      publishedHere: Boolean(memory.publishedHere),
    });
  return {
    state,
    isLoading,
    canUse,
    isPending,
    hidden: Boolean(memory.hidden),
    hide: () => update({ hidden: true }),
    show: () => update({ hidden: false }),
    markTried: () => update({ tried: true }),
    markPublished: (touchpointId) =>
      update({ publishedHere: true, touchpointId, pendingShare: undefined }),
    chooseExperience: (experienceId) => update({ experienceId }),
    touchpointId: memory.touchpointId ?? null,
    logoAsked: Boolean(memory.logoAsked),
    markLogoAsked: () => update({ logoAsked: true }),
    reloadProfile: profile.reload,
    profile,
    pendingShare: memory.pendingShare ?? null,
    rememberPendingShare: (pending) =>
      update({ pendingShare: pending ?? undefined }),
    canManageBusiness,
  };
}

/**
 * One Primeros pasos per panel: the shell holds it (`useFirstSteps`) and
 * the page and the guide button read it, so what the page saves shows on
 * the button without reloading.
 */
const FirstStepsContext = createContext<FirstSteps | null>(null);
export const FirstStepsProvider = FirstStepsContext.Provider;

export function useSharedFirstSteps(): FirstSteps {
  const steps = useContext(FirstStepsContext);
  if (!steps) throw new Error("Primeros pasos needs the workspace shell.");
  return steps;
}

/** The shared state where it may be missing (Ayuda outside the shell). */
export function useOptionalFirstSteps(): FirstSteps | null {
  return useContext(FirstStepsContext);
}
