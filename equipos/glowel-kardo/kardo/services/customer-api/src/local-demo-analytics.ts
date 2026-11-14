import type { AnalyticsEngineClient, AnalyticsEngineRow } from "./analytics-engine.js";

type Channel = "qr" | "nfc" | "link";
type EventType = "tap" | "click";

type DemoEventBucket = {
  hourUtc: string;
  publicId: string;
  revision: string;
  eventType: EventType;
  channel: Channel;
  total: number;
};

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** Known demo touchpoints get tuned profiles; any other workspace touchpoint gets deterministic activity. */
const TOUCHPOINT_PROFILES: Record<string, { weight: number; revision: string }> = {
  // Mesa 1 (published revision 4 -> La Cafetería del Centro)
  f69930e706214bd4ad828387d38c4212: { weight: 1.0, revision: "4" },
  // Mostrador · Caja
  "84b17faba43545fb92bd048a8fe518f4": { weight: 0.42, revision: "1" },
};

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function unitNoise(seed: string): number {
  return (hashSeed(seed) % 10_000) / 10_000;
}

function formatUtcHour(ms: number): string {
  const d = new Date(ms);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:00:00`;
}

function parsePublicIds(sql: string): string[] {
  const inMatch = sql.match(/index1\s+IN\s*\(([^)]+)\)/i);
  if (inMatch?.[1]) {
    const ids: string[] = [];
    const re = /'([^']+)'/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(inMatch[1])) !== null) {
      if (m[1]) ids.push(m[1]);
    }
    return ids;
  }

  const eqMatch = sql.match(/index1\s*=\s*'([^']+)'/i);
  return eqMatch?.[1] ? [eqMatch[1]] : [];
}

function parseWindow(sql: string, nowMs: number): {
  startMs: number;
  endMs: number;
} {
  const prevMatch = sql.match(/timestamp\s*<=\s*NOW\(\)\s*-\s*INTERVAL\s*'(\d+)'\s*DAY/i);
  if (prevMatch?.[1]) {
    const days = Number(prevMatch[1]);
    return {
      startMs: nowMs - days * 2 * DAY_MS,
      endMs: nowMs - days * DAY_MS,
    };
  }

  const currMatch = sql.match(/INTERVAL\s*'(\d+)'\s*DAY/i);
  const days = currMatch?.[1] ? Number(currMatch[1]) : 7;
  return {
    startMs: nowMs - days * DAY_MS,
    endMs: nowMs,
  };
}

/** Realistic Mexico City (UTC-6) cafe hourly demand curve. */
function cafeHourlyFactor(hourMs: number): number {
  const d = new Date(hourMs);
  const localHour = (d.getUTCHours() - 6 + 24) % 24;
  const localDay = new Date(hourMs - 6 * HOUR_MS).getUTCDay(); // 0=Sun, 6=Sat

  let hourWeight = 0;
  if (localHour >= 8 && localHour <= 11) hourWeight = 1.35; // morning coffee rush
  else if (localHour >= 12 && localHour <= 15) hourWeight = 1.1; // breakfast / lunch
  else if (localHour >= 16 && localHour <= 19) hourWeight = 0.85; // afternoon snack
  else if (localHour === 7 || localHour === 20) hourWeight = 0.45;
  else if (localHour === 21) hourWeight = 0.15;
  else return 0; // closed overnight

  // Weekends (Fri-Sun) are noticeably busier in a cafe.
  const weekendBoost = localDay === 0 || localDay === 6 ? 1.28 : localDay === 5 ? 1.15 : 0.95;
  return hourWeight * weekendBoost;
}

function generateHourlyBuckets(
  publicIds: string[],
  startMs: number,
  endMs: number,
  nowMs: number,
): DemoEventBucket[] {
  const buckets: DemoEventBucket[] = [];
  const firstHourMs = Math.ceil(startMs / HOUR_MS) * HOUR_MS;
  const lastHourMs = Math.floor(Math.min(endMs, nowMs) / HOUR_MS) * HOUR_MS;

  for (let hourMs = firstHourMs; hourMs <= lastHourMs; hourMs += HOUR_MS) {
    const demand = cafeHourlyFactor(hourMs);
    if (demand <= 0) continue;

    // Slight organic day-over-day growth toward today so previous-period deltas look healthy.
    const daysAgo = Math.max(0, (nowMs - hourMs) / DAY_MS);
    const growthMultiplier = Math.max(0.65, 1.0 - daysAgo * 0.015);
    const hourUtc = formatUtcHour(hourMs);

    for (const publicId of publicIds) {
      const profile = TOUCHPOINT_PROFILES[publicId] ?? { weight: 0.65, revision: "1" };
      const noise = 0.6 + unitNoise(`${publicId}:${hourMs}:base`) * 0.85;
      const totalTaps = Math.max(0, Math.round(demand * profile.weight * growthMultiplier * noise * 2.1));
      if (totalTaps === 0) continue;

      const qrRatio = 0.62 + unitNoise(`${publicId}:${hourMs}:qr`) * 0.12;
      const nfcRatio = 0.24;
      const qrTaps = Math.max(1, Math.round(totalTaps * qrRatio));
      const nfcTaps = Math.max(0, Math.round(totalTaps * nfcRatio));
      const linkTaps = Math.max(0, totalTaps - qrTaps - nfcTaps);

      const channelCounts: Array<[Channel, number]> = [
        ["qr", qrTaps],
        ["nfc", nfcTaps],
        ["link", linkTaps],
      ];

      for (const [channel, taps] of channelCounts) {
        if (taps <= 0) continue;
        buckets.push({
          hourUtc,
          publicId,
          revision: profile.revision,
          eventType: "tap",
          channel,
          total: taps,
        });

        const clickRate = 0.22 + unitNoise(`${publicId}:${hourMs}:${channel}:click`) * 0.18;
        const clicks = Math.round(taps * clickRate);
        if (clicks > 0) {
          buckets.push({
            hourUtc,
            publicId,
            revision: profile.revision,
            eventType: "click",
            channel,
            total: clicks,
          });
        }
      }
    }
  }

  return buckets;
}

/**
 * Local-only synthetic Analytics Engine client used when KARDO_ENV === "local"
 * and Cloudflare Analytics Engine credentials are not configured.
 */
export function createLocalDemoAnalyticsEngineClient(): AnalyticsEngineClient {
  return {
    async query(sql: string): Promise<AnalyticsEngineRow[]> {
      if (/MIN\(timestamp\)\s+AS\s+first/i.test(sql)) {
        return [];
      }

      const publicIds = parsePublicIds(sql);
      if (publicIds.length === 0) {
        return [];
      }

      const nowMs = Date.now();
      const { startMs, endMs } = parseWindow(sql, nowMs);
      const buckets = generateHourlyBuckets(publicIds, startMs, endMs, nowMs);

      const isHourly = /toStartOfInterval/i.test(sql);
      const hasRevision = /blob1\s+AS\s+revision/i.test(sql);
      const hasChannel = /blob3\s+AS\s+channel/i.test(sql);

      if (isHourly) {
        const grouped = new Map<string, AnalyticsEngineRow & { total: number }>();
        for (const b of buckets) {
          const key = hasChannel ? `${b.hourUtc}|${b.eventType}|${b.channel}` : `${b.hourUtc}|${b.eventType}`;
          const existing = grouped.get(key);
          if (existing) {
            existing.total += b.total;
          } else {
            grouped.set(
              key,
              hasChannel
                ? { hour: b.hourUtc, event_type: b.eventType, channel: b.channel, total: b.total }
                : { hour: b.hourUtc, event_type: b.eventType, total: b.total },
            );
          }
        }
        return Array.from(grouped.values()).sort((a, b) =>
          String(a.hour).localeCompare(String(b.hour)),
        );
      }

      // Breakdown by touchpoint
      const grouped = new Map<string, AnalyticsEngineRow & { total: number }>();
      for (const b of buckets) {
        const key = hasRevision
          ? `${b.publicId}|${b.revision}|${b.eventType}|${b.channel}`
          : `${b.publicId}|${b.eventType}|${b.channel}`;
        const existing = grouped.get(key);
        if (existing) {
          existing.total += b.total;
        } else {
          grouped.set(
            key,
            hasRevision
              ? {
                  public_id: b.publicId,
                  revision: b.revision,
                  event_type: b.eventType,
                  channel: b.channel,
                  total: b.total,
                }
              : {
                  public_id: b.publicId,
                  event_type: b.eventType,
                  channel: b.channel,
                  total: b.total,
                },
          );
        }
      }
      return Array.from(grouped.values());
    },
  };
}
