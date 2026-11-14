import type {
  AvailabilityExperience,
  AvailabilityItem,
  AvailabilitySection,
  ItemAvailabilityChange,
} from "@kardo/contracts";
import { type ItemState, sameState } from "./model.js";

/**
 * Optimistic saving for one Menu or Catalog.
 *
 * Three layers sit on top of the last state the server confirmed (`base`):
 * - `pending`: changes waiting for the debounce (latest value per item);
 * - `inFlight`: the batch the server is processing (at most one at a time,
 *   so responses can never arrive out of order);
 * - `failed`: changes the server refused. They are rolled back (the UI shows
 *   `base` again) and kept only so "Reintentar" can send them again.
 *
 * What the UI shows is `pending ?? inFlight ?? base` per item. A change made
 * while a batch is in flight waits in `pending` and goes out right after, so
 * nothing the user does is ever lost or overwritten by an older response.
 */

export const SAVE_DELAY_MS = 400;
/** The API accepts at most 150 items per request. */
export const MAX_BATCH = 150;

export type Timers = {
  set: (callback: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
};

const defaultTimers: Timers = {
  set: (callback, ms) => globalThis.setTimeout(callback, ms),
  clear: (handle) =>
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** `saving` covers both the debounce wait and the request itself. */
export type SavePhase = "idle" | "saving" | "saved" | "error";

export type QueueSnapshot = {
  /** Server state with every unsaved change applied: what the UI shows. */
  experience: AvailabilityExperience;
  phase: SavePhase;
  /** Why changes were not saved; stays until retried, dismissed or superseded. */
  error: string | null;
  /** Items whose change was refused and rolled back. */
  failedIds: ReadonlySet<string>;
  /** Changes not confirmed yet (waiting or in flight). */
  unsaved: number;
};

export type SaveQueueOptions = {
  send: (items: ItemAvailabilityChange[]) => Promise<AvailabilityExperience>;
  describeError: (error: unknown) => string;
  onChange?: (() => void) | undefined;
  onError?: ((error: unknown) => void) | undefined;
  delay?: number | undefined;
  maxBatch?: number | undefined;
  timers?: Timers | undefined;
};

type Waiter = { failures: number; resolve: (ok: boolean) => void };

function indexItems(
  experience: AvailabilityExperience,
): Map<string, AvailabilityItem> {
  const items = new Map<string, AvailabilityItem>();
  for (const section of experience.sections)
    for (const item of section.items) items.set(item.id, item);
  return items;
}

export class AvailabilitySaveQueue {
  private base: AvailabilityExperience;
  private items: Map<string, AvailabilityItem>;
  private readonly pending = new Map<string, ItemState>();
  private inFlight: Map<string, ItemState> | null = null;
  private readonly failed = new Map<string, ItemState>();
  private error: string | null = null;
  private timer: unknown = null;
  private hasSaved = false;
  private failures = 0;
  private waiters: Waiter[] = [];
  private current: QueueSnapshot;
  private readonly delay: number;
  private readonly maxBatch: number;
  private readonly timers: Timers;
  /** Bumps whenever `base` changes; lets a slower refresh detect it is stale. */
  version = 0;

  constructor(
    experience: AvailabilityExperience,
    private readonly options: SaveQueueOptions,
  ) {
    this.base = experience;
    this.items = indexItems(experience);
    this.delay = options.delay ?? SAVE_DELAY_MS;
    this.maxBatch = options.maxBatch ?? MAX_BATCH;
    this.timers = options.timers ?? defaultTimers;
    this.current = this.build();
  }

  get snapshot(): QueueSnapshot {
    return this.current;
  }

  get experienceId(): string {
    return this.base.experienceId;
  }

  hasUnsaved(): boolean {
    return this.pending.size > 0 || this.inFlight !== null;
  }

  /**
   * Applies changes at once (optimistically) and schedules one request for
   * everything changed within the debounce window. `immediate` skips the
   * wait (bulk actions and undo).
   */
  change(
    changes: readonly ItemAvailabilityChange[],
    options: { immediate?: boolean } = {},
  ): void {
    let touched = false;
    for (const change of changes) {
      const confirmed = this.items.get(change.itemId);
      if (!confirmed) continue;
      touched = true;
      const state: ItemState = {
        status: change.status,
        quantity: change.quantity,
      };
      this.failed.delete(change.itemId);
      // Back to what the server has (or is about to have): nothing to send.
      const reference = this.inFlight?.get(change.itemId) ?? confirmed;
      if (sameState(state, reference)) this.pending.delete(change.itemId);
      else this.pending.set(change.itemId, state);
    }
    if (!touched) return;
    if (!this.failed.size) this.error = null;
    if (this.pending.size) this.schedule(options.immediate ? 0 : this.delay);
    else this.cancelTimer();
    this.emit();
  }

  /** Sends the rolled-back changes again (newer changes to them win). */
  retry(): void {
    if (!this.failed.size) return;
    for (const [itemId, state] of this.failed) {
      if (this.pending.has(itemId) || !this.items.has(itemId)) continue;
      const reference = this.inFlight?.get(itemId) ?? this.items.get(itemId);
      if (reference && !sameState(state, reference))
        this.pending.set(itemId, state);
    }
    this.failed.clear();
    this.error = null;
    if (this.pending.size) this.schedule(0);
    this.emit();
  }

  /** Accepts the rollback: forgets the failed changes and the message. */
  dismissError(): void {
    if (!this.failed.size && !this.error) return;
    this.failed.clear();
    this.error = null;
    this.emit();
  }

  /** Sends whatever is waiting now instead of after the debounce. */
  async flush(): Promise<void> {
    this.cancelTimer();
    if (this.inFlight || !this.pending.size) return;
    const batch = new Map<string, ItemState>();
    for (const [itemId, state] of this.pending) {
      // Items removed from the Menu since the change are dropped.
      if (!this.items.has(itemId)) {
        this.pending.delete(itemId);
        continue;
      }
      if (batch.size >= this.maxBatch) break;
      batch.set(itemId, state);
      this.pending.delete(itemId);
    }
    if (!batch.size) {
      this.emit();
      return;
    }
    this.inFlight = batch;
    this.emit();
    try {
      const updated = await this.options.send(
        [...batch].map(([itemId, state]) => ({
          itemId,
          status: state.status,
          quantity: state.quantity,
        })),
      );
      this.setBase(updated);
      this.hasSaved = true;
    } catch (error) {
      this.failures += 1;
      // Rollback: `base` still holds the confirmed state. Items changed again
      // meanwhile keep their newer pending value instead.
      for (const [itemId, state] of batch)
        if (!this.pending.has(itemId)) this.failed.set(itemId, state);
      if (this.failed.size) this.error = this.options.describeError(error);
      this.options.onError?.(error);
    } finally {
      this.inFlight = null;
    }
    if (this.pending.size) {
      void this.flush();
      return;
    }
    this.emit();
  }

  /**
   * Adopts a fresher server state from a list refresh, unless a save landed
   * (or is landing) since the refresh started: that response is newer.
   */
  replaceBase(
    experience: AvailabilityExperience,
    expectedVersion: number,
  ): boolean {
    if (this.inFlight || expectedVersion !== this.version) return false;
    this.setBase(experience);
    for (const [itemId, state] of this.pending) {
      const item = this.items.get(itemId);
      if (!item || sameState(item, state)) this.pending.delete(itemId);
    }
    for (const itemId of this.failed.keys())
      if (!this.items.has(itemId)) this.failed.delete(itemId);
    if (!this.failed.size) this.error = null;
    if (!this.pending.size) this.cancelTimer();
    this.emit();
    return true;
  }

  /**
   * Resolves once nothing is waiting or in flight: `true` when every save
   * since the call succeeded.
   */
  whenSettled(): Promise<boolean> {
    if (this.isIdle()) return Promise.resolve(true);
    return new Promise((resolve) =>
      this.waiters.push({ failures: this.failures, resolve }),
    );
  }

  private isIdle(): boolean {
    return !this.hasUnsaved() && this.timer === null;
  }

  private setBase(experience: AvailabilityExperience): void {
    this.base = experience;
    this.items = indexItems(experience);
    this.version += 1;
  }

  private schedule(ms: number): void {
    this.cancelTimer();
    this.timer = this.timers.set(() => {
      this.timer = null;
      void this.flush();
    }, ms);
  }

  private cancelTimer(): void {
    if (this.timer === null) return;
    this.timers.clear(this.timer);
    this.timer = null;
  }

  private emit(): void {
    this.current = this.build();
    this.options.onChange?.();
    if (this.waiters.length && this.isIdle()) {
      const waiters = this.waiters;
      this.waiters = [];
      for (const waiter of waiters)
        waiter.resolve(waiter.failures === this.failures);
    }
  }

  private build(): QueueSnapshot {
    const unsaved = this.pending.size + (this.inFlight?.size ?? 0);
    return {
      experience: this.overlay(),
      phase: unsaved
        ? "saving"
        : this.error
          ? "error"
          : this.hasSaved
            ? "saved"
            : "idle",
      error: this.error,
      failedIds: new Set(this.failed.keys()),
      unsaved,
    };
  }

  /** `base` with unsaved changes applied; untouched items keep identity. */
  private overlay(): AvailabilityExperience {
    if (!this.pending.size && !this.inFlight?.size) return this.base;
    let changed = false;
    const sections = this.base.sections.map((section): AvailabilitySection => {
      let sectionChanged = false;
      const items = section.items.map((item) => {
        const state = this.pending.get(item.id) ?? this.inFlight?.get(item.id);
        if (!state || sameState(state, item)) return item;
        sectionChanged = true;
        return { ...item, status: state.status, quantity: state.quantity };
      });
      if (!sectionChanged) return section;
      changed = true;
      return { ...section, items };
    });
    return changed ? { ...this.base, sections } : this.base;
  }
}
