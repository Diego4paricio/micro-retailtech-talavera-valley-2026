import type { CustomerWorkspace } from "@kardo/contracts";
import { useWorkspaceProfile } from "../features/business-profile/profile-store.js";
import { useAssetImage } from "../lib/asset-images.js";

/**
 * The active organization's mark: its logo (Configuración → Marca) when it
 * has one, the first letter of its name otherwise (2026-10-03). The side
 * menu and the top bar show the same one (domain audit A2-74); both read the
 * shared business profile, so a new logo shows up in both at once.
 */
export function WorkspaceMark({
  workspace,
  className = "workspace-mark",
}: {
  workspace: CustomerWorkspace;
  className?: string;
}) {
  const profile = useWorkspaceProfile();
  const logo = useAssetImage(
    workspace.id,
    profile.data?.logoAssetId ?? undefined,
    "thumb",
  );
  return (
    <span
      aria-hidden="true"
      className={className}
      data-logo={logo.url ? "" : undefined}
    >
      {logo.url ? (
        <img alt="" decoding="async" src={logo.url} />
      ) : (
        workspace.name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
