import type {
  CustomerWorkspace,
  WorkspaceInvitation,
  WorkspaceMember,
} from "@kardo/contracts";
import type { Session } from "@supabase/supabase-js";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../src/components/Toast.js";
import {
  invitationErrorMessage,
  inviteCooldownMessage,
} from "../src/features/organization/InviteDialog.js";
import { PeopleGroup } from "../src/features/organization/PeopleGroup.js";
import {
  invitationDescription,
  peopleRows,
  peopleSummary,
  roleSummaries,
  transferPlanLine,
  withInvitation,
} from "../src/features/organization/team-model.js";
import { TeamPanels } from "../src/features/settings/TeamPanels.js";
import { ApiRequestError } from "../src/lib/api.js";
import { RouterProvider } from "../src/lib/router.js";
import type { Resource } from "../src/lib/use-resource.js";
import { WorkspaceProvider } from "../src/workspace/WorkspaceContext.js";

// ADR 023 §2.4: Equipo shows members and pending invitations in one list.

const me = "e6abf26a-3263-4149-9d75-9b7441165d29";

const member = (
  overrides: Partial<WorkspaceMember> & Pick<WorkspaceMember, "profileId">,
): WorkspaceMember => ({
  displayName: null,
  email: null,
  role: "editor",
  joinedAt: "2026-09-16T10:00:00.000Z",
  isCurrentUser: false,
  ...overrides,
});

const invitation = (
  overrides: Partial<WorkspaceInvitation> & Pick<WorkspaceInvitation, "id">,
): WorkspaceInvitation => ({
  email: "taller.ruiz@example.com",
  role: "editor",
  status: "pending",
  expiresAt: "2026-10-10T18:00:00.000Z",
  createdAt: "2026-10-03T18:00:00.000Z",
  ...overrides,
});

const members: WorkspaceMember[] = [
  member({
    profileId: "11111111-1111-4111-8111-111111111111",
    displayName: "Marta (florería)",
    email: "marta@example.com",
    role: "viewer",
  }),
  member({
    profileId: "22222222-2222-4222-8222-222222222222",
    displayName: "Dr. Sol",
    email: "sol@example.com",
    role: "editor",
  }),
  member({
    profileId: me,
    displayName: "Ana López",
    email: "ana@example.com",
    role: "owner",
    isCurrentUser: true,
  }),
  member({
    profileId: "33333333-3333-4333-8333-333333333333",
    email: "luis@example.com",
    role: "admin",
  }),
];

const invitations: WorkspaceInvitation[] = [
  invitation({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    email: "vieja@example.com",
    createdAt: "2026-10-01T10:00:00.000Z",
  }),
  invitation({
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    email: "nueva@example.com",
    role: "admin",
    createdAt: "2026-10-03T10:00:00.000Z",
  }),
  invitation({
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    email: "cancelada@example.com",
    status: "revoked",
  }),
  invitation({
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    email: "vencida@example.com",
    status: "expired",
  }),
];

describe("the people list", () => {
  it("goes Owner, Admin, Editor, Viewer, then pending invitations", () => {
    const rows = peopleRows(members, invitations);
    expect(
      rows.map((row) =>
        row.kind === "member"
          ? row.member.role
          : `invitation:${row.invitation.email}`,
      ),
    ).toEqual([
      "owner",
      "admin",
      "editor",
      "viewer",
      "invitation:nueva@example.com",
      "invitation:vieja@example.com",
    ]);
  });

  it("leaves out revoked and expired invitations", () => {
    const emails = peopleRows([], invitations).map((row) =>
      row.kind === "invitation" ? row.invitation.email : null,
    );
    expect(emails).not.toContain("cancelada@example.com");
    expect(emails).not.toContain("vencida@example.com");
  });

  it("says when a pending invitation expires", () => {
    const text = invitationDescription(
      invitation({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
    );
    expect(text).toMatch(/^Invitación pendiente · vence el 10 oct/);
  });

  it("replaces the pending invitation of an email invited again", () => {
    const resent = invitation({
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      email: "vieja@example.com",
    });
    const next = withInvitation(invitations, resent);
    expect(next[0]).toBe(resent);
    expect(
      next.filter(
        (item) =>
          item.email === "vieja@example.com" && item.status === "pending",
      ),
    ).toHaveLength(1);
    expect(withInvitation(null, resent)).toEqual([resent]);
  });

  it("counts people and pending invitations in words", () => {
    expect(peopleSummary(1, 0)).toBe("1 persona");
    expect(peopleSummary(4, 1)).toBe("4 personas y 1 invitación pendiente");
    expect(peopleSummary(2, 3)).toBe("2 personas y 3 invitaciones pendientes");
  });

  it("explains every role without promising solicitudes to editors or viewers", () => {
    expect(roleSummaries.owner).toContain("plan");
    expect(roleSummaries.editor).toContain("No ve las solicitudes");
    expect(roleSummaries.viewer).toContain("No ve las solicitudes");
  });

  it("explains the wait before inviting the same email again", () => {
    const throttled = new ApiRequestError("x", 429, "RATE_LIMITED");
    expect(invitationErrorMessage(throttled)).toBe(inviteCooldownMessage);
  });
});

describe("Personas, rendered", () => {
  afterEach(() => vi.unstubAllGlobals());

  const workspace: CustomerWorkspace = {
    id: "99999999-9999-4999-8999-999999999999",
    publicId: "kardoOrganization1",
    name: "Florería Lila",
    kind: "organization",
    role: "owner",
  };

  const resource = <T,>(data: T): Resource<T> => ({
    data,
    error: null,
    isLoading: false,
    reload: async () => {},
    setData: () => {},
  });

  function render(
    role: CustomerWorkspace["role"],
    people: WorkspaceMember[],
    pending: WorkspaceInvitation[] | null,
  ) {
    vi.stubGlobal("window", {
      location: { pathname: "/organization", search: "", hash: "" },
    });
    return renderToStaticMarkup(
      <RouterProvider>
        <ToastProvider>
          <WorkspaceProvider
            reloadWorkspaces={async () => {}}
            selectWorkspace={() => {}}
            session={{ user: { id: me } } as Session}
            workspace={{ ...workspace, role }}
            workspaces={[{ ...workspace, role }]}
          >
            <PeopleGroup
              invitations={pending ? resource(pending) : null}
              members={resource(people)}
            />
          </WorkspaceProvider>
        </ToastProvider>
      </RouterProvider>,
    );
  }

  it("marks the viewer with (tú) and lists invitations after the members", () => {
    const html = render("owner", members, invitations);
    expect(html).toContain('Ana López<span class="team-you"> (tú)</span>');
    expect(html).toContain("4 personas y 2 invitaciones pendientes");
    const owner = html.indexOf("Ana López");
    const viewer = html.indexOf("Marta (florería)");
    const pending = html.indexOf("nueva@example.com");
    expect(owner).toBeLessThan(viewer);
    expect(viewer).toBeLessThan(pending);
    expect(html).toContain("Invitación pendiente · vence el 10 oct");
    expect(html).toContain(
      'aria-label="Acciones para la invitación de nueva@example.com"',
    );
    expect(html).not.toContain("cancelada@example.com");
  });

  it("tells an Editor who can invite instead of offering actions", () => {
    // Seen by Dr. Sol, an Editor.
    const asEditor = members.map((item) => ({
      ...item,
      isCurrentUser: item.displayName === "Dr. Sol",
    }));
    const html = render("editor", asEditor, null);
    expect(html).toContain(
      "Solo un Owner o un Admin puede invitar personas o cambiar roles.",
    );
    expect(html).not.toContain("Acciones para Ana López");
    expect(html).not.toContain("Acciones para Marta");
    // Their own row keeps the way out.
    expect(html).toContain('aria-label="Acciones para Dr. Sol"');
    expect(html).not.toContain("Invitación pendiente");
  });
});

describe("the Equipo page", () => {
  afterEach(() => vi.unstubAllGlobals());

  const organization: CustomerWorkspace = {
    id: "99999999-9999-4999-8999-999999999999",
    publicId: "kardoOrganization1",
    name: "Taller Ruiz",
    kind: "organization",
    role: "owner",
  };
  const personal: CustomerWorkspace = {
    id: "88888888-8888-4888-8888-888888888888",
    publicId: "kardoPersonal00001",
    name: "Ana López",
    kind: "personal",
    role: "owner",
  };

  function page(workspace: CustomerWorkspace) {
    vi.stubGlobal("window", {
      location: { pathname: "/organization", search: "", hash: "" },
    });
    return renderToStaticMarkup(
      <RouterProvider>
        <ToastProvider>
          <WorkspaceProvider
            reloadWorkspaces={async () => {}}
            selectWorkspace={() => {}}
            session={{ user: { id: me } } as Session}
            workspace={workspace}
            workspaces={[workspace, { ...organization, role: "editor" }]}
          >
            <TeamPanels />
          </WorkspaceProvider>
        </ToastProvider>
      </RouterProvider>,
    );
  }

  it("offers Invitar to the Owner, with the groups in order", () => {
    const html = page(organization);
    expect(html).toContain(
      "Personas con acceso a Taller Ruiz y lo que puede hacer cada una.",
    );
    expect(html).toContain(">Invitar</button>");
    const people = html.indexOf(">Personas</h3>");
    const roles = html.indexOf(">Qué puede hacer cada rol</h3>");
    const organizations = html.indexOf(">Tus organizaciones</h3>");
    expect(people).toBeGreaterThan(-1);
    expect(people).toBeLessThan(roles);
    expect(roles).toBeLessThan(organizations);
    expect(html).not.toContain("<table");
    expect(html).not.toContain("eyebrow");
  });

  it("hides Invitar from an Editor", () => {
    const html = page({ ...organization, role: "editor" });
    expect(html).not.toContain(">Invitar</button>");
    expect(html).toContain("Tu rol");
  });

  it("explains the personal space and offers to create an organization", () => {
    const html = page(personal);
    expect(html).toContain("Tu espacio personal es solo tuyo.");
    expect(html).not.toContain(">Personas</h3>");
    expect(html.match(/>Crear organización<\/button>/g)).toHaveLength(1);
  });
});

describe("transfer (ADR 024)", () => {
  it("says only that the organization changes plan", () => {
    expect(transferPlanLine("Luis Pérez")).toBe(
      "Sale de tu plan y entra al plan de Luis Pérez.",
    );
  });
});
