import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { authLinkSiteUrl } from "@/lib/auth-email";
import {
  clubDay,
  DIGEST_KIND,
  digestMailings,
  digestSessionsForDay,
  mapDigestCoach,
  mapDigestSession,
  plannedDigestSends,
  type CoachDigestRow,
  type DigestSend,
  type SessionDigestRow,
} from "@/lib/session-digest";
import { dailySessionDigestEmail } from "@/lib/session-email";
import { supabaseUrl } from "@/lib/supabase/config";

/**
 * "Dagens økt" — the one scheduled job in the app.
 *
 * Vercel Cron calls this every morning (see `vercel.json`), it finds the
 * sessions starting today in the club's own time zone, and mails every coach on
 * the teams running them. Nothing else calls it; a coach never triggers it.
 *
 * Three things make this the second privileged route rather than something the
 * browser could do:
 *
 *   1. **There is no signed-in user at 07:00.** RLS is the authorization
 *      boundary everywhere else precisely because a request carries a coach's
 *      token; a cron request carries nobody's. So this reads with the secret
 *      key, like `app/api/admin/auth-link` does, and the caller is authenticated
 *      by a shared secret instead — `CRON_SECRET`, which Vercel attaches to
 *      every cron invocation as a bearer token.
 *   2. **Sending must be idempotent across runs.** Vercel retries, deploys
 *      overlap, and an administrator will curl this by hand while testing. The
 *      primary key on `session_email_log` is what arbitrates: the job claims
 *      every (session, coach) pair it is about to mail, and only the claims the
 *      database actually granted turn into letters. A failed send gives its
 *      claim back, so a later run that day tries again.
 *   3. **A missing mailer is not an error.** Like the auth-link route, this
 *      answers 200 and reports what it would have done when Resend is not
 *      configured — and, importantly, claims nothing in that case, so the first
 *      real run still sends everything.
 *
 * `GET /api/cron/daily-session-digest?dry=1` does the whole read and reports the
 * recipients without claiming or sending anything.
 */

const secretKey = process.env.SUPABASE_SECRET_KEY;
const cronSecret = process.env.CRON_SECRET;
const resendApiKey = process.env.RESEND_API_KEY;
const resendFrom = process.env.RESEND_FROM;
const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

const SESSION_SELECT =
  "id, team_id, title, starts_at, venue, planned_duration_minutes, objective, notes, status, teams(name), " +
  "session_blocks(title, notes, position, session_items(title, description, duration_minutes, coaching_notes, assigned_coach_id, position, kind, exercise_id, exercises(name)))";

const COACH_SELECT = "team_id, profile_id, profiles(id, email, full_name, session_digest_email, deleted_at)";

function bad(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

/** Compares without leaking the secret's contents through timing. */
function secretMatches(provided: string, expected: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!cronSecret) return bad("CRON_SECRET mangler, så den planlagte jobben er slått av.", 503);
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!provided || !secretMatches(provided, cronSecret)) return bad("Ugyldig nøkkel.", 401);

  if (!supabaseUrl || !secretKey) return bad("Supabase er ikke satt opp for dette miljøet.", 503);

  const dryRun = new URL(request.url).searchParams.get("dry") !== null;
  const day = clubDay(new Date());
  const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: sessionRows, error: sessionError } = await admin
    .from("sessions")
    .select(SESSION_SELECT)
    .gte("starts_at", day.from)
    .lt("starts_at", day.to)
    .in("status", ["published", "in_progress"]);
  if (sessionError) return bad(sessionError.message, 502);

  const sessions = digestSessionsForDay(
    ((sessionRows ?? []) as unknown as SessionDigestRow[]).map(mapDigestSession).filter((session) => session !== null),
    day,
  );
  // The common morning: nothing is on. Say so and send nobody anything — a
  // daily "ingenting i dag" is how a digest earns a filter rule.
  if (sessions.length === 0) return Response.json({ day: day.key, sessions: 0, recipients: 0, sent: 0, failed: 0 });

  const teamIds = [...new Set(sessions.map((session) => session.teamId))];
  const { data: coachRows, error: coachError } = await admin.from("team_memberships").select(COACH_SELECT).in("team_id", teamIds);
  if (coachError) return bad(coachError.message, 502);

  const coaches = ((coachRows ?? []) as unknown as CoachDigestRow[]).map(mapDigestCoach).filter((coach) => coach !== null);
  const planned = plannedDigestSends(sessions, coaches);

  if (dryRun) {
    return Response.json({
      day: day.key, dryRun: true, sessions: sessions.length,
      recipients: [...new Set(planned.map((send) => send.email))],
    });
  }

  // Claiming before a send that cannot happen would silence the first real run.
  if (!resendApiKey || !resendFrom) {
    return Response.json({
      day: day.key, sessions: sessions.length, recipients: planned.length, sent: 0, failed: 0,
      emailError: "E-post er ikke satt opp (RESEND_API_KEY/RESEND_FROM), så ingenting ble sendt.",
    });
  }

  // `ignoreDuplicates` turns this into "insert what is new", and the select
  // hands back exactly the rows this run won. Everything else was mailed by an
  // earlier run today.
  const { data: claimedRows, error: claimError } = await admin
    .from("session_email_log")
    .upsert(
      planned.map((send) => ({ session_id: send.sessionId, kind: DIGEST_KIND, recipient_profile_id: send.profileId, email: send.email })),
      { onConflict: "session_id,kind,recipient_profile_id", ignoreDuplicates: true },
    )
    .select("session_id, recipient_profile_id, email");
  if (claimError) return bad(claimError.message, 502);

  const claims: DigestSend[] = (claimedRows ?? []).map((row) => ({
    sessionId: row.session_id as string,
    profileId: row.recipient_profile_id as string,
    email: row.email as string,
  }));
  const mailings = digestMailings(claims, sessions, coaches);
  const siteUrl = authLinkSiteUrl(configuredSiteUrl, request.url);

  let sent = 0;
  const failures: Array<{ email: string; error: string }> = [];
  // Sequential on purpose: a handful of letters a morning, and Resend's free
  // tier rate-limits bursts. Ordering also keeps the log readable.
  for (const mailing of mailings) {
    const mail = dailySessionDigestEmail({ recipient: mailing.recipient, sessions: mailing.sessions, siteUrl });
    if (!mail) continue;
    const error = await sendEmail(mailing.recipient.email, mail);
    if (!error) { sent += 1; continue; }
    failures.push({ email: mailing.recipient.email, error });
    // Hand the claim back so a rerun later today can try again. If this fails
    // too, the coach simply misses one mail — better than a duplicate storm.
    await admin.from("session_email_log")
      .delete()
      .eq("kind", DIGEST_KIND)
      .eq("recipient_profile_id", mailing.recipient.profileId)
      .in("session_id", mailing.sessions.map((session) => session.id));
  }

  return Response.json({
    day: day.key,
    sessions: sessions.length,
    recipients: mailings.length,
    skipped: planned.length - claims.length,
    sent,
    failed: failures.length,
    failures: failures.length ? failures : undefined,
  });
}

async function sendEmail(to: string, mail: { subject: string; html: string; text: string }): Promise<string | null> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: resendFrom, to: [to], subject: mail.subject, html: mail.html, text: mail.text }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (response?.ok) return null;
  const detail = await response?.json().then((payload: { message?: string }) => payload.message).catch(() => null);
  return detail ?? "E-posten kunne ikke sendes.";
}
