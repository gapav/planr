# Deploying Plannr

Free-tier rollout, password authentication, invitation-only. There is no
recurring cost at all unless you want a nicer URL than `*.vercel.app`.

| Piece | Service | Plan | Cost |
| --- | --- | --- | --- |
| Source | GitHub | Free (private repo) | 0 |
| Frontend | Vercel | Hobby | 0 |
| Database, auth, realtime | Supabase | Free | 0 |
| Email | — | none needed | 0 |
| Domain | optional | — | ~150 NOK/yr |

Dropping magic links removes the entire email dependency: no SMTP provider, no
sending domain, no SPF/DKIM/DMARC, no DNS. You invite coaches from your own
mailbox.

Three things to know before committing to this:

- **Vercel Hobby is for personal, non-commercial use.** A volunteer club project
  fits comfortably. If the club is a business or pays someone to run this, the
  terms want Pro. Read [the Hobby plan terms](https://vercel.com/docs/plans/hobby)
  and make the call yourself.
- **Supabase Free has no backups and pauses after 7 days of inactivity.** Both are
  manageable — see [Living with the free tier](#living-with-the-free-tier) — but
  they are yours to manage, not the platform's.
- **There is no "forgot password" without email.** With no SMTP configured,
  `resetPasswordForEmail` cannot deliver. A coach who forgets their password comes
  to you, and you set a new one in the Supabase dashboard. At coaching-team scale
  that is fine; it does not scale to hundreds of users.

## How access works

Two separate steps, and it matters that they're separate:

| Step | Where | What it grants |
| --- | --- | --- |
| Create the account | Supabase dashboard | A login. **No team access at all.** |
| Invite to a team | Plannr, as team admin | The team and the role (admin or coach) |

Creating the auth user fires `handle_new_user`, which writes a `profiles` row and
nothing else — they can sign in and see an empty app. Team membership comes only
from `accept_team_invitation`, and **that** is where you choose which team and
which role, per invitation, inside Plannr.

`accept_team_invitation` refuses unless the signed-in user's email matches the
invited email, so an invite link is useless to anyone but its recipient. Forwarding
it is harmless.

A coach on two teams gets two invite links. Memberships are keyed
`(team_id, profile_id)`, so there is no limit.

## Before you deploy

### Done — password auth (was blocker 1)

Magic links are gone. `signIn` uses `signInWithPassword`, the first sign-in is
forced through `/account/password`, and `inviteMember` returns a copyable
`/invite/<token>` link instead of sending mail. `app/auth/confirm` is deleted.

### Done — profile privilege escalation (was blocker 2)

`202609020011_password_auth.sql` adds `must_set_password` and replaces the
table-wide update grant on `profiles` with a column grant, so a coach can no
longer set `is_global_admin` on their own row. Covered by three new assertions in
`supabase/tests/rls.test.sql`.

### Still open — finish-workout flow

Migrations `202609020009` and `202609020010` add the `completed` status and the
`finish_session` RPC. The SQL and UI are in the working tree but uncommitted.
Everything must land together, or a started workout stays locked and stuck under
Upcoming forever.

### Nit

[app/layout.tsx:5](site/app/layout.tsx#L5) falls back to `https://grep.app` when
`NEXT_PUBLIC_SITE_URL` is unset. Cosmetic — it only affects OG metadata — but set
the variable.

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

> **Never hand-edit the bootstrap.** After adding a migration, regenerate it with
> `npm --prefix site run db:bootstrap`. `supabase/migrations/` stays the source of
> truth; the bootstrap is a convenience for empty projects only. `npm test` fails
> if the checked-in file has drifted from the migrations, so drift cannot reach
> production unnoticed.

Verify in the dashboard:

- Every table shows **RLS enabled**.
- Database → Functions: `start_session`, `finish_session`, `create_team`,
  `accept_team_invitation`, `publish_session`, `reorder_session_blocks`,
  `reorder_block_items` all present, executable by `authenticated` only.
- Database → Roles/Grants: `authenticated` has **column-level** update on
  `profiles`, not table-level.
- **Advisors → Security**: no unexplained warnings.

## 3. Auth settings

Authentication → **Sign In / Providers**:

- **Email** provider: enabled, **Confirm email: off** (you confirm accounts
  yourself when creating them).
- **Allow new users to sign up: OFF.** This is what makes the app genuinely
  invitation-only, and it's only possible because you create accounts by hand.
- Minimum password length 10, and enable the leaked-password check if offered.

Authentication → **URL Configuration**:

- **Site URL:** your production URL
- **Redirect URLs:** you can leave this empty once `auth/confirm` is deleted —
  password sign-in does no redirecting.

## 4. Deploy to Vercel

Import the GitHub repo:

- Framework: **Next.js**
- **Root directory: `site`** ← the one setting that isn't automatic
- Build/install commands: default
- Production branch: `main`

Environment variables, **Production only** — leave Preview and Development empty:

```
NEXT_PUBLIC_SITE_URL=https://your-domain.no
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Leaving Preview empty is deliberate and is why you don't need a second Supabase
project: with no Supabase URL `isSupabaseConfigured` is false, the client factories
return `null`, and the app seeds from `lib/demo-data.ts`. Every branch preview is a
free throwaway demo that cannot touch real player data.

Only the publishable key goes in a `NEXT_PUBLIC_*` variable. There is no
service-role key in this app and there must never be one.

Deploy, confirm the `.vercel.app` URL works, then add a custom domain if you want
one, then set `NEXT_PUBLIC_SITE_URL` to the final URL and redeploy.

## 5. Your own account

Signups are off, so create yourself the same way you'll create everyone else —
Supabase → Authentication → **Users → Add user**:

- Email, a strong password, **Auto Confirm User: on**

Sign in, create your team through the UI (that makes you its admin), and if you
want to curate the shared exercise library:

```sql
update public.profiles set is_global_admin = true where email = 'you@example.com';
```

## 6. Onboarding a coach

Repeat per coach:

1. **Supabase → Authentication → Users → Add user.** Their email, a generated temp
   password, **Auto Confirm User: on**.
2. **In Plannr:** open the team, Invite coach, enter the same email and pick
   **admin** or **coach**. Copy the invite link it gives you.
3. **From your mailbox**, send them: the app URL, their email, the temp password,
   and the invite link. Send the password by a different channel than the link if
   you want to be careful.
4. They sign in, are forced to set their own password, then open the invite link
   and land in the team.

Their display name defaults to the email local part, because `handle_new_user` has
no better source — `nora@club.no` shows up as "nora". Fix it in SQL after creating
them (the trigger only fires on insert or email change, so editing user metadata
later does nothing):

```sql
update public.profiles set full_name = 'Nora Vik' where email = 'nora@club.no';
```

Things that bite: the invited email must match the signed-in one or
`accept_team_invitation` refuses (which is also why forwarding a link is harmless);
invitations are single-use and expire after 7 days; a lost link can be re-copied
from the pending invitation row in `/team`.

Removing a coach: remove them from the team in Plannr (drops the membership), and
delete the user in Supabase Auth if they should lose the login entirely.

## 7. Smoke test with fake data

Before any real roster goes in:

- [ ] Sign in with a password on a real device
- [ ] Confirm a signed-out visitor **cannot** self-register
- [ ] Create a second coach end to end: dashboard user → invite link → forced
      password change → lands in the correct team with the correct role
- [ ] Confirm that coach sees only that team
- [ ] Confirm they cannot escalate: `update public.profiles set is_global_admin =
      true where id = auth.uid()` must be rejected
- [ ] Add an exercise with a YouTube link and one with a Vimeo link (Vimeo goes
      through `/api/media/thumbnail`, the only real API route — worth confirming
      it works on Vercel)
- [ ] Import a test `.xls` and `.xlsx` roster; confirm stored names are
      `"Firstname L."` only
- [ ] Build and publish a session
- [ ] Open it in two browsers: edits appear live, presence shows which block the
      other coach is on
- [ ] Check players in, generate groups, start the workout, confirm the plan locks
- [ ] Finish the workout; confirm it leaves Upcoming and stays locked
- [ ] Do the last three **on the phone you'll actually use in the hall**

## Living with the free tier

**Pausing.** Supabase pauses free projects after 7 days without database activity.
In season you'll never hit it; over a summer break you will. Unpausing is one
button and nothing is lost — just don't let a coach mid-session be the one who
discovers it. A free uptime monitor (UptimeRobot, every 5 min) prevents it
entirely. See [Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing).

**Backups.** The free plan has none. Take your own before every schema change and
roughly monthly:

```bash
npx supabase db dump --db-url "postgresql://postgres:PASSWORD@db.YOUR_PROJECT.supabase.co:5432/postgres" -f backup-$(date +%F).sql
```

Keep the dumps off Supabase and off the laptop's only disk. Restore one into a
scratch project once, so you know the command works before you need it. See
[Database Backups](https://supabase.com/docs/guides/platform/backups).

**Forgotten passwords.** Supabase → Authentication → Users → the user → reset
password, then tell them the new one and have them change it. There is no
self-service path without SMTP. If this becomes a chore, that is the signal to add
a transactional email provider — the free tiers start around 3 000 emails/month.

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
- Vercel and Supabase process personal data on the club's behalf, so accept their
  data-processing agreements (both offer one in the dashboard).
- Keep injuries, diagnoses and anything medical out of session notes. That is
  special-category data and it changes the whole picture.

Norwegian guidance: [legal basis](https://www.datatilsynet.no/rettigheter-og-plikter/virksomhetenes-plikter/behandlingsgrunnlag/)
and [data-processing agreements](https://www.datatilsynet.no/rettigheter-og-plikter/virksomhetenes-plikter/databehandleravtale/).

## Launch order

1. Land the finish-session work and commit it together with password auth.
2. Supabase project → paste `prod_bootstrap.sql` → auth settings (signups **off**).
3. Vercel import → production env vars → domain.
4. Create your own account in the dashboard, sign in, create the team.
5. Smoke test with fake data, two coaches, on a phone.
6. Import the real roster.
