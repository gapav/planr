import { readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { mapDigestSession, type SessionDigestRow } from "./session-digest";
import { dailySessionDigestEmail } from "./session-email";

const OUT = "/private/tmp/claude-501/-Users-gardpavels-code-plannr/0e45c27c-eb5c-46c7-8c65-f84ff8934186/scratchpad";
const SELECT = "id,team_id,title,starts_at,venue,planned_duration_minutes,objective,notes,status,teams(name),session_blocks(title,notes,position,session_items(title,description,duration_minutes,coaching_notes,assigned_coach_id,position,kind,exercise_id,exercises(name)))";

// A scaffold, not a test of anything: it renders the real letter for one
// session so it can be read in a browser. Skipped unless you point it at a
// session, so `npm test` stays green. Delete it when you are done with it.
function envFile(path: string): Record<string, string> {
  try {
    return Object.fromEntries(readFileSync(path, "utf8").split("\n")
      .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/))
      .filter((match) => match !== null)
      .map((match) => [match[1], match[2]]));
  } catch { return {}; }
}

it.skipIf(!process.env.PREVIEW_SESSION_ID && !process.env.PREVIEW_FILE)("renders the digest for one real session", async () => {
  const id = process.env.PREVIEW_SESSION_ID;
  // Credentials come from a gitignored env file rather than the command line,
  // so the production secret key never appears in a shell history. `vercel env
  // pull .env.prod.local --environment=production` writes exactly this shape.
  const file = envFile(".env.prod.local");
  const url = process.env.GREP_SUPABASE_URL ?? file.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.GREP_SUPABASE_SECRET_KEY ?? file.SUPABASE_SECRET_KEY;
  let rows: SessionDigestRow[];
  if (url && key && id) {
    const response = await fetch(`${url}/rest/v1/sessions?id=eq.${id}&select=${encodeURIComponent(SELECT)}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    rows = await response.json() as SessionDigestRow[];
    if (!Array.isArray(rows) || !rows[0]) throw new Error(`Fant ingen økt: ${JSON.stringify(rows).slice(0, 300)}`);
    writeFileSync(`${OUT}/session.json`, JSON.stringify(rows, null, 2));
  } else {
    rows = JSON.parse(readFileSync(process.env.PREVIEW_FILE ?? `${OUT}/session.json`, "utf8")) as SessionDigestRow[];
  }
  const session = mapDigestSession(rows[0]);
  if (!session) throw new Error("Økta har ingen starttid, så ingen e-post ville blitt sendt for den.");
  const mail = dailySessionDigestEmail({
    recipient: { profileId: process.env.PREVIEW_COACH_ID ?? "preview-coach", fullName: process.env.PREVIEW_COACH_NAME ?? "Gard" },
    sessions: [session],
    siteUrl: "https://grep.team",
  })!;
  writeFileSync(`${OUT}/dagens-okt.html`, mail.html);
  writeFileSync(`${OUT}/dagens-okt.txt`, `${mail.subject}\n\n${mail.text}`);
  console.log(`\n${mail.subject}\n\n${mail.text}\n`);
});
