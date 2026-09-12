"use client";

import { ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useGrep } from "@/components/app-provider";
import { LogoArtwork } from "@/components/logo";
import { ClubLogoCard } from "@/components/club-logo-card";
import { HelpTip } from "@/components/help-tip";
import { PageHeading } from "@/components/page-heading";
import { RosterManager } from "@/components/roster-manager";
import { SessionDigestCard } from "@/components/session-digest-card";
import { TeamCrest } from "@/components/team-crest";
import { TeamInvitationsCard } from "@/components/team-invitations-card";
import { Avatar, EmptyState, Tag } from "@/components/ui";

export default function TeamPage() {
  const { currentTeam, user, teams, invitations, players, workspaceLoaded } = useGrep();
  const [view, setView] = useState<"players" | "coaches" | "settings">("players");
  const isAdmin = currentTeam?.role === "admin";
  const teamPlayers = players.filter((player) => player.teamId === currentTeam?.id);
  const tabs = [{ id: "players" as const, label: "Spillere", count: teamPlayers.length }, { id: "coaches" as const, label: "Trenere", count: currentTeam?.members.length ?? 0 }, { id: "settings" as const, label: "Innstillinger", count: null }];
  return <AppShell><div className="grep-page grep-team-page">
    <PageHeading eyebrow={currentTeam?.name ?? "Trenerrommet"} title="Laget" description="Alle med. Alle på samme side." actions={currentTeam && <TeamCrest team={currentTeam} size="lg" />} />
    {!workspaceLoaded ? <p role="status" className="overview-loading">Henter laget …</p> : !currentTeam ? <EmptyState icon={<Users size={24} />} title="Du er ikke med på noe lag ennå" body="Når du blir invitert til et lag, finner du spillerne og trenerteamet her." action={user?.isGlobalAdmin && <Link className="grep-action" href="/admin">Administrer lag</Link>} /> : <>
      <div className="grep-segments grep-team-tabs" role="group" aria-label="Vis laginformasjon">{tabs.map((tab) => <button key={tab.id} aria-pressed={view === tab.id} onClick={() => setView(tab.id)}>{tab.label}{tab.count !== null && <span>{tab.count}</span>}</button>)}</div>
      <div className="grep-team-content">
        {view === "players" && <><div className="grep-context-note"><ShieldCheck size={19} /><p>Bare trenerteamet ser spillerlisten. Vi lagrer kun navn og draktnummer.</p></div><RosterManager players={teamPlayers} canManage={isAdmin} /></>}
        {view === "coaches" && <>
          <section className="grep-team-roster"><div className="grep-section-heading"><div><h2>Trenerteam</h2><p>{currentTeam.members.length} trenere, én felles plan.</p></div><HelpTip topic="team-access" /></div>
            <div className="divide-y divide-[var(--line)]">{currentTeam.members.map((member) => <div key={member.id} className="grep-coach-row"><Avatar name={member.fullName} initials={member.initials} color={member.color} /><div><p>{member.fullName} {member.id === user?.id && <Tag>Deg</Tag>}</p><small>{member.email}</small></div><Tag tone={member.teamRole === "admin" ? "orange" : "green"}>{member.teamRole === "admin" ? "Administrator" : "Trener"}</Tag></div>)}</div>
          </section>
          {isAdmin && <TeamInvitationsCard team={currentTeam} invitations={invitations.filter((invitation) => invitation.teamId === currentTeam.id && invitation.acceptedAt === null)} />}
        </>}
        {view === "settings" && <div className="grep-settings-grid">
          <div><h2 className="grep-settings-label">For laget</h2><ClubLogoCard team={currentTeam} canManage={isAdmin} /><section className="grep-other-teams"><h3>Dine lag</h3><div className="mt-4 grid gap-2">{teams.map((team) => <div key={team.id} className="flex items-center gap-3 rounded-xl bg-[var(--paper)] p-3"><TeamCrest team={team} size="sm" /><span className="min-w-0 flex-1 text-sm">{team.shortName}</span><Tag>{team.role === "admin" ? "Administrator" : "Trener"}</Tag></div>)}</div>{user?.isGlobalAdmin ? <Link className="grep-text-link mt-4" href="/admin"><ShieldCheck size={17} />Administrer alle lag</Link> : <p className="mt-4 text-sm text-[var(--ink-soft)]">Nye lag opprettes av systemadministratoren.</p>}</section></div>
          <div><h2 className="grep-settings-label">For deg</h2><SessionDigestCard /><p className="grep-settings-hint">Dette er ditt personlige e-postvalg. Det endrer ikke varsler for de andre trenerne.</p><section className="grep-privacy-note"><LogoArtwork /><h3>Et trygt trenerrom.</h3><p>Lagets økter og spillerliste er bare tilgjengelig for lagets medlemmer.</p></section></div>
        </div>}
      </div>
    </>}
  </div></AppShell>;
}
