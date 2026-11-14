import type { AskHelp, HelpAnswer } from "@kardo/contracts";
import { apiRequest } from "../lib/api.js";

export const helpApi = {
  /**
   * Only the section, the question and the short history travel: never
   * workspace data (the server has no access to it either).
   */
  ask: (question: AskHelp, signal?: AbortSignal) =>
    apiRequest<HelpAnswer>("/v1/help/ask", {
      method: "POST",
      body: question,
      signal,
    }),
};
