import type { StaffPlan, StaffUpsertPlan } from "@kardo/contracts";
import { apiRequest } from "../lib/api.js";

// The contract only exports `StaffPlanListSchema` (no matching `Static` type
// alias); the list endpoint is simply an array of `StaffPlan`.
export const plansApi = {
  list: (signal?: AbortSignal) =>
    apiRequest<StaffPlan[]>("/v1/staff/plans", { signal }),
  create: (body: StaffUpsertPlan) =>
    apiRequest<StaffPlan>("/v1/staff/plans", { method: "POST", body }),
  update: (planId: string, body: StaffUpsertPlan) =>
    apiRequest<StaffPlan>(`/v1/staff/plans/${planId}`, {
      method: "PUT",
      body,
    }),
};
