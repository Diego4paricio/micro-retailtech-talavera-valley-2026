import type {
  Asset,
  ExperienceContent,
  ExperienceSummary,
  ExperienceTargetStatus,
  ExperienceTargets,
  ExperienceType,
  ExperienceVersion,
  Touchpoint,
} from "@kardo/contracts";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { assetsApi } from "../../api/assets.js";
import { experiencesApi } from "../../api/experiences.js";
import { useToast } from "../../components/Toast.js";
import { ApiRequestError, errorMessage } from "../../lib/api.js";
import { useRouter } from "../../lib/router.js";
import { useResource } from "../../lib/use-resource.js";
import { useTick } from "../../lib/use-tick.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { isDesignableType } from "../studio/model/content.js";
import { replacing } from "./assign.js";
import {
  cleanContent,
  type ValidationErrors,
  validateContent,
} from "./content.js";
import {
  changedElsewhereMessage,
  isChangedElsewhere,
} from "./draft-conflict.js";
import {
  experienceTargetsOf,
  resolveTargetTouchpoints,
  sameTargets,
} from "./targets.js";
import {
  draftSavePlan,
  opensOwnStudio,
  publicationProgressNote,
  publishedMessage,
  staysInExperience,
} from "./workspace-model.js";

/**
 * The state of one Experience workspace, lifted above its three views
 * (Diseño, Destinos, Historial) so an unsaved draft — name, content and
 * destinations — survives switching between them. The page owns it; the
 * views only read and change it.
 */

export type WorkspaceSource = {
  kind: "existing";
  experience: ExperienceSummary;
  versions: readonly ExperienceVersion[];
  /** Every version the page has, also past the ones listed. */
  versionCount?: number | undefined;
  targetStatuses: readonly ExperienceTargetStatus[];
  reload: () => Promise<void>;
  onVersionsReplaced: (versions: readonly ExperienceVersion[]) => void;
  onArchivedChange: (archivedAt: string | null) => void;
};

export type PublishResult =
  | { ok: true }
  | { ok: false; message: string; code: string | null };

type WorkspaceValue = {
  experience: ExperienceSummary;
  experienceId: string;
  type: ExperienceType;
  versions: readonly ExperienceVersion[];
  /** Every version the page has (the list shows the 50 most recent). */
  versionCount: number;
  targetStatuses: readonly ExperienceTargetStatus[];

  name: string;
  setName: (name: string) => void;
  content: ExperienceContent;
  setContent: (content: ExperienceContent) => void;
  /** Content already saved on the server by someone else here («Editar
   * productos»): it becomes both the draft and the saved state. */
  adoptSavedContent: (
    content: ExperienceContent,
    /** The draft revision the server answered with. */
    draftRevision?: number | undefined,
  ) => void;
  /** Unsaved name or content. */
  isDirty: boolean;
  errors: ValidationErrors;
  errorCount: number;
  visibleErrors: ValidationErrors;
  /** Takes the person to the invalid fields: the Estudio for pages designed
   * there, the marked fields in Diseño otherwise. */
  revealErrors: () => void;
  /** Someone else saved this page while this screen was open (409
   * `EXPERIENCE_CHANGED`): saving is stopped until the page is reloaded. */
  hasConflict: boolean;
  /** Reloads the page to see the latest version (loses what is on screen). */
  reloadLatest: () => void;

  savedTargets: ExperienceTargets;
  targets: ExperienceTargets;
  setTargets: (targets: ExperienceTargets) => void;
  targetsChanged: boolean;
  /** Touchpoints the (possibly unsaved) destinations resolve to. */
  resolvedTargets: Touchpoint[];

  canEdit: boolean;
  canPublish: boolean;
  isArchived: boolean;
  readOnly: boolean;

  assets: readonly Asset[];
  addAsset: (asset: Asset) => void;

  isSaving: boolean;
  serverError: string | null;
  dismissServerError: () => void;
  /** Saves every pending change (draft and destinations). */
  save: () => Promise<boolean>;
  /**
   * Saves the draft like `save`, but quietly and keeping the saved
   * destinations: the caller needs the saved page right away (the publish
   * dialog creates a link that points at it) and sets the destinations
   * itself. Null when a field stops it; API errors are thrown.
   */
  saveDraft: () => Promise<ExperienceSummary | null>;
  /** The destinations the server already holds after a step taken outside
   * this workspace (a new link created and published from the dialog). */
  adoptSavedTargets: (targets: ExperienceTargets) => void;
  discard: () => void;

  isPublicationInFlight: boolean;
  latestFailure: string | null;
  /** Live status line while a publication is in flight (null otherwise). */
  publicationNote: string | null;
  isPublishOpen: boolean;
  openPublish: () => void;
  closePublish: () => void;
  publish: (input: {
    targets: ExperienceTargets;
    idempotencyKey: string;
    /** The destinations showing another page that the owner confirmed to
     * replace; any other one is kept (round 4, B1). Omitted: today's
     * behavior, everything is replaced. */
    replaceTargets?: readonly string[] | undefined;
  }) => Promise<PublishResult>;

  restore: (version: ExperienceVersion) => Promise<void>;
  publishVersion: (version: ExperienceVersion) => Promise<void>;
  isDuplicating: boolean;
  duplicate: () => Promise<void>;
  archive: () => Promise<void>;
  unarchive: () => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

function snapshot(name: string, content: ExperienceContent): string {
  return JSON.stringify({ name, content });
}

function focusFirstInvalid() {
  // Errors render on the next frame; then move focus to the first one.
  window.requestAnimationFrame(() =>
    document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus(),
  );
}

export function ExperienceWorkspaceProvider({
  source,
  children,
}: {
  source: WorkspaceSource;
  children: ReactNode;
}) {
  const {
    workspace,
    touchpoints,
    groups,
    experiences,
    can,
    upsertExperience,
    refreshPublicationState,
  } = useWorkspace();
  const { route, navigate, setGuard } = useRouter();
  const { notify } = useToast();

  const existing = source.experience;
  const experienceId = existing.id;
  const type = existing.type;

  const initial = {
    name: source.experience.name,
    content: source.experience.content,
    targets: experienceTargetsOf(source.experience),
  };
  const [name, setName] = useState(initial.name);
  const [content, setContent] = useState<ExperienceContent>(initial.content);
  // The last saved name and content: what "Descartar" goes back to.
  const [savedDraft, setSavedDraft] = useState<{
    name: string;
    content: ExperienceContent;
  }>(() => ({ name: initial.name, content: initial.content }));
  const saved = useMemo(
    () => snapshot(savedDraft.name, savedDraft.content),
    [savedDraft],
  );
  // The revision of the draft this screen loaded (domain audit A2-22): every
  // save sends it back, and the server refuses it when someone saved in
  // between. The ref follows our own saves; a ref, because publish reads it
  // after awaits.
  const draftRevisionRef = useRef<number | undefined>(
    source.experience.draftRevision,
  );
  const [hasConflict, setHasConflict] = useState(false);
  const [targets, setTargets] = useState<ExperienceTargets>(initial.targets);
  const [savedTargets, setSavedTargets] = useState<ExperienceTargets>(
    initial.targets,
  );
  const [showErrors, setShowErrors] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [isPublishOpen, setIsPublishOpen] = useState(false);

  // «Link» where the place is one, «QR o etiqueta» otherwise (A2-27).
  const kindOfTouchpoint = useCallback(
    (id: string) =>
      touchpoints.data?.find((touchpoint) => touchpoint.id === id)?.kind,
    [touchpoints.data],
  );

  const canEdit = can("experiences.edit");
  const canPublish = can("experiences.publish");
  const isArchived = Boolean(existing.archivedAt);
  const readOnly = !canEdit || isArchived;

  const assetsResource = useResource(`assets:${workspace.id}`, (signal) =>
    assetsApi.list(workspace.id, signal),
  );
  const { setData: setAssets } = assetsResource;
  const addAsset = useCallback(
    (asset: Asset) =>
      setAssets((items) => (items ? [asset, ...items] : [asset])),
    [setAssets],
  );

  const isDirty = saved !== snapshot(name, content);
  const adoptSavedContent = useCallback(
    (next: ExperienceContent, revision?: number | undefined) => {
      if (revision !== undefined) draftRevisionRef.current = revision;
      setContent(next);
      setSavedDraft((current) => ({ name: current.name, content: next }));
    },
    [],
  );
  const targetsChanged = !sameTargets(targets, savedTargets);
  const resolvedTargets = useMemo(
    () =>
      resolveTargetTouchpoints(
        targets,
        touchpoints.data ?? [],
        groups.data ?? [],
      ),
    [targets, touchpoints.data, groups.data],
  );
  const errors = useMemo(() => {
    const contentErrors = validateContent(type, content);
    if (!name.trim()) contentErrors.name = "Ponle un nombre interno.";
    return contentErrors;
  }, [type, content, name]);
  const errorCount = Object.keys(errors).length;
  // A page designed in the Estudio has no content fields here, so a content
  // problem must not stop renaming or saving the name (domain audit A2-25).
  const editsContentHere = !isDesignableType(type);
  const nameError = name.trim() ? 0 : 1;
  const visibleErrors = showErrors ? errors : {};

  // Protect unsaved work when leaving the Experience (in-app navigation and
  // tab close). Moving between its own views keeps the draft, so it passes.
  // The router drops a guard once it lets a navigation through: `route` in
  // the dependencies registers it again on the new view.
  const hasPending = !readOnly && (isDirty || targetsChanged);
  // `save` is declared below; the guard reads the latest one when used.
  const saveRef = useRef<(() => Promise<boolean>) | null>(null);
  const cannotSaveQuietlyRef = useRef(false);
  cannotSaveQuietlyRef.current = hasConflict || nameError > 0;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-register on every route change
  useEffect(() => {
    if (!hasPending) {
      setGuard(null);
      return;
    }
    setGuard({
      allows: (next) => {
        if (staysInExperience(next, experienceId)) return true;
        // Opening this page's own Estudio is not leaving it: a new name or
        // new destinations are saved on the way in (domain audit A2-33).
        // Anything that cannot be saved quietly keeps the usual question.
        if (
          opensOwnStudio(next, experienceId) &&
          !cannotSaveQuietlyRef.current
        ) {
          void saveRef.current?.().then((ok) => {
            if (!ok)
              notifyRef.current("No pudimos guardar tus cambios.", "error");
          });
          return true;
        }
        return false;
      },
      message: "Si sales ahora, se pierden los cambios de esta página.",
      save: () => saveRef.current?.() ?? Promise.resolve(false),
    });
    return () => setGuard(null);
  }, [hasPending, experienceId, setGuard, route]);

  // When polling reports a new publication state, refresh versions and the
  // per-Touchpoint status.
  const publicationStatus = existing.publicationStatus;
  const reloadDetail = source.reload;
  const previousStatus = useRef(publicationStatus);
  useEffect(() => {
    if (previousStatus.current === publicationStatus) return;
    previousStatus.current = publicationStatus;
    if (reloadDetail) void reloadDetail();
  }, [publicationStatus, reloadDetail]);

  /**
   * Writes the pending draft and destinations. Returns the saved Experience,
   * `null` when validation stops it, and throws API errors to the caller.
   * Only what changed travels (domain audit A2-22): a rename sends the name
   * alone, so it never rewrites content the Estudio saved from another
   * view, and every write carries the draft revision this screen loaded.
   */
  const persist = useCallback(
    async (
      nextTargets: ExperienceTargets,
    ): Promise<ExperienceSummary | null> => {
      setShowErrors(true);
      const contentChanged =
        JSON.stringify(content) !== JSON.stringify(savedDraft.content);
      const plan = draftSavePlan({
        contentChanged,
        nameInvalid: nameError > 0,
        contentInvalid: errorCount > nameError,
        editsContentHere,
        draftRevision: draftRevisionRef.current,
      });
      if (plan.blocked) {
        focusFirstInvalid();
        return null;
      }
      setIsSaving(true);
      try {
        let current = existing;
        if (isDirty) {
          try {
            current = await experiencesApi.update(workspace.id, current.id, {
              name: name.trim(),
              ...(plan.sendsContent
                ? { content: cleanContent(type, content) }
                : {}),
              ...plan.revision,
            });
          } catch (error) {
            if (isChangedElsewhere(error)) {
              setHasConflict(true);
              throw new ApiRequestError(
                changedElsewhereMessage,
                409,
                "EXPERIENCE_CHANGED",
              );
            }
            throw error;
          }
          if (current.draftRevision !== undefined)
            draftRevisionRef.current = current.draftRevision;
        }
        if (!sameTargets(nextTargets, savedTargets))
          current = await experiencesApi.setTargets(
            workspace.id,
            current.id,
            nextTargets,
          );
        upsertExperience(current);
        setSavedDraft({ name, content });
        const targetsWereSaved = !sameTargets(nextTargets, savedTargets);
        setSavedTargets(nextTargets);
        setTargets(nextTargets);
        if (targetsWereSaved && reloadDetail) void reloadDetail();
        return current;
      } finally {
        setIsSaving(false);
      }
    },
    [
      content,
      editsContentHere,
      errorCount,
      existing,
      isDirty,
      name,
      nameError,
      reloadDetail,
      savedDraft,
      savedTargets,
      type,
      upsertExperience,
      workspace.id,
    ],
  );

  const save = useCallback(async (): Promise<boolean> => {
    setServerError(null);
    const onlyTargets = !isDirty && targetsChanged;
    try {
      const current = await persist(targets);
      if (!current) return false;
      if (onlyTargets) {
        notify(
          current.publicationStatus === "draft"
            ? "Guardamos dónde se ve. Se aplica cuando publiques."
            : "Guardamos dónde se ve. Publica para llevar esta página a los nuevos QR, etiquetas y links.",
        );
      } else {
        notify(
          "Borrador guardado. Lo publicado no cambia hasta que publiques.",
        );
      }
      return true;
    } catch (error) {
      setServerError(errorMessage(error));
      return false;
    }
  }, [isDirty, notify, persist, targets, targetsChanged]);
  saveRef.current = save;

  // Keeps the saved destinations: the caller sets them right after.
  const saveDraft = useCallback(async () => {
    setServerError(null);
    return persist(savedTargets);
  }, [persist, savedTargets]);

  const adoptSavedTargets = useCallback((next: ExperienceTargets) => {
    setSavedTargets(next);
    setTargets(next);
  }, []);

  const discard = useCallback(() => {
    setName(savedDraft.name);
    setContent(savedDraft.content);
    setTargets(savedTargets);
    setShowErrors(false);
    setServerError(null);
  }, [savedDraft, savedTargets]);

  const publish = useCallback(
    async (input: {
      targets: ExperienceTargets;
      idempotencyKey: string;
      replaceTargets?: readonly string[] | undefined;
    }): Promise<PublishResult> => {
      try {
        // A page designed in the Estudio is fixed there, not in Diseño
        // (domain audit A2-25).
        if (nameError === 0 && errorCount > 0 && !editsContentHere)
          return {
            ok: false,
            message: "Revisa tu página en el Estudio antes de publicar.",
            code: "INVALID_CONTENT",
          };
        let current = existing;
        if (isDirty || !sameTargets(input.targets, savedTargets)) {
          const saved = await persist(input.targets);
          if (!saved)
            return {
              ok: false,
              message:
                nameError > 0
                  ? "Ponle un nombre interno antes de publicar."
                  : "Revisa los campos marcados en Diseño antes de publicar.",
              code: "INVALID_CONTENT",
            };
          current = saved;
        }
        const batch = await experiencesApi.publish(
          workspace.id,
          current.id,
          input.idempotencyKey,
          input.replaceTargets
            ? { replaceTargets: [...input.replaceTargets] }
            : undefined,
        );
        upsertExperience({
          ...current,
          publicationStatus: "pending",
          hasUnpublishedChanges: false,
        });
        notify(publishedMessage(batch, kindOfTouchpoint));
        void refreshPublicationState();
        if (reloadDetail) void reloadDetail();
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          message: errorMessage(error),
          code: error instanceof ApiRequestError ? error.code : null,
        };
      }
    },
    [
      editsContentHere,
      errorCount,
      existing,
      isDirty,
      kindOfTouchpoint,
      nameError,
      notify,
      persist,
      refreshPublicationState,
      reloadDetail,
      savedTargets,
      upsertExperience,
      workspace.id,
    ],
  );

  const openPublish = useCallback(() => setIsPublishOpen(true), []);
  const revealErrors = useCallback(() => {
    // A page designed in the Estudio has nothing marked in Diseño: the
    // problem is fixed there (domain audit A2-25).
    if (!editsContentHere && nameError === 0) {
      navigate({ name: "experience-studio", id: experienceId });
      return;
    }
    setShowErrors(true);
    // After the dialog has closed and returned focus to its opener.
    window.setTimeout(
      () =>
        document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus(),
      280,
    );
  }, [editsContentHere, experienceId, nameError, navigate]);
  const closePublish = useCallback(() => setIsPublishOpen(false), []);
  const reloadLatest = useCallback(() => window.location.reload(), []);

  const restore = useCallback(
    async (version: ExperienceVersion) => {
      try {
        const detail = await experiencesApi.restoreVersion(
          workspace.id,
          existing.id,
          version.id,
        );
        const restored = detail.experience as unknown as ExperienceSummary;
        setName(restored.name);
        setContent(restored.content);
        setSavedDraft({ name: restored.name, content: restored.content });
        if (restored.draftRevision !== undefined)
          draftRevisionRef.current = restored.draftRevision;
        upsertExperience(restored);
        source.onVersionsReplaced(detail.versions);
        notify(`Borrador restaurado desde la versión ${version.revision}.`);
      } catch (error) {
        notify(errorMessage(error), "error");
      }
    },
    [existing.id, notify, source, upsertExperience, workspace.id],
  );

  const publishVersion = useCallback(
    async (version: ExperienceVersion) => {
      try {
        // Going back to a version never takes a QR or a link from another
        // page (domain audit A9-5): the message names any place that kept
        // its page.
        const batch = await experiencesApi.publishVersion(
          workspace.id,
          existing.id,
          version.id,
          replacing([]),
        );
        upsertExperience({ ...existing, publicationStatus: "pending" });
        notify(publishedMessage(batch, kindOfTouchpoint));
        await refreshPublicationState();
      } catch (error) {
        notify(errorMessage(error), "error");
      }
    },
    [
      existing,
      kindOfTouchpoint,
      notify,
      refreshPublicationState,
      upsertExperience,
      workspace.id,
    ],
  );

  const duplicate = useCallback(async () => {
    setIsDuplicating(true);
    try {
      const copy = await experiencesApi.duplicate(workspace.id, existing.id);
      upsertExperience(copy);
      notify(`«${copy.name}» se creó como borrador.`);
      navigate({ name: "experience", id: copy.id });
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setIsDuplicating(false);
    }
  }, [existing, navigate, notify, upsertExperience, workspace.id]);

  const onArchivedChange = source.onArchivedChange;
  const { setData: setExperiences } = experiences;
  const archive = useCallback(async () => {
    // Errors reach the confirmation dialog, which stays open to show them.
    const result = await experiencesApi.archive(workspace.id, existing.id);
    setExperiences((current) =>
      current ? current.filter((item) => item.id !== existing.id) : current,
    );
    onArchivedChange(result.archivedAt);
    // An archived Experience is read-only: pending edits cannot be saved.
    setTargets(savedTargets);
    setName(savedDraft.name);
    setContent(savedDraft.content);
    notify(
      result.fallbackPublications
        ? `Página archivada. ${result.fallbackPublications === 1 ? "1 QR o etiqueta" : `${result.fallbackPublications} QR y etiquetas`} ahora muestran la página de su grupo.`
        : "Página archivada. Puedes restaurarla cuando quieras.",
    );
  }, [
    existing,
    notify,
    onArchivedChange,
    savedDraft,
    savedTargets,
    setExperiences,
    workspace.id,
  ]);

  const unarchive = useCallback(async () => {
    try {
      const restored = await experiencesApi.unarchive(
        workspace.id,
        existing.id,
      );
      upsertExperience(restored);
      onArchivedChange(null);
      notify(`«${restored.name}» se restauró desde Archivadas.`);
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  }, [existing, notify, onArchivedChange, upsertExperience, workspace.id]);

  const versions = source.versions;
  const targetStatuses = source.targetStatuses;
  const isPublicationInFlight =
    existing.publicationStatus === "pending" ||
    existing.publicationStatus === "processing";
  useTick(isPublicationInFlight ? 10_000 : 3_600_000);
  const publicationNote = isPublicationInFlight
    ? publicationProgressNote(versions[0]?.publication, Date.now())
    : null;
  const latestFailure =
    existing.publicationStatus === "failed"
      ? (versions[0]?.publication?.failureReason ??
        "No pudimos completar la publicación.")
      : null;

  const value: WorkspaceValue = {
    experience: existing,
    experienceId,
    type,
    versions,
    versionCount: Math.max(source.versionCount ?? 0, versions.length),
    targetStatuses,
    name,
    setName,
    content,
    setContent,
    adoptSavedContent,
    isDirty,
    errors,
    errorCount,
    visibleErrors,
    revealErrors,
    hasConflict,
    reloadLatest,
    savedTargets,
    targets,
    setTargets,
    targetsChanged,
    resolvedTargets,
    canEdit,
    canPublish,
    isArchived,
    readOnly,
    assets: assetsResource.data ?? [],
    addAsset,
    isSaving,
    serverError,
    dismissServerError: () => setServerError(null),
    save,
    saveDraft,
    adoptSavedTargets,
    discard,
    isPublicationInFlight,
    latestFailure,
    publicationNote,
    isPublishOpen,
    openPublish,
    closePublish,
    publish,
    restore,
    publishVersion,
    isDuplicating,
    duplicate,
    archive,
    unarchive,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useExperienceWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext);
  if (!value)
    throw new Error(
      "useExperienceWorkspace must be used inside ExperienceWorkspaceProvider.",
    );
  return value;
}
