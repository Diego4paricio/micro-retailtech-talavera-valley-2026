import {
  isPanelActionUrl,
  type Notification,
  normalizeNotificationActionUrl,
} from "@kardo/contracts";
import { type MouseEvent, useId, useState } from "react";
import { Icon } from "../../components/Icon.js";
import { formatDateTime, formatRelative } from "../../lib/format.js";
import type { Route } from "../../lib/router.js";
import {
  categoryView,
  followPanelUrl,
  needsExpand,
  previewText,
} from "./model.js";

/**
 * One notification (ADR 022): folded to a line, «Ver más» opens it whole.
 * Expanding it, following its button or «Marcar como leída» marks it read;
 * just seeing it in the list does not. Plain text only: never HTML.
 */
export function NotificationItem({
  notification,
  onRead,
  onNavigate,
  navigate,
  currentWorkspaceId = null,
  onSelectWorkspace,
  variant = "bell",
}: {
  notification: Notification;
  onRead: (notification: Notification) => void;
  /** The router's navigate (passed in so the item renders without one). */
  navigate: (route: Route) => void;
  /** The organization open now. A panel link of a notice for another one
   * switches to it first (A2-52). */
  currentWorkspaceId?: string | null;
  onSelectWorkspace?: ((workspaceId: string) => void) | undefined;
  /** Called after following a panel link (the bell closes). */
  onNavigate?: (() => void) | undefined;
  variant?: "bell" | "page";
}) {
  const view = categoryView[notification.category];
  const expandable = needsExpand(notification);
  const [expanded, setExpanded] = useState(false);
  const textId = useId();
  const unread = notification.readAt === null;
  const isOpen = expanded || !expandable;

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && unread) onRead(notification);
  }

  return (
    <article
      aria-labelledby={`${textId}-title`}
      className={`notif-item notif-item-${variant}${unread ? " is-unread" : ""}`}
    >
      <span aria-hidden="true" className={`notif-icon tone-${view.tone}`}>
        <Icon name={view.icon} size={16} />
      </span>
      <div className="notif-content">
        <p className="notif-meta">
          <span className="notif-category">{view.label}</span>
          {notification.pinned ? (
            <span className="notif-pinned">
              <Icon name="pin" size={12} />
              Fijada
            </span>
          ) : null}
          {notification.workspace ? (
            <span className="notif-workspace" title="Para esta organización">
              {notification.workspace.name}
            </span>
          ) : null}
          <time
            dateTime={notification.publishedAt}
            title={formatDateTime(notification.publishedAt)}
          >
            {formatRelative(notification.publishedAt)}
          </time>
        </p>
        <h3 className="notif-title" id={`${textId}-title`}>
          {notification.title}
        </h3>
        {isOpen ? (
          <div className="notif-text" id={`${textId}-text`}>
            {notification.body.split(/\n{2,}/).map((paragraph, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: paragraphs of a fixed text
              <p key={index}>{paragraph}</p>
            ))}
            {notification.editedAt ? (
              <p className="notif-edited">
                Editada {formatRelative(notification.editedAt)}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="notif-preview">{previewText(notification.body)}</p>
        )}
        {(isOpen && notification.action) || expandable ? (
          <div className="notif-actions">
            {isOpen && notification.action ? (
              <ActionLink
                label={notification.action.label}
                onOpenPanel={(url) =>
                  followPanelUrl(url, {
                    noticeWorkspaceId: notification.workspace?.id ?? null,
                    currentWorkspaceId,
                    selectWorkspace: onSelectWorkspace,
                    navigate,
                  })
                }
                onFollow={() => {
                  if (unread) onRead(notification);
                  onNavigate?.();
                }}
                url={notification.action.url}
              />
            ) : null}
            {expandable ? (
              <button
                aria-controls={isOpen ? `${textId}-text` : undefined}
                aria-expanded={expanded}
                className="notif-toggle"
                onClick={toggle}
                type="button"
              >
                {expanded ? "Ver menos" : "Ver más"}
                <Icon name="chevron-down" size={14} />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {unread ? (
        <button
          aria-label={`Marcar como leída: ${notification.title}`}
          className="notif-mark"
          onClick={() => onRead(notification)}
          title="Marcar como leída"
          type="button"
        >
          <span aria-hidden="true" className="notif-dot" />
          <Icon name="check" size={14} />
        </button>
      ) : null}
    </article>
  );
}

/** A panel path opens here; an https address, in a new tab. Anything else
 * (the server already refuses it) is not rendered as a link at all. */
function ActionLink({
  label,
  url,
  onFollow,
  onOpenPanel,
}: {
  label: string;
  url: string;
  onFollow: () => void;
  /** Opens a panel path (switching organization first when it is needed). */
  onOpenPanel: (url: string) => void;
}) {
  const safe = normalizeNotificationActionUrl(url);
  if (!safe) return null;

  if (isPanelActionUrl(safe)) {
    const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        onFollow();
        return;
      }
      event.preventDefault();
      onFollow();
      onOpenPanel(safe);
    };
    return (
      <a
        className="button button-secondary button-small"
        href={safe}
        onClick={onClick}
      >
        {label}
        <Icon name="arrow-right" size={14} />
      </a>
    );
  }

  return (
    <a
      className="button button-secondary button-small"
      href={safe}
      onClick={onFollow}
      rel="noopener noreferrer"
      target="_blank"
    >
      {label}
      <Icon name="external" size={14} />
    </a>
  );
}
