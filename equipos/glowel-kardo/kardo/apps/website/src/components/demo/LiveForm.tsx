import { type CSSProperties, type FormEvent, useId } from "react";
import { type PageTheme, themeAttributes } from "../kardo-page/theme";
import { Logo } from "../Logo";
import { type FormSettings, formControls } from "./studio-data";

/*
  The Formulario de contacto as the Resolver serves it (renderForm() in
  services/resolver/src/render.ts), with controls that work: KardoPage draws
  the form inert to illustrate it, while here a visitor fills it in and
  sends it. Same order, labels, limits and required fields; the classes are
  the ones kardo-page.css already ports. Nothing is sent anywhere: the
  demo keeps the lead in the page's memory.
*/

export interface FormValues {
  email: string;
  name: string;
  phone: string;
  message: string;
  consent: boolean;
}

export const emptyFormValues: FormValues = {
  email: "",
  name: "",
  phone: "",
  message: "",
  consent: false,
};

/** Room for the phone's status bar, like KardoPage's insetTop. */
function pageStyle(style: CSSProperties, insetTop: number): CSSProperties {
  return { ...style, paddingTop: 28 + insetTop };
}

export function LiveFormPage({
  form,
  theme,
  insetTop,
  values,
  onChange,
  onSubmit,
}: {
  form: FormSettings;
  theme: PageTheme;
  insetTop: number;
  values: FormValues;
  onChange: (values: FormValues) => void;
  onSubmit: () => void;
}) {
  const { className, style } = themeAttributes(theme);
  const id = useId();

  function submit(event: FormEvent<HTMLFormElement>) {
    // The browser already checked the required fields and the email.
    event.preventDefault();
    onSubmit();
  }

  return (
    <div className="kp flex flex-1 flex-col">
      <div
        className={`page flex-1 ${className}`}
        style={pageStyle(style, insetTop)}
      >
        <div className="card">
          <h1>{form.title}</h1>
          {form.description ? (
            <p className="description">{form.description}</p>
          ) : null}
          <form className="form" onSubmit={submit}>
            {formControls(form).map((control) => (
              <label
                className="label"
                htmlFor={`${id}-${control.name}`}
                key={control.name}
              >
                {control.label}
                {control.required ? "" : " (opcional)"}
                {control.type === "textarea" ? (
                  <textarea
                    className="input"
                    id={`${id}-${control.name}`}
                    maxLength={control.maxLength}
                    name={control.name}
                    onChange={(event) =>
                      onChange({
                        ...values,
                        [control.name]: event.target.value,
                      })
                    }
                    required={control.required}
                    style={{
                      height: "auto",
                      minHeight: 88,
                      resize: "vertical",
                    }}
                    value={values[control.name]}
                  />
                ) : (
                  <input
                    className="input"
                    id={`${id}-${control.name}`}
                    maxLength={control.maxLength}
                    name={control.name}
                    onChange={(event) =>
                      onChange({
                        ...values,
                        [control.name]: event.target.value,
                      })
                    }
                    required={control.required}
                    type={control.type}
                    value={values[control.name]}
                  />
                )}
              </label>
            ))}
            <label className="consent">
              <input
                checked={values.consent}
                name="consent"
                onChange={(event) =>
                  onChange({ ...values, consent: event.target.checked })
                }
                required
                style={{ marginTop: 3 }}
                type="checkbox"
                value="yes"
              />
              <span>{form.consentText}</span>
            </label>
            <button
              className="primary"
              style={{ cursor: "pointer" }}
              type="submit"
            >
              {form.submitLabel}
            </button>
          </form>
        </div>
        <footer className="kardo-footer">
          <Logo className="h-[15px] w-auto" title="Kardo" tone="mono" />
        </footer>
      </div>
    </div>
  );
}

/**
 * The page the Resolver answers a sent form with: renderNoticePage() with
 * "¡Listo!" and the form's success message, in the fixed brand look (no
 * theme), with the notice styles of brandCss.
 */
export function NoticePage({
  message,
  insetTop,
}: {
  message: string;
  insetTop: number;
}) {
  return (
    <div className="kp flex flex-1 flex-col">
      <div className="page flex-1" style={pageStyle({}, insetTop)}>
        <div
          className="card notice"
          style={{
            borderRadius: 14,
            padding: "34px 26px",
            textAlign: "center",
          }}
        >
          <div style={{ marginBottom: 16 }}>
            <Logo className="mx-auto block h-6 w-auto" title="Kardo" />
          </div>
          <h1>¡Listo!</h1>
          <p
            style={{
              color: "var(--t-text-secondary, var(--text-secondary))",
              fontSize: "0.95rem",
              lineHeight: 1.6,
              marginTop: 4,
            }}
          >
            {message}
          </p>
        </div>
        <footer className="kardo-footer">
          <Logo className="h-[15px] w-auto" title="Kardo" tone="mono" />
        </footer>
      </div>
    </div>
  );
}
