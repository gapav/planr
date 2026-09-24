"use client";

import { ArrowRight, CalendarDays, ChevronRight, Clock3, ListFilter, MapPin, Search, Target, Trophy, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AccountMenu } from "./account-menu";
import { useGrep } from "./app-provider";
import { AppShell } from "./app-shell";
import { CourtArtwork } from "./court-artwork";
import { monthKey, monthLabel } from "@/lib/fixtures";
import { overviewFixture, overviewFocus, overviewHeadline, overviewHeadlines, overviewSalutation, overviewSessions } from "@/lib/overview";
import { calendarDaysUntil } from "@/lib/session";
import type { MonthFocus } from "@/lib/types";
import { cn, minutesLabel } from "@/lib/utils";

const dayFormat = new Intl.DateTimeFormat("nb-NO", { weekday: "long", day: "numeric", month: "long" });

export function Overview() {
  const { user, currentTeam, sessions, fixtures, warmupRoutines, monthFocus, workspaceLoaded, createSession } = useGrep();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Resolve dates in the coach's browser and refresh when a tab is revisited.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const refresh = () => setNow(new Date());
    refresh();
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", refresh); };
  }, []);
  // Drawn once on the client: picking during render would make the server and
  // the first client render disagree about the greeting.
  const [headline, setHeadline] = useState<string>(overviewHeadlines[0]);
  useEffect(() => {
    const draw = () => setHeadline(overviewHeadline());
    draw();
  }, []);
  const { next, draft } = overviewSessions(sessions, currentTeam?.id, now ?? new Date(0));
  const match = now ? overviewFixture(fixtures, currentTeam?.id, warmupRoutines, now) : null;
  const focus = now ? overviewFocus(monthFocus, currentTeam?.id, now) : null;
  const focusMonthLabel = now ? monthLabel(monthKey(now)) : "";
  const loading = !workspaceLoaded || !now;
  const firstName = user?.fullName.trim().split(/\s+/)[0] || "trener";
  const ongoing = next?.status === "in_progress";
  const today = next && now && calendarDaysUntil(next.startsAt, now) === 0;
  const date = next?.startsAt ? new Date(next.startsAt) : null;
  const dateLabel = date ? dayFormat.format(date) : "Økten er i gang";
  const sessionHref = next ? `/sessions/${next.id}${ongoing ? "/live" : ""}` : "";

  async function planSession() {
    if (creating || !currentTeam) return;
    setCreating(true); setError(null);
    try { const id = await createSession(); router.push(`/sessions/${id}/edit`); }
    catch { setError("Vi kunne ikke opprette økten. Prøv igjen."); }
    finally { setCreating(false); }
  }

  return <AppShell><div className="overview">
    <div className="overview-topbar">
      <span className="overview-team">{currentTeam?.name ?? "Ditt trenerrom"}</span>
      <Link href="/exercises" className="overview-search" aria-label="Søk i øvelsesbanken"><Search size={20} /></Link>
      <AccountMenu />
    </div>
    <header className="overview-welcome">
      <div className="overview-welcome-copy">
        <p className="overview-greeting">{overviewSalutation(now)}, {firstName}</p>
        <h1>{headline}</h1>
        <button className="grep-action" onClick={() => void planSession()} disabled={creating || loading || !currentTeam}>
          {creating ? "Klargjør økten …" : "Planlegg økt"}<ArrowRight size={19} />
        </button>
      </div>
      <div className="overview-court-crop"><CourtArtwork /></div>
    </header>
    {error && <p role="alert" className="overview-error">{error}</p>}
    {loading ? <div className="overview-loading" role="status">Henter lagets økter …</div> : !currentTeam ?
      <section className="overview-card overview-no-team"><Users size={26} /><h2>Velkommen til trenerrommet</h2><p>Når du blir invitert til et lag, finner du øktplanene og trenerteamet her.</p>{user?.isGlobalAdmin && <Link className="grep-action" href="/admin">Administrer lag<ArrowRight size={18} /></Link>}</section> : <>
      <div className="overview-cards">
        <section className="overview-card overview-next" aria-labelledby="next-session-heading">
          <div className="overview-card-label"><span>{ongoing ? "Økten er i gang" : today ? "Dagens økt" : "Neste trening:"}</span><Link href="/sessions" className="overview-card-icon" aria-label="Åpne øktkalenderen"><CalendarDays size={19} /></Link></div>
          {next ? <>
            <h2 id="next-session-heading">{next.title}</h2>
            <p className="overview-session-title overview-date">{dateLabel}</p>
            <div className="overview-session-meta">
              {date && <span><Clock3 size={16} />{new Intl.DateTimeFormat("nb-NO", { hour: "2-digit", minute: "2-digit" }).format(date)} · {minutesLabel(next.plannedDurationMinutes)}</span>}
              {next.venue && <span><MapPin size={16} />{next.venue}</span>}
            </div>
            <Link className="grep-action grep-action-secondary" href={sessionHref}>{ongoing ? "Tilbake til økten" : "Gå til økt"}<ArrowRight size={17} /></Link>
          </> : <>
            <h2 id="next-session-heading">Plass til en god økt.</h2>
            <p className="overview-empty-copy">Ingen økter i kalenderen ennå. Start en plan, eller fortsett der dere slapp.</p>
            {draft ? <Link className="grep-action grep-action-secondary" href={`/sessions/${draft.id}/edit`}>Fortsett utkast<ArrowRight size={17} /></Link> : <Link className="grep-text-link" href="/exercises">Finn inspirasjon i øvelsesbanken<ArrowRight size={17} /></Link>}
          </>}
        </section>
        <div className="overview-shortcuts">
          <NextMatch match={match} canImport={currentTeam.role === "admin"} />
          <Link href="/exercises" className="overview-card overview-shortcut"><span className="overview-shortcut-icon peach"><ListFilter size={25} strokeWidth={1.7} /></span><span><strong>Finn øvelser</strong><small>En god idé til neste økt</small></span><ChevronRight size={19} /></Link>
        </div>
      </div>
      <MonthFocusBand focus={focus} label={focusMonthLabel} />
    </>}
  </div></AppShell>;
}

/**
 * The month's focus closes the overview: the cards are what happens next, and
 * the focus is the standing answer to "towards what?" — read after them, not
 * before. It only reads the note out — the note is written in the month it belongs to, over in the session
 * calendar, and who wrote it is a question for that screen and not this one. A
 * month with nothing written keeps the band and says where it is set.
 */
function MonthFocusBand({ focus, label }: { focus: MonthFocus | null; label: string }) {
  return <section className={cn("overview-focus", !focus && "overview-focus-unset")} aria-labelledby="month-focus-heading">
    <span className="overview-focus-mark" aria-hidden><Target size={25} strokeWidth={1.7} /></span>
    <div className="overview-focus-copy">
      <h2 id="month-focus-heading" className="overview-focus-eyebrow">Månedens fokus<span>· {label}</span></h2>
      {focus
        ? <p className="overview-focus-note">{focus.note}</p>
        : <p className="overview-focus-note overview-focus-invite">Ingen fokus satt for {label}. Én setning om hva laget skal jobbe mest med setter dere i <Link href="/sessions">øktkalenderen</Link>.</p>}
    </div>
  </section>;
}

/**
 * The match card is the sibling of "Neste økt", not a third shortcut tile: it
 * carries the two lines a coach cannot read off the nav — who they meet, and
 * when the squad is due. An empty calendar keeps the card rather than
 * collapsing the column, so the layout holds and the emptiness reads as a task.
 *
 * The whole card is the link, with the shortcut tile's chevron as the
 * affordance rather than a button of its own: a second full-height action in
 * this column would push the session card taller than its content.
 */
function NextMatch({ match, canImport }: { match: ReturnType<typeof overviewFixture>; canImport: boolean }) {
  const kickOff = match ? new Date(match.startsAt) : null;
  const time = (value: string) => new Intl.DateTimeFormat("nb-NO", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  // A squad playing two or three matches back to back is not going to "one
  // match": the card names the day and everyone we meet, and the clock line
  // carries the first throw-off the whole trip hangs off.
  const opponent = match && (match.day ? `${match.day.team} mot ${match.opponents}` : match.isDerby
    // A derby is the club against itself, so there is no single opponent to name.
    ? `${match.fixture.homeTeam} – ${match.fixture.awayTeam}`
    : `Mot ${match.opponent}`);
  const label = match?.day ? "Neste kampdag:" : "Neste kamp:";
  const action = match ? "Åpne kampkalenderen" : canImport ? "Importer kamper" : "Se kampkalenderen";
  return <Link href="/matches" className="overview-card overview-match" aria-label={match && kickOff ? `${label} ${dayFormat.format(kickOff)}, ${opponent}. ${action}` : action}>
    <span className="overview-match-body">
      <span className="overview-card-label"><span>{label}</span><Trophy size={19} /></span>
      {match && kickOff ? <>
        <span className="overview-date overview-match-date">{dayFormat.format(kickOff)}</span>
        <span className="overview-session-title">{opponent}</span>
        <span className="overview-session-meta">
          <span><Clock3 size={16} />{time(match.startsAt)}{match.meetAt && ` · oppmøte ${time(match.meetAt)}`}</span>
          {match.venue && <span><MapPin size={16} />{match.venue}</span>}
          {match.day && <span>{match.day.fixtures.length} kamper</span>}
        </span>
      </> : <>
        <span className="overview-match-date">Ingen kamper i kalenderen ennå.</span>
        <span className="overview-empty-copy">{canImport ? "Importer terminlisten, så ligger avkast, bane og oppmøte klart foran hver kamp." : "Når terminlisten er importert ligger avkast, bane og oppmøte klart foran hver kamp."}</span>
      </>}
    </span>
    <ChevronRight size={19} />
  </Link>;
}
