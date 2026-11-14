import { Tooltip as RadixTooltip } from "radix-ui";
import type { ReactNode } from "react";

/** A short, accessible hint anchored to its trigger (a KPI label, an icon…). */
export function Tooltip({
  content,
  children,
}: {
  content: ReactNode;
  children: ReactNode;
}) {
  return (
    <RadixTooltip.Provider delayDuration={250}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content className="kd-tooltip" sideOffset={6}>
            {content}
            <RadixTooltip.Arrow className="kd-tooltip-arrow" />
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  );
}
