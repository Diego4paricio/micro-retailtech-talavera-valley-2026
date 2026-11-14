/**
 * In-app help: curated guides per section + "Pregúntale a Kardo".
 *
 *   import { HelpButton } from "../help/index.js";
 *   <HelpButton section="touchpoints" />            // "Ayuda"
 *   <HelpButton section="links" label="¿Qué es un Link?" />
 *
 * The HelpProvider (with its drawer) is mounted once in the workspace shell.
 */
export { AnswerText } from "./AnswerText.js";
export {
  getHelpGuide,
  type HelpConcept,
  type HelpGuide,
  type HelpTask,
  helpGuides,
} from "./guides.js";
export { HelpButton } from "./HelpButton.js";
export { HelpDrawer } from "./HelpDrawer.js";
export { HelpProvider } from "./HelpProvider.js";
export { type HelpApi, useHelp } from "./help-context.js";
export { helpSectionForRoute, helpTopics } from "./sections.js";
