import { emailShell, escapeHtml } from "./email-shell";

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

/** The shared envelope, with the one-time-link furniture every auth mail wants. */
function shell({ heading, lead, action, link }: { heading: string; lead: string; action: string; link: string }): string {
  return emailShell({
    preheader: "En sikker engangslenke fra Grep er klar.",
    eyebrow: "Laget samlet",
    heading,
    lead,
    action: { label: action, link },
    note: { title: "Trygt og enkelt.", text: plainFooter },
    // A single-use credential has to survive a client that strips the button.
    showPlainLink: true,
  });
}
