import {
  KARDO_ICON_WIDTH,
  KARDO_LOGO_HEIGHT,
  kardoIconOutlines,
} from "@kardo/page-render";
import { type ReactNode, useId } from "react";

/** What a business can put behind a QR or NFC, shown one at a time. */
const rotatingWords = ["menú", "catálogo", "perfil", "formulario"] as const;

export function AuthLayout({
  headline,
  body,
  children,
  formKey,
}: {
  /** Deprecated: accepted for compatibility, never shown. */
  eyebrow?: string;
  /** Replaces the brand message; omit it to show Kardo's own. */
  headline?: string;
  body?: string;
  /** Deprecated: accepted for compatibility, never shown. */
  showSchematic?: boolean;
  children: ReactNode;
  formKey?: string;
}) {
  const headlineId = useId();
  return (
    <main className="auth-layout">
      <section aria-labelledby={headlineId} className="auth-story">
        <img alt="Kardo" className="auth-logo" src="/kardo-logo-oscuro.svg" />
        <div className="auth-story-copy">
          {headline ? (
            <h1 id={headlineId}>{headline}</h1>
          ) : (
            <h1 id={headlineId}>
              <span className="visually-hidden">
                Tu menú, catálogo, perfil o formulario, siempre al día.
              </span>
              <span aria-hidden="true" className="auth-headline-line">
                Tu{" "}
                <span className="auth-rotator">
                  {rotatingWords.map((word) => (
                    <span key={word}>{word}</span>
                  ))}
                </span>
              </span>
              <span aria-hidden="true" className="auth-headline-line">
                siempre al día.
              </span>
            </h1>
          )}
          <p>
            {body ??
              "Tus clientes lo abren con un QR o NFC. Tú lo cambias desde aquí, sin reimprimir."}
          </p>
        </div>
        <AuthSignal />
      </section>
      <section className="auth-form-area">
        <div className="auth-form-wrap" key={formKey}>
          {children}
        </div>
      </section>
    </main>
  );
}

/** The brand's tap signal, drawn large and quiet: the official symbol
 * (ring, dot and two signal waves) whose waves light up in turn, like a
 * phone reaching a QR or NFC. */
function AuthSignal() {
  return (
    <svg
      aria-hidden="true"
      className="auth-signal"
      focusable="false"
      viewBox={`-4 -6 ${KARDO_ICON_WIDTH + 26} ${KARDO_LOGO_HEIGHT + 12}`}
    >
      <path className="auth-signal-ring" d={kardoIconOutlines.ring} />
      <path className="auth-signal-core" d={kardoIconOutlines.dot} />
      <path
        className="auth-signal-wave auth-signal-wave--inner"
        d={kardoIconOutlines.inner}
      />
      <path
        className="auth-signal-wave auth-signal-wave--outer"
        d={kardoIconOutlines.outer}
      />
    </svg>
  );
}

export function FormNotice({ children }: { children: string | null }) {
  if (!children) return null;
  return (
    <p className="form-notice" role="status">
      {children}
    </p>
  );
}
