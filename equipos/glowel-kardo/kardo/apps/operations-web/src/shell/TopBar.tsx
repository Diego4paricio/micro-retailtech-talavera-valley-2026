import { Icon } from "../components/Icon.js";
import { permissionAreas } from "../lib/permissions.js";
import { useStaff } from "./StaffContext.js";

export function TopBar() {
  const { staff, signOut } = useStaff();
  const name = staff.displayName ?? staff.email;
  const initials = name.slice(0, 2).toUpperCase();
  const areas = permissionAreas(staff.permissions);

  return (
    <header className="op-topbar">
      <div className="op-topbar-identity">
        <span aria-hidden="true" className="op-topbar-avatar">
          {initials}
        </span>
        <span className="op-topbar-copy">
          <strong>{name}</strong>
          <small title={staff.email}>{staff.email}</small>
        </span>
      </div>
      <ul aria-label="Permisos activos" className="op-topbar-roles">
        {areas.map((area) => (
          <li className="op-role-pill" key={area}>
            {area}
          </li>
        ))}
      </ul>
      <div className="op-topbar-actions">
        <button
          className="button button-secondary button-small"
          onClick={() => void signOut()}
          type="button"
        >
          <Icon name="logout" size={16} /> Cerrar sesión
        </button>
      </div>
    </header>
  );
}
