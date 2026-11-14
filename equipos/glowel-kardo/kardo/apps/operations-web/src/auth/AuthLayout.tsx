import type { ReactNode } from "react";

export function AuthLayout({
  eyebrow,
  headline,
  body,
  children,
  formKey,
}: {
  eyebrow: string;
  headline: string;
  body: string;
  children: ReactNode;
  formKey?: string;
}) {
  return (
    <main className="auth-layout">
      <section className="auth-story" aria-label="Kardo Operations">
        <img alt="Kardo" className="auth-logo" src="/kardo-logo-oscuro.svg" />
        <div className="auth-story-copy">
          <p className="eyebrow eyebrow-light">{eyebrow}</p>
          <h1>{headline}</h1>
          <p>{body}</p>
        </div>
      </section>
      <section className="auth-form-area">
        <div className="auth-form-wrap" key={formKey}>
          {children}
        </div>
      </section>
    </main>
  );
}

export function FormNotice({ children }: { children: string | null }) {
  if (!children) return null;
  return (
    <p className="field-error" role="alert">
      {children}
    </p>
  );
}
