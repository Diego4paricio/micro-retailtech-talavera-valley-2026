import { customerRoles } from "@kardo/domain";
import { SettingsGroup } from "../../components/SettingsBlocks.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { roleLabels } from "./role-labels.js";
import { roleSummaries } from "./team-model.js";
import "./organization.css";

/**
 * The permission matrix in words, one line per role (no table). A list of
 * its own rather than settings rows: the explanations are prose and need
 * the full width when the column is narrow.
 */
export function RolesGroup() {
  const { workspace } = useWorkspace();
  const showMine = workspace.kind === "organization";
  return (
    <SettingsGroup id="team-roles" title="Qué puede hacer cada rol">
      <dl className="team-roles">
        {customerRoles.map((role) => (
          <div className="team-role" key={role}>
            <dt>
              {roleLabels[role]}
              {showMine && workspace.role === role ? (
                <span className="settings-tag">Tu rol</span>
              ) : null}
            </dt>
            <dd>{roleSummaries[role]}</dd>
          </div>
        ))}
      </dl>
    </SettingsGroup>
  );
}
