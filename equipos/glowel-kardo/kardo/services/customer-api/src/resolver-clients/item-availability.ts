import type { ItemAvailabilityStatus } from "@kardo/contracts";
import { type ResolverCommandInput, resolverCommandPoster } from "./http.js";

/** One item's live state as the Resolver stores it. */
export type ResolverItemAvailability = {
  id: string;
  status: ItemAvailabilityStatus;
  quantity: number | null;
};

export type ItemAvailabilityClient = {
  /** Replaces the Resolver's live copy of an Experience's item availability.
   * The Resolver ignores a `version` older than the one it already holds. */
  replace(input: {
    experienceId: string;
    version: number;
    items: ResolverItemAvailability[];
  }): Promise<void>;
};

export function createResolverItemAvailabilityClient(
  input: ResolverCommandInput,
): ItemAvailabilityClient {
  const post = resolverCommandPoster(input);
  return { replace: (value) => post("/internal/item-availability", value) };
}
