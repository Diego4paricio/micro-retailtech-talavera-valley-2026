import type {
  StaffPublicationPage,
  StaffPublicationRow,
} from "@kardo/contracts";
import { apiRequest } from "../lib/api.js";
import { buildQuery } from "../lib/pagination.js";

export type PublicationQueryStatus =
  | "failed"
  | "pending"
  | "processing"
  | "published";

export type PublicationQuery = {
  status?: PublicationQueryStatus;
  workspaceId?: string;
  cursor?: string | null;
  limit?: number;
};

export const publicationsApi = {
  list: (params: PublicationQuery, signal?: AbortSignal) =>
    apiRequest<StaffPublicationPage>(
      `/v1/staff/publications${buildQuery(params)}`,
      { signal },
    ),
  retry: (publicationId: string) =>
    apiRequest<StaffPublicationRow>(
      `/v1/staff/publications/${publicationId}/retry`,
      { method: "POST" },
    ),
};
