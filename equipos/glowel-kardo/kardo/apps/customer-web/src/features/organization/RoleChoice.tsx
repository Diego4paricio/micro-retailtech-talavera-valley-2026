import type { AssignableRole } from "@kardo/contracts";
import { roleLabels } from "./role-labels.js";
import { assignableRoles, roleHints } from "./team-model.js";
import "./organization.css";

/**
 * The role as a short list of options, each with what it can do in one
 * line, instead of a bare select (ADR 023 §2.4). Used to invite and to
 * change someone's role.
 */
export function RoleChoice({
  name,
  value,
  onChange,
  disabled,
}: {
  /** Radio group name, unique per form. */
  name: string;
  value: AssignableRole;
  onChange: (role: AssignableRole) => void;
  disabled?: boolean | undefined;
}) {
  return (
    <fieldset className="role-choice" disabled={disabled}>
      <legend>Rol</legend>
      {assignableRoles.map((role) => {
        const id = `${name}-${role}`;
        return (
          <label className="role-option" htmlFor={id} key={role}>
            <input
              aria-describedby={`${id}-hint`}
              checked={value === role}
              id={id}
              name={name}
              onChange={() => onChange(role)}
              type="radio"
              value={role}
            />
            <span className="role-option-name">{roleLabels[role]}</span>
            <small id={`${id}-hint`}>{roleHints[role]}</small>
          </label>
        );
      })}
    </fieldset>
  );
}
