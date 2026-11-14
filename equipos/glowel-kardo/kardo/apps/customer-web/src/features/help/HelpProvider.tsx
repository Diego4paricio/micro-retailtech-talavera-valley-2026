import type { HelpSection } from "@kardo/contracts";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { HelpDrawer } from "./HelpDrawer.js";
import { HelpContext } from "./help-context.js";

/**
 * Owns the help drawer for the workspace shell. Any descendant can open it
 * with `useHelp()?.openHelp(section)` or simply render `<HelpButton />`.
 */
export function HelpProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [section, setSection] = useState<HelpSection>("general");

  const openHelp = useCallback((next: HelpSection) => {
    setSection(next);
    setIsOpen(true);
  }, []);
  const closeHelp = useCallback(() => setIsOpen(false), []);

  const value = useMemo(
    () => ({ isOpen, section, openHelp, closeHelp }),
    [isOpen, section, openHelp, closeHelp],
  );

  return (
    <HelpContext.Provider value={value}>
      {children}
      <HelpDrawer
        onClose={closeHelp}
        onSectionChange={setSection}
        open={isOpen}
        section={section}
      />
    </HelpContext.Provider>
  );
}
