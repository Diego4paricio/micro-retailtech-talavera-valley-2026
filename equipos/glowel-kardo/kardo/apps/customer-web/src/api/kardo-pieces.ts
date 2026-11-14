import type {
  ClaimKardoPieces,
  KardoPieceClaimPreview,
  KardoPieceClaimResult,
} from "@kardo/contracts";
import { apiRequest } from "../lib/api.js";

const base = (workspaceId: string) =>
  `/v1/workspaces/${workspaceId}/kardo-pieces`;

/** «Producto de Kardo» (ADR 026): what a code activates, then activate. */
export const kardoPiecesApi = {
  preview: (workspaceId: string, code: string, signal?: AbortSignal) =>
    apiRequest<KardoPieceClaimPreview>(`${base(workspaceId)}/preview`, {
      method: "POST",
      body: { code },
      signal,
    }),
  claim: (workspaceId: string, body: ClaimKardoPieces) =>
    apiRequest<KardoPieceClaimResult>(`${base(workspaceId)}/claim`, {
      method: "POST",
      body,
    }),
};
