import { customerRoleText } from "@kardo/domain";
/**
 * Optional transactional email for workspace invitations (Resend). Sending
 * never blocks or fails the invitation itself: the panel always receives the
 * one-time link and falls back to sharing it manually when `send` returns
 * false.
 */
export type InvitationEmail = {
  to: string;
  workspaceName: string;
  inviterName: string | null;
  role: "admin" | "editor" | "viewer";
  /** `{origin}/invite#token=…` — the token stays in the URL fragment so it
   * never reaches server logs or Referer headers. */
  acceptUrl: string;
  expiresAt: string;
};

export type InvitationMailer = {
  readonly enabled: boolean;
  send(email: InvitationEmail): Promise<boolean>;
};

export const disabledInvitationMailer: InvitationMailer = {
  enabled: false,
  send: async () => false,
};

export function createResendInvitationMailer(input: {
  apiKey: string;
  from: string;
  fetchFn?: typeof fetch;
  onError?: (error: unknown) => void;
}): InvitationMailer {
  const fetchFn = input.fetchFn ?? fetch;
  return {
    enabled: true,
    async send(email) {
      // Reserved TLDs (RFC 2606/6761) never receive mail; sending would only
      // bounce and hurt the sender domain's reputation (E2E accounts use them).
      if (isUndeliverable(email.to)) return false;
      const { subject, html, text } = renderInvitationEmail(email);
      try {
        const response = await fetchFn("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            authorization: `Bearer ${input.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            from: input.from,
            to: [email.to],
            subject,
            html,
            text,
          }),
          signal: AbortSignal.timeout(8_000),
        });
        await response.body?.cancel();
        return response.ok;
      } catch (error) {
        input.onError?.(error);
        return false;
      }
    },
  };
}

export function isUndeliverable(address: string): boolean {
  const domain = address.split("@").at(-1)?.toLowerCase() ?? "";
  return (
    /(^|\.)(test|example|invalid|localhost)$/.test(domain) ||
    /(^|\.)example\.(com|net|org)$/.test(domain)
  );
}

/** Names the customer writes go into the subject and the body of an email
 * sent from Kardo's domain: one line, no control characters, short. */
export function emailSafeName(value: string, maxLength = 80): string {
  const line = value
    .replace(/[\p{Cc}\u2028\u2029]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return line.length > maxLength ? `${line.slice(0, maxLength - 1)}…` : line;
}

export function renderInvitationEmail(email: InvitationEmail): {
  subject: string;
  html: string;
  text: string;
} {
  const inviter =
    emailSafeName(email.inviterName ?? "") || "Un miembro del equipo";
  const workspace = emailSafeName(email.workspaceName) || "una organización";
  // The same role names as the panel (domain audit A2-15).
  const role = customerRoleText[email.role].label;
  const expires = new Date(email.expiresAt).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const subject = `${inviter} te invitó a ${workspace} en Kardo`;
  const text = [
    `${inviter} te invitó a colaborar en ${workspace} en Kardo como ${role}.`,
    "",
    `Acepta la invitación: ${email.acceptUrl}`,
    "",
    `El enlace vence el ${expires}. Si no esperabas esta invitación, ignora este correo.`,
  ].join("\n");
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f3f0e8;font-family:Arial,sans-serif;color:#08293d">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fffefa;border-radius:16px;padding:32px">
<tr><td>
<p style="margin:0 0 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#0d637d">Kardo</p>
<h1 style="margin:0 0 16px;font-size:24px;line-height:1.2">Te invitaron a ${escapeHtml(workspace)}</h1>
<p style="margin:0 0 24px;font-size:16px;line-height:1.5">${escapeHtml(inviter)} te invitó a colaborar como <strong>${role}</strong>.</p>
<p style="margin:0 0 24px"><a href="${escapeHtml(email.acceptUrl)}" style="display:inline-block;background:#08293d;color:#fffefa;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:bold">Aceptar invitación</a></p>
<p style="margin:0;font-size:13px;line-height:1.5;color:#516a72">El enlace vence el ${escapeHtml(expires)}. Si no esperabas esta invitación, ignora este correo.</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject, html, text };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
