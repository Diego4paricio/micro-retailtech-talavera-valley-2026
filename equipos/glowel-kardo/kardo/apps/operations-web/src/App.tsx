import type { StaffSession } from "@kardo/contracts";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { sessionApi } from "./api/session.js";
import { TotpChallenge, TotpEnroll } from "./auth/Mfa.js";
import { SignIn } from "./auth/SignIn.js";
import { ToastProvider } from "./components/Toast.js";
import { errorMessage } from "./lib/api.js";
import { isDemoMode } from "./lib/demo.js";
import { RouterProvider } from "./lib/router.js";
import { Shell } from "./shell/Shell.js";
import { StaffProvider } from "./shell/StaffContext.js";
import { supabase } from "./supabase.js";

const demoSession = {
  access_token: "kardo-operations-demo-session",
  user: {
    id: "60000000-0000-4000-8000-000000000001",
    email: "demo@kardo.app",
  },
} as Session;

export function App() {
  return (
    <RouterProvider>
      <ToastProvider>
        <AuthGate />
      </ToastProvider>
    </RouterProvider>
  );
}

/** Decides between sign-in, the MFA gate and the protected shell. */
function AuthGate() {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(!isDemoMode);

  useEffect(() => {
    if (isDemoMode || !supabase) {
      setIsLoading(false);
      return;
    }
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (isDemoMode) return <MfaGate session={demoSession} skipMfa />;
  if (isLoading) return <LoadingScreen />;
  if (!supabase) return <ConfigurationNotice />;
  if (!session) return <SignIn />;
  return <MfaGate session={session} />;
}

type MfaStatus = "checking" | "challenge" | "enroll" | "ready";

/**
 * Enforces AAL2 before anything touches the Staff API: challenges an existing
 * verified TOTP factor, or walks a factor-less staff member through
 * enrollment. Re-checks whenever the access token changes (an MFA verify
 * refreshes the session, which re-runs this effect and finds `aal2`).
 */
function MfaGate({
  session,
  skipMfa,
}: {
  session: Session;
  skipMfa?: boolean;
}) {
  const [status, setStatus] = useState<MfaStatus>(
    skipMfa ? "ready" : "checking",
  );
  const [factorId, setFactorId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: session.access_token re-triggers the check after an MFA verify upgrades the session to aal2
  useEffect(() => {
    if (skipMfa || !supabase) return;
    let current = true;
    async function check() {
      if (!supabase) return;
      setStatus("checking");
      setError(null);
      const level = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!current) return;
      if (level.error) {
        setError("No pudimos comprobar tu nivel de verificación.");
        return;
      }
      if (level.data.currentLevel === "aal2") {
        setStatus("ready");
        return;
      }
      const factors = await supabase.auth.mfa.listFactors();
      if (!current) return;
      if (factors.error) {
        setError("No pudimos comprobar tus factores de verificación.");
        return;
      }
      const verified = factors.data.totp.find(
        (factor) => factor.status === "verified",
      );
      if (verified) {
        setFactorId(verified.id);
        setStatus("challenge");
      } else {
        setStatus("enroll");
      }
    }
    void check();
    return () => {
      current = false;
    };
  }, [session.access_token, skipMfa]);

  if (status === "checking") return <LoadingScreen />;
  if (error)
    return (
      <AccessBlocked
        message={error}
        onSignOut={() => void supabase?.auth.signOut()}
      />
    );
  if (status === "challenge" && factorId)
    return <TotpChallenge factorId={factorId} />;
  if (status === "enroll") return <TotpEnroll />;
  return <StaffGate session={session} />;
}

/** Once AAL2 is confirmed, resolves the staff profile and permissions. */
function StaffGate({ session }: { session: Session }) {
  const [staff, setStaff] = useState<StaffSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // biome-ignore lint/correctness/useExhaustiveDependencies: session.access_token re-fetches the staff profile after a token refresh
  useEffect(() => {
    let current = true;
    setIsLoading(true);
    setError(null);
    sessionApi
      .current()
      .then((value) => {
        if (!current) return;
        setStaff(value);
        setIsLoading(false);
      })
      .catch((requestError: unknown) => {
        if (!current) return;
        setError(errorMessage(requestError));
        setIsLoading(false);
      });
    return () => {
      current = false;
    };
  }, [session.access_token]);

  if (isLoading) return <LoadingScreen />;
  if (error || !staff)
    return (
      <AccessBlocked
        message={error ?? "No se pudo comprobar tu membresía de staff."}
        onSignOut={() => void supabase?.auth.signOut()}
      />
    );
  return (
    <StaffProvider session={session} staff={staff}>
      <Shell />
    </StaffProvider>
  );
}

function LoadingScreen() {
  return (
    <main className="state-screen" aria-busy="true">
      <img alt="Kardo" src="/kardo-logo-oscuro.svg" />
      <p role="status">Verificando tu sesión de Operations…</p>
    </main>
  );
}

function ConfigurationNotice() {
  return (
    <main className="state-screen">
      <img alt="Kardo" src="/kardo-logo-oscuro.svg" />
      <p>Faltan las variables públicas de Supabase para este entorno.</p>
    </main>
  );
}

function AccessBlocked({
  message,
  onSignOut,
}: {
  message: string;
  onSignOut: () => void;
}) {
  return (
    <main className="state-screen">
      <img alt="Kardo" src="/kardo-logo-oscuro.svg" />
      <section className="state-panel state-panel-error">
        <p className="eyebrow">Acceso bloqueado</p>
        <h2>No pudimos abrir Kardo Operations.</h2>
        <p>{message}</p>
        <p>
          Si crees que esto es un error, pide a Platform Admin que revise tu
          perfil de staff y tus permisos.
        </p>
        <button
          className="button button-primary"
          onClick={onSignOut}
          type="button"
        >
          Cerrar sesión
        </button>
      </section>
    </main>
  );
}
