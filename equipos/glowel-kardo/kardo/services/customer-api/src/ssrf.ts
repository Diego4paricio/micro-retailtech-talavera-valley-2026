import dns from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

/**
 * SSRF hardening for the one place this service makes an outbound request to
 * a URL the customer supplied (`POST /lead-delivery/test`). `webhook-url.ts`
 * already rejects a literal IP or an obviously local hostname at save time,
 * but a hostname's DNS answer can change *after* it was saved (the classic
 * "DNS rebinding" attack: a name that resolves to a public IP during
 * validation and to `127.0.0.1`/a cloud metadata address at request time).
 * This resolves the hostname once, rejects it unless every returned address
 * is public/non-reserved, and then pins the connection to that exact
 * validated address — the underlying `fetch` never performs its own DNS
 * lookup, so a second (attacker-controlled) answer can't be substituted
 * between the check and the connection.
 */
export class UnsafeWebhookTargetError extends Error {}

/**
 * Every address range a webhook must never reach: private, loopback,
 * link-local, shared, documentation, benchmarking, multicast and reserved
 * blocks, plus the IPv6 transition forms that embed an IPv4 address
 * (IPv4-compatible, NAT64, 6to4, Teredo). `BlockList` also applies the IPv4
 * rules to IPv4-mapped IPv6 addresses (`::ffff:a.b.c.d`). Completed in the
 * security review of 2026-10 (it missed `fe80::/10` past `fe80:`, NAT64,
 * 6to4 and several reserved IPv4 blocks).
 */
const blockedRanges = (() => {
  const list = new BlockList();
  const v4: [string, number][] = [
    ["0.0.0.0", 8], // "this network"
    ["10.0.0.0", 8], // RFC1918
    ["100.64.0.0", 10], // CGNAT (RFC6598)
    ["127.0.0.0", 8], // loopback
    ["169.254.0.0", 16], // link-local (cloud metadata)
    ["172.16.0.0", 12], // RFC1918
    ["192.0.0.0", 24], // IETF protocol assignments
    ["192.0.2.0", 24], // TEST-NET-1
    ["192.88.99.0", 24], // 6to4 relay anycast
    ["192.168.0.0", 16], // RFC1918
    ["198.18.0.0", 15], // benchmarking
    ["198.51.100.0", 24], // TEST-NET-2
    ["203.0.113.0", 24], // TEST-NET-3
    ["224.0.0.0", 4], // multicast
    ["240.0.0.0", 4], // reserved + broadcast
  ];
  for (const [network, prefix] of v4) list.addSubnet(network, prefix, "ipv4");
  const v6: [string, number][] = [
    ["::", 128], // unspecified
    ["::1", 128], // loopback
    ["::", 96], // IPv4-compatible (deprecated)
    ["64:ff9b::", 96], // NAT64
    ["64:ff9b:1::", 48], // local NAT64
    ["100::", 64], // discard
    ["2001::", 23], // IETF protocol assignments (Teredo included)
    ["2001:db8::", 32], // documentation
    ["2002::", 16], // 6to4
    ["fc00::", 7], // unique local
    ["fe80::", 10], // link-local
    ["fec0::", 10], // site-local (deprecated)
    ["ff00::", 8], // multicast
  ];
  for (const [network, prefix] of v6) list.addSubnet(network, prefix, "ipv6");
  return list;
})();

export function isUnsafeIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return blockedRanges.check(ip, "ipv4");
  if (version === 6) {
    const value = ip.toLowerCase();
    // IPv4-mapped in dotted form: check the embedded IPv4 address too.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value)?.[1];
    if (mapped)
      return isIP(mapped) !== 4 || blockedRanges.check(mapped, "ipv4");
    return blockedRanges.check(value, "ipv6");
  }
  return true; // Not a parseable IP literal at all: never safe to connect to.
}

/** Resolves `hostname` and returns one address, only if *every* resolved
 * address is public — fails closed rather than picking "the first safe one"
 * out of a mixed answer, since that mix is itself the rebinding signal. */
export async function resolveSafeWebhookAddress(
  hostname: string,
): Promise<{ address: string; family: 4 | 6 }> {
  let records: { address: string; family: number }[];
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new UnsafeWebhookTargetError(
      "The webhook host could not be resolved.",
    );
  }
  if (records.length === 0) {
    throw new UnsafeWebhookTargetError(
      "The webhook host resolved to no address.",
    );
  }
  if (records.some((record) => isUnsafeIp(record.address))) {
    throw new UnsafeWebhookTargetError(
      "The webhook host resolves to a disallowed address.",
    );
  }
  const first = records[0];
  if (!first) {
    throw new UnsafeWebhookTargetError(
      "The webhook host resolved to no address.",
    );
  }
  return { address: first.address, family: first.family === 6 ? 6 : 4 };
}

export type SafeFetchInput = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
};

/** `fetch`, but DNS-pinned to a pre-validated address (see module doc) and
 * never following a redirect (a 3xx could point anywhere, including back at
 * a private address). */
export async function safeFetch(input: SafeFetchInput): Promise<Response> {
  const target = new URL(input.url);
  const pinned = await resolveSafeWebhookAddress(target.hostname);
  const agent = new Agent({
    connect: {
      lookup: (_hostname, _options, callback) => {
        callback(null, [{ address: pinned.address, family: pinned.family }]);
      },
    },
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    return (await undiciFetch(target, {
      method: input.method,
      headers: input.headers,
      ...(input.body !== undefined ? { body: input.body } : {}),
      redirect: "manual",
      signal: controller.signal,
      dispatcher: agent,
    })) as unknown as Response;
  } finally {
    clearTimeout(timer);
    await agent.close();
  }
}
