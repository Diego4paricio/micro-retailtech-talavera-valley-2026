import {
  type AccountSession,
  type AccountSignIn,
  type CustomerProfile,
  legalVersions,
} from "@kardo/contracts";

/**
 * Demo mode for «Tu cuenta» (ADR 023): a profile that keeps its
 * preferences, three open sessions and a short sign-in history. Nothing
 * leaves the browser.
 */
const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();

const currentSessionId = "8c1f2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";

const profile: CustomerProfile = {
  subject: "e6abf26a-3263-4149-9d75-9b7441165d29",
  email: "demo@kardo.test",
  displayName: "Mariana Ríos",
  termsAcceptedAt: minutesAgo(60 * 24),
  termsVersion: legalVersions.terms,
  privacyVersion: legalVersions.privacy,
  preferredName: "Mariana",
  timeZone: null,
  hourCycle: null,
  locale: "es-MX",
  marketingEmails: false,
};

let sessions: AccountSession[] = [
  {
    id: currentSessionId,
    createdAt: minutesAgo(60 * 5),
    lastActiveAt: minutesAgo(1),
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    ip: "189.203.44.17",
    current: true,
    secondFactor: false,
  },
  {
    id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
    createdAt: minutesAgo(60 * 26),
    lastActiveAt: minutesAgo(60 * 3),
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
    ip: "187.190.12.8",
    current: false,
    secondFactor: false,
  },
  {
    id: "2b3c4d5e-6f70-4b8c-9d0e-1f2a3b4c5d6e",
    createdAt: minutesAgo(60 * 24 * 6),
    lastActiveAt: minutesAgo(60 * 24 * 2),
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.0.0",
    ip: "201.141.90.33",
    current: false,
    secondFactor: false,
  },
];

const signIns: AccountSignIn[] = [
  [5 * 60, 0],
  [26 * 60, 1],
  [3 * 24 * 60, 0],
  [6 * 24 * 60, 2],
  [12 * 24 * 60, 0],
  [33 * 24 * 60, 1],
].map(([minutes, device], index) => ({
  id: `0000000${index}-aaaa-4bbb-8ccc-dddddddddddd`,
  signedInAt: minutesAgo(minutes ?? 0),
  userAgent: sessions[device ?? 0]?.userAgent ?? null,
  ip: sessions[device ?? 0]?.ip ?? null,
}));

export function handleAccountDemo(
  path: string,
  method: string,
  body: Record<string, unknown>,
): unknown {
  if (path === "/v1/me/profile" && method === "GET") return profile;
  if (path === "/v1/me/profile" && method === "PATCH") {
    for (const key of [
      "displayName",
      "preferredName",
      "timeZone",
      "hourCycle",
      "marketingEmails",
    ] as const)
      if (key in body) Object.assign(profile, { [key]: body[key] });
    return profile;
  }
  if (path === "/v1/me/sessions" && method === "GET")
    return { items: sessions };
  if (path === "/v1/me/sessions/close-others" && method === "POST") {
    const closed = sessions.filter((session) => !session.current).length;
    sessions = sessions.filter((session) => session.current);
    return { closed };
  }
  const close = /^\/v1\/me\/sessions\/([^/]+)$/.exec(path);
  if (close && method === "DELETE") {
    const before = sessions.length;
    sessions = sessions.filter((session) => session.id !== close[1]);
    return { closed: before - sessions.length };
  }
  if (path === "/v1/me/sign-ins" && method === "GET")
    return { items: signIns, days: 90 };
  return undefined;
}
