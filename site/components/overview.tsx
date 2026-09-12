"use client";

import { ArrowRight, CalendarDays, ChevronRight, Clock3, FilePenLine, ListFilter, MapPin, Search, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useGrep } from "./app-provider";
import { AppShell } from "./app-shell";
import { CourtArtwork } from "./court-artwork";
import { overviewSessions } from "@/lib/overview";
import { calendarDaysUntil } from "@/lib/session";
import { minutesLabel } from "@/lib/utils";

export function Overview() {
  const { user, currentTeam, sessions, workspaceLoaded, createSession } = useGrep();
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
  const { next, draft } = overviewSessions(sessions, currentTeam?.id, now ?? new Date(0));
  const loading = !workspaceLoaded || !now;
  const firstName = user?.fullName.trim().split(/\s+/)[0] || "trener";
  const ongoing = next?.status === "in_progress";
  const today = next && now && calendarDaysUntil(next.startsAt, now) === 0;
  const date = next?.startsAt ? new Date(next.startsAt) : null;
  const dateLabel = date ? new Intl.DateTimeFormat("nb-NO", { weekday: "long", day: "numeric", month: "long" }).format(date) : "Økten er i gang";

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
      <span className="overview-avatar" title={user?.fullName}>{user?.initials ?? "T"}</span>
    </div>
    <header className="overview-welcome">
      <div className="overview-welcome-copy">
        <p className="overview-greeting">Hei, {firstName}</p>
        <h1>Klar for neste økt?</h1>
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
          <div className="overview-card-label"><span>{ongoing ? "Økten er i gang" : today ? "Dagens økt" : "Neste økt"}</span><CalendarDays size={19} /></div>
          {next ? <>
            <h2 id="next-session-heading" className="overview-date">{dateLabel}</h2>
            <p className="overview-session-title">{next.title}</p>
            <div className="overview-session-meta">
              {date && <span><Clock3 size={16} />{new Intl.DateTimeFormat("nb-NO", { hour: "2-digit", minute: "2-digit" }).format(date)} · {minutesLabel(next.plannedDurationMinutes)}</span>}
              {next.venue && <span><MapPin size={16} />{next.venue}</span>}
            </div>
            <Link className="grep-action grep-action-secondary" href={`/sessions/${next.id}${ongoing ? "/live" : ""}`}>{ongoing ? "Tilbake til økten" : "Åpne øktplan"}<ArrowRight size={17} /></Link>
          </> : <>
            <h2 id="next-session-heading">Plass til en god økt.</h2>
            <p className="overview-empty-copy">Ingen økter i kalenderen ennå. Start en plan, eller fortsett der dere slapp.</p>
            {draft ? <Link className="grep-action grep-action-secondary" href={`/sessions/${draft.id}/edit`}>Fortsett utkast<ArrowRight size={17} /></Link> : <Link className="grep-text-link" href="/exercises">Finn inspirasjon i øvelsesbanken<ArrowRight size={17} /></Link>}
          </>}
        </section>
        <div className="overview-shortcuts">
          <Link href="/exercises" className="overview-card overview-shortcut"><span className="overview-shortcut-icon"><ListFilter size={25} strokeWidth={1.7} /></span><span><strong>Finn øvelser</strong><small>En god idé til neste økt</small></span><ChevronRight size={19} /></Link>
          <Link href="/sessions?view=past" className="overview-card overview-shortcut"><span className="overview-shortcut-icon peach"><Clock3 size={25} strokeWidth={1.7} /></span><span><strong>Tidligere økter</strong><small>Ta med det som fungerte</small></span><ChevronRight size={19} /></Link>
        </div>
      </div>
      {draft && next && <Link href={`/sessions/${draft.id}/edit`} className="overview-draft"><span className="overview-draft-icon"><FilePenLine size={20} /></span><span><small>Fortsett der dere slapp</small><strong>{draft.title}</strong></span><span className="overview-draft-action">Åpne utkast<ArrowRight size={17} /></span></Link>}
    </>}
  </div></AppShell>;
}
