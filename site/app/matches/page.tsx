"use client";

import { CalendarDays, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useGrep } from "@/components/app-provider";
import { FixtureImport } from "@/components/fixture-import";
import { HelpTip } from "@/components/help-tip";
import { MatchCalendar } from "@/components/match-calendar";
import { TeamCrest } from "@/components/team-crest";
import { Button, EmptyState } from "@/components/ui";

export default function MatchesPage() {
  const { currentTeam, fixtures, clearFixtures } = useGrep();
  const [importing, setImporting] = useState(false);
  const isAdmin = currentTeam?.role === "admin";
  const teamFixtures = useMemo(() => fixtures.filter((fixture) => fixture.teamId === currentTeam?.id), [fixtures, currentTeam]);

  if (!currentTeam) return <AppShell><div className="mx-auto max-w-3xl px-4 py-20"><EmptyState icon={<CalendarDays size={22} />} title="Opprett ditt første lag" body="Kampkalenderen hører til et lag, slik at de riktige trenerne ser den." action={<Link href="/team" className="inline-flex min-h-11 items-center rounded-xl bg-[var(--orange)] px-4 text-sm font-bold text-white">Opprett et lag</Link>} /></div></AppShell>;

  return <AppShell><div className="mx-auto max-w-[1100px] px-4 pb-16 pt-7 sm:px-8 sm:pt-10">
    <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div className="flex items-start gap-4"><TeamCrest team={currentTeam} size="lg" className="mt-1" /><div>
        <p className="text-xs font-black uppercase tracking-[.16em] text-[var(--orange)]">{currentTeam.shortName}</p>
        <div className="mt-2 flex items-center gap-2.5"><h1 className="text-4xl font-black tracking-[-.055em] sm:text-5xl">Kampkalender</h1><HelpTip topic="match-calendar" /></div>
        <p className="mt-3 text-[var(--ink-soft)]">{teamFixtures.length ? `${teamFixtures.length} ${teamFixtures.length === 1 ? "kamp" : "kamper"} i terminlisten for lagene deres.` : "Terminlisten for avdelingen, filtrert ned til lagene deres."}</p>
      </div></div>
      {isAdmin && <div className="flex flex-wrap gap-2">
        {teamFixtures.length > 0 && <Button variant="ghost" onClick={() => { if (confirm("Vil du fjerne alle kampene fra kalenderen? Du kan importere terminlisten på nytt etterpå.")) void clearFixtures(); }}><Trash2 size={17} />Tøm kalenderen</Button>}
        <Button size="lg" onClick={() => setImporting(true)}><Upload size={18} />Importer kamper</Button>
      </div>}
    </header>
    <div className="mt-9"><MatchCalendar fixtures={teamFixtures} canManage={Boolean(isAdmin)} canEditWarmup /></div>
    <FixtureImport open={importing} onClose={() => setImporting(false)} />
  </div></AppShell>;
}
