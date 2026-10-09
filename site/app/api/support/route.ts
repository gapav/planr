import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createInterestRateLimit } from "@/lib/interest-rate-limit";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";
import { supportEmail, supportSchema } from "@/lib/support";

export const runtime = "nodejs";
const allow = createInterestRateLimit();
const MAX_BYTES = 16384;
const unavailable = "Vi fikk ikke sendt meldingen akkurat nå. Prøv igjen om litt.";
const reply = (data: object, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

/**
 * The help button: a signed-in coach writes, the owner gets the mail.
 *
 * It sends through Resend like the interest form, and for the same reason it
 * cannot be RLS: the database cannot send mail. It never holds the Supabase
 * secret key. The caller's token is verified by the auth server, and name,
 * address and teams are read under the caller's own RLS — the body carries only
 * the message, so a coach can neither pick the recipient nor write as someone
 * else. Their address becomes Reply-To, so answering is just replying.
 */
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return reply({ error: "Åpne Grep og prøv igjen." }, 403);
  if (!supabaseUrl || !supabasePublishableKey) return reply({ error: "Supabase er ikke satt opp for dette miljøet." }, 503);

  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!accessToken) return reply({ error: "Du må være logget inn." }, 401);
  const asCaller = createClient(supabaseUrl, supabasePublishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: caller, error: callerError } = await asCaller.auth.getUser(accessToken);
  if (callerError || !caller.user?.email) return reply({ error: "Innloggingen din har utløpt. Logg inn på nytt." }, 401);

  if (Number(request.headers.get("content-length")) > MAX_BYTES) return reply({ error: "Meldingen er for lang." }, 413);
  let raw: unknown;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BYTES) return reply({ error: "Meldingen er for lang." }, 413);
    raw = JSON.parse(text);
  } catch { return reply({ error: "Kunne ikke lese meldingen. Prøv igjen." }, 400); }
  const parsed = supportSchema.safeParse(raw);
  if (!parsed.success) return reply({ error: "Skriv en melding på mellom 5 og 3000 tegn." }, 400);

  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  const to = process.env.GREP_SUPPORT_TO || "gardpavels@gmail.com";
  if (!key || !from) return reply({ error: unavailable }, 503);
  if (!allow(`user:${caller.user.id}`, 5) || !allow("global", 50)) {
    return reply({ error: "Du har sendt flere meldinger på kort tid. Prøv igjen om en time." }, 429);
  }

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    asCaller.from("profiles").select("full_name").eq("id", caller.user.id).maybeSingle(),
    asCaller.from("team_memberships").select("teams(name)").eq("profile_id", caller.user.id),
  ]);
  const email = caller.user.email.toLowerCase();
  const teams = (memberships ?? []).flatMap((row) => {
    const team = row.teams as { name?: unknown } | { name?: unknown }[] | null;
    return (Array.isArray(team) ? team : [team]).flatMap((entry) => typeof entry?.name === "string" ? [entry.name] : []);
  });
  const name = typeof profile?.full_name === "string" && profile.full_name.trim() ? profile.full_name.trim() : email;

  const mail = supportEmail(parsed.data, { name, email, teams });
  const payload = JSON.stringify({ from, to: [to], reply_to: email, ...mail });
  try {
    const sent = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `grep-support-${createHash("sha256").update(payload).digest("hex")}`,
      },
      body: payload,
      signal: AbortSignal.timeout(10_000),
    });
    if (!sent.ok) return reply({ error: unavailable }, 502);
    const receipt = await sent.json().catch(() => null);
    if (typeof receipt?.id !== "string" || !receipt.id) return reply({ error: unavailable }, 502);
    return reply({ ok: true });
  } catch { return reply({ error: unavailable }, 502); }
}
