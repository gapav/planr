"use client";

import { CalendarDays, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useGrep } from "@/components/app-provider";
import { FixtureImport } from "@/components/fixture-import";
import { HelpTip } from "@/components/help-tip";
import { MatchCalendar } from "@/components/match-calendar";
import { PageHeading } from "@/components/page-heading";
import { Button, EmptyState } from "@/components/ui";

export default function MatchesPage() {
  const { currentTeam, fixtures, clearFixtures } = useGrep();
  const [importing, setImporting] = useState(false);
  const isAdmin = currentTeam?.role === "admin";
  const teamFixtures = useMemo(() => fixtures.filter((fixture) => fixture.teamId === currentTeam?.id), [fixtures, currentTeam]);

  if (!currentTeam) return <AppShell><div className="grep-page"><EmptyState icon={<CalendarDays size={22} />} title="Du er ikke med på noe lag ennå" body="Når du blir invitert til et lag, finner du kampene deres her." action={<Link href="/" className="grep-text-link">Til oversikten</Link>} /></div></AppShell>;

  return <AppShell><div className="grep-page grep-matches">
    <PageHeading eyebrow={currentTeam.shortName} title="Kampkalender" description="Neste avkast. Hele laget på samme side." actions={<>{isAdmin && <Button onClick={() => setImporting(true)}><Upload size={18} />Importer kamper</Button>}<HelpTip topic="match-calendar" /></>} />
    <MatchCalendar key={currentTeam.id} fixtures={teamFixtures} canManage={Boolean(isAdmin)} canEditWarmup />
    {isAdmin && teamFixtures.length > 0 && <details className="grep-calendar-settings"><summary>Administrer terminlisten</summary><p>Fjern terminlisten hvis du vil starte på nytt. Dette fjerner alle lagets importerte kamper.</p><Button variant="ghost" onClick={() => { if (confirm("Vil du fjerne alle kampene fra kalenderen? Du kan importere terminlisten på nytt etterpå.")) void clearFixtures().catch(() => { /* Provider displays the error notice. */ }); }}><Trash2 size={16} />Tøm kalenderen</Button></details>}
    <FixtureImport open={importing} onClose={() => setImporting(false)} />
  </div></AppShell>;
}
