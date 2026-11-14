import { useState } from "react";
import { membersApi } from "../../api/members.js";
import { Icon } from "../../components/Icon.js";
import { SettingsIntro } from "../../components/SettingsBlocks.js";
import { Link } from "../../lib/router.js";
import { useResource } from "../../lib/use-resource.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { CreateOrganizationDialog } from "../organization/CreateOrganizationDialog.js";
import { InviteDialog } from "../organization/InviteDialog.js";
import { OrganizationsGroup } from "../organization/OrganizationsGroup.js";
import { PeopleGroup } from "../organization/PeopleGroup.js";
import { RolesGroup } from "../organization/RolesGroup.js";
import { withInvitation } from "../organization/team-model.js";

/**
 * Configuración → Equipo (ADR 023 §2.4), at /organization: who has access
 * and what each role can do, then the person's organizations. Members and
 * pending invitations are one list; inviting and every change open a dialog.
 */
export function TeamPanels() {
  const { workspace, pendingSetup, can } = useWorkspace();
  const isOrganization = workspace.kind === "organization";
  const canInvite = isOrganization && can("members.manage");
  const members = useResource(
    isOrganization ? `members:${workspace.id}` : null,
    (signal) => membersApi.list(workspace.id, signal),
  );
  const invitations = useResource(
    canInvite ? `invitations:${workspace.id}` : null,
    (signal) => membersApi.invitations(workspace.id, signal),
  );
  const [inviteOpen, setInviteOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const openCreate = () => setCreateOpen(true);
  // Invited people start their own business at /crear-negocio (A2-12).
  const setupPending = Boolean(pendingSetup);

  return (
    <>
      {isOrganization ? (
        <SettingsIntro
          actions={
            canInvite ? (
              <button
                className="button button-primary button-small"
                onClick={() => setInviteOpen(true)}
                type="button"
              >
                <Icon name="invite" size={16} />
                Invitar
              </button>
            ) : undefined
          }
          description={`Personas con acceso a ${workspace.name} y lo que puede hacer cada una.`}
          title="Equipo"
        />
      ) : (
        <SettingsIntro
          actions={
            // At the cap it stays: the dialog says why (relevo 36, E7).
            setupPending ? (
              <Link
                className="button button-primary button-small"
                to={{ name: "create-business" }}
              >
                Crear mi propio negocio
              </Link>
            ) : (
              <button
                className="button button-primary button-small"
                onClick={openCreate}
                type="button"
              >
                Crear organización
              </button>
            )
          }
          description="Tu espacio personal es solo tuyo. Para trabajar con más personas, crea una organización e invítalas."
          title="Equipo"
        />
      )}

      {isOrganization ? (
        <PeopleGroup
          invitations={canInvite ? invitations : null}
          members={members}
        />
      ) : null}
      <RolesGroup />
      <OrganizationsGroup
        onCreate={isOrganization && !setupPending ? openCreate : null}
      />

      {canInvite ? (
        <InviteDialog
          onClose={() => setInviteOpen(false)}
          onInvited={(invitation) =>
            invitations.setData((items) => withInvitation(items, invitation))
          }
          open={inviteOpen}
        />
      ) : null}
      {setupPending ? null : (
        <CreateOrganizationDialog
          onClose={() => setCreateOpen(false)}
          open={createOpen}
        />
      )}
    </>
  );
}
