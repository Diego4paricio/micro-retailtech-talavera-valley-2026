import crypto from "node:crypto";
import type {
  AnalyticsSummary,
  AvailabilityExperience,
  AvailabilityOverview,
  CreateExperience,
  CustomerWorkspace,
  ExperienceDetail,
  ExperienceSummary,
  ExperienceTargets,
  ItemAvailabilityChange,
  LeadPage,
  PublicationBatch,
  Touchpoint,
  UpdateExperience,
} from "@kardo/contracts";
import type { ExtractedExperienceResult } from "../../design-ai/extract-from-image.js";
import type { BotConfig } from "../config.js";

interface SupabaseTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface ActiveWorkspaceContext {
  workspace: CustomerWorkspace;
  touchpoints: Touchpoint[];
  primaryTouchpoint: Touchpoint | null;
  publicQrUrl: string | null;
  activeExperience: ExperienceSummary | null;
  availabilityExp: AvailabilityExperience | null;
}

export class KardoApiClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private expiresAtMs = 0;

  constructor(private readonly config: BotConfig) {}

  private async ensureAccessToken(forceRefresh = false): Promise<string> {
    const now = Date.now();
    if (!forceRefresh && this.accessToken && now < this.expiresAtMs - 60_000) {
      return this.accessToken;
    }

    if (!forceRefresh && this.refreshToken) {
      try {
        const res = await fetch(
          `${this.config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`,
          {
            method: "POST",
            headers: {
              apikey: this.config.supabaseAnonKey,
              "content-type": "application/json",
            },
            body: JSON.stringify({ refresh_token: this.refreshToken }),
          },
        );
        if (res.ok) {
          const data = (await res.json()) as SupabaseTokenResponse;
          this.accessToken = data.access_token;
          this.refreshToken = data.refresh_token;
          this.expiresAtMs = Date.now() + data.expires_in * 1000;
          return this.accessToken;
        }
      } catch {
        // Fall through to password grant
      }
    }

    const res = await fetch(
      `${this.config.supabaseUrl}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          apikey: this.config.supabaseAnonKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: this.config.demoEmail,
          password: this.config.demoPassword,
        }),
      },
    );

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(
        `Supabase Auth login failed (${res.status}): ${errBody.slice(0, 200)}`,
      );
    }

    const data = (await res.json()) as SupabaseTokenResponse;
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
    this.expiresAtMs = Date.now() + data.expires_in * 1000;
    return this.accessToken;
  }

  private async request<T>(
    path: string,
    init: {
      method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      body?: unknown;
      headers?: Record<string, string>;
    } = {},
    retried = false,
  ): Promise<T> {
    const token = await this.ensureAccessToken(retried);
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    };
    if (init.body !== undefined) {
      headers["content-type"] = "application/json";
    }

    const response = await fetch(`${this.config.customerApiBaseUrl}${path}`, {
      method: init.method ?? "GET",
      headers,
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });

    if (response.status === 401 && !retried) {
      return this.request<T>(path, init, true);
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(
        `Kardo API ${init.method ?? "GET"} ${path} failed (${response.status}): ${errText.slice(0, 280)}`,
      );
    }

    return (await response.json()) as T;
  }

  public listWorkspaces(): Promise<CustomerWorkspace[]> {
    return this.request<CustomerWorkspace[]>("/v1/workspaces");
  }

  public listTouchpoints(workspaceId: string): Promise<Touchpoint[]> {
    return this.request<Touchpoint[]>(
      `/v1/workspaces/${workspaceId}/touchpoints`,
    );
  }

  public listExperiences(workspaceId: string): Promise<ExperienceSummary[]> {
    return this.request<ExperienceSummary[]>(
      `/v1/workspaces/${workspaceId}/experiences`,
    );
  }

  public getExperienceDetail(
    workspaceId: string,
    experienceId: string,
  ): Promise<ExperienceDetail> {
    return this.request<ExperienceDetail>(
      `/v1/workspaces/${workspaceId}/experiences/${experienceId}`,
    );
  }

  public getAvailability(workspaceId: string): Promise<AvailabilityOverview> {
    return this.request<AvailabilityOverview>(
      `/v1/workspaces/${workspaceId}/availability`,
    );
  }

  public saveAvailability(
    workspaceId: string,
    experienceId: string,
    items: ItemAvailabilityChange[],
  ): Promise<AvailabilityExperience> {
    return this.request<AvailabilityExperience>(
      `/v1/workspaces/${workspaceId}/experiences/${experienceId}/availability`,
      {
        method: "PUT",
        body: { items },
      },
    );
  }

  public createExperience(
    workspaceId: string,
    body: CreateExperience,
  ): Promise<ExperienceSummary> {
    return this.request<ExperienceSummary>(
      `/v1/workspaces/${workspaceId}/experiences`,
      {
        method: "POST",
        body,
      },
    );
  }

  public updateExperience(
    workspaceId: string,
    experienceId: string,
    body: UpdateExperience,
  ): Promise<ExperienceSummary> {
    return this.request<ExperienceSummary>(
      `/v1/workspaces/${workspaceId}/experiences/${experienceId}`,
      {
        method: "PATCH",
        body,
      },
    );
  }

  public setExperienceTargets(
    workspaceId: string,
    experienceId: string,
    body: ExperienceTargets,
  ): Promise<ExperienceSummary> {
    return this.request<ExperienceSummary>(
      `/v1/workspaces/${workspaceId}/experiences/${experienceId}/targets`,
      {
        method: "PUT",
        body,
      },
    );
  }

  public publishExperience(
    workspaceId: string,
    experienceId: string,
  ): Promise<PublicationBatch> {
    return this.request<PublicationBatch>(
      `/v1/workspaces/${workspaceId}/experiences/${experienceId}/publication-intents`,
      {
        method: "POST",
        headers: {
          "idempotency-key": crypto.randomUUID(),
        },
      },
    );
  }

  public extractFromImage(
    workspaceId: string,
    body: {
      type: "menu" | "catalog";
      imageBase64: string;
      mimeType: string;
    },
  ): Promise<ExtractedExperienceResult> {
    return this.request<ExtractedExperienceResult>(
      `/v1/workspaces/${workspaceId}/experiences/extract-from-image`,
      {
        method: "POST",
        body,
      },
    );
  }

  public getAnalyticsSummary(workspaceId: string): Promise<AnalyticsSummary> {
    return this.request<AnalyticsSummary>(
      `/v1/workspaces/${workspaceId}/analytics/summary?days=7`,
    );
  }

  public listLeads(workspaceId: string): Promise<LeadPage> {
    return this.request<LeadPage>(`/v1/workspaces/${workspaceId}/leads`);
  }

  public async resolveActiveContext(
    preferredExperienceId?: string,
  ): Promise<ActiveWorkspaceContext> {
    const workspaces = await this.listWorkspaces();
    const workspace =
      workspaces.find((w) => w.kind === "organization" && !w.setupPending) ??
      workspaces[0];
    if (!workspace) {
      throw new Error("No se encontró ningún workspace en la cuenta Kardo.");
    }

    const [touchpoints, experiences, availability] = await Promise.all([
      this.listTouchpoints(workspace.id),
      this.listExperiences(workspace.id),
      this.getAvailability(workspace.id),
    ]);

    const activeTouchpoints = touchpoints.filter(
      (tp) => tp.status === "active" && tp.kind !== "link",
    );
    const primaryTouchpoint =
      activeTouchpoints.find((tp) =>
        tp.operationalName.toLowerCase().includes("mesa"),
      ) ??
      activeTouchpoints[0] ??
      touchpoints[0] ??
      null;

    const menuOrCatalogExps = experiences.filter(
      (e) => e.type === "menu" || e.type === "catalog",
    );

    // Prefer: 1) preferredExperienceId, 2) experience currently live on primaryTouchpoint,
    // 3) experience with liveTouchpointCount > 0, 4) most recently updated menu/catalog
    const liveExpIdOnPrimary = primaryTouchpoint?.live?.experienceId;
    const activeExperience =
      (preferredExperienceId
        ? menuOrCatalogExps.find((e) => e.id === preferredExperienceId)
        : undefined) ??
      (liveExpIdOnPrimary
        ? menuOrCatalogExps.find((e) => e.id === liveExpIdOnPrimary)
        : undefined) ??
      menuOrCatalogExps.find((e) => (e.liveTouchpointCount ?? 0) > 0) ??
      menuOrCatalogExps[0] ??
      null;

    const availabilityExp = activeExperience
      ? (availability.experiences.find(
          (ae) => ae.experienceId === activeExperience.id,
        ) ??
        availability.experiences[0] ??
        null)
      : (availability.experiences[0] ?? null);

    // Look for a touchpoint that actually serves the activeExperience if possible
    const servingTouchpoint =
      (activeExperience
        ? activeTouchpoints.find(
            (tp) =>
              tp.live?.experienceId === activeExperience.id ||
              activeExperience.targets?.touchpointIds?.includes(tp.id),
          )
        : undefined) ?? primaryTouchpoint;

    const publicQrUrl = servingTouchpoint
      ? `${this.config.publicResolverUrl}/t/${servingTouchpoint.publicId}`
      : null;

    return {
      workspace,
      touchpoints,
      primaryTouchpoint: servingTouchpoint,
      publicQrUrl,
      activeExperience,
      availabilityExp,
    };
  }
}

