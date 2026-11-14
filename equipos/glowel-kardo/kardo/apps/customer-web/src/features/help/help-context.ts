import type { HelpSection } from "@kardo/contracts";
import { createContext, useContext } from "react";

export type HelpApi = {
  isOpen: boolean;
  section: HelpSection;
  /** Opens the guide drawer on a section. */
  openHelp: (section: HelpSection) => void;
  closeHelp: () => void;
};

export const HelpContext = createContext<HelpApi | null>(null);

/** The help drawer controls, or `null` outside the workspace shell. */
export function useHelp(): HelpApi | null {
  return useContext(HelpContext);
}
