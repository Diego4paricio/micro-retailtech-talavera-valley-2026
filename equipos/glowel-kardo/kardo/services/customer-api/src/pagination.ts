import { InvalidCursorError } from "./errors.js";

export type LeadCursor = { createdAt: string; id: string };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Opaque, base64url-encoded `(createdAt, id)` cursor for lead pagination.
 * Callers never see the raw pair; they only round-trip the token this
 * encodes. */
export function encodeLeadCursor(cursor: LeadCursor): string {
  return Buffer.from(`${cursor.createdAt}|${cursor.id}`, "utf8").toString(
    "base64url",
  );
}

export function decodeLeadCursor(token: string): LeadCursor {
  let decoded: string;
  try {
    decoded = Buffer.from(token, "base64url").toString("utf8");
  } catch {
    throw new InvalidCursorError();
  }
  const separatorIndex = decoded.lastIndexOf("|");
  if (separatorIndex < 0) throw new InvalidCursorError();
  const createdAt = decoded.slice(0, separatorIndex);
  const id = decoded.slice(separatorIndex + 1);
  const parsedDate = new Date(createdAt);
  if (Number.isNaN(parsedDate.getTime()) || !UUID_PATTERN.test(id)) {
    throw new InvalidCursorError();
  }
  return { createdAt, id };
}
