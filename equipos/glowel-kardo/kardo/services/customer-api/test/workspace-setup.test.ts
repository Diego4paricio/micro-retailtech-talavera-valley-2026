import type { CustomerWorkspace } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import { buildCustomerApi } from "../src/app.js";
import { authHeader, verifierFor, workspaceId } from "./helpers.js";

// Relevo 20, T3: the personal space of someone who joined by invitation and
// never finished sign up travels marked, so the panel can hide it and offer
// "Crear mi propio negocio" (with the trial only if they still have it).

const notUsed = async () => {
  throw new Error("not used");
};

function appWith(workspaces: CustomerWorkspace[]) {
  return buildCustomerApi({
    sessionVerifier: verifierFor(),
    workspaceRepository: {
      listForCustomer: async () => workspaces,
      completeOnboarding: notUsed,
      updateWorkspace: notUsed,
      createOrganization: notUsed,
    },
  });
}

describe("workspace list: personal space without sign up", () => {
  it("keeps the setup marks", async () => {
    const app = appWith([
      {
        id: workspaceId,
        publicId: "kardoPersonal00001",
        name: "Ana · Personal",
        kind: "personal",
        role: "owner",
        setupPending: true,
        trialAvailable: true,
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        publicId: "kardoOrganization1",
        name: "Florería Lila",
        kind: "organization",
        role: "editor",
      },
    ]);
    const response = await app.inject({
      method: "GET",
      url: "/v1/workspaces",
      headers: authHeader,
    });
    expect(response.statusCode).toBe(200);
    const [personal, organization] = response.json();
    expect(personal).toMatchObject({
      setupPending: true,
      trialAvailable: true,
    });
    expect(organization).not.toHaveProperty("setupPending");
    expect(organization).not.toHaveProperty("trialAvailable");
    await app.close();
  });
});

describe("sign up: personal or business (owner decision, 2026-10-01)", () => {
  function onboardingApp(received: unknown[]) {
    return buildCustomerApi({
      sessionVerifier: verifierFor(),
      workspaceRepository: {
        listForCustomer: notUsed,
        completeOnboarding: async (_identity, id, input) => {
          received.push(input);
          return {
            id,
            publicId: "kardoPersonal00001",
            name: input.workspaceName,
            kind: "organization",
            role: "owner",
            accountType: input.accountType ?? null,
          };
        },
        updateWorkspace: notUsed,
        createOrganization: notUsed,
      },
    });
  }

  it("saves what the person declared and returns it", async () => {
    const received: unknown[] = [];
    const app = onboardingApp(received);
    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/onboarding`,
      headers: authHeader,
      payload: { workspaceName: "Ana López", accountType: "personal" },
    });
    expect(response.statusCode).toBe(200);
    expect(received).toEqual([
      { workspaceName: "Ana López", accountType: "personal" },
    ]);
    expect(response.json()).toMatchObject({
      kind: "organization",
      accountType: "personal",
    });
    await app.close();
  });

  it("rejects any other account type", async () => {
    const received: unknown[] = [];
    const app = onboardingApp(received);
    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/onboarding`,
      headers: authHeader,
      payload: { workspaceName: "Ana López", accountType: "empresa" },
    });
    expect(response.statusCode).toBe(400);
    expect(received).toEqual([]);
    await app.close();
  });
});
