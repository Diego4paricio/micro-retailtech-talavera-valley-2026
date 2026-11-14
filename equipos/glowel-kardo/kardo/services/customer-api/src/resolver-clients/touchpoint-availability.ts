import type { BusinessRoutes } from "./business-routes.js";
import { type ResolverCommandInput, resolverCommandPoster } from "./http.js";

export type TouchpointAvailabilityClient = {
  /** `retired` is terminal in the Resolver: the public ID never serves again. */
  setAvailability(input: {
    publicId: string;
    status: "active" | "paused" | "retired";
  }): Promise<void>;
  /** Points `/@handle` at a Link's public ID (`publicId: null` removes it)
   * and drops `previousHandle` when a Link is renamed. */
  setAlias(input: {
    handle: string;
    publicId: string | null;
    previousHandle: string | null;
  }): Promise<void>;
  /** Links, phase 3b: the whole state behind kardo.com.mx/<negocio>. */
  setBusiness?(routes: BusinessRoutes): Promise<void>;
  /** Kardo pieces (ADR 026): an activated piece stops showing «Esta pieza
   * aún no está activada». Up to 100 addresses per call. */
  setPieces?(input: { publicIds: string[]; claimed: boolean }): Promise<void>;
};

export function createResolverAvailabilityClient(
  input: ResolverCommandInput,
): TouchpointAvailabilityClient {
  const post = resolverCommandPoster(input);
  return {
    setAvailability: (value) => post("/internal/availability", value),
    setAlias: (value) => post("/internal/alias", value),
    setBusiness: (value) => post("/internal/business", value),
    setPieces: async (value) => {
      for (let start = 0; start < value.publicIds.length; start += 100)
        await post("/internal/pieces", {
          publicIds: value.publicIds.slice(start, start + 100),
          claimed: value.claimed,
        });
    },
  };
}
