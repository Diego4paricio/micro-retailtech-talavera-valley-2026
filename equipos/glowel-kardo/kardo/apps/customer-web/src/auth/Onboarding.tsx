import type {
  AccountType,
  CompleteCustomerOnboarding,
  CustomerWorkspace,
} from "@kardo/contracts";
import { type FormEvent, useEffect, useState } from "react";
import { workspacesApi } from "../api/workspaces.js";
import { industryOptions } from "../features/business-profile/options.js";
import { syncEmailNames } from "../lib/account-profile.js";
import { errorMessage } from "../lib/api.js";
import { clearSignupPlan, readSignupPlan } from "../lib/signup-plan.js";
import { supabase } from "../supabase.js";
import { FormNotice } from "./AuthLayout.js";

/**
 * The first question (owner decision, 2026-10-01): personal or business. It
 * is kept with the space; both are organizations and can invite who helps.
 */
const accountTypes: {
  value: AccountType;
  label: string;
  help: string;
}[] = [
  {
    value: "personal",
    label: "Personal",
    help: "Para ti: tu marca personal, tu perfil o un proyecto. Tu espacio lleva tu nombre y también puedes invitar a quien te ayude.",
  },
  {
    value: "business",
    label: "Negocio",
    help: "Para tu empresa o negocio, con tu equipo.",
  },
];

/** «María José» gives «María»: a starting point they can change. */
function firstWord(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

export function Onboarding({ onCompleted }: { onCompleted: () => void }) {
  const [workspace, setWorkspace] = useState<CustomerWorkspace | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  // How Kardo calls them; it follows the first name until they type.
  const [preferredName, setPreferredName] = useState("");
  const [preferredTouched, setPreferredTouched] = useState(false);
  const [accountType, setAccountType] = useState<AccountType | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("");
  // Two steps. «Objetivo» left on 2026-10-07: nothing read it and it stopped
  // 7 of 20 simulated owners (relevo 37, C2).
  const [step, setStep] = useState<"you" | "business">("you");
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void workspacesApi
      .list(controller.signal)
      .then((workspaces) =>
        setWorkspace(
          workspaces.find((item) => item.kind === "personal") ??
            workspaces[0] ??
            null,
        ),
      )
      .catch(() => {
        if (!controller.signal.aborted)
          setNotice("No pudimos preparar tu espacio. Recarga la página.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace || !supabase) return;
    if (
      !accountType ||
      (accountType === "business" && (!businessName.trim() || !businessType))
    )
      return;
    setIsSubmitting(true);
    setNotice(null);
    try {
      const name = fullName();
      const preferred = preferredName.trim() || firstWord(firstName);
      // `industry`: the contract adds it with the server change (A2-55).
      const body: CompleteCustomerOnboarding & { industry?: string } = {
        // A personal space is called by the person's name (owner,
        // 2026-10-04); a business one by the business's.
        workspaceName:
          accountType === "personal" ? name : businessName.trim() || name,
        displayName: name,
        ...(preferred ? { preferredName: preferred } : {}),
        ...(accountType ? { accountType } : {}),
        // The giro goes to the organization's own profile, saved by the
        // server when the sign-up ends (A2-55).
        ...(accountType === "business" && businessType
          ? { industry: businessType }
          : {}),
        // Starts the 15-day trial of the plan picked on /precios/ (ADR 020).
        ...readSignupPlan(),
      };
      await workspacesApi.completeOnboarding(workspace.id, body);
      clearSignupPlan();
      // Display-only metadata (the giro, and the names Supabase's emails
      // read to greet the person); never used for authorization. The server
      // already saved the giro in the organization, and this copy is
      // optional (A2-56): if it fails the sign-up is still done, so it is
      // never repeated.
      await syncEmailNames({
        business_type: accountType === "business" ? businessType : null,
        display_name: name,
        preferred_name: preferred,
      });
      onCompleted();
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  function fullName(): string {
    return `${firstName.trim()} ${lastName.trim()}`.replace(/\s+/g, " ").trim();
  }

  function continueToBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!firstName.trim() || !lastName.trim()) return;
    if (!preferredName.trim()) setPreferredName(firstWord(firstName));
    setStep("business");
    setNotice(null);
  }

  return (
    <main className="onboarding-layout">
      <header className="onboarding-header">
        <img alt="Kardo" src="/kardo-logo.svg" />
        <span>Configuración inicial</span>
      </header>
      <section className="onboarding-card" aria-labelledby="onboarding-title">
        <h1 id="onboarding-title">Configura tu espacio.</h1>
        <p className="auth-intro">
          Esto configura tu espacio de Kardo. Podrás modificarlo después desde
          Configuración.
        </p>
        {isLoading ? <p className="form-note">Preparando tu espacio…</p> : null}
        {!isLoading && !workspace ? (
          <p className="form-notice" role="alert">
            {notice ?? "No encontramos un espacio para esta cuenta."}
          </p>
        ) : null}
        {workspace ? (
          <>
            <ol
              className="auth-progress"
              aria-label="Progreso de configuración"
            >
              <li
                aria-current={step === "you" ? "step" : undefined}
                className={step === "you" ? "auth-progress-current" : ""}
              >
                1. Tú
              </li>
              <li
                aria-current={step === "business" ? "step" : undefined}
                className={step === "business" ? "auth-progress-current" : ""}
              >
                2. Tu cuenta
              </li>
            </ol>
            {step === "you" ? (
              <form className="auth-form" onSubmit={continueToBusiness}>
                <label htmlFor="first-name">Tu nombre</label>
                <input
                  autoComplete="given-name"
                  id="first-name"
                  maxLength={60}
                  onChange={(event) => {
                    setFirstName(event.target.value);
                    if (!preferredTouched)
                      setPreferredName(firstWord(event.target.value));
                  }}
                  placeholder="Ej. María José"
                  required
                  value={firstName}
                />
                <label htmlFor="last-name">Tus apellidos</label>
                <input
                  autoComplete="family-name"
                  id="last-name"
                  maxLength={60}
                  onChange={(event) => setLastName(event.target.value)}
                  placeholder="Ej. López Ruiz"
                  required
                  value={lastName}
                />
                <label htmlFor="preferred-name">¿Cómo te decimos?</label>
                <input
                  aria-describedby="preferred-name-note"
                  autoComplete="nickname"
                  id="preferred-name"
                  maxLength={60}
                  onChange={(event) => {
                    setPreferredTouched(true);
                    setPreferredName(event.target.value);
                  }}
                  placeholder="Ej. Majo"
                  value={preferredName}
                />
                <p className="form-note" id="preferred-name-note">
                  Así te saludamos en Kardo y en los correos.
                </p>
                <button className="button button-primary" type="submit">
                  Continuar
                </button>
              </form>
            ) : step === "business" ? (
              <form className="auth-form" onSubmit={submit}>
                <fieldset className="account-type">
                  <legend>¿Cómo usarás Kardo?</legend>
                  <div className="choice-row">
                    {accountTypes.map((option) => (
                      <label
                        className={
                          accountType === option.value
                            ? "choice choice-selected"
                            : "choice"
                        }
                        htmlFor={`account-${option.value}`}
                        key={option.value}
                      >
                        <input
                          checked={accountType === option.value}
                          id={`account-${option.value}`}
                          name="account-type"
                          onChange={() => setAccountType(option.value)}
                          required
                          type="radio"
                          value={option.value}
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                  <p className="form-note">
                    {accountTypes.find((option) => option.value === accountType)
                      ?.help ??
                      "Elige una opción. En las dos puedes invitar a quien te ayude."}
                  </p>
                </fieldset>
                {accountType === "business" ? (
                  <>
                    <label htmlFor="business-name">Nombre del negocio</label>
                    <input
                      autoComplete="organization"
                      id="business-name"
                      maxLength={120}
                      onChange={(event) => setBusinessName(event.target.value)}
                      placeholder="Ej. Café Nube"
                      required
                      value={businessName}
                    />
                  </>
                ) : null}
                {accountType === "business" ? (
                  <>
                    <label htmlFor="business-type">
                      ¿Qué tipo de negocio tienes?
                    </label>
                    <select
                      id="business-type"
                      onChange={(event) => setBusinessType(event.target.value)}
                      required
                      value={businessType}
                    >
                      <option value="">Selecciona una opción</option>
                      {/* The giros of Configuración, so Primeros pasos
                          starts with it instead of asking again. */}
                      {industryOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </>
                ) : null}
                <FormNotice>{notice}</FormNotice>
                <button
                  className="button button-primary"
                  disabled={isSubmitting}
                  type="submit"
                >
                  {isSubmitting ? "Preparando espacio…" : "Entrar a mi espacio"}
                </button>
                <button
                  className="mode-switch mode-switch-secondary"
                  onClick={() => setStep("you")}
                  type="button"
                >
                  Volver
                </button>
              </form>
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  );
}
