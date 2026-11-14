import type {
  StaffCreatePieceBatch,
  StaffKitList,
  StaffPieceBatch,
  StaffPieceBatchList,
} from "@kardo/contracts";
import { apiRequest } from "../lib/api.js";

const base = "/v1/staff";

export const piecesApi = {
  listKits: (signal?: AbortSignal) =>
    apiRequest<StaffKitList>(`${base}/kits`, { signal }),
  listBatches: (signal?: AbortSignal) =>
    apiRequest<StaffPieceBatchList>(`${base}/piece-batches`, { signal }),
  getBatch: (id: string, signal?: AbortSignal) =>
    apiRequest<StaffPieceBatch>(
      `${base}/piece-batches/${encodeURIComponent(id)}`,
      { signal },
    ),
  createBatch: (body: StaffCreatePieceBatch) =>
    apiRequest<StaffPieceBatch>(`${base}/piece-batches`, {
      method: "POST",
      body,
    }),
};
