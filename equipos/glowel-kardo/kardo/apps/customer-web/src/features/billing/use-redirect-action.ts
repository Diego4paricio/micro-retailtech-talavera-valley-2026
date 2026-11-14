import { useCallback, useState } from "react";
import { errorMessage } from "../../lib/api.js";

/**
 * Runs a checkout or portal request and sends the browser to the Stripe page
 * it returns. `busy` names the running action so only its button spins; it is
 * kept on success because the page is about to unload.
 */
export function useRedirectAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (key: string, request: () => Promise<{ url: string | null }>) => {
      setBusy(key);
      setError(null);
      try {
        const { url } = await request();
        if (!url) throw new Error("Stripe no devolvió la página de pago.");
        window.location.assign(url);
      } catch (requestError) {
        setError(errorMessage(requestError));
        setBusy(null);
      }
    },
    [],
  );

  return { busy, error, run, clearError: () => setError(null) };
}
