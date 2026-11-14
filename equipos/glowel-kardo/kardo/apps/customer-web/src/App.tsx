import type { Session } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";
import { Onboarding } from "./auth/Onboarding.js";
import { SecondFactor } from "./auth/SecondFactor.js";
import { SetPassword } from "./auth/SetPassword.js";
import { SignIn } from "./auth/SignIn.js";
import { ToastProvider } from "./components/Toast.js";
import { isDemoMode } from "./lib/demo.js";
import {
  capturePendingInvitation,
  readPendingInvitation,
} from "./lib/pending-invitation.js";
import {
  capturePendingPieceCode,
  readPendingPieceCode,
} from "./lib/pending-piece-code.js";
import {
  type RegistrationStage,
  readRegistrationStage,
  writeRegistrationStage,
} from "./lib/registration-stage.js";
import { entryIntent, RouterProvider, useRouter } from "./lib/router.js";
import { SECOND_FACTOR_REQUIRED_EVENT } from "./lib/second-factor.js";
import { captureSignupPlan } from "./lib/signup-plan.js";
import { supabase } from "./supabase.js";
import { LoadingScreen, WorkspaceApp } from "./workspace/WorkspaceApp.js";

const demoSession = {
  access_token: "kardo-demo-session",
  user: {
    id: "e6abf26a-3263-4149-9d75-9b7441165d29",
    email: "demo@kardo.test",
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

/** Decides between the public access flow and the protected workspace. */
function AuthGate() {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(!isDemoMode);
  const [stage, setStage] = useState<RegistrationStage>(readRegistrationStage);
  // "Crear cuenta" on the Website opens /registro: start on registration.
  const [entry] = useState(() => {
    const intent = entryIntent(window.location.pathname);
    // The plan picked on /precios/ travels with /registro (ADR 020).
    if (intent === "sign-up") captureSignupPlan(window.location.search);
    return intent;
  });
  // An invitation link waits for the sign in or the new account (T3).
  const [invited] = useState(() => capturePendingInvitation(window.location));
  // The activation card's QR (`/activar?codigo=`, ADR 026): the code waits
  // through the sign in or the new account, like the plan from /precios/.
  const [pieceCode] = useState(() => capturePendingPieceCode(window.location));
  const { navigate } = useRouter();
  // Mirrors `session` for the auth listener, which must not read state from
  // inside a state updater.
  const sessionRef = useRef<Session | null>(null);

  useEffect(() => {
    if (isDemoMode || !supabase) {
      setIsLoading(false);
      return;
    }
    void supabase.auth.getSession().then(({ data }) => {
      sessionRef.current = data.session;
      setSession(data.session);
      setIsLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      const sameIdentity =
        event === "TOKEN_REFRESHED" &&
        sessionRef.current?.user.id === nextSession?.user.id;
      // Token refreshes keep the same identity: avoid re-rendering the tree.
      if (!sameIdentity) {
        sessionRef.current = nextSession;
        setSession(nextSession);
      }
      if (event === "SIGNED_OUT") {
        writeRegistrationStage(null);
        setStage(null);
        // Signing out resets the address, so the next sign-in opens on the
        // Resumen. Reloading a deep link with a stored session keeps it.
        navigate({ name: "overview" }, { replace: true });
      }
      setIsLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  // Which person and access token the second-factor check answered for. A
  // new person (sign in, email code) is checked before anything shows; a new
  // token of someone already inside (a factor just added in Seguridad) is
  // checked without taking the panel down.
  const [assurance, setAssurance] = useState<{
    userId: string;
    token: string;
    needsSecondFactor: boolean;
  } | null>(null);

  useEffect(() => {
    if (isDemoMode || !supabase || !session) return;
    const token = session.access_token;
    const userId = session.user.id;
    let cancelled = false;
    void supabase.auth.mfa
      .getAuthenticatorAssuranceLevel()
      .then(({ data, error }) => {
        if (cancelled) return;
        // Unknown counts as complete: the Customer API still refuses an aal1
        // token of an account with a factor, and its 401 MFA_REQUIRED comes
        // back here through SECOND_FACTOR_REQUIRED_EVENT.
        const needsSecondFactor =
          !error && data.currentLevel !== "aal2" && data.nextLevel === "aal2";
        setAssurance({ userId, token, needsSecondFactor });
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    function holdForSecondFactor() {
      const current = sessionRef.current;
      if (current)
        setAssurance({
          userId: current.user.id,
          token: current.access_token,
          needsSecondFactor: true,
        });
    }
    window.addEventListener(SECOND_FACTOR_REQUIRED_EVENT, holdForSecondFactor);
    return () =>
      window.removeEventListener(
        SECOND_FACTOR_REQUIRED_EVENT,
        holdForSecondFactor,
      );
  }, []);

  function updateStage(next: RegistrationStage) {
    writeRegistrationStage(next);
    setStage(next);
  }

  if (isDemoMode) return <WorkspaceApp session={demoSession} />;
  if (isLoading) return <LoadingScreen />;
  if (!supabase) return <ConfigurationNotice />;
  if (!session)
    return (
      <SignIn
        initialMode={
          entry === "sign-up" || invited || pieceCode ? "sign-up" : "sign-in"
        }
        invited={invited}
        onVerified={updateStage}
      />
    );
  // Before any stage: recovering the password or finishing a registration
  // also needs the second factor when the account has one.
  const checked =
    assurance?.userId === session.user.id &&
    (assurance.token === session.access_token || !assurance.needsSecondFactor);
  if (!checked) return <LoadingScreen />;
  if (assurance.needsSecondFactor) return <SecondFactor />;
  if (stage === "password")
    return (
      <SetPassword
        // Joining by invitation skips the questions about a business of its
        // own: the person goes straight to the organization that invited it
        // and can create a business later ("Crear mi propio negocio").
        onCompleted={() =>
          updateStage(readPendingInvitation() ? null : "onboarding")
        }
        variant="new-account"
      />
    );
  if (stage === "recovery")
    return (
      <SetPassword onCompleted={() => updateStage(null)} variant="recovery" />
    );
  if (stage === "onboarding")
    return (
      <Onboarding
        onCompleted={() => {
          // Right after the sign-up questions: Primeros pasos (owner,
          // 2026-10-03, relevo 31), or the pieces of the kit that brought
          // the person here (ADR 026).
          const code = readPendingPieceCode();
          navigate(
            code ? { name: "activate-piece", code } : { name: "first-steps" },
            { replace: true },
          );
          updateStage(null);
        }}
      />
    );
  return <WorkspaceApp session={session} />;
}

function ConfigurationNotice() {
  return (
    <main className="state-screen">
      <img alt="Kardo" src="/kardo-logo.svg" />
      <p>Falta configurar Supabase para iniciar sesión.</p>
    </main>
  );
}
