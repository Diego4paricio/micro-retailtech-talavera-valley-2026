import { passwordRules } from "../lib/auth-errors.js";

export function isStrongPassword(value: string): boolean {
  return passwordRules.every((rule) => rule.test(value));
}

export function PasswordRules({ value }: { value: string }) {
  return (
    <ul className="password-rules" aria-label="Requisitos de la contraseña">
      {passwordRules.map((rule) => {
        const met = rule.test(value);
        return (
          <li className={met ? "password-rule-met" : ""} key={rule.label}>
            <span aria-hidden="true">{met ? "✓" : "○"}</span>
            {rule.label}
            <span className="visually-hidden">
              {met ? " (cumplido)" : " (pendiente)"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
