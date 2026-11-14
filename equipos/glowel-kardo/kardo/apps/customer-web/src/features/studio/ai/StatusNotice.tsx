import { Notice } from "../../../components/Notice.js";
import { type KardoAiState, kardoAiStatusMessage } from "../html/kardo-ai.js";

/**
 * The one «sin IA» notice of every AI surface (blocks rail, html-block
 * dialog and modo HTML): no key, no quota, no plan, too many requests, page
 * gone. The words come from `kardoAiStatusMessage`, which knows whether this
 * type of page has a modo HTML to point to (domain audit A2-38). Renders
 * nothing for `idle`, `running` or `done` (each surface shows those on its
 * own).
 */
export function AiStatusNotice({
  status,
  message,
  htmlMode,
}: {
  status: KardoAiState["status"];
  /** Only read for `status === "error"`. */
  message?: string | undefined;
  /** Whether this type of page has a modo HTML (`supportsCustomHtml`). */
  htmlMode: boolean;
}) {
  const notice = kardoAiStatusMessage({ status, message }, htmlMode);
  return notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null;
}
