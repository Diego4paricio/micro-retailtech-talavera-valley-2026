import type { CustomerWorkspace } from "@kardo/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateBusinessForm } from "../src/features/organization/CreateBusinessPage.js";
import {
  invitationErrorMessage,
  membersCapMessage,
} from "../src/features/organization/InviteDialog.js";
import { ApiRequestError } from "../src/lib/api.js";
import {
  capturePendingInvitation,
  clearPendingInvitation,
  invitationTokenFrom,
  readPendingInvitation,
} from "../src/lib/pending-invitation.js";
import { parseRoute, routePath } from "../src/lib/router.js";
import { spaceLabel } from "../src/workspace/Sidebar.js";

// Relevo 20, T3: people who join by invitation go straight to the
// organization; their own business is optional ("Crear mi propio negocio").

const token = "tOkEn_0123456789abcdefghijklmnopqrstuvwxyz";
const store = new Map<string, string>();

function browser() {
  vi.stubGlobal("window", {
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  });
}

afterEach(() => {
  store.clear();
  vi.unstubAllGlobals();
});

describe("invitation opened before signing in", () => {
  it("reads the token only from the invitation address", () => {
    expect(
      invitationTokenFrom({ pathname: "/invite", hash: `#token=${token}` }),
    ).toBe(token);
    expect(
      invitationTokenFrom({ pathname: "/invite/", hash: `#token=${token}` }),
    ).toBe(token);
    expect(
      invitationTokenFrom({ pathname: "/", hash: `#token=${token}` }),
    ).toBeNull();
    expect(
      invitationTokenFrom({ pathname: "/invite", hash: "#token=short" }),
    ).toBeNull();
    expect(
      invitationTokenFrom({ pathname: "/invite", hash: "#token=%E0%A4%A" }),
    ).toBeNull();
  });

  it("keeps it in this tab while the person signs up, then forgets it", () => {
    browser();
    expect(capturePendingInvitation({ pathname: "/registro", hash: "" })).toBe(
      false,
    );
    expect(readPendingInvitation()).toBeNull();
    expect(
      capturePendingInvitation({
        pathname: "/invite",
        hash: `#token=${token}`,
      }),
    ).toBe(true);
    expect(readPendingInvitation()).toBe(token);
    clearPendingInvitation();
    expect(readPendingInvitation()).toBeNull();
  });

  it("never reads a tampered value back", () => {
    browser();
    store.set("kardo.pending-invitation", "<script>alert(1)</script>");
    expect(readPendingInvitation()).toBeNull();
  });
});

describe("Crear mi propio negocio", () => {
  const personal: CustomerWorkspace = {
    id: "11111111-1111-4111-8111-111111111111",
    publicId: "personal000000000001",
    name: "Ana · Personal",
    kind: "personal",
    role: "owner",
    setupPending: true,
    trialAvailable: true,
  };

  it("has its own address", () => {
    expect(parseRoute({ pathname: "/crear-negocio", search: "" })).toEqual({
      name: "create-business",
    });
    expect(routePath({ name: "create-business" })).toBe("/crear-negocio");
  });

  it("starts the 15-day trial when the person never used it", () => {
    const html = renderToStaticMarkup(
      <CreateBusinessForm
        invited
        onCreated={() => {}}
        trialAvailable
        workspace={personal}
      />,
    );
    expect(html).toContain("Crea tu propio negocio en Kardo");
    expect(html).toContain("Crear mi negocio y empezar 15 días gratis");
    expect(html).toContain("15 días gratis de Profesional, sin tarjeta");
  });

  it("never promises a second trial", () => {
    const html = renderToStaticMarkup(
      <CreateBusinessForm
        invited={false}
        onCreated={() => {}}
        trialAvailable={false}
        workspace={personal}
      />,
    );
    expect(html).toContain("Ya usaste tu prueba gratis");
    expect(html).not.toContain("empezar 15 días gratis");
  });
});

describe("member cap of the inviting plan", () => {
  it("explains that pending invitations count", () => {
    const capped = new ApiRequestError("x", 403, "PLAN_LIMIT");
    expect(invitationErrorMessage(capped)).toBe(membersCapMessage);
    expect(membersCapMessage).toContain("invitaciones pendientes");
    const other = new ApiRequestError("Otra cosa.", 409, "CONFLICT");
    expect(invitationErrorMessage(other)).toBe("Otra cosa.");
  });
});

describe("the space label in the switcher", () => {
  const base = {
    id: "11111111-1111-4111-8111-111111111111",
    publicId: "kardoOrganization1",
    name: "Ana López",
    kind: "organization",
    role: "owner",
  } as const;

  it("says what the sign up declared, else the kind", () => {
    expect(spaceLabel({ ...base, accountType: "personal" })).toBe("Personal");
    expect(spaceLabel({ ...base, accountType: "business" })).toBe("Negocio");
    expect(spaceLabel({ ...base, accountType: null })).toBe("Organización");
    expect(spaceLabel({ ...base, kind: "personal" })).toBe("Personal");
  });
});
