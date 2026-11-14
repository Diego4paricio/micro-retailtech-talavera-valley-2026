import { StaffValidationError } from "./errors.js";

/** Every list endpoint in Operations paginates on `(timestamp desc, id desc)`
 * — newest first, tie-broken by id — with an opaque base64url cursor so the
 * client never has to know (or trust) the underlying column names. */
export type KeysetCursor = { timestamp: string; id: string };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeKeysetCursor(cursor: KeysetCursor): string {
  return Buffer.from(`${cursor.timestamp}|${cursor.id}`, "utf8").toString(
    "base64url",
  );
}

export function decodeKeysetCursor(token: string): KeysetCursor {
  let decoded: string;
  try {
    decoded = Buffer.from(token, "base64url").toString("utf8");
  } catch {
    throw new StaffValidationError("The pagination cursor is invalid.");
  }
  const separatorIndex = decoded.lastIndexOf("|");
  if (separatorIndex < 0) {
    throw new StaffValidationError("The pagination cursor is invalid.");
  }
  const timestamp = decoded.slice(0, separatorIndex);
  const id = decoded.slice(separatorIndex + 1);
  const parsedDate = new Date(timestamp);
  if (Number.isNaN(parsedDate.getTime()) || !UUID_PATTERN.test(id)) {
    throw new StaffValidationError("The pagination cursor is invalid.");
  }
  return { timestamp, id };
}

/** Default/maximum page sizes shared by every Staff API list endpoint. */
export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export function resolveLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_PAGE_LIMIT;
  return Math.min(Math.max(limit, 1), MAX_PAGE_LIMIT);
}
