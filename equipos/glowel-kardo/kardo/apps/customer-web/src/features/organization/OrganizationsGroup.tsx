import type { BillingMyAccount } from "@kardo/contracts";
import { useEffect, useState } from "react";
import { SettingsGroup, SettingsRow } from "../../components/SettingsBlocks.js";
import { useToast } from "../../components/Toast.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { loadMyBillingAccount } from "../billing/my-account.js";
import { organizationsFooter } from "./new-organization-model.js";
import { roleLabels } from "./role-labels.js";

/**
 * «Tus organizaciones»: every organization this person belongs to, its
 * role there, and the way to open it. Creating one stays here too
 * (`onCreate` is null when the action already sits elsewhere on the page).
 */
export function OrganizationsGroup({
  onCreate,
}: {
  onCreate: (() => void) | null;
}) {
  const { workspace, workspaces, selectWorkspace } = useWorkspace();
  const { notify } = useToast();
  const organizations = workspaces.filter(
    (item) => item.kind === "organization",
  );
  const [account, setAccount] = useState<BillingMyAccount | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    loadMyBillingAccount()
      .then((value) => {
        if (!controller.signal.aborted) setAccount(value);
      })
      .catch(() => setAccount(null));
    return () => controller.abort();
  }, []);

  return (
    <SettingsGroup
      actions={
        onCreate ? (
          <button
            className="button button-secondary button-small"
            onClick={onCreate}
            type="button"
          >
            Crear organización
          </button>
        ) : undefined
      }
      description="Cambia entre ellas aquí o desde el selector del menú lateral."
      footer={organizationsFooter(account) ?? undefined}
      id="team-organizations"
      title="Tus organizaciones"
    >
      {organizations.length ? (
        organizations.map((organization) => (
          <SettingsRow
            action={
              organization.id === workspace.id ? (
                <span className="team-current">Actual</span>
              ) : (
                <button
                  aria-label={`Abrir ${organization.name}`}
                  className="button button-secondary button-small"
                  onClick={() => {
                    selectWorkspace(organization.id);
                    notify(`Cambiaste a ${organization.name}.`);
                  }}
                  type="button"
                >
                  Abrir
                </button>
              )
            }
            key={organization.id}
            label={organization.name}
            value={roleLabels[organization.role]}
          />
        ))
      ) : (
        <SettingsRow
          description="Crea una para trabajar con tu equipo, o pide que te inviten a una."
          label="Aún no perteneces a ninguna organización"
        />
      )}
    </SettingsGroup>
  );
}
