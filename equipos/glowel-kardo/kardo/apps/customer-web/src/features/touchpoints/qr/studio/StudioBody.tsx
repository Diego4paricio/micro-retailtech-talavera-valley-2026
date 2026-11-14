import { Tabs } from "radix-ui";
import { type ReactNode, useMemo } from "react";
import { Icon } from "../../../../components/Icon.js";
import { useWorkspace } from "../../../../workspace/WorkspaceContext.js";
import { CanvasStage } from "./CanvasStage.js";
import { useMediaQuery } from "./hooks.js";
import { LegibilityIndicator } from "./Legibility.js";
import type { StudioSectionId } from "./labels.js";
import { DesktopPanel, MobilePanel, SectionRail } from "./PropertiesPanel.js";
import {
  type LibraryBinding,
  StudioContext,
  type StudioContextValue,
} from "./StudioContext.js";
import type { StudioCore } from "./useStudioCore.js";

/** Three zones (rail · stage · panel) from this width; stacked below. */
const wideQuery = "(min-width: 75rem)";

/**
 * The editing surface both editors share: section rail, live stage with
 * mockups and legibility, and the properties panel (an accordion under the
 * pinned preview on small screens).
 */
export function StudioBody({
  core,
  readOnly,
  canManageTemplates,
  alt,
  mockupName,
  previewNote,
  library,
  openSaveTemplate,
}: {
  core: StudioCore;
  readOnly: boolean;
  canManageTemplates: boolean;
  alt: string;
  /** Name shown on the card and poster mockups. */
  mockupName: string;
  previewNote?: ReactNode | undefined;
  library: LibraryBinding | null;
  openSaveTemplate: (() => void) | null;
}) {
  const { workspace } = useWorkspace();
  const isWide = useMediaQuery(wideQuery);
  const {
    design,
    history,
    shownBuild,
    url,
    nombre,
    swatches,
    logoTools,
    assets,
    profile,
    templates,
    canUploadAssets,
    goToSection,
    gate,
    legibility,
    result,
    lastBuild,
    svgUrl,
  } = core;

  const context = useMemo<StudioContextValue>(
    () => ({
      design,
      change: history.update,
      readOnly,
      build: shownBuild,
      url,
      touchpointName: nombre,
      swatches,
      logo: logoTools,
      assets,
      profile,
      templates,
      canManageTemplates,
      canUploadAssets,
      goToSection,
      openSaveTemplate,
      library,
    }),
    [
      design,
      history.update,
      readOnly,
      shownBuild,
      url,
      nombre,
      swatches,
      logoTools,
      assets,
      profile,
      templates,
      canManageTemplates,
      canUploadAssets,
      goToSection,
      openSaveTemplate,
      library,
    ],
  );

  const firstProblem = gate.problems[0];
  const stage = (
    <CanvasStage
      alert={
        firstProblem ? (
          <p className="qrs-stage-problem">
            <Icon name="octagon-alert" size={16} />
            <span>{firstProblem.message}</span>
            {firstProblem.section ? (
              <button
                className="link-button"
                onClick={() => {
                  if (firstProblem.section)
                    goToSection(firstProblem.section as StudioSectionId);
                }}
                type="button"
              >
                Corregir
              </button>
            ) : null}
          </p>
        ) : null
      }
      alt={alt}
      analysis={shownBuild?.analysis ?? null}
      error={!result.ok && !lastBuild ? result.error : null}
      note={previewNote}
      organizationName={workspace.name}
      scene={shownBuild?.scene ?? null}
      status={
        <LegibilityIndicator
          analysis={shownBuild?.analysis ?? null}
          gate={gate}
          legibility={legibility}
          onFix={goToSection}
        />
      }
      svgUrl={svgUrl}
      touchpointName={mockupName}
      transparent={design.background.transparent}
    />
  );

  return (
    <StudioContext.Provider value={context}>
      {isWide ? (
        <Tabs.Root
          activationMode="automatic"
          className="qrs-body qrs-body-wide"
          onValueChange={(value) => core.setSection(value as StudioSectionId)}
          orientation="vertical"
          value={core.section}
        >
          <SectionRail flags={core.flags} />
          <div className="qrs-stage-col">{stage}</div>
          <DesktopPanel readOnly={readOnly} />
        </Tabs.Root>
      ) : (
        <div className="qrs-body qrs-body-stacked">
          {stage}
          <MobilePanel
            flags={core.flags}
            onOpenChange={core.setOpenSection}
            open={core.openSection}
            readOnly={readOnly}
          />
        </div>
      )}
    </StudioContext.Provider>
  );
}
