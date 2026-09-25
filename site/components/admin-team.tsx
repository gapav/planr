"use client";

import { ArrowLeft, CalendarDays, Check, ChevronRight, Copy, Mail, MailCheck, Pencil, Search, Send, TriangleAlert, Trash2, UserPlus, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { AdminFrame } from "@/components/admin-frame";
import { ADMIN_PAGE_SIZE, ShowMore } from "@/components/admin-list";
import { type InviteResult, useGrep } from "@/components/app-provider";
import { TeamCrest } from "@/components/team-crest";
import { Avatar, Button, EmptyState, Field, inputClass, Modal, Tag } from "@/components/ui";
import { canDemoteMember, isTeamMemberOf, sessionCountsByTeam, teamNeedsAdmin, teamSessionsInTab } from "@/lib/admin";
import { invitationUrl } from "@/lib/auth";
import { DISPLAY_NAME_MAX_LENGTH, DISPLAY_NAME_MIN_LENGTH } from "@/lib/profile";
import { COACH_AVATAR_SELF } from "@/lib/team-palette";
import type { AdminTeam, AdminTeamMember, SessionTab, TeamInvitation, TeamRole } from "@/lib/types";
import { formatSessionDate } from "@/lib/utils";

const roleLabel: Record<TeamRole, string> = { admin: "Lagadministrator", coach: "Trener" };
type TeamView = "coaches" | "sessions" | "settings";
const views: Array<{ id: TeamView; label: string }> = [{ id: "coaches", label: "Trenere" }, { id: "sessions", label: "Økter" }, { id: "settings", label: "Innstillinger" }];
const sessionTabs: Array<{ id: SessionTab; label: string }> = [{ id: "upcoming", label: "Kommende" }, { id: "drafts", label: "Utkast" }, { id: "past", label: "Gjennomførte" }];

function readView(value: string | null): TeamView { return value === "sessions" || value === "settings" ? value : "coaches"; }

/**
 * `/admin/teams/<id>`: everything the console does to one team. The view sits
 * in `?vis=` so a link to a team's sessions opens on its sessions.
 */
export function AdminTeamScreen({ teamId }: { teamId: string }) {
  return <AdminFrame><AdminTeamContent teamId={teamId} /></AdminFrame>;
}

function AdminTeamContent({ teamId }: { teamId: string }) {
  const { user, adminTeams, adminTeamsLoaded } = useGrep();
  const search = useSearchParams();
  const view = readView(search.get("vis"));
  const [inviteOpen, setInviteOpen] = useState(false);
  const team = adminTeams.find((entry) => entry.id === teamId);

  if (!adminTeamsLoaded) return <p className="text-sm text-[var(--ink-soft)]">Laster laget …</p>;
  if (!team) return <div className="py-12"><EmptyState icon={<Users size={22} />} title="Laget finnes ikke" body="Det kan ha blitt slettet, eller lenken er feil." action={<Link href="/admin" className="grep-action">Til alle lag</Link>} /></div>;

  return <>
    <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--ink-soft)] hover:text-[var(--ink)]"><ArrowLeft size={16} />Alle lag</Link>
    <header className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-4"><TeamCrest team={team} size="lg" /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-3xl font-black tracking-[-.045em] sm:text-4xl">{team.shortName}</h1>{teamNeedsAdmin(team) && <Tag tone="orange">Mangler lagadministrator</Tag>}{isTeamMemberOf(team, user?.id) && <Tag>Du er medlem</Tag>}</div><p className="mt-1 truncate text-sm text-[var(--ink-soft)]">{team.name} · {team.members.length} {team.members.length === 1 ? "trener" : "trenere"}</p></div></div>
      <Button onClick={() => setInviteOpen(true)}><UserPlus size={17} />Inviter trener</Button>
    </header>

    <TeamViewNav teamId={team.id} view={view} coachCount={team.members.length + team.invitations.length} />

    <div className="mt-6">
      {view === "coaches" && <CoachesView team={team} onInvite={() => setInviteOpen(true)} />}
      {view === "sessions" && <SessionsView teamId={team.id} />}
      {view === "settings" && <SettingsView team={team} />}
    </div>

    <InviteDialog team={team} open={inviteOpen} onClose={() => setInviteOpen(false)} />
  </>;
}

function TeamViewNav({ teamId, view, coachCount }: { teamId: string; view: TeamView; coachCount: number }) {
  const { sessions, adminSessions } = useGrep();
  const counts = useMemo(() => sessionCountsByTeam([...sessions, ...adminSessions]).get(teamId), [adminSessions, sessions, teamId]);
  const sessionCount = counts ? counts.upcoming + counts.drafts + counts.past : 0;
  const badge: Partial<Record<TeamView, number>> = { coaches: coachCount, sessions: sessionCount };
  return <nav className="grep-segments mt-7" aria-label="Om laget">{views.map((entry) => <Link key={entry.id} href={entry.id === "coaches" ? `/admin/teams/${teamId}` : `/admin/teams/${teamId}?vis=${entry.id}`} replace scroll={false} aria-current={view === entry.id ? "page" : undefined}>{entry.label}{badge[entry.id] !== undefined && <span>{badge[entry.id]}</span>}</Link>)}</nav>;
}

function Panel({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return <section className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--surface)] shadow-[0_8px_30px_rgba(16,32,29,.04)]">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3 sm:px-6"><h2 className="text-xs font-black uppercase tracking-[.13em] text-[var(--ink-soft)]">{title}</h2>{aside}</div>
    {children}
  </section>;
}

function useCopy(onError: (message: string) => void) {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(key: string, text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(key); window.setTimeout(() => setCopied((current) => current === key ? null : current), 2000); }
    catch { onError("Kopieringen mislyktes — marker lenken og kopier den manuelt."); }
  }
  return { copied, copy };
}

/** Only worth a search box once the list no longer fits on one screen. */
const MEMBER_SEARCH_FROM = 8;

function CoachesView({ team, onInvite }: { team: AdminTeam; onInvite(): void }) {
  const { user, adminResendInvitation, adminSendLoginLink, adminRevokeInvitation, adminSetMemberRole, adminSetDisplayName, adminRemoveMember } = useGrep();
  const [query, setQuery] = useState("");
  const [resent, setResent] = useState<string | null>(null); const [loginSent, setLoginSent] = useState<string | null>(null);
  const [handover, setHandover] = useState<{ email: string; link: string } | null>(null);
  const [renameMember, setRenameMember] = useState<AdminTeamMember | null>(null); const [memberName, setMemberName] = useState("");
  const [removing, setRemoving] = useState<AdminTeamMember | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const { copied, copy } = useCopy(setError);
  const isGlobalAdmin = user?.isGlobalAdmin === true;
  const needle = query.trim().toLocaleLowerCase("nb-NO");
  const members = needle ? team.members.filter((member) => `${member.fullName} ${member.email}`.toLocaleLowerCase("nb-NO").includes(needle)) : team.members;

  function linkFor(invitation: TeamInvitation) { return invitation.token ? invitationUrl(window.location.origin, invitation.token) : null; }
  async function run(action: () => Promise<unknown>) { setBusy(true); setError(null); try { await action(); return true; } catch (caught) { setError(caught instanceof Error ? caught.message : "Handlingen kunne ikke fullføres"); return false; } finally { setBusy(false); } }
  async function resend(invitation: TeamInvitation) {
    setHandover(null);
    await run(async () => {
      const result = await adminResendInvitation(team.id, invitation.id);
      if (result.emailed) { setResent(invitation.id); window.setTimeout(() => setResent((current) => current === invitation.id ? null : current), 2500); }
      else if (result.loginLink) setHandover({ email: invitation.email, link: result.loginLink });
      else throw new Error(result.emailError ?? "E-posten kunne ikke sendes.");
    });
  }
  async function sendLogin(member: AdminTeamMember) {
    setHandover(null);
    await run(async () => {
      const result = await adminSendLoginLink(member.email);
      if (result.emailed) { setLoginSent(member.id); window.setTimeout(() => setLoginSent((current) => current === member.id ? null : current), 2500); }
      else if (result.link) setHandover({ email: member.email, link: result.link });
      else throw new Error(result.emailError ?? "Lenken kunne ikke sendes.");
    });
  }
  // A coach's name starts as the email local part, and the administrator who
  // onboards them sees it first. They can still fix it themselves from /team.
  async function renameCoach(event: React.FormEvent) {
    event.preventDefault();
    if (!renameMember) return;
    const target = renameMember;
    if (await run(() => adminSetDisplayName(target.id, memberName))) setRenameMember(null);
  }
  async function remove() {
    if (!removing) return;
    const target = removing;
    if (await run(() => adminRemoveMember(team.id, target.id))) setRemoving(null);
  }

  return <div className="grid gap-5">
    {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-[var(--danger)]">{error}</p>}

    {team.invitations.length > 0 && <Panel title={`Ventende invitasjoner · ${team.invitations.length}`}>
      <ul className="divide-y divide-[var(--line)]">{team.invitations.map((invitation) => <li key={invitation.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-6"><Mail size={16} className="shrink-0 text-[var(--ink-soft)]" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{invitation.email}</p><p className="text-xs text-[var(--ink-soft)]">{roleLabel[invitation.role].toLowerCase()} · blir med ved første innlogging</p></div>
        <Button variant="ghost" size="sm" className="px-2" disabled={busy} title="Send på nytt" aria-label={`Send invitasjonen til ${invitation.email} på nytt`} onClick={() => void resend(invitation)}>{resent === invitation.id ? <Check size={15} className="text-[var(--green)]" /> : <Send size={15} />}</Button>
        <Button variant="ghost" size="sm" className="px-2" disabled={!invitation.token} title="Kopier lenken" aria-label={`Kopier invitasjonslenken for ${invitation.email}`} onClick={() => { const link = linkFor(invitation); if (link) void copy(invitation.id, link); }}>{copied === invitation.id ? <Check size={15} className="text-[var(--green)]" /> : <Copy size={15} />}</Button>
        <Button variant="ghost" size="sm" className="px-2 text-[var(--danger)]" disabled={busy} title="Trekk tilbake" aria-label={`Trekk tilbake invitasjonen til ${invitation.email}`} onClick={() => void run(() => adminRevokeInvitation(team.id, invitation.id))}><X size={16} /></Button>
      </li>)}</ul>
    </Panel>}

    <Panel title={`Trenere · ${team.members.length}`} aside={team.members.length >= MEMBER_SEARCH_FROM && <label className="relative block w-full sm:w-64"><span className="sr-only">Søk blant trenerne</span><Search className="absolute left-3 top-2.5 text-[var(--ink-soft)]" size={15} /><input type="search" className="min-h-9 w-full rounded-xl border border-[var(--line)] bg-white pl-9 pr-3 text-sm" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Søk navn eller e-post" /></label>}>
      {team.members.length === 0
        ? <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6"><p className="flex items-center gap-2.5 text-sm text-[var(--ink-soft)]"><TriangleAlert size={17} className="text-[var(--orange)]" />Ingen trenere ennå. Inviter en lagadministrator som kan ta over laget.</p><Button size="sm" onClick={onInvite}><UserPlus size={16} />Inviter</Button></div>
        : members.length === 0 ? <p className="px-4 py-5 text-sm text-[var(--ink-soft)] sm:px-6">Ingen trenere matcher søket.</p>
        : <ul className="divide-y divide-[var(--line)]">{members.map((member) => <li key={member.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6">
          <Avatar name={member.fullName} initials={member.initials} color={member.id === user?.id ? COACH_AVATAR_SELF : member.color} />
          <div className="min-w-0 flex-[1_1_200px]"><div className="flex items-center gap-2"><p className="truncate text-sm font-black">{member.fullName}</p>{member.id === user?.id && <Tag>Deg</Tag>}</div><p className="truncate text-xs text-[var(--ink-soft)]">{member.email}</p></div>
          <select className="min-h-9 rounded-xl border border-[var(--line)] bg-white px-2 text-xs font-bold disabled:opacity-50" value={member.teamRole} disabled={busy || (member.teamRole === "admin" && !canDemoteMember(team, member.id, isGlobalAdmin))} onChange={(event) => void run(() => adminSetMemberRole(team.id, member.id, event.target.value as TeamRole))} aria-label={`Rolle for ${member.fullName} i ${team.shortName}`}><option value="coach">Trener</option><option value="admin">Administrator</option></select>
          <span className="flex items-center">
            <Button variant="ghost" size="sm" className="px-2" disabled={busy} aria-label={`Endre visningsnavn for ${member.fullName}`} title="Endre visningsnavn" onClick={() => { setMemberName(member.fullName); setRenameMember(member); setError(null); }}><Pencil size={16} /></Button>
            <Button variant="ghost" size="sm" className="px-2" disabled={busy} aria-label={`Send innloggingslenke til ${member.fullName}`} title="Send innloggingslenke" onClick={() => void sendLogin(member)}>{loginSent === member.id ? <Check size={16} className="text-[var(--green)]" /> : <Mail size={16} />}</Button>
            <Button variant="ghost" size="sm" className="px-2 text-[var(--danger)]" title="Fjern fra laget" aria-label={member.id === user?.id ? `Forlat ${team.shortName}` : `Fjern ${member.fullName} fra ${team.shortName}`} disabled={busy || !canDemoteMember(team, member.id, isGlobalAdmin)} onClick={() => setRemoving(member)}><Trash2 size={16} /></Button>
          </span>
        </li>)}</ul>}
    </Panel>

    <Modal open={handover !== null} onClose={() => setHandover(null)} title="Send innloggingslenken" description={handover ? `E-post er ikke satt opp, så ${handover.email} må få lenken fra deg.` : ""}>
      {handover && <div className="grid gap-5">
        <div className="rounded-xl border border-[var(--line)] bg-[var(--paper)] p-3"><p className="break-all font-mono text-[13px] leading-6">{handover.link}</p></div>
        <p className="text-sm leading-6 text-[var(--ink-soft)]">Lenken logger treneren inn uten passord. Den virker én gang, og bare for {handover.email} — send den direkte til treneren, ikke i en delt kanal.</p>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => void copy("handover", handover.link)}>{copied === "handover" ? <><Check size={17} />Kopiert</> : <><Copy size={17} />Kopier lenken</>}</Button><Button type="button" onClick={() => setHandover(null)}>Ferdig</Button></div>
      </div>}
    </Modal>

    <Modal open={renameMember !== null} onClose={() => setRenameMember(null)} title="Endre visningsnavn" description={renameMember ? `Navnet ${renameMember.email} vises med på økter, aktiviteter og i e-postene. Innloggingen er fortsatt e-postadressen.` : ""}>
      <form className="grid gap-5" onSubmit={renameCoach}>
        <Field label="Visningsnavn"><input required minLength={DISPLAY_NAME_MIN_LENGTH} maxLength={DISPLAY_NAME_MAX_LENGTH} className={inputClass} value={memberName} onChange={(event) => setMemberName(event.target.value)} autoComplete="off" autoFocus /></Field>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setRenameMember(null)}>Avbryt</Button><Button disabled={busy}>{busy ? "Lagrer…" : "Lagre navn"}</Button></div>
      </form>
    </Modal>

    <Modal open={removing !== null} onClose={() => { if (!busy) setRemoving(null); }} title={removing?.id === user?.id ? `Forlat ${team.shortName}?` : "Fjern fra laget?"} description={removing ? (removing.id === user?.id ? "Grep-kontoen din og andre lag berøres ikke." : `${removing.fullName} mister tilgangen til ${team.shortName}. Grep-kontoen og eventuelle andre lag beholdes.`) : ""}>
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={busy} onClick={() => setRemoving(null)}>Avbryt</Button><Button type="button" variant="danger" disabled={busy} onClick={() => void remove()}>{busy ? "Fjerner…" : removing?.id === user?.id ? "Forlat laget" : "Fjern fra laget"}</Button></div>
    </Modal>
  </div>;
}

/**
 * The team's plans, read-only for a team the admin is not on. A team the
 * admin also coaches keeps its plans in `sessions`, the rest arrive through
 * `adminSessions`; either way `/sessions/<id>` decides what the admin may do.
 */
function SessionsView({ teamId }: { teamId: string }) {
  const { sessions, adminSessions } = useGrep();
  const [tab, setTab] = useState<SessionTab>("upcoming"); const [limit, setLimit] = useState(ADMIN_PAGE_SIZE);
  const all = useMemo(() => [...sessions, ...adminSessions], [adminSessions, sessions]);
  const counts = useMemo(() => sessionCountsByTeam(all).get(teamId) ?? { upcoming: 0, drafts: 0, past: 0 }, [all, teamId]);
  const rows = useMemo(() => teamSessionsInTab(all, teamId, tab), [all, teamId, tab]);

  return <div className="grid gap-4">
    <div className="grep-segments self-start" role="group" aria-label="Vis økter">{sessionTabs.map((entry) => <button key={entry.id} type="button" aria-pressed={tab === entry.id} onClick={() => { setTab(entry.id); setLimit(ADMIN_PAGE_SIZE); }}>{entry.label}<span>{counts[entry.id]}</span></button>)}</div>
    {rows.length === 0
      ? <p className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 text-sm text-[var(--ink-soft)]">{tab === "upcoming" ? "Ingen kommende økter." : tab === "drafts" ? "Ingen økter under planlegging." : "Ingen gjennomførte økter."}</p>
      : <div className="overflow-hidden rounded-[22px] border border-[var(--line)] bg-[var(--surface)]">
          <ul className="divide-y divide-[var(--line)]">{rows.slice(0, limit).map((session) => <li key={session.id}><Link href={`/sessions/${session.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-[var(--paper)] sm:px-6"><CalendarDays size={16} className="shrink-0 text-[var(--ink-soft)]" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{session.title}</span><span className="block text-xs text-[var(--ink-soft)]">{formatSessionDate(session.startsAt)}{session.venue ? ` · ${session.venue}` : ""}</span></span>{session.status === "in_progress" && <Tag tone="green">Pågår</Tag>}<ChevronRight size={17} className="shrink-0 text-[var(--ink-soft)]" /></Link></li>)}</ul>
          <ShowMore shown={Math.min(limit, rows.length)} total={rows.length} onMore={() => setLimit((current) => current + ADMIN_PAGE_SIZE)} />
        </div>}
  </div>;
}

function SettingsView({ team }: { team: AdminTeam }) {
  const { renameTeam, deleteTeam } = useGrep();
  const router = useRouter();
  const [name, setName] = useState(team.name); const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState<"rename" | "delete" | null>(null); const [saved, setSaved] = useState(false); const [error, setError] = useState<string | null>(null);
  const confirmed = confirmation.trim().toLocaleLowerCase("nb-NO") === team.shortName.toLocaleLowerCase("nb-NO");

  async function rename(event: React.FormEvent) {
    event.preventDefault(); setBusy("rename"); setError(null); setSaved(false);
    try { await renameTeam(team.id, name); setSaved(true); } catch (caught) { setError(caught instanceof Error ? caught.message : "Navnet kunne ikke lagres"); } finally { setBusy(null); }
  }
  async function remove(event: React.FormEvent) {
    event.preventDefault(); if (!confirmed) return; setBusy("delete"); setError(null);
    try { await deleteTeam(team.id); router.replace("/admin"); } catch (caught) { setError(caught instanceof Error ? caught.message : "Laget kunne ikke slettes"); setBusy(null); }
  }

  return <div className="grid max-w-2xl gap-5">
    {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-[var(--danger)]">{error}</p>}
    <Panel title="Lagnavn">
      <form className="grid gap-4 p-4 sm:p-6" onSubmit={rename}>
        <Field label="Lagnavn" hint="Vises i sidemenyen og på øktene til laget. Skriv «Klubb — Lag» for å få klubbnavnet med."><input required minLength={3} className={inputClass} value={name} onChange={(event) => { setName(event.target.value); setSaved(false); }} /></Field>
        <div className="flex items-center justify-end gap-3">{saved && <span className="flex items-center gap-1.5 text-sm font-semibold text-[var(--ink-soft)]"><Check size={16} />Lagret</span>}<Button disabled={busy !== null || name.trim() === team.name}>{busy === "rename" ? "Lagrer…" : "Lagre navn"}</Button></div>
      </form>
    </Panel>
    <section className="rounded-[22px] border border-red-200 bg-red-50/50 p-4 sm:p-6">
      <h2 className="font-black text-[#7f1d1d]">Slett laget</h2>
      <p className="mt-1.5 text-sm leading-6 text-[#7f1d1d]">Alle øktene, spillerne og kampene til laget slettes, og trenerne mister tilgangen. Kontoene deres beholdes. Dette kan ikke angres.</p>
      <form className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={remove}>
        <label className="grid gap-2 text-sm font-semibold"><span>Skriv <strong>{team.shortName}</strong> for å bekrefte</span><input className={inputClass} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></label>
        <Button type="submit" variant="danger" disabled={busy !== null || !confirmed}><Trash2 size={16} />{busy === "delete" ? "Sletter…" : "Slett laget"}</Button>
      </form>
    </section>
  </div>;
}

function InviteDialog({ team, open, onClose }: { team: AdminTeam; open: boolean; onClose(): void }) {
  const { adminInviteMember } = useGrep();
  const [email, setEmail] = useState(""); const [role, setRole] = useState<TeamRole>("coach");
  const [invited, setInvited] = useState<InviteResult | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const { copied, copy } = useCopy(setError);

  async function invite(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(null); try { setInvited(await adminInviteMember(team.id, email, role)); } catch (caught) { setError(caught instanceof Error ? caught.message : "Invitasjonen kunne ikke opprettes"); } finally { setBusy(false); } }
  function close() { onClose(); setInvited(null); setEmail(""); setRole("coach"); setError(null); }

  return <Modal open={open} onClose={close} title={invited ? (invited.emailed ? "Invitasjonen er sendt" : invited.loginLink ? "Send lenken til treneren" : "Plassen er reservert") : `Inviter en trener til ${team.shortName}`} description={invited ? (invited.emailed ? "Treneren logger inn fra lenken i e-posten." : invited.loginLink ? "Kontoen er klar. Lenken under er alt treneren trenger." : "Kontoen ble ikke opprettet.") : "Treneren får en sikker engangslenke, logger inn og blir med på laget automatisk. Invitasjonen utløper etter sju dager."}>
    {invited
      ? <div className="grid gap-5">
          {invited.emailed
            ? <div className="flex items-start gap-3 rounded-xl bg-[var(--mint)] p-3.5"><MailCheck size={20} className="mt-0.5 shrink-0" /><p className="text-sm leading-6">Vi har sendt en innloggingslenke til <strong>{email}</strong>. Treneren logger inn og blir med på {team.shortName} med én gang.</p></div>
            : <><p role="alert" className={`rounded-xl px-3 py-2 text-sm font-semibold ${invited.loginLink ? "bg-[var(--mint)] text-[var(--ink)]" : "bg-red-50 text-[var(--danger)]"}`}>{invited.emailError}</p><p className="text-sm leading-6 text-[var(--ink-soft)]">{invited.loginLink ? <>Kontoen til <strong>{email}</strong> er opprettet og plassen står klar. Send lenken under til treneren selv — den logger dem inn uten passord.</> : <>Plassen på laget står klar. Send lenken under til <strong>{email}</strong> selv, eller prøv å sende e-posten på nytt fra listen over ventende invitasjoner.</>}</p><div className="rounded-xl border border-[var(--line)] bg-[var(--paper)] p-3"><p className="break-all font-mono text-[13px] leading-6">{invited.loginLink ?? invited.inviteUrl}</p></div>{invited.loginLink && <p className="text-xs leading-5 text-[var(--ink-soft)]">Lenken virker én gang, og bare for {email}. Send den direkte til treneren — ikke i en delt kanal.</p>}</>}
          <div className="flex justify-end gap-2">{!invited.emailed && <Button type="button" variant="secondary" onClick={() => void copy("new", invited.loginLink ?? invited.inviteUrl)}>{copied === "new" ? <><Check size={17} />Kopiert</> : <><Copy size={17} />Kopier lenken</>}</Button>}<Button type="button" onClick={close}>Ferdig</Button></div>
        </div>
      : <form className="grid gap-5" onSubmit={invite}><Field label="Trenerens e-postadresse"><div className="relative"><Mail className="absolute left-3.5 top-3.5 text-[var(--ink-soft)]" size={17} /><input type="email" required className={`${inputClass} pl-10`} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="trener@klubb.no" autoFocus /></div></Field><Field label="Rolle på laget"><select className={inputClass} value={role} onChange={(event) => setRole(event.target.value as TeamRole)}><option value="coach">Trener — planlegg og publiser økter</option><option value="admin">Administrator — administrer også tilgangen til laget</option></select></Field>{error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-[var(--danger)]">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={close}>Avbryt</Button><Button disabled={busy}>{busy ? "Oppretter…" : "Opprett invitasjonslenke"}</Button></div></form>}
  </Modal>;
}
