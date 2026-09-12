/**
 * The one envelope every Grep email arrives in.
 *
 * Extracted from `auth-email.ts` when the morning digest became the second
 * thing we send: two hand-maintained copies of table-based email markup would
 * have drifted within a month, and a coach should not be able to tell from the
 * chrome whether a letter came from the invite flow or the scheduler.
 *
 * It stays deliberately old-fashioned — nested tables, inline styles, no
 * external CSS — because that is what survives Outlook, Gmail's clipper and a
 * ten-year-old phone. Dark mode is opted out of (`color-scheme: light only`)
 * rather than designed for; a mail client inverting a palette it does not
 * understand looks worse than a light letter on a dark screen.
 */

export interface EmailAction { label: string; link: string }

export interface EmailShellOptions {
  /** The grey line beside the subject in an inbox list. Never rendered. */
  preheader: string;
  /** The small orange line above the heading. */
  eyebrow: string;
  heading: string;
  /** Already-escaped HTML: the lead paragraph carries `<strong>` in places. */
  lead: string;
  /** Already-escaped HTML placed between the lead and the button. */
  body?: string;
  action?: EmailAction;
  /** The pale green box under the button. */
  note?: { title: string; text: string };
  /** Repeats the link as selectable text — for a one-time credential a button alone can lose. */
  showPlainLink?: boolean;
  /** The small print under the card. */
  footer?: string;
}

const DEFAULT_FOOTER = "Hvis du ikke ventet denne e-posten, kan du trygt se bort fra den.<br>Grep · laget for trenerrommet";

export function emailShell({ preheader, eyebrow, heading, lead, body, action, note, showPlainLink, footer }: EmailShellOptions): string {
  const safeLink = action ? escapeHtml(action.link) : "";
  const button = action
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px"><tr><td align="center" bgcolor="#f0642e" style="background:#f0642e;border-radius:13px"><a href="${safeLink}" style="display:block;padding:16px 24px;color:#fff;font-size:16px;font-weight:800;line-height:1.2;text-decoration:none">${escapeHtml(action.label)}&nbsp;&nbsp;→</a></td></tr></table>`
    : "";
  const noteBox = note
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eef5ef" style="margin-top:28px;background:#eef5ef;border-radius:16px"><tr><td style="padding:17px 19px;color:#31564b;font-size:14px;line-height:1.55"><strong style="color:#10201d">${escapeHtml(note.title)}</strong><br>${escapeHtml(note.text)}</td></tr></table>`
    : "";
  const plainLink = showPlainLink && action
    ? `<p style="margin:27px 0 0;color:#6b7975;font-size:12px;line-height:1.65">Fungerer ikke knappen? Kopier denne adressen inn i nettleseren:</p><p style="margin:7px 0 0;word-break:break-all;color:#40514d;font-size:12px;line-height:1.6">${safeLink}</p>`
    : "";
  return `<!doctype html><html lang="no"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:#f5f2e9;color:#10201d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f2e9" style="width:100%;background:#f5f2e9"><tr><td align="center" style="padding:38px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px">
<tr><td bgcolor="#10201d" style="background:#10201d;border-radius:26px 26px 0 0;padding:26px 30px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="42" height="42" align="center" valign="middle" bgcolor="#f0642e" style="width:42px;height:42px;background:#f0642e;border-radius:14px;color:#fff;font-size:22px;font-weight:900;line-height:42px">G</td><td style="padding-left:13px;color:#fff;font-size:25px;font-weight:900;letter-spacing:-.8px">Grep</td></tr></table></td>
<td align="right" valign="middle" style="color:#dbea9c;font-size:11px;font-weight:800;letter-spacing:1.7px;text-transform:uppercase">Trenerrommet</td>
</tr></table></td></tr>
<tr><td bgcolor="#fffefb" style="background:#fffefb;border:1px solid #e4e2da;border-top:0;padding:42px 34px 36px">
<p style="margin:0;color:#f0642e;font-size:12px;font-weight:900;letter-spacing:1.8px;text-transform:uppercase">${escapeHtml(eyebrow)}</p>
<h1 style="margin:13px 0 0;color:#10201d;font-size:32px;line-height:1.12;font-weight:900;letter-spacing:-1.2px">${escapeHtml(heading)}</h1>
<p style="margin:18px 0 0;color:#40514d;font-size:16px;line-height:1.7">${lead}</p>
${body ?? ""}${button}${noteBox}
${plainLink}
</td></tr>
<tr><td bgcolor="#dbea9c" style="height:7px;background:#dbea9c;border-radius:0 0 26px 26px;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td align="center" style="padding:22px 20px 0;color:#77827f;font-size:12px;line-height:1.6">${footer ?? DEFAULT_FOOTER}</td></tr>
</table></td></tr></table></body></html>`;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] ?? character));
}
