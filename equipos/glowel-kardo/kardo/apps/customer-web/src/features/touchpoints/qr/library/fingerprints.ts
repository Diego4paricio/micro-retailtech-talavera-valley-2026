import type { QrDesign } from "@kardo/contracts";
import { useEffect, useMemo, useState } from "react";
import { touchpointUrls } from "../../../../lib/touchpoint-urls.js";
import { designFingerprint } from "../qr-design.js";
import { stableKey } from "../studio/history.js";

// Many Touchpoints share one library design: hash each distinct design once.
const cache = new Map<string, Promise<string>>();

export function fingerprintOf(design: QrDesign): Promise<string> {
  const key = stableKey(design);
  let pending = cache.get(key);
  if (!pending) {
    pending = designFingerprint(design);
    cache.set(key, pending);
    pending.catch(() => cache.delete(key));
  }
  return pending;
}

/** Fingerprint of each entry's design (`undefined` while it is computed). */
export function useFingerprints(
  entries: readonly { id: string; design: QrDesign }[],
): ReadonlyMap<string, string> {
  const [result, setResult] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const key = useMemo(
    () =>
      entries
        .map((entry) => `${entry.id}:${stableKey(entry.design)}`)
        .join("|"),
    [entries],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` summarizes `entries`
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      entries.map(
        async (entry) => [entry.id, await fingerprintOf(entry.design)] as const,
      ),
    )
      .then((pairs) => {
        if (!cancelled) setResult(new Map(pairs));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [key]);
  return result;
}

/**
 * The address used to preview a design that is not tied to one Touchpoint:
 * the longest possible public ID, so the legibility check is conservative.
 */
export function worstCasePreviewUrl(): string {
  return touchpointUrls("x".repeat(32)).qr;
}
