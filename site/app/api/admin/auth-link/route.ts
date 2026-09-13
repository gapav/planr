import { createClient } from "@supabase/supabase-js";
import { authLinkSiteUrl, type AuthLinkType, confirmLinkUrl, invitationEmail, loginEmail } from "@/lib/auth-email";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";

/**
 * Minting an auth link for a coach and mailing it to them.
 *
 * Two intents share this route because the boundary around them is identical:
 * `invite` creates the account, while `login` mints a fresh magic link for an
 * account that already exists. Both replace a trip
 * to the Supabase dashboard, and neither needs Supabase to send any mail.
 *
 * This is the one privileged route in the app, and the only place a Supabase
 * secret key exists. Everywhere else the browser talks to PostgREST directly
 * and RLS is the authorization boundary — that model cannot reach this, because
 * creating an `auth.users` row is an admin operation by definition. It used to
 * be done by hand in the Supabase dashboard; this replaces those clicks, not
 * the security model around them.
 *
 * The boundary here is therefore explicit and has to be right:
 *
 *   1. The caller's access token is verified by Supabase (`getUser` on a client
 *      carrying their token, *not* the secret key) — a forged or expired token
 *      is rejected by the auth server, not by us.
 *   2. Their global-admin flag and team-admin membership are read through that
 *      same user-scoped client. Nothing in the request body grants authority.
 *   3. Only then does the secret key get used, and only to mint a link.
 *
 * The secret key is never sent to the browser. The response carries the link
 * only when the email did not go out, so the console can offer it for the
 * administrator to pass on by hand; it is a single-use token for that one
 * address. Resend is optional — see the send step below.
 */

const secretKey = process.env.SUPABASE_SECRET_KEY;
const resendApiKey = process.env.RESEND_API_KEY;
const resendFrom = process.env.RESEND_FROM;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

interface AuthLinkRequest { email?: unknown; teamId?: unknown; intent?: unknown }

function bad(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  if (!supabaseUrl || !supabasePublishableKey) return bad("Supabase er ikke satt opp for dette miljøet.", 503);
  if (!secretKey) return bad("SUPABASE_SECRET_KEY mangler, så kontoen kan ikke opprettes.", 503);

  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!accessToken) return bad("Du må være logget inn.", 401);

  // Carries the caller's token, never the secret key: the auth server verifies
  // it, and the follow-up select runs under their own RLS. The token is passed
  // to `getUser` explicitly — the header alone reaches PostgREST but not
  // `getUser`, which without an argument reads a session from storage and finds
  // none here, so every caller would be turned away.
  const asCaller = createClient(supabaseUrl, supabasePublishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: caller, error: callerError } = await asCaller.auth.getUser(accessToken);
  if (callerError || !caller.user) return bad("Innloggingen din har utløpt. Logg inn på nytt.", 401);

  const body = await request.json().catch((): AuthLinkRequest => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const teamId = typeof body.teamId === "string" ? body.teamId : "";
  const intent = body.intent === "login" ? "login" : "invite";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad("Skriv en gyldig e-postadresse.", 400);

  const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile } = await asCaller.from("profiles").select("is_global_admin").eq("id", caller.user.id).single();
  const isGlobalAdmin = profile?.is_global_admin === true;

  let teamName = "laget";
  let invitationToken: string | null = null;
  if (intent === "invite") {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(teamId)) return bad("Laget mangler eller er ugyldig.", 400);
    const { data: membership } = await asCaller.from("team_memberships").select("role").eq("team_id", teamId).eq("profile_id", caller.user.id).eq("role", "admin").maybeSingle();
    if (!isGlobalAdmin && !membership) return bad("Bare lagadministratoren kan invitere trenere til dette laget.", 403);

    // A mail may only be minted for a seat that already exists. This prevents
    // the privileged auth endpoint from becoming a general-purpose mailer or
    // account-creation endpoint for somebody who happens to administer a team.
    const { data: invitation } = await admin.from("team_invitations")
      .select("token")
      .eq("team_id", teamId)
      .eq("email", email)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!invitation) return bad("Opprett invitasjonen før innloggingslenken sendes.", 409);
    invitationToken = invitation.token;
    const { data: team } = await admin.from("teams").select("name").eq("id", teamId).single();
    // The full name, not `shortTeamName`: that abbreviation is for dense admin
    // lists, and "Du er invitert til G16" drops the club the coach would recognize.
    teamName = team?.name?.trim() || "laget";
  } else if (!isGlobalAdmin) {
    return bad("Bare en systemadministrator kan sende en ny innloggingslenke til en eksisterende trener.", 403);
  }

  // `invite` creates a new account; an address that already exists gets the
  // same passwordless experience through `magiclink`. Both links establish a
  // browser session and then continue to the reserved team seat.
  let type: AuthLinkType = intent === "login" ? "magiclink" : "invite";
  let generated = await admin.auth.admin.generateLink({ type, email });
  if (intent === "invite" && generated.error && isAlreadyRegistered(generated.error.message)) {
    type = "magiclink";
    generated = await admin.auth.admin.generateLink({ type, email });
  }
  if (generated.error || !generated.data.properties?.hashed_token) {
    return bad(generated.error?.message ?? "Lenken kunne ikke lages.", 502);
  }

  const next = invitationToken ? `/invite/${invitationToken}` : "/sessions";
  const link = confirmLinkUrl(authLinkSiteUrl(siteUrl, request.url), generated.data.properties.hashed_token, type, next);

  // Sending is optional. Minting the link is this route's job; delivering it is
  // a convenience on top, and a project with no verified sending domain — or no
  // Resend account at all — is a perfectly workable setup where the
  // administrator passes the link on themselves. Refusing to mint because the
  // mailer is absent would break the whole feature to protect a nicety.
  if (!resendApiKey || !resendFrom) {
    return Response.json({ link, emailed: false, emailError: "E-post er ikke satt opp, så lenken må sendes til treneren manuelt." });
  }

  const { subject, html, text } = intent === "login"
    ? loginEmail({ link })
    : invitationEmail({ teamName, link });

  const sent = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: resendFrom, to: [email], subject, html, text }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);

  if (!sent?.ok) {
    const detail = await sent?.json().then((payload: { message?: string }) => payload.message).catch(() => null);
    // The account exists either way, so the link comes back rather than being
    // lost with the failed send.
    return Response.json({ link, emailed: false, emailError: detail ?? "E-posten kunne ikke sendes." });
  }

  // Withheld on success: it is a live single-use credential and the email
  // already carries it.
  return Response.json({ emailed: true, emailError: null, newAccount: type === "invite" });
}

function isAlreadyRegistered(message: string) {
  return /already been registered|already registered|already exists/i.test(message);
}
