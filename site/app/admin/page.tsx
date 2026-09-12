"use client";

import { Check, Copy, Mail, MailCheck, Pencil, Plus, Send, ShieldCheck, TriangleAlert, Trash2, UserPlus, Users, X } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { AdminAccountDirectory } from "@/components/admin-account-directory";
import { type InviteResult, useGrep } from "@/components/app-provider";
import { TeamCrest } from "@/components/team-crest";
import { Avatar, Button, EmptyState, Field, inputClass, Modal, Tag } from "@/components/ui";
import { canDemoteMember, isTeamMemberOf, teamNeedsAdmin } from "@/lib/admin";
import { invitationUrl } from "@/lib/auth";
import type { AdminTeam, AdminTeamMember, TeamInvitation, TeamRole } from "@/lib/types";

const roleLabel: Record<TeamRole, string> = { admin: "Lagadministrator", coach: "Trener" };

export default function AdminPage() {
  const { user, workspaceLoaded, adminTeams, adminTeamsLoaded, adminAccounts, adminAccountsLoaded, createTeam, deleteAccountPermanently } = useGrep();
  const [createOpen, setCreateOpen] = useState(false); const [teamName, setTeamName] = useState(""); const [adminEmail, setAdminEmail] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  const isGlobalAdmin = user?.isGlobalAdmin === true;

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(null);
    try { await createTeam(teamName, adminEmail); setCreateOpen(false); setTeamName(""); setAdminEmail(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Laget kunne ikke opprettes"); }
    finally { setSaving(false); }
  }

  if (!workspaceLoaded) return <AppShell><div className="grid min-h-[60vh] place-items-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--line)] border-t-[var(--orange)]" aria-label="Laster" /></div></AppShell>;
  if (!isGlobalAdmin) return <AppShell><div className="mx-auto max-w-3xl px-4 py-20"><EmptyState icon={<ShieldCheck size={22} />} title="Ingen tilgang" body="Bare en systemadministrator kan opprette lag og tildele trenere. Spillerlisten og klubblogoen til laget ditt finner du under Lag og spillere." /></div></AppShell>;

  return <AppShell><div className="mx-auto max-w-[1100px] px-4 pb-16 pt-7 sm:px-8 sm:pt-10">
    <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-xs font-black uppercase tracking-[.16em] text-[var(--orange)]">Systemadministrasjon</p><h1 className="mt-2 text-4xl font-black tracking-[-.055em] sm:text-5xl">Lag og trenere</h1><p className="mt-3 max-w-xl text-[var(--ink-soft)]">Opprett lag og gi dem en lagadministrator. Du blir ikke medlem av lagene du oppretter, og står derfor ikke i lagoversikten deres.</p></div><Button size="lg" onClick={() => setCreateOpen(true)}><Plus size={18} />Opprett lag</Button></header>

    <section className="mt-8 flex items-start gap-4 rounded-[24px] bg-[var(--ink)] p-5 text-white"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10"><Mail size={20} /></span><div><h2 className="font-black">Slik får treneren tilgang</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">Trykk <strong className="font-bold text-white/75">Inviter</strong> på laget. Treneren får en sikker engangslenke, logger inn og blir med på laget automatisk. Nettleseren husker innloggingen, så det trengs ikke noe passord.</p></div></section>

    {!adminTeamsLoaded ? <p className="mt-8 text-sm text-[var(--ink-soft)]">Laster lagene …</p>
      : adminTeams.length === 0 ? <div className="mt-8"><EmptyState icon={<Users size={22} />} title="Ingen lag ennå" body="Opprett det første laget og inviter en lagadministrator som kan planlegge for det." action={<Button onClick={() => setCreateOpen(true)}><Plus size={17} />Opprett lag</Button>} /></div>
      : <div className="mt-8 grid gap-5">{adminTeams.map((team) => <AdminTeamCard key={team.id} team={team} />)}</div>}

    <AdminAccountDirectory accounts={adminAccounts} loaded={adminAccountsLoaded} currentUserId={user.id} onDelete={deleteAccountPermanently} />

    <Modal open={createOpen} onClose={() => { setCreateOpen(false); setError(null); }} title="Opprett et lag" description="Laget får sin egen lagadministrator. Du blir ikke medlem.">
      <form className="grid gap-5" onSubmit={submit}>
        <Field label="Lagnavn" hint="Skriv «Klubb — Lag» for å få klubbnavnet med i lagoversikten."><input required minLength={3} className={inputClass} value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Fjordvik HK — Gutter 18" autoFocus /></Field>
        <Field label="Lagadministratorens e-postadresse" hint="Kan stå tom hvis du vil invitere treneren senere."><div className="relative"><Mail className="absolute left-3.5 top-3.5 text-[var(--ink-soft)]" size={17} /><input type="email" className={`${inputClass} pl-10`} value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} placeholder="trener@klubb.no" /></div></Field>
        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-[var(--danger)]">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => { setCreateOpen(false); setError(null); }}>Avbryt</Button><Button disabled={saving}>{saving ? "Oppretter…" : "Opprett lag"}</Button></div>
      </form>
    </Modal>
  </div></AppShell>;
}

function AdminTeamCard({ team }: { team: AdminTeam }) {
  const { user, renameTeam, deleteTeam, adminInviteMember, adminResendInvitation, adminSendLoginLink, adminRevokeInvitation, adminSetMemberRole, adminRemoveMember } = useGrep();
  const [inviteOpen, setInviteOpen] = useState(false); const [renameOpen, setRenameOpen] = useState(false);
  const [email, setEmail] = useState(""); const [role, setRole] = useState<TeamRole>("coach"); const [name, setName] = useState(team.name);
  const [invited, setInvited] = useState<InviteResult | null>(null); const [copied, setCopied] = useState<string | null>(null); const [resent, setResent] = useState<string | null>(null); const [handover, setHandover] = useState<{ email: string; link: string; kind: "invite" | "login" } | null>(null); const [loginSent, setLoginSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const isGlobalAdmin = user?.isGlobalAdmin === true;
  const youAreOnTeam = isTeamMemberOf(team, user?.id);

  async function copy(key: string, text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(key); window.setTimeout(() => setCopied((current) => current === key ? null : current), 2000); }
    catch { setError("Kopieringen mislyktes — marker lenken og kopier den manuelt."); }
  }
  function linkFor(invitation: TeamInvitation) { return invitation.token ? invitationUrl(window.location.origin, invitation.token) : null; }
  async function run(action: () => Promise<unknown>) { setBusy(true); setError(null); try { await action(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Handlingen kunne ikke fullføres"); } finally { setBusy(false); } }
  async function invite(event: React.FormEvent) { event.preventDefault(); setBusy(true); setError(null); try { setInvited(await adminInviteMember(team.id, email, role)); } catch (caught) { setError(caught instanceof Error ? caught.message : "Invitasjonen kunne ikke opprettes"); } finally { setBusy(false); } }
  function closeInvite() { setInviteOpen(false); setInvited(null); setEmail(""); setRole("coach"); setError(null); }
  async function resend(invitation: TeamInvitation) {
    setBusy(true); setError(null);
    setHandover(null);
    try { const result = await adminResendInvitation(team.id, invitation.id); if (result.emailed) { setResent(invitation.id); window.setTimeout(() => setResent((current) => current === invitation.id ? null : current), 2500); } else if (result.loginLink) setHandover({ email: invitation.email, link: result.loginLink, kind: "invite" }); else setError(result.emailError ?? "E-posten kunne ikke sendes."); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "E-posten kunne ikke sendes"); }
    finally { setBusy(false); }
  }
  async function sendLogin(member: AdminTeamMember) {
    setBusy(true); setError(null); setHandover(null);
    try { const result = await adminSendLoginLink(member.email); if (result.emailed) { setLoginSent(member.id); window.setTimeout(() => setLoginSent((current) => current === member.id ? null : current), 2500); } else if (result.link) setHandover({ email: member.email, link: result.link, kind: "login" }); else setError(result.emailError ?? "Lenken kunne ikke sendes."); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Lenken kunne ikke sendes"); }
    finally { setBusy(false); }
  }
  async function rename(event: React.FormEvent) { event.preventDefault(); await run(() => renameTeam(team.id, name)); setRenameOpen(false); }

  return <section className="overflow-hidden rounded-[26px] border border-[var(--line)] bg-[var(--surface)] shadow-[0_8px_30px_rgba(16,32,29,.04)]">
    <div className="flex flex-wrap items-center gap-4 border-b border-[var(--line)] p-5 sm:p-6"><TeamCrest team={team} size="lg" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-xl font-black">{team.shortName}</h2>{teamNeedsAdmin(team) && <Tag tone="orange">Mangler lagadministrator</Tag>}{youAreOnTeam && <Tag>Du er medlem</Tag>}</div><p className="mt-1 truncate text-sm text-[var(--ink-soft)]">{team.name} · {team.members.length} {team.members.length === 1 ? "medlem" : "medlemmer"}</p></div><div className="flex items-center gap-2"><Button variant="secondary" size="sm" onClick={() => { setName(team.name); setRenameOpen(true); }}><Pencil size={16} />Endre navn</Button><Button size="sm" onClick={() => setInviteOpen(true)}><UserPlus size={16} />Inviter</Button><Button variant="ghost" size="sm" className="px-2 text-[var(--danger)]" aria-label={`Slett ${team.shortName}`} disabled={busy} onClick={() => { if (confirm(`Vil du slette ${team.shortName}? Alle øktene og spillerne til laget slettes også, og dette kan ikke angres.`)) void run(() => deleteTeam(team.id)); }}><Trash2 size={17} /></Button></div></div>

    {team.members.length === 0 && team.invitations.length === 0
      ? <p className="flex items-center gap-2.5 p-5 text-sm text-[var(--ink-soft)] sm:px-6"><TriangleAlert size={17} className="text-[var(--orange)]" />Ingen trenere ennå. Inviter en lagadministrator som kan ta over laget.</p>
      : <div className="divide-y divide-[var(--line)]">{team.members.map((member) => <div key={member.id} className="flex flex-wrap items-center gap-3 p-4 sm:px-6"><Avatar name={member.fullName} initials={member.initials} color={member.id === user?.id ? "#f0642e" : member.color} size="lg" /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate font-black">{member.fullName}</p>{member.id === user?.id && <Tag>Deg</Tag>}</div><p className="truncate text-sm text-[var(--ink-soft)]">{member.email}</p></div><select className="min-h-9 rounded-xl border border-[var(--line)] bg-white px-2 text-xs font-bold disabled:opacity-50" value={member.teamRole} disabled={busy || (member.teamRole === "admin" && !canDemoteMember(team, member.id, isGlobalAdmin))} onChange={(event) => void run(() => adminSetMemberRole(team.id, member.id, event.target.value as TeamRole))} aria-label={`Rolle for ${member.fullName} i ${team.shortName}`}><option value="coach">Trener</option><option value="admin">Administrator</option></select><Button variant="ghost" size="sm" className="px-2" disabled={busy} aria-label={`Send innloggingslenke til ${member.fullName}`} title="Send innloggingslenke" onClick={() => void sendLogin(member)}>{loginSent === member.id ? <Check size={16} className="text-[var(--green)]" /> : <Mail size={16} />}</Button><Button variant="ghost" size="sm" className="px-2 text-[var(--danger)]" title="Fjern fra laget" aria-label={member.id === user?.id ? `Forlat ${team.shortName}` : `Fjern ${member.fullName} fra ${team.shortName}`} disabled={busy || !canDemoteMember(team, member.id, isGlobalAdmin)} onClick={() => { const question = member.id === user?.id ? `Vil du forlate ${team.shortName}? Grep-kontoen din og andre lag berøres ikke.` : `Vil du fjerne ${member.fullName} fra ${team.shortName}? Grep-kontoen og eventuelle andre lag beholdes.`; if (confirm(question)) void run(() => adminRemoveMember(team.id, member.id)); }}><Trash2 size={17} /></Button></div>)}</div>}

    {team.invitations.length > 0 && <div className="border-t border-[var(--line)] bg-[var(--paper)]/55 p-5 sm:p-6"><p className="text-xs font-black uppercase tracking-[.13em] text-[var(--ink-soft)]">Ventende invitasjoner</p><div className="mt-3 grid gap-2">{team.invitations.map((invitation) => <div key={invitation.id} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2.5"><Mail size={16} className="text-[var(--ink-soft)]" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{invitation.email}</p><p className="text-xs text-[var(--ink-soft)]">{roleLabel[invitation.role].toLowerCase()} · blir med ved første innlogging</p></div><Button variant="ghost" size="sm" className="px-2" disabled={busy} aria-label={`Send invitasjonen til ${invitation.email} på nytt`} onClick={() => void resend(invitation)}>{resent === invitation.id ? <Check size={15} className="text-[var(--green)]" /> : <Send size={15} />}</Button><Button variant="ghost" size="sm" className="px-2" disabled={!invitation.token} aria-label={`Kopier invitasjonslenken for ${invitation.email}`} onClick={() => { const link = linkFor(invitation); if (link) void copy(invitation.id, link); }}>{copied === invitation.id ? <Check size={15} className="text-[var(--green)]" /> : <Copy size={15} />}</Button><Button variant="ghost" size="sm" className="px-2 text-[var(--danger)]" disabled={busy} aria-label={`Trekk tilbake invitasjonen til ${invitation.email}`} onClick={() => void run(() => adminRevokeInvitation(team.id, invitation.id))}><X size={16} /></Button></div>)}</div></div>}

    {error && <p role="alert" className="border-t border-[var(--line)] bg-red-50 px-5 py-3 text-sm font-semibold text-[var(--danger)] sm:px-6">{error}</p>}

    <Modal open={handover !== null} onClose={() => setHandover(null)} title="Send innloggingslenken" description={handover ? `E-post er ikke satt opp, så ${handover.email} må få lenken fra deg.` : ""}>
      {handover && <div className="grid gap-5">
        <div className="rounded-xl border border-[var(--line)] bg-[var(--paper)] p-3"><p className="break-all font-mono text-[13px] leading-6">{handover.link}</p></div>
        <p className="text-sm leading-6 text-[var(--ink-soft)]">Lenken logger treneren inn uten passord. Den virker én gang, og bare for {handover.email} — send den direkte til treneren, ikke i en delt kanal.</p>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => void copy("handover", handover.link)}>{copied === "handover" ? <><Check size={17} />Kopiert</> : <><Copy size={17} />Kopier lenken</>}</Button><Button type="button" onClick={() => setHandover(null)}>Ferdig</Button></div>
      </div>}
    </Modal>

    <Modal open={renameOpen} onClose={() => setRenameOpen(false)} title="Endre lagnavn" description="Navnet vises i sidemenyen og på øktene til laget."><form className="grid gap-5" onSubmit={rename}><Field label="Lagnavn"><input required minLength={3} className={inputClass} value={name} onChange={(event) => setName(event.target.value)} autoFocus /></Field><div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setRenameOpen(false)}>Avbryt</Button><Button disabled={busy}>{busy ? "Lagrer…" : "Lagre"}</Button></div></form></Modal>

    <Modal open={inviteOpen} onClose={closeInvite} title={invited ? (invited.emailed ? "Invitasjonen er sendt" : invited.loginLink ? "Send lenken til treneren" : "Plassen er reservert") : `Inviter en trener til ${team.shortName}`} description={invited ? (invited.emailed ? "Treneren logger inn fra lenken i e-posten." : invited.loginLink ? "Kontoen er klar. Lenken under er alt treneren trenger." : "Kontoen ble ikke opprettet.") : "Invitasjonen er knyttet til denne e-postadressen og utløper etter sju dager."}>
      {invited
        ? <div className="grid gap-5">
            {invited.emailed
              ? <div className="flex items-start gap-3 rounded-xl bg-[var(--mint)] p-3.5"><MailCheck size={20} className="mt-0.5 shrink-0" /><p className="text-sm leading-6">Vi har sendt en innloggingslenke til <strong>{email}</strong>. Treneren logger inn og blir med på {team.shortName} med én gang.</p></div>
              : <><p role="alert" className={`rounded-xl px-3 py-2 text-sm font-semibold ${invited.loginLink ? "bg-[var(--mint)] text-[var(--ink)]" : "bg-red-50 text-[var(--danger)]"}`}>{invited.emailError}</p><p className="text-sm leading-6 text-[var(--ink-soft)]">{invited.loginLink ? <>Kontoen til <strong>{email}</strong> er opprettet og plassen står klar. Send lenken under til treneren selv — den logger dem inn uten passord.</> : <>Plassen på laget står klar. Send lenken under til <strong>{email}</strong> selv, eller prøv å sende e-posten på nytt fra listen over ventende invitasjoner.</>}</p><div className="rounded-xl border border-[var(--line)] bg-[var(--paper)] p-3"><p className="break-all font-mono text-[13px] leading-6">{invited.loginLink ?? invited.inviteUrl}</p></div>{invited.loginLink && <p className="text-xs leading-5 text-[var(--ink-soft)]">Lenken virker én gang, og bare for {email}. Send den direkte til treneren — ikke i en delt kanal.</p>}</>}
            <div className="flex justify-end gap-2">{!invited.emailed && <Button type="button" variant="secondary" onClick={() => void copy("new", invited.loginLink ?? invited.inviteUrl)}>{copied === "new" ? <><Check size={17} />Kopiert</> : <><Copy size={17} />Kopier lenken</>}</Button>}<Button type="button" onClick={closeInvite}>Ferdig</Button></div>
          </div>
        : <form className="grid gap-5" onSubmit={invite}><Field label="Trenerens e-postadresse"><div className="relative"><Mail className="absolute left-3.5 top-3.5 text-[var(--ink-soft)]" size={17} /><input type="email" required className={`${inputClass} pl-10`} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="trener@klubb.no" autoFocus /></div></Field><Field label="Rolle på laget"><select className={inputClass} value={role} onChange={(event) => setRole(event.target.value as TeamRole)}><option value="coach">Trener — planlegg og publiser økter</option><option value="admin">Administrator — administrer også tilgangen til laget</option></select></Field>{error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-[var(--danger)]">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={closeInvite}>Avbryt</Button><Button disabled={busy}>{busy ? "Oppretter…" : "Opprett invitasjonslenke"}</Button></div></form>}
    </Modal>
  </section>;
}
