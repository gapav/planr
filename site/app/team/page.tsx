"use client";

import { ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { useGrep } from "@/components/app-provider";
import { ClubLogoCard } from "@/components/club-logo-card";
import { HelpTip } from "@/components/help-tip";
import { RosterManager } from "@/components/roster-manager";
import { TeamCrest } from "@/components/team-crest";
import { Avatar, Tag } from "@/components/ui";

// Membership is not administered here. An invitation only reserves a seat — the
// account behind it is created by hand in the Supabase dashboard, which only the
// platform owner can reach — so inviting, promoting and removing coaches all
// live in /admin. What is left is the club data a team admin can finish on
// their own: the roster, the logo, and who is already on the team.
export default function TeamPage() {
  const { currentTeam, user, teams, players } = useGrep();
  const isAdmin = currentTeam?.role === "admin";
  const teamPlayers = players.filter((player) => player.teamId === currentTeam?.id);
  return <AppShell><div className="mx-auto max-w-[1100px] px-4 pb-16 pt-7 sm:px-8 sm:pt-10"><header className="flex items-start gap-4">{currentTeam && <TeamCrest team={currentTeam} size="lg" className="mt-1" />}<div><p className="text-xs font-black uppercase tracking-[.16em] text-[var(--orange)]">Klubbområde</p><h1 className="mt-2 text-4xl font-black tracking-[-.055em] sm:text-5xl">Lag og spillere</h1><p className="mt-3 text-[var(--ink-soft)]">Spillerlisten, klubblogoen og trenerne til {currentTeam?.shortName}.</p></div></header>
    <div className="mt-9 grid gap-6 lg:grid-cols-[minmax(0,1fr)_310px]"><section className="overflow-hidden rounded-[26px] border border-[var(--line)] bg-[var(--surface)] shadow-[0_8px_30px_rgba(16,32,29,.04)]"><div className="flex items-center justify-between border-b border-[var(--line)] p-5 sm:p-6"><div><div className="flex items-center gap-2"><h2 className="text-xl font-black">Trenerteam</h2><HelpTip topic="team-access" /></div><p className="mt-1 text-sm text-[var(--ink-soft)]">{currentTeam?.members.length ?? 0} aktive medlemmer</p></div><Users className="text-[var(--ink-soft)]" size={21} /></div><div className="divide-y divide-[var(--line)]">{currentTeam?.members.map((member) => { const memberRole = member.teamRole ?? "coach"; return <div key={member.id} className="flex items-center gap-3 p-4 sm:px-6"><Avatar name={member.fullName} initials={member.initials} color={member.color} size="lg" /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate font-black">{member.fullName}</p>{member.id === user?.id && <Tag>Deg</Tag>}</div><p className="truncate text-sm text-[var(--ink-soft)]">{member.email}</p></div><Tag tone={memberRole === "admin" ? "orange" : "green"}>{memberRole === "admin" ? "Administrator" : "Trener"}</Tag></div>; })}</div><p className="border-t border-[var(--line)] bg-[var(--paper)]/55 p-5 text-sm leading-6 text-[var(--ink-soft)] sm:px-6">Trenere legges til av systemadministratoren, som også oppretter innloggingen deres. Ta kontakt hvis laget skal ha en trener til.</p></section>
      <aside className="space-y-5">{currentTeam && <ClubLogoCard team={currentTeam} canManage={isAdmin} />}<section className="rounded-[24px] bg-[var(--ink)] p-5 text-white"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white/10"><ShieldCheck size={21} /></span><h3 className="mt-4 font-black">Personvern for laget</h3><p className="mt-2 text-sm leading-6 text-white/55">Bare nåværende medlemmer kan se lagets økter og spillerliste. Øvelsesbanken er fortsatt åpen for alle.</p></section><section className="rounded-[24px] border border-[var(--line)] bg-[var(--surface)] p-5"><h3 className="font-black">Dine lag</h3><div className="mt-4 grid grid-cols-1 gap-2">{teams.map((team) => <div key={team.id} className="flex items-center gap-2.5 rounded-xl bg-[var(--paper)] px-3 py-2.5 text-sm font-bold"><TeamCrest team={team} size="sm" /><span className="min-w-0 flex-1 truncate">{team.shortName}</span><Tag>{team.role === "admin" ? "administrator" : "trener"}</Tag></div>)}</div>{user?.isGlobalAdmin ? <Link href="/admin" className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-white text-sm font-bold"><ShieldCheck size={17} />Administrer alle lag</Link> : <p className="mt-4 text-xs leading-5 text-[var(--ink-soft)]">Nye lag og trenere opprettes av systemadministratoren.</p>}</section></aside></div>
    <RosterManager players={teamPlayers} canManage={isAdmin} />
  </div></AppShell>;
}
