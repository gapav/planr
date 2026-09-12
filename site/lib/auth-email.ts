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

/**
 * The origin for an administrator-issued auth link.
 *
 * A local request must return to the local app even when the environment was
 * copied from production. Non-local requests keep using the configured public
 * origin so proxy host headers cannot choose where a live credential is sent.
 */
export function authLinkSiteUrl(configuredSiteUrl: string | undefined, requestUrl: string): string {
  const requestOrigin = new URL(requestUrl).origin;
  const hostname = new URL(requestOrigin).hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]") return requestOrigin;
  return configuredSiteUrl || requestOrigin;
}

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

/** A branded, table-based shell that remains dependable across email clients. */
function shell({ heading, lead, action, link }: { heading: string; lead: string; action: string; link: string }): string {
  const safeLink = escapeHtml(link);
  return `<!doctype html><html lang="no"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:#f5f2e9;color:#10201d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">En sikker engangslenke fra Grep er klar.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f2e9" style="width:100%;background:#f5f2e9"><tr><td align="center" style="padding:38px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px">
<tr><td bgcolor="#10201d" style="background:#10201d;border-radius:26px 26px 0 0;padding:26px 30px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="42" height="42" align="center" valign="middle" bgcolor="#f0642e" style="width:42px;height:42px;background:#f0642e;border-radius:14px;color:#fff;font-size:22px;font-weight:900;line-height:42px">G</td><td style="padding-left:13px;color:#fff;font-size:25px;font-weight:900;letter-spacing:-.8px">Grep</td></tr></table></td>
<td align="right" valign="middle" style="color:#dbea9c;font-size:11px;font-weight:800;letter-spacing:1.7px;text-transform:uppercase">Trenerrommet</td>
</tr></table></td></tr>
<tr><td bgcolor="#fffefb" style="background:#fffefb;border:1px solid #e4e2da;border-top:0;padding:42px 34px 36px">
<p style="margin:0;color:#f0642e;font-size:12px;font-weight:900;letter-spacing:1.8px;text-transform:uppercase">Laget samlet</p>
<h1 style="margin:13px 0 0;color:#10201d;font-size:32px;line-height:1.12;font-weight:900;letter-spacing:-1.2px">${escapeHtml(heading)}</h1>
<p style="margin:18px 0 0;color:#40514d;font-size:16px;line-height:1.7">${lead}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px"><tr><td align="center" bgcolor="#f0642e" style="background:#f0642e;border-radius:13px"><a href="${safeLink}" style="display:block;padding:16px 24px;color:#fff;font-size:16px;font-weight:800;line-height:1.2;text-decoration:none">${escapeHtml(action)}&nbsp;&nbsp;→</a></td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eef5ef" style="margin-top:28px;background:#eef5ef;border-radius:16px"><tr><td style="padding:17px 19px;color:#31564b;font-size:14px;line-height:1.55"><strong style="color:#10201d">Trygt og enkelt.</strong><br>${plainFooter}</td></tr></table>
<p style="margin:27px 0 0;color:#6b7975;font-size:12px;line-height:1.65">Fungerer ikke knappen? Kopier denne adressen inn i nettleseren:</p><p style="margin:7px 0 0;word-break:break-all;color:#40514d;font-size:12px;line-height:1.6">${safeLink}</p>
</td></tr>
<tr><td bgcolor="#dbea9c" style="height:7px;background:#dbea9c;border-radius:0 0 26px 26px;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td align="center" style="padding:22px 20px 0;color:#77827f;font-size:12px;line-height:1.6">Hvis du ikke ventet denne e-posten, kan du trygt se bort fra den.<br>Grep · laget for trenerrommet</td></tr>
</table></td></tr></table></body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] ?? character));
}
