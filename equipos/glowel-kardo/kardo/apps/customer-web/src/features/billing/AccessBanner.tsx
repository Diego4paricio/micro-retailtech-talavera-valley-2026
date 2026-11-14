import { type ReactNode, useState } from "react";
import { Icon } from "../../components/Icon.js";
import { useToast } from "../../components/Toast.js";
import { Link } from "../../lib/router.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { useOrganizationExport } from "../organization/use-export.js";
import { useAccess } from "./access-context.js";
import {
  askOwnerText,
  type AccessBanner as Banner,
  bannerFor,
  pricingUrl,
} from "./access-model.js";
import "./access.css";

/** Presentational strip: one compact line, or two on a phone. */
export function AccessBannerView({
  banner,
  canManage,
  pricingHref,
  exporting = false,
  onDownload,
  onDismiss,
  chooseAction = null,
}: {
  banner: Banner;
  canManage: boolean;
  pricingHref: string;
  exporting?: boolean;
  onDownload?: () => void;
  /** When set, a «×» closes the strip for this session (only the informational
   * trial countdown, which otherwise repeats on every section — round 4). */
  onDismiss?: (() => void) | undefined;
  /** «Elegir» for an organization left out of the plan (needs the router). */
  chooseAction?: ReactNode;
}) {
  return (
    <div className={`access-strip access-strip-${banner.tone}`} role="status">
      <p>{banner.text}</p>
      <div className="access-strip-actions">
        {banner.download ? (
          <button
            aria-busy={exporting || undefined}
            className="button button-secondary button-small"
            disabled={exporting}
            onClick={onDownload}
            type="button"
          >
            Descargar
          </button>
        ) : null}
        {banner.viewPlans ? (
          <a className="button button-primary button-small" href={pricingHref}>
            Ver planes
          </a>
        ) : null}
        {banner.chooseExcluded && canManage ? chooseAction : null}
        {banner.choosePlan ? (
          canManage ? (
            <a
              className="button button-primary button-small"
              href={pricingHref}
            >
              Elegir plan
            </a>
          ) : (
            <span className="access-strip-hint">{askOwnerText}</span>
          )
        ) : null}
        {onDismiss ? (
          <button
            aria-label="Ocultar este aviso"
            className="access-strip-close"
            onClick={onDismiss}
            title="Ocultar"
            type="button"
          >
            <Icon name="close" size={15} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

// Remembered only for this tab (sessionStorage): the trial countdown is just
// information, so once the person closes it we keep it closed until the tab is
// gone — but it comes back if its text changes (a new day-count, a new state).
const dismissKey = (workspaceId: string) =>
  `kardo-access-banner-dismissed:${workspaceId}`;

function readDismissed(workspaceId: string): string | null {
  try {
    return window.sessionStorage.getItem(dismissKey(workspaceId));
  } catch {
    return null;
  }
}

/**
 * Global strip under the top bar. Nothing while the access loads or if its
 * read failed: the panel is never blocked by it.
 */
export function AccessBanner() {
  const { workspace, can } = useWorkspace();
  const { access } = useAccess();
  const { notify } = useToast();
  const [dismissed, setDismissed] = useState(() => readDismissed(workspace.id));
  const exporter = useOrganizationExport(workspace, (message) =>
    notify(message, "error"),
  );
  const banner = bannerFor(access, {
    canExport: can("workspace.manage"),
  });
  if (!banner || !access) return null;
  // Only the informational trial strip is dismissible; a warning that asks for
  // an action (no plan, paused, deletion) always stays.
  const dismissible = banner.tone === "info";
  if (dismissible && dismissed === banner.text) return null;
  const onDismiss = dismissible
    ? () => {
        try {
          window.sessionStorage.setItem(dismissKey(workspace.id), banner.text);
        } catch {
          // A private window may refuse storage; just hide it for now.
        }
        setDismissed(banner.text);
      }
    : undefined;
  return (
    <AccessBannerView
      banner={banner}
      canManage={access.canManage}
      exporting={exporter.busy}
      onDismiss={onDismiss}
      onDownload={() => void exporter.download()}
      chooseAction={
        <Link
          className="button button-primary button-small"
          to={{ name: "settings", section: "plan" }}
        >
          Elegir
        </Link>
      }
      pricingHref={pricingUrl(workspace.id)}
    />
  );
}
