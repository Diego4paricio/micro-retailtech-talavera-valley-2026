import type {
  CustomerNotificationCategory,
  Notification,
} from "@kardo/contracts";
import type { IconName } from "../../components/Icon.js";
import { parseRoute, type Route } from "../../lib/router.js";

/** How each category reads and looks in the bell (ADR 022). */
export const categoryView: Record<
  CustomerNotificationCategory,
  {
    label: string;
    icon: IconName;
    tone: "info" | "warning" | "success" | "neutral";
  }
> = {
  news: { label: "Novedad", icon: "star", tone: "info" },
  maintenance: { label: "Mantenimiento", icon: "wrench", tone: "warning" },
  account: { label: "Tu cuenta", icon: "profile", tone: "warning" },
  tip: { label: "Consejo", icon: "idea", tone: "success" },
  lead: { label: "Solicitud", icon: "lead", tone: "info" },
};

/** Characters shown before «Ver más». */
export const PREVIEW_CHARS = 140;

/** Long texts, or texts with more than one paragraph, fold. A short one is
 * shown whole, with its button. */
export function needsExpand(notification: Pick<Notification, "body">): boolean {
  return (
    notification.body.length > PREVIEW_CHARS || notification.body.includes("\n")
  );
}

/** One line of the body for the folded view, cut on a word. */
export function previewText(body: string): string {
  const firstParagraph = body.split(/\n+/)[0] ?? "";
  if (firstParagraph.length <= PREVIEW_CHARS) return firstParagraph;
  const cut = firstParagraph.slice(0, PREVIEW_CHARS);
  const space = cut.lastIndexOf(" ");
  return `${(space > 80 ? cut.slice(0, space) : cut).replace(/[,.;:\s]+$/, "")}…`;
}

/** Badge text: up to 9, then «9+». */
export function badgeText(count: number): string {
  return count > 9 ? "9+" : String(count);
}

/** Pinned first, then newest. The API already sorts; this keeps local
 * updates (a read mark) from reordering anything. */
export function sortNotifications(
  items: readonly Notification[],
): Notification[] {
  return [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.publishedAt.localeCompare(a.publishedAt);
  });
}

export function markReadLocally(
  items: readonly Notification[],
  ids: ReadonlySet<string> | "all",
  readAt: string,
): Notification[] {
  return items.map((item) =>
    item.readAt === null && (ids === "all" || ids.has(item.id))
      ? { ...item, readAt }
      : item,
  );
}

/** The route a panel path of a notification opens («/leads?lead=<id>» keeps
 * its id: the router carries it). */
export function routeOfPanelUrl(safeUrl: string): Route {
  const [pathname = "/", search = ""] = safeUrl.split("?");
  return parseRoute({ pathname, search: search ? `?${search}` : "" });
}

/**
 * Follows a panel link of a notification. If the notice belongs to another
 * organization than the one open, it switches to that one first (A2-52).
 */
export function followPanelUrl(
  safeUrl: string,
  options: {
    noticeWorkspaceId: string | null;
    currentWorkspaceId: string | null;
    selectWorkspace?: ((workspaceId: string) => void) | undefined;
    navigate: (route: Route) => void;
  },
): void {
  const { noticeWorkspaceId, currentWorkspaceId } = options;
  if (noticeWorkspaceId && noticeWorkspaceId !== currentWorkspaceId)
    options.selectWorkspace?.(noticeWorkspaceId);
  options.navigate(routeOfPanelUrl(safeUrl));
}
