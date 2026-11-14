import type {
  AvailabilityExperience,
  AvailabilityOverview,
  ItemAvailabilityChange,
  SaveItemAvailability,
} from "@kardo/contracts";
import {
  AvailabilitySaveQueue,
  type QueueSnapshot,
  type Timers,
} from "./save-queue.js";

/**
 * Every Menu and Catalog of the workspace with its save queue. Framework-free
 * (React reads it through `useSyncExternalStore`), so the merge rules between
 * list refreshes and in-flight saves are unit-tested.
 */

export type AvailabilityApi = {
  load: (signal?: AbortSignal) => Promise<AvailabilityOverview>;
  save: (
    experienceId: string,
    body: SaveItemAvailability,
  ) => Promise<AvailabilityExperience>;
};

export type StoreSnapshot = {
  status: "loading" | "ready" | "error";
  /** Why the list could not be loaded (only while there is nothing to show). */
  error: string | null;
  experiences: readonly QueueSnapshot[];
};

export type StoreOptions = {
  describeError: (error: unknown) => string;
  /** Errors after which the list itself changed (e.g. an archived Experience). */
  requiresRefresh?: ((error: unknown) => boolean) | undefined;
  delay?: number | undefined;
  timers?: Timers | undefined;
};

export class AvailabilityStore {
  private readonly queues = new Map<string, AvailabilitySaveQueue>();
  private order: string[] = [];
  private status: StoreSnapshot["status"] = "loading";
  private error: string | null = null;
  private readonly listeners = new Set<() => void>();
  private loading: Promise<void> | null = null;
  private current: StoreSnapshot = {
    status: "loading",
    error: null,
    experiences: [],
  };

  constructor(
    private readonly api: AvailabilityApi,
    private readonly options: StoreOptions,
  ) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): StoreSnapshot => this.current;

  /**
   * Loads the list (again). Unsaved changes survive: a refresh only replaces
   * the confirmed state underneath them, and never with data older than a
   * save that landed while it was loading.
   */
  refresh(): Promise<void> {
    if (this.loading) return this.loading;
    if (this.status === "error") {
      this.status = "loading";
      this.error = null;
      this.emit();
    }
    const versions = new Map(
      [...this.queues].map(([id, queue]) => [id, queue.version]),
    );
    this.loading = (async () => {
      try {
        const overview = await this.api.load();
        this.apply(overview, versions);
        this.status = "ready";
        this.error = null;
      } catch (error) {
        // A failed background refresh keeps what is on screen.
        if (this.status !== "ready") {
          this.status = "error";
          this.error = this.options.describeError(error);
        }
      } finally {
        this.loading = null;
        this.emit();
      }
    })();
    return this.loading;
  }

  change(
    experienceId: string,
    changes: readonly ItemAvailabilityChange[],
    options: { immediate?: boolean } = {},
  ): void {
    this.queues.get(experienceId)?.change(changes, options);
  }

  retry(experienceId: string): void {
    this.queues.get(experienceId)?.retry();
  }

  dismissError(experienceId: string): void {
    this.queues.get(experienceId)?.dismissError();
  }

  whenSettled(experienceId: string): Promise<boolean> {
    return (
      this.queues.get(experienceId)?.whenSettled() ?? Promise.resolve(true)
    );
  }

  /** Sends everything waiting now (the page is closing or going away). */
  flushAll(): void {
    for (const queue of this.queues.values()) void queue.flush();
  }

  hasUnsaved(): boolean {
    for (const queue of this.queues.values())
      if (queue.hasUnsaved()) return true;
    return false;
  }

  private apply(
    overview: AvailabilityOverview,
    versions: ReadonlyMap<string, number>,
  ): void {
    const ids: string[] = [];
    for (const experience of overview.experiences) {
      const id = experience.experienceId;
      ids.push(id);
      const queue = this.queues.get(id);
      if (queue) queue.replaceBase(experience, versions.get(id) ?? -1);
      else this.queues.set(id, this.createQueue(experience));
    }
    const listed = new Set(ids);
    // Gone from the list (archived): keep a queue only until it settles.
    for (const [id, queue] of this.queues)
      if (!listed.has(id) && !queue.hasUnsaved()) this.queues.delete(id);
    this.order = ids;
  }

  private createQueue(
    experience: AvailabilityExperience,
  ): AvailabilitySaveQueue {
    const id = experience.experienceId;
    return new AvailabilitySaveQueue(experience, {
      send: (items) => this.api.save(id, { items }),
      describeError: this.options.describeError,
      onChange: () => this.emit(),
      onError: (error) => {
        if (this.options.requiresRefresh?.(error)) void this.refresh();
      },
      delay: this.options.delay,
      timers: this.options.timers,
    });
  }

  private emit(): void {
    const experiences: QueueSnapshot[] = [];
    for (const id of this.order) {
      const queue = this.queues.get(id);
      if (queue) experiences.push(queue.snapshot);
    }
    this.current = { status: this.status, error: this.error, experiences };
    for (const listener of this.listeners) listener();
  }
}
