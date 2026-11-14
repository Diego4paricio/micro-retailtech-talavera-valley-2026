export const sensitiveLogKeys = [
  "authorization",
  "cookie",
  "password",
  "refresh_token",
  "access_token",
] as const;

export function createRequestId(): string {
  return crypto.randomUUID();
}
