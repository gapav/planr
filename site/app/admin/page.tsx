"use client";

import { ChevronRight, Mail, Plus, Search, TriangleAlert, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AdminFrame, AdminHeader } from "@/components/admin-frame";
import { ADMIN_PAGE_SIZE, ShowMore } from "@/components/admin-list";
import { useGrep } from "@/components/app-provider";
import { TeamCrest } from "@/components/team-crest";
import { Avatar, Button, EmptyState, Field, inputClass, Modal, Tag } from "@/components/ui";
import { adminOverview, filterAdminTeams, isTeamMemberOf, sessionCountsByTeam, teamNeedsAdmin, type AdminTeamFilter, type SessionTabCounts } from "@/lib/admin";
import { COACH_AVATAR_SELF } from "@/lib/team-palette";
import type { AdminTeam } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function AdminPage() {
  return <AdminFrame><AdminTeams /></AdminFrame>;
}

/**
 * The console's front page: one row per team, and every action one click
 * further in on `/admin/teams/<id>`. It used to render each team as a card with
 * its whole coach list open, which stopped being scannable around the third
 * team — the owner comes here to find one team, not to read all of them.
 */
function AdminTeams() {
  const { user, adminTeams, adminTeamsLoaded, adminAccounts, sessions, adminSessions, createTeam } = useGrep();
  const router = useRouter();
  const [query, setQuery] = useState(""); const [filter, setFilter] = useState<AdminTeamFilter>("all"); const [limit, setLimit] = useState(ADMIN_PAGE_SIZE);
  const [createOpen, setCreateOpen] = useState(false); const [teamName, setTeamName] = useState(""); const [adminEmail, setAdminEmail] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  const overview = adminOverview(adminTeams, adminAccounts);
  const visible = useMemo(() => filterAdminTeams(adminTeams, query, filter), [adminTeams, query, filter]);
  const counts = useMemo(() => sessionCountsByTeam([...sessions, ...adminSessions]), [sessions, adminSessions]);

  function search(value: string) { setQuery(value); setLimit(ADMIN_PAGE_SIZE); }
  function choose(next: AdminTeamFilter) { setFilter(next); setLimit(ADMIN_PAGE_SIZE); }
  function closeCreate() { setCreateOpen(false); setError(null); }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(null);
    try { const id = await createTeam(teamName, adminEmail); setCreateOpen(false); setTeamName(""); setAdminEmail(""); router.push(`/admin/teams/${id}`); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Laget kunne ikke opprettes"); }
    finally { setSaving(false); }
  }

  return <>
    <AdminHeader section="teams" title="Lag" description="Opprett lag, gi dem en lagadministrator og se hva de planlegger. Du blir ikke medlem av lagene du oppretter." actions={<Button size="lg" onClick={() => setCreateOpen(true)}><Plus size={18} />Opprett lag</Button>} />

    <dl className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Lag" value={overview.teams} />
      <Stat label="Brukerkontoer" value={overview.accounts} href="/admin/accounts" />
      <Stat label="Ventende invitasjoner" value={overview.pendingInvitations} />
      <Stat label="Mangler lagadministrator" value={overview.teamsNeedingAdmin} warn={overview.teamsNeedingAdmin > 0} onClick={overview.teamsNeedingAdmin > 0 ? () => choose(filter === "needs-admin" ? "all" : "needs-admin") : undefined} active={filter === "needs-admin"} />
    </dl>

    <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <label className="relative block w-full sm:max-w-sm"><span className="sr-only">Søk etter lag</span><Search className="absolute left-3.5 top-3.5 text-[var(--ink-soft)]" size={17} /><input type="search" className={`${inputClass} pl-10`} value={query} onChange={(event) => search(event.target.value)} placeholder="Søk lag, trener eller e-post" /></label>
      <div className="grep-segments" role="group" aria-label="Vis lag">
        <button type="button" aria-pressed={filter === "all"} onClick={() => choose("all")}>Alle<span>{adminTeams.length}</span></button>
        <button type="button" aria-pressed={filter === "needs-admin"} onClick={() => choose("needs-admin")}>Mangler administrator<span>{overview.teamsNeedingAdmin}</span></button>
      </div>
    </div>

    {!adminTeamsLoaded ? <p className="mt-6 text-sm text-[var(--ink-soft)]">Laster lagene …</p>
      : adminTeams.length === 0 ? <div className="mt-6"><EmptyState icon={<Users size={22} />} title="Ingen lag ennå" body="Opprett det første laget og inviter en lagadministrator som kan planlegge for det." action={<Button onClick={() => setCreateOpen(true)}><Plus size={17} />Opprett lag</Button>} /></div>
      : visible.length === 0 ? <p className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 text-sm text-[var(--ink-soft)]">Ingen lag matcher søket.</p>
      : <div className="mt-6 overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--surface)] shadow-[0_8px_30px_rgba(16,32,29,.04)]">
          <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_24px] gap-4 border-b border-[var(--line)] bg-[var(--paper)]/60 px-6 py-2.5 text-[11px] font-black uppercase tracking-[.12em] text-[var(--ink-soft)] md:grid" aria-hidden><span>Lag</span><span>Trenere</span><span>Økter</span><span /></div>
          <ul className="divide-y divide-[var(--line)]">{visible.slice(0, limit).map((team) => <TeamRow key={team.id} team={team} counts={counts.get(team.id)} youAreOnTeam={isTeamMemberOf(team, user?.id)} selfId={user?.id} />)}</ul>
          <ShowMore shown={Math.min(limit, visible.length)} total={visible.length} onMore={() => setLimit((current) => current + ADMIN_PAGE_SIZE)} />
        </div>}

    <Modal open={createOpen} onClose={closeCreate} title="Opprett et lag" description="Laget får sin egen lagadministrator. Du blir ikke medlem.">
      <form className="grid gap-5" onSubmit={submit}>
        <Field label="Lagnavn" hint="Skriv «Klubb — Lag» for å få klubbnavnet med i lagoversikten."><input required minLength={3} className={inputClass} value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Fjordvik HK — Gutter 18" autoFocus /></Field>
        <Field label="Lagadministratorens e-postadresse" hint="Kan stå tom hvis du vil invitere treneren senere."><div className="relative"><Mail className="absolute left-3.5 top-3.5 text-[var(--ink-soft)]" size={17} /><input type="email" className={`${inputClass} pl-10`} value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} placeholder="trener@klubb.no" /></div></Field>
        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-[var(--danger)]">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={closeCreate}>Avbryt</Button><Button disabled={saving}>{saving ? "Oppretter…" : "Opprett lag"}</Button></div>
      </form>
    </Modal>
  </>;
}

function Stat({ label, value, href, warn = false, active = false, onClick }: { label: string; value: number; href?: string; warn?: boolean; active?: boolean; onClick?: () => void }) {
  const body = <><dt className="text-xs font-bold text-[var(--ink-soft)]">{label}</dt><dd className={cn("mt-1 text-2xl font-black tracking-[-.04em]", warn && "text-[var(--orange-dark)]")}>{value}</dd></>;
  const shell = cn("block rounded-2xl border bg-[var(--surface)] px-4 py-3 text-left", active ? "border-[var(--ink)]" : "border-[var(--line)]", (href || onClick) && "transition hover:border-[var(--ink)]");
  if (href) return <Link href={href} className={shell}>{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} aria-pressed={active} className={shell}>{body}</button>;
  return <div className={shell}>{body}</div>;
}

const MAX_FACES = 4;

function TeamRow({ team, counts, youAreOnTeam, selfId }: { team: AdminTeam; counts: SessionTabCounts | undefined; youAreOnTeam: boolean; selfId: string | undefined }) {
  const needsAdmin = teamNeedsAdmin(team);
  const faces = team.members.slice(0, MAX_FACES);
  const sessionSummary = counts ? [counts.upcoming && `${counts.upcoming} kommende`, counts.drafts && `${counts.drafts} utkast`, counts.past && `${counts.past} gjennomført`].filter(Boolean).join(" · ") : "";
  return <li><Link href={`/admin/teams/${team.id}`} className="grid grid-cols-[minmax(0,1fr)_24px] items-center gap-x-4 gap-y-2 px-4 py-3.5 transition hover:bg-[var(--paper)] sm:px-6 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_24px]">
    <span className="flex min-w-0 items-center gap-3"><TeamCrest team={team} /><span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><strong className="truncate">{team.shortName}</strong>{needsAdmin && <Tag tone="orange">Mangler lagadministrator</Tag>}{youAreOnTeam && <Tag>Du er medlem</Tag>}</span>{team.name !== team.shortName && <span className="block truncate text-xs text-[var(--ink-soft)]">{team.name}</span>}</span></span>
    <ChevronRight size={18} className="row-span-3 self-center text-[var(--ink-soft)] md:order-last md:row-span-1" aria-hidden />
    <span className="flex min-w-0 items-center gap-2.5 pl-[52px] md:pl-0">
      {team.members.length === 0
        ? <span className="flex items-center gap-1.5 text-sm text-[var(--ink-soft)]"><TriangleAlert size={15} className="text-[var(--orange)]" />Ingen trenere</span>
        : <><span className="flex -space-x-2">{faces.map((member) => <Avatar key={member.id} name={member.fullName} initials={member.initials} color={member.id === selfId ? COACH_AVATAR_SELF : member.color} size="sm" />)}</span><span className="text-sm font-semibold">{team.members.length}{team.members.length > MAX_FACES && <span className="sr-only"> trenere</span>}</span></>}
      {team.invitations.length > 0 && <span className="text-xs font-semibold text-[var(--ink-soft)]">+{team.invitations.length} invitert</span>}
    </span>
    <span className="truncate pl-[52px] text-sm text-[var(--ink-soft)] md:pl-0">{sessionSummary || "Ingen økter"}</span>
  </Link></li>;
}
