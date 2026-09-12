/**
 * The emails an administrator sends from `/admin`, and the links inside them.
 *
 * Supabase's own `action_link` goes through `/auth/v1/verify`, which answers a
 * dashboard-generated link with an implicit `#access_token=…` fragment that
 * `createBrowserClient` rejects outright — the whole reason `app/auth/confirm`
 * exists. `generateLink` hands back the raw `hashed_token` alongside that link,
 * so the link is built here instead and points straight at the page that can
 * verify a token hash. Nothing in the Supabase dashboard is involved: no email
 * template, no redirect allow-list entry, no SMTP.
 */

/** The link types `app/auth/confirm` knows how to verify. */
export type AuthLinkType = "invite" | "magiclink" | "recovery";

export function confirmLinkUrl(siteUrl: string, tokenHash: string, type: AuthLinkType, next?: string): string {
  const destination = next ? `&next=${encodeURIComponent(next)}` : "";
  return `${siteUrl.replace(/\/+$/, "")}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=${type}${destination}`;
}

export interface AuthEmail { subject: string; html: string; text: string }

/**
 * What lands in the coach's inbox when they are invited.
 *
 * A new account and an existing account deliberately read the same here. Both
 * links establish a long-lived browser session; neither coach needs a password.
 */
export function invitationEmail({ teamName, link }: { teamName: string; link: string }): AuthEmail {
  return {
    subject: `Du er invitert til ${teamName} i Grep`,
    html: shell({
      heading: "Velkommen til trenerrommet",
      lead: `Du er invitert som trener for <strong>${escapeHtml(teamName)}</strong> i Grep. Åpne den sikre engangslenken for å logge inn og bli med på laget.`,
      action: "Logg inn og bli med",
      link,
    }),
    text: `Du er invitert som trener for ${teamName} i Grep. Åpne den sikre engangslenken for å logge inn og bli med på laget.\n\n${link}\n\n${plainFooter}`,
  };
}

/** A fresh passwordless sign-in link sent to an existing coach by an admin. */
export function loginEmail({ link }: { link: string }): AuthEmail {
  return {
    subject: "Logg inn på Grep",
    html: shell({
      heading: "Logg inn på Grep",
      lead: "Åpne den sikre engangslenken for å logge inn. Nettleseren husker deg, så du trenger vanligvis ikke en ny e-post neste gang.",
      action: "Logg inn på Grep",
      link,
    }),
    text: `Åpne den sikre engangslenken for å logge inn på Grep. Nettleseren husker deg, så du trenger vanligvis ikke en ny e-post neste gang.\n\n${link}\n\n${plainFooter}`,
  };
}

/**
 * The email an administrator sends a coach who cannot get in.
 *
 * `recovery` is the same `generateLink` call the invitation uses, and lands on
 * the same page — `app/auth/confirm` forwards a recovery link to
 * `/account/password`. So resetting a password needs no Supabase SMTP, no
 * template and no trip to the dashboard, exactly like inviting.
 */
export function passwordResetEmail({ link }: { link: string }): AuthEmail {
  return {
    subject: "Velg et nytt passord i Grep",
    html: shell({
      heading: "Velg et nytt passord",
      lead: "Lagadministratoren har sendt deg en lenke for å velge et nytt passord i Grep. Trykk på knappen under, så velger du det selv.",
      action: "Velg nytt passord",
      link,
    }),
    text: `Lagadministratoren har sendt deg en lenke for å velge et nytt passord i Grep.\n\n${link}\n\n${plainFooter}`,
  };
}

const plainFooter = "Lenken virker én gang og utløper etter en stund. Virker den ikke lenger, be om en ny.";

/** One table-based shell, because every mail client renders those the same. */
function shell({ heading, lead, action, link }: { heading: string; lead: string; action: string; link: string }): string {
  const safeLink = escapeHtml(link);
  return `<!doctype html><html lang="no"><body style="margin:0;background:#f6f5f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#10201d">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f1;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fffefb;border:1px solid #e4e2da;border-radius:24px;padding:36px">
<tr><td style="font-size:13px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#f0642e">Grep</td></tr>
<tr><td style="padding-top:18px;font-size:28px;font-weight:800;letter-spacing:-.03em;line-height:1.15">${escapeHtml(heading)}</td></tr>
<tr><td style="padding-top:16px;font-size:16px;line-height:1.7;color:#4a5754">${lead}</td></tr>
<tr><td style="padding-top:28px"><a href="${safeLink}" style="display:inline-block;background:#f0642e;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;padding:14px 24px;border-radius:12px">${escapeHtml(action)}</a></td></tr>
<tr><td style="padding-top:28px;font-size:13px;line-height:1.7;color:#6b7975">${plainFooter}<br><br>Fungerer ikke knappen? Kopier denne adressen inn i nettleseren:<br><span style="word-break:break-all;color:#4a5754">${safeLink}</span></td></tr>
</table></td></tr></table></body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] ?? character));
}
