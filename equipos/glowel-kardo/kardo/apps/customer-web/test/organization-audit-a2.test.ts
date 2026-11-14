import type { InvitationPreview, WorkspaceMember } from "@kardo/contracts";
import { customerRoles, customerRoleText } from "@kardo/domain";
import { describe, expect, it } from "vitest";
import {
  defaultBrand,
  isHexColor,
  paletteChoices,
} from "../src/features/business-profile/BrandPicker.js";
import {
  alreadyMemberMessage,
  invitationErrorMessage,
  invitationLink,
} from "../src/features/organization/InviteDialog.js";
import { initialWizardState } from "../src/features/organization/new-organization-model.js";
import { roleLabels } from "../src/features/organization/role-labels.js";
import {
  canAcceptTransfer,
  invitationPreviewText,
  memberName,
  noTransferCandidatesText,
  roleHints,
  roleSummaries,
  transferCandidates,
  withoutPersonalSuffix,
} from "../src/features/organization/team-model.js";
import { exportFilename } from "../src/features/organization/use-export.js";
import { leadsAnyOrganization } from "../src/features/settings/account/security-model.js";
import { reauthenticationProblem } from "../src/features/settings/account/use-reauthenticate.js";
import { ApiRequestError } from "../src/lib/api.js";

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

describe("transferring ownership (A2-9, A2-10)", () => {
  const people = [
    member({ profileId: "1", role: "owner", isCurrentUser: true }),
    member({ profileId: "2", role: "admin" }),
    member({ profileId: "3", role: "editor" }),
    member({ profileId: "4", role: "viewer" }),
  ];

  it("offers only the other Administrators", () => {
    expect(transferCandidates(people).map((item) => item.profileId)).toEqual([
      "2",
    ]);
  });

  it("offers nobody when there is no other Administrator, and says what to do", () => {
    expect(
      transferCandidates(people.filter((p) => p.role !== "admin")),
    ).toEqual([]);
    expect(noTransferCandidatesText).toBe(
      "Primero haz Administrador a alguien de tu equipo.",
    );
  });

  it("lets only an Administrator accept", () => {
    expect(canAcceptTransfer("admin")).toBe(true);
    for (const role of ["owner", "editor", "viewer"] as const)
      expect(canAcceptTransfer(role)).toBe(false);
  });
});

describe("inviting (A2-11, A2-17)", () => {
  it("says an existing member is already on the team", () => {
    const error = new ApiRequestError("x", 409, "ALREADY_MEMBER");
    expect(invitationErrorMessage(error)).toBe(alreadyMemberMessage);
    expect(alreadyMemberMessage).toBe("Esa persona ya es parte del equipo.");
  });

  it("copies the link of the email when the server sends it", () => {
    const base = {
      invitation: {} as never,
      token: "t".repeat(40),
    };
    expect(
      invitationLink({
        ...base,
        inviteUrl: "https://app.kardo.test/invite#token=abc",
      }),
    ).toBe("https://app.kardo.test/invite#token=abc");
  });
});

describe("the invitation page (A2-17)", () => {
  const preview = (state: InvitationPreview["state"]): InvitationPreview => ({
    workspaceName: "Florería Lila",
    role: "editor",
    invitedBy: "Marta",
    state,
    emailHint: "an•••@gmail.com",
  });

  it("names the organization, the role and who invites", () => {
    const text = invitationPreviewText(preview("valid"), "yo@correo.com");
    expect(text.title).toBe("Te invitaron a Florería Lila");
    expect(text.detail).toContain("Marta te invitó como Editor");
    expect(text.canAccept).toBe(true);
  });

  it("explains each cause and blocks accepting", () => {
    const wrong = invitationPreviewText(
      preview("wrong_email"),
      "yo@correo.com",
    );
    expect(wrong.detail).toContain("an•••@gmail.com");
    expect(wrong.detail).toContain("yo@correo.com");
    const used = invitationPreviewText(preview("accepted"), "yo@correo.com");
    const revoked = invitationPreviewText(preview("revoked"), "yo@correo.com");
    const expired = invitationPreviewText(preview("expired"), "yo@correo.com");
    expect(used.detail).toContain("ya se usó");
    expect(revoked.detail).toContain("canceló");
    expect(expired.detail).toContain("venció");
    for (const text of [wrong, used, revoked, expired])
      expect(text.canAccept).toBe(false);
    expect(
      new Set([wrong.detail, used.detail, revoked.detail, expired.detail]).size,
    ).toBe(4);
  });
});

describe("roles in one place (A2-15)", () => {
  it("the labels, summaries and hints all come from the domain", () => {
    for (const role of customerRoles) {
      expect(roleLabels[role]).toBe(customerRoleText[role].label);
      expect(roleSummaries[role]).toBe(customerRoleText[role].summary);
    }
    expect(roleHints.admin).toBe(customerRoleText.admin.hint);
  });

  it("drops the «· Personal» suffix from a name", () => {
    expect(withoutPersonalSuffix("juan · Personal")).toBe("juan");
    expect(withoutPersonalSuffix("Florería Lila")).toBe("Florería Lila");
    expect(
      memberName(member({ profileId: "1", displayName: "juan · Personal" })),
    ).toBe("juan");
    expect(
      memberName(
        member({ profileId: "1", displayName: " · Personal", email: "a@b.mx" }),
      ),
    ).toBe("a@b.mx");
  });
});

describe("the account pieces (A2-14, A2-64, A2-65)", () => {
  it("asks for a code or a password with the right failure message", () => {
    expect(reauthenticationProblem(true)).toContain("código");
    expect(reauthenticationProblem(false)).toBe(
      "La contraseña no es correcta.",
    );
  });

  it("recommends 2FA to anyone leading ANY organization", () => {
    expect(leadsAnyOrganization([{ role: "viewer" }, { role: "admin" }])).toBe(
      true,
    );
    expect(leadsAnyOrganization([{ role: "owner" }])).toBe(true);
    expect(leadsAnyOrganization([{ role: "editor" }, { role: "viewer" }])).toBe(
      false,
    );
    expect(leadsAnyOrganization([])).toBe(false);
  });

  it("names the organization's export file", () => {
    expect(exportFilename("Café Ñandú", new Date("2026-09-30T12:00:00Z"))).toBe(
      "kardo-cafe-nandu-2026-09-30.json",
    );
  });
});

describe("the brand picker (A2-6)", () => {
  it("keeps Kardo's colors in one constant", () => {
    expect(defaultBrand).toEqual({ primary: "#0a6c78", accent: "#4ec3ce" });
    expect(initialWizardState.primary).toBe(defaultBrand.primary);
    expect(initialWizardState.accent).toBe(defaultBrand.accent);
    expect(paletteChoices(null)[0]).toEqual({
      ...defaultBrand,
      label: "Kardo",
    });
  });

  it("ignores a logo color that is not #rrggbb", () => {
    expect(isHexColor("#8e3b4e")).toBe(true);
    expect(isHexColor("red")).toBe(false);
    expect(paletteChoices("red")).toHaveLength(1);
  });
});
