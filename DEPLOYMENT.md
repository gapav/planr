# Deploying Plannr

Free-tier rollout, passwordless, invitation-only. There is no recurring cost at
all unless you want a nicer URL than `*.vercel.app`.

| Piece | Service | Plan | Cost |
| --- | --- | --- | --- |
| Source | GitHub | Free (private repo) | 0 |
| Frontend, morning cron | Vercel | Hobby | 0 |
| Database, auth, realtime, storage | Supabase | Free | 0 |
| Email | Resend (API, plus SMTP for Supabase) | Free | 0 |
| Domain | optional, but email wants one | — | ~150 NOK/yr |

Coaches sign in with a one-time link by email — nobody has a password to forget.
That makes email part of the product rather than an extra, and it arrives by two
roads:

- **Grep's own mail** — invitations, the morning session email, support and
  interest messages — goes out through the Resend HTTP API from the server.
- **Supabase's mail** — the sign-in link a coach asks for on `/sign-in` — goes
  out through whatever SMTP Supabase is configured with. Its built-in sender
  only delivers to members of the Supabase project (that is, you), so real
  coaches need custom SMTP. Resend's SMTP relay works, on the same verified
  domain.

Until a sending domain is verified, the app still works: every invite and login
link the console mints is shown to you to pass on by hand. What does not work
without custom SMTP is a coach requesting their own sign-in link.

Three things to know before committing to this:

- **Vercel Hobby is for personal, non-commercial use.** A volunteer club project
  fits comfortably. If the club is a business or pays someone to run this, the
  terms want Pro. Read [the Hobby plan terms](https://vercel.com/docs/plans/hobby)
  and make the call yourself.
- **Supabase Free has no backups and pauses after 7 days of inactivity.** Both are
  manageable — see [Living with the free tier](#living-with-the-free-tier) — but
  they are yours to manage, not the platform's.
- **Email is on the sign-in path.** A coach whose mail does not arrive cannot get
  in by themselves. You can always mint them a link from `/admin`, but verify the
  sending domain (SPF/DKIM) before inviting a whole coaching team.

## How access works

Signing up is switched off everywhere: Supabase refuses new users, and
`/sign-in` asks for a link with `shouldCreateUser: false`, answering an unknown
address exactly like a known one. An account only ever comes into being from an
invitation, and the invitation is also what grants the team:

| Who | Where | What they can hand out |
| --- | --- | --- |
| Global admin (you) | `/admin` | Teams, and seats on any team as **admin** or **coach** |
| Team admin | `/team` → *Inviter trenere* | **Coach** seats on their own team |

Inviting is two steps, in this order. The seat is reserved first — a
`team_invitations` row, through RLS, valid for 7 days. Then
`/api/admin/auth-link`, the only route that holds the Supabase secret key, mints
a one-time link for that address: `invite` creates the account if there is none,
and an address that already has one gets a sign-in link instead. It refuses to
mint anything unless the seat already exists, so it cannot be used as a general
mailer or account factory.

When the coach follows the link they are signed in, and the app claims every
seat waiting for their email address (`accept_team_invitation`, which refuses
unless the signed-in email matches the invited one). The `/invite/<token>` link
is only a fallback — forwarding it is harmless, because it is useless to anyone
but its recipient.

A team admin is never shown the sign-in link for an account that already
existed: they can reserve a seat for any address, and that link signs in as
whoever owns it. That coach gets the link by email if mail is configured, and
otherwise simply signs in as usual — the seat is claimed for them either way.

A coach on two teams holds two seats. Memberships are keyed
`(team_id, profile_id)`, so there is no limit.

## 1. Commit the release

```bash
cd /Users/gardpavels/code/plannr
npm --prefix site run lint && npm --prefix site test && npm --prefix site run build
git add -A && git commit -m "..." && git push origin main
```

`.env.local` is gitignored. Keep it that way.

## 2. Create the Supabase project

New project, region **Central EU (Frankfurt)** or **North EU (Ireland)**. Save the
database password in a password manager — on the free tier it is the only way to
take a backup.

Apply the schema in one go — this is a brand-new empty project, so you do **not**
run the migrations one at a time:

1. Open **SQL Editor**.
2. Paste all of `site/supabase/prod_bootstrap.sql`.
3. Run once.

It is a generated file — the migrations concatenated in filename order, with
explicit `commit;` breaks after each migration that adds an enum value, because
later statements use those values.

> **Never hand-edit the bootstrap, and never run it against a restored
> database.** It contains one-time cleanup migrations that delete rows
> (`202609020028` drops unaccepted invitations, `202609020029` drops auth users
> who never signed in) — harmless on an empty project, destructive on a real one.
> After adding a migration, regenerate it with `npm --prefix site run
> db:bootstrap`; `npm test` fails if the checked-in file has drifted from
> `supabase/migrations/`, which stays the source of truth.

Verify in the dashboard:

- Every table shows **RLS enabled**.
- Database → Functions: `create_team`, `accept_team_invitation`,
  `publish_session`, `start_session`, `start_session_without_setup`,
  `undo_session_start`, `finish_session`, `reopen_session`, `copy_session`,
  `reorder_session_blocks`, `reorder_block_items`, `reorder_warmup_items`,
  `admin_list_teams`, `admin_list_accounts`, `admin_set_display_name` — all
  executable by `authenticated` only, never `anon`.
- Database → Roles/Grants: `anon` can read nothing — not even `exercises`.
  `authenticated` has **column-level** update on `profiles`, not table-level.
- **Advisors → Security**: no unexplained warnings. One is expected — see the
  link expiry below.

## 3. Auth settings

Most of this is code-managed in `site/supabase/config.toml`; check the
production project matches it with
`npm --prefix site run supabase:config:diff:prod`.

Authentication → **Sign In / Providers**:

- **Allow new users to sign up: OFF.** Invitations create accounts through the
  admin API, which this does not affect.
- **Email** provider: enabled, **Confirm email: off** — following the link is
  the confirmation.
- **Email OTP expiry: 86400** (24 hours, the maximum). An invitation is read
  whenever the coach next opens their mail; the one-hour default expired links
  you then had to mint again. The security advisor flags anything over 3600 —
  accepted knowingly, since every link is single-use.

Authentication → **URL Configuration**:

- **Site URL:** your production URL.
- **Redirect URLs:** `https://your-domain.no/auth/confirm`. Every Supabase
  sign-in link returns there.

Authentication → **Emails**:

- **SMTP Settings:** custom SMTP, or coaches cannot request their own sign-in
  link (see the top of this file).
- **Magic Link template:** subject «Logg inn på Grep», body from
  `site/supabase/templates/magic-link.html`. It has to stay on the token-hash
  form (`{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email`): the
  default `{{ .ConfirmationURL }}` comes back in a shape the browser client
  rejects, and the coach lands signed out. `config.toml` declares this template
  for production, so a config push sets it too.

`/auth/confirm` exchanges the link only after the coach presses the button on
it, because mail scanners open links and must not spend a one-time login.

## 4. Deploy to Vercel

Import the GitHub repo:

- Framework: **Next.js**
- **Root directory: `site`** ← the one setting that isn't automatic
- Build/install commands: default
- Production branch: `main`

Environment variables, **Production only** — leave Preview and Development empty:

| Variable | Needed | What for |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | yes | The public URL. The links in Grep's own emails are built from it (sign-in links from `/sign-in` use the browser's origin), and OG metadata falls back to `https://grep.team` without it. |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | |
| `SUPABASE_SECRET_KEY` | yes | Server-only. Creating accounts, deleting them, and the morning email. |
| `RESEND_API_KEY`, `RESEND_FROM` | for mail | `RESEND_FROM` must be on a domain verified in Resend. Unset, invite links are shown to you instead, and the morning email is a dry run. |
| `CRON_SECRET` | for the morning email | See section 7. |
| `GREP_SUPPORT_TO`, `GREP_INTEREST_TO` | no | Where *Hjelp og support* and the `/velkommen` interest form send mail; both default to the owner's address. |

Only the three `NEXT_PUBLIC_*` values reach the browser. `SUPABASE_SECRET_KEY`
bypasses RLS entirely, so it lives only in the three server routes that need it
— `/api/admin/auth-link`, `/api/admin/accounts` and
`/api/cron/daily-session-digest` — and must never get a `NEXT_PUBLIC_` prefix.

Leaving Preview empty is deliberate and is why you don't need a second Supabase
project: with no Supabase URL `isSupabaseConfigured` is false, the client
factories return `null`, and the app seeds from `lib/demo-data.ts`. Every branch
preview is a free throwaway demo that cannot touch real player data.

Deploy, confirm the `.vercel.app` URL works, then add a custom domain if you want
one, then set `NEXT_PUBLIC_SITE_URL` to the final URL and redeploy.

## 5. Your own account

Signups are off, so create yourself once in the dashboard — Supabase →
Authentication → **Users → Add user**, your email, **Auto Confirm User: on** —
and make yourself the global admin:

```sql
update public.profiles set is_global_admin = true where email = 'you@example.com';
```

Then sign in on `/sign-in` with a link. Supabase's built-in sender delivers to
project members, so this works before custom SMTP is set up. `/admin` appears
in the sidebar.

## 6. Onboarding a coach

From `/admin`:

1. **Create the team**, optionally naming its first administrator's email — that
   reserves their admin seat and sends the invitation in one go.
2. **Invite** further coaches from the team's page as **admin** or **coach**.
   With mail configured the invitation arrives by email; without it, the console
   shows the one-time link — send it from your own mailbox.
3. The coach opens the link, presses *Fortsett til Grep*, and lands in the team.

A team admin can invite coaches to their own team from `/team` the same way.

Invitations are single-use and expire after 7 days. A pending one can be sent
again or revoked from the console, and a coach who cannot get in can ask for a
new link on `/sign-in`, or you can send one from `/admin`.

Their display name starts as the email local part — `nora@club.no` shows up as
"nora". Coaches rename themselves under *Laget → For deg*, and you can rename
anyone from `/admin`.

**Removing a coach:** remove their membership from the team in `/admin`. To take
the login away entirely, delete the account permanently under `/admin` →
accounts — their past sessions stay, credited to «Slettet bruker». That refuses
while the account still owns uploaded files in Storage.

## 7. The morning session email

On a morning when the team trains, every coach on it gets the day's plan in
their inbox — title, time, venue, focus, every block and activity, with their
own assigned activities marked. Drafts are never mailed, nor is a published
plan less than 80 % built. No session that day means no email at all.

**What it needs**

| Variable | Why |
| --- | --- |
| `CRON_SECRET` | Authenticates the scheduler. Vercel sends it on every cron invocation as `Authorization: Bearer …`; without it the route answers 503 and sends nothing. Generate it with `openssl rand -base64 32` — never something memorable. |
| `SUPABASE_SECRET_KEY` | The job runs early in the morning with nobody signed in, so RLS has no user to authorize. It reads with the secret key, like the invite route. |
| `RESEND_API_KEY`, `RESEND_FROM` | The delivery itself. Unset, the job still runs and reports what it *would* have sent — and claims nothing, so the first configured run sends everything. |

Treat `CRON_SECRET` like an admin password. It cannot reveal the secret key or
let anyone write data, but whoever holds it can trigger the send, and a dry run
answers with every recipient's email address.

**The schedule** lives in `site/vercel.json` as `0 5 * * *`. Vercel schedules
in UTC, so that is 07:00 in Oslo in summer and 06:00 in winter; which sessions
count as "today" is still decided in Oslo time. Vercel **Hobby allows 2 cron
jobs, one run per day**, fired within the hour of the stated time, which is why
this is a fixed morning digest rather than "two hours before the session".
Moving to per-session timing means Vercel Pro, or moving the trigger to
Supabase `pg_cron`.

**Testing it** without waiting for tomorrow:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://your-domain.no/api/cron/daily-session-digest?dry=1"
```

`?dry=1` reads everything and reports the recipients without claiming or
sending. Drop it to send for real. Running it twice is safe: every (session,
coach) pair is claimed in `session_email_log` first, and only newly claimed
pairs are mailed, so the second run reports `sent: 0`. A send that fails gives
its claim back, so a later run that day retries it.

**Turning it off.** Each coach has their own switch under *Laget → For deg*
(«Dagens økt på e-post»). To stop it for everyone, remove the `crons` entry
from `site/vercel.json` or unset `CRON_SECRET`.

## 8. Smoke test with fake data

Before any real roster goes in:

- [ ] Request a sign-in link on a real phone and follow it
- [ ] Confirm an unknown address gets the same «check your inbox» answer and
      no mail, and cannot become an account
- [ ] Onboard a second coach end to end: create a team with them as first
      admin → link (by email or copied) → they land in the right team with the
      right role
- [ ] As that team admin, invite a third coach from `/team`
- [ ] Confirm each coach sees only their own team
- [ ] Confirm they cannot escalate: `update public.profiles set is_global_admin =
      true where id = auth.uid()` must be rejected
- [ ] Add an exercise with a YouTube link and one with a Vimeo link (Vimeo goes
      through `/api/media/thumbnail` — worth confirming it works on Vercel)
- [ ] Import a test `.xls` and `.xlsx` roster; confirm stored names are
      `"Firstname L."` only
- [ ] Build and publish a session
- [ ] Open it in two browsers: edits appear live, presence shows which block the
      other coach is on
- [ ] Check players in, generate groups, start the workout, confirm the plan locks
- [ ] Finish the workout; confirm it moves to the past and stays locked; reopen it
- [ ] Do the last three **on the phone you'll actually use in the hall**
- [ ] Trigger the morning email by hand (section 7) and read it on a phone

## Living with the free tier

**Pausing.** Supabase pauses free projects after 7 days without database activity.
In season you'll never hit it; over a summer break you will. Unpausing is one
button and nothing is lost — just don't let a coach mid-session be the one who
discovers it. A free uptime monitor (UptimeRobot, every 5 min) prevents it
entirely. See [Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing).

**Backups.** The free plan has none. Take your own before every schema change and
roughly monthly:

```bash
make doctor    # one-time: check this machine can do it at all
make backup    # guided, read-only, prompts for the password
```

Three reasons not to reach for `supabase db dump` by hand here. It shells out to
`pg_dump` inside **Docker**, which this project does not otherwise need; it
**excludes the `auth` schema**, so the dump restores a schema nobody can sign in
to; and it cannot see **Storage files** at all, so exercise videos and team logos
are left behind. `make backup` covers all three, and steers you to the Session
pooler because the direct `db.<ref>.supabase.co` host is IPv6-only.

Keep the dumps off Supabase and off the laptop's only disk. Restore one into a
scratch project once, so you know the command works before you need it —
`make restore` walks through it. The full runbook, including what a backup
*cannot* hold, is in [DISASTER_RECOVERY.md](DISASTER_RECOVERY.md). See also
[Database Backups](https://supabase.com/docs/guides/platform/backups).

**A coach who cannot get in.** There is no password reset — sign-in is by link,
whether or not a coach has also set a password. They ask for a
new link on `/sign-in`, or you send one from `/admin`. If their mail never
arrives, the console shows you the link to pass on yourself.

**Schema changes after launch.** Applied migrations are immutable. Add a new
numbered file in `site/supabase/migrations/`, run `npm --prefix site run
db:bootstrap`, back up, run the new migration in the SQL Editor, *then* deploy the
frontend that depends on it. Never the other way round — a frontend that writes a
column the database does not have fails with `Could not find the '<column>' column
of '<table>' in the schema cache`.

## Privacy

Player first names, surname initials, jersey numbers and coach emails are personal
data, and the players are likely minors. The app already minimizes what it stores,
which does most of the work. What's left is short:

- Write down why the club processes this and on what legal basis, and publish a
  two-paragraph privacy notice on the site.
- Decide when former players, coaches and old sessions get deleted — and do it.
- Vercel, Supabase and Resend process personal data on the club's behalf, so
  accept their data-processing agreements. Resend sees every coach's address and
  the full session plans in the morning email.
- Keep injuries, diagnoses and anything medical out of session notes. That is
  special-category data and it changes the whole picture — and the morning email
  copies session notes into inboxes.

Norwegian guidance: [legal basis](https://www.datatilsynet.no/rettigheter-og-plikter/virksomhetenes-plikter/behandlingsgrunnlag/)
and [data-processing agreements](https://www.datatilsynet.no/rettigheter-og-plikter/virksomhetenes-plikter/databehandleravtale/).

## Launch order

1. Supabase project → paste `prod_bootstrap.sql` → auth settings (signups
   **off**, redirect URL, OTP expiry).
2. Resend: verify the sending domain; point Supabase's custom SMTP at it.
3. Vercel import → production env vars → domain.
4. Create your own account in the dashboard, make it global admin, sign in.
5. Smoke test with fake data, two coaches, on a phone.
6. Create the real teams, invite the coaches, import the rosters.
