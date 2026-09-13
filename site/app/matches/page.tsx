"use client";

import { CalendarDays, Timer, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useGrep } from "@/components/app-provider";
import { FixtureImport } from "@/components/fixture-import";
import { HelpTip } from "@/components/help-tip";
import { MatchCalendar, type MatchCalendarHandle } from "@/components/match-calendar";
import { PageHeading } from "@/components/page-heading";
import { Button, EmptyState } from "@/components/ui";

export default function MatchesPage() {
  const { currentTeam, fixtures, clearFixtures } = useGrep();
  const [importing, setImporting] = useState(false);
  const calendar = useRef<MatchCalendarHandle>(null);
  const isAdmin = currentTeam?.role === "admin";
  const teamFixtures = useMemo(() => fixtures.filter((fixture) => fixture.teamId === currentTeam?.id), [fixtures, currentTeam]);

  if (!currentTeam) return <AppShell><div className="grep-page"><EmptyState icon={<CalendarDays size={22} />} title="Du er ikke med på noe lag ennå" body="Når du blir invitert til et lag, finner du kampene deres her." action={<Link href="/" className="grep-text-link">Til oversikten</Link>} /></div></AppShell>;

  return <AppShell><div className="grep-page grep-matches">
    <PageHeading eyebrow={currentTeam.shortName} title="Kampkalender" description="Neste avkast. Hele laget på samme side." actions={<>{teamFixtures.length > 0 && <Button size="lg" onClick={() => calendar.current?.openWarmup()}><Timer size={19} />Kampoppvarming</Button>}<HelpTip topic="match-calendar" /></>} />
    <MatchCalendar key={currentTeam.id} ref={calendar} fixtures={teamFixtures} canManage={Boolean(isAdmin)} canEditWarmup onImport={isAdmin ? () => setImporting(true) : undefined} />
    {isAdmin && teamFixtures.length > 0 && <details className="grep-calendar-settings"><summary>Importer eller tøm terminlisten</summary><p>Terminlisten importeres vanligvis én gang i sesongen. Importer på nytt for å legge til flere kamper, eller tøm kalenderen for å starte helt på nytt — det fjerner alle lagets importerte kamper.</p><div className="grep-calendar-settings-actions"><Button variant="secondary" onClick={() => setImporting(true)}><Upload size={16} />Importer kamper</Button><Button variant="ghost" onClick={() => { if (confirm("Vil du fjerne alle kampene fra kalenderen? Du kan importere terminlisten på nytt etterpå.")) void clearFixtures().catch(() => { /* Provider displays the error notice. */ }); }}><Trash2 size={16} />Tøm kalenderen</Button></div></details>}
    <FixtureImport open={importing} onClose={() => setImporting(false)} />
  </div></AppShell>;
}
