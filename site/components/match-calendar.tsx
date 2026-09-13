"use client";

import { Building2, CalendarDays, Clock3, List, ChevronDown, ChevronLeft, ChevronRight, Hash, MapPin, Trash2, Trophy } from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { buildCalendarMonth, dayKey, fixtureOpponent, fixtureTeamNames, groupFixturesByDay, groupMatchDays, isHomeVenue, joinNames, matchDayStart, monthKey, monthLabel, shiftMonth, upcomingFixtures } from "@/lib/fixtures";
import type { MatchDay as MatchDayGroup, MatchDayTeam } from "@/lib/fixtures";
import { fixturePalette, savedTeamColors, teamPalette } from "@/lib/team-palette";
import type { TeamFixture, WarmupRoutine } from "@/lib/types";
import { useGrep } from "./app-provider";
import { Button, EmptyState, Modal, Tag } from "./ui";
import { WarmupDialog, WarmupSummaryButton } from "./warmup-dialog";
import { warmupSchedule } from "@/lib/warmup";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["man", "tir", "ons", "tor", "fre", "lør", "søn"];

// A month grid is only readable when every week is the same height, so a day
// never renders more than three lines: three matches, or two and a link to the
// rest. A single busy Saturday would otherwise stretch its whole week to four
// times the height of the six empty days beside it.
const LINES_PER_DAY = 3;

// The clock is not a store that changes under us; the date is read once per
// render and only has to differ between the server and the browser.
const subscribeToNothing = () => () => {};

function time(startsAt: string) {
  return new Intl.DateTimeFormat("nb-NO", { hour: "2-digit", minute: "2-digit" }).format(new Date(startsAt));
}
function longDate(startsAt: string) {
  return new Intl.DateTimeFormat("nb-NO", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(startsAt));
}
const weekdayFormat = new Intl.DateTimeFormat("nb-NO", { weekday: "short" });
const dayOfMonthFormat = new Intl.DateTimeFormat("nb-NO", { day: "numeric" });
const dayHeadFormat = new Intl.DateTimeFormat("nb-NO", { weekday: "long", day: "numeric", month: "long" });

export function MatchCalendar({ fixtures: rawFixtures, canManage, canEditWarmup }: { fixtures: TeamFixture[]; canManage: boolean; canEditWarmup: boolean }) {
  const colors = useMemo(() => savedTeamColors(rawFixtures), [rawFixtures]);
  const fixtures = useMemo(() => rawFixtures.map((fixture) => ({ ...fixture, ourTeamColors: colors })), [rawFixtures, colors]);
  const { removeFixture, warmupRoutines } = useGrep();
  // Which day is "today" depends on the reader's clock and zone, so the server
  // renders no highlight at all rather than the server's own answer — the
  // browser fills it in on hydration.
  const today = useSyncExternalStore(subscribeToNothing, () => dayKey(new Date()), () => null);
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [view, setView] = useState<"list" | "calendar">("list");
  const [picked, setPicked] = useState<string | null>(null);
  const [open, setOpen] = useState<TeamFixture | null>(null);
  const [removing, setRemoving] = useState(false);
  const [warmupFor, setWarmupFor] = useState<TeamFixture | null>(null);
  const [dayOpen, setDayOpen] = useState<string | null>(null);

  // One routine per team, shown against every match rather than copied onto
  // each of them.
  const teamId = fixtures[0]?.teamId;
  const routine = (warmupRoutines ?? []).find((entry) => entry.teamId === teamId && entry.isDefault) ?? null;
  const teams = useMemo(() => fixtureTeamNames(fixtures), [fixtures]);
  // A filtered team that is no longer in the schedule — the last of its matches
  // deleted, say — would otherwise leave the calendar empty for no visible
  // reason, so the filter falls back to all teams instead of being reset.
  const team = picked && teams.includes(picked) ? picked : null;
  const shown = useMemo(() => team ? fixtures.filter((fixture) => fixture.ourTeams.includes(team)) : fixtures, [fixtures, team]);
  const byDay = useMemo(() => groupFixturesByDay(shown), [shown]);
  const weeks = useMemo(() => buildCalendarMonth(month), [month]);
  const next = useMemo(() => upcomingFixtures(shown)[0] ?? null, [shown]);
  // The hero describes what is still ahead, so it is grouped over the upcoming
  // fixtures: once the morning match is played, the card is about the one left.
  const nextDay = useMemo(() => {
    if (!next) return null;
    const sameDay = upcomingFixtures(shown).filter((fixture) => dayKey(fixture.startsAt) === dayKey(next.startsAt));
    return groupMatchDays(sameDay)[0]?.teams.find((group) => group.fixtures.some((fixture) => fixture.id === next.id)) ?? null;
  }, [shown, next]);
  const monthFixtures = useMemo(() => shown.filter((fixture) => monthKey(fixture.startsAt) === month).sort((a, b) => a.startsAt.localeCompare(b.startsAt)), [shown, month]);
  const monthDays = useMemo(() => groupMatchDays(monthFixtures), [monthFixtures]);

  async function confirmRemove(fixture: TeamFixture) {
    setRemoving(true);
    try { await removeFixture(fixture.id); setOpen(null); }
    catch { /* the provider rolls the row back and shows a notice */ }
    finally { setRemoving(false); }
  }

  if (!fixtures.length) return <EmptyState icon={<CalendarDays size={22} />} title="Ingen kamper i kalenderen" body="Importer terminlisten fra turneringssystemet, og velg hvilke av lagene i avdelingen som er deres." />;

  return <>
    {/* The hero wears the brand, not the team: which squad plays next changes
        every week, and the card is about the fixture, not about being Gul. The
        dot in the eyebrow carries the team, the same token the filter uses. */}
    {next && <button type="button" onClick={() => setOpen(next)} className="grep-match-featured">
      <span className="grep-match-date"><span>{new Intl.DateTimeFormat("nb-NO", { month: "short" }).format(new Date(next.startsAt))}</span><strong>{dayOfMonthFormat.format(new Date(next.startsAt))}</strong></span>
      <NextUp next={next} group={nextDay} routine={routine} />
      <ChevronRight size={21} className="grep-match-chevron" />
    </button>}

    {teams.length > 1 && <div className="mt-6 flex flex-wrap items-center gap-2" role="group" aria-label="Filtrer på lag">
      <FilterChip active={team === null} onClick={() => setPicked(null)}>Alle lag</FilterChip>
      {teams.map((name) => <FilterChip key={name} active={team === name} color={teamPalette(name, colors[name]).accent} onClick={() => setPicked(team === name ? null : name)}>{name}</FilterChip>)}
    </div>}

    <div className="grep-match-toolbar">
      <h2 className="text-xl font-semibold tracking-[-.03em] first-letter:uppercase sm:text-2xl">{monthLabel(month)}</h2>
      <div className="grep-match-controls"><div className="grep-match-view grep-segments" role="group" aria-label="Kalendervisning"><button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}><List size={16} />Liste</button><button type="button" aria-pressed={view === "calendar"} onClick={() => setView("calendar")}><CalendarDays size={16} />Kalender</button></div><div className="flex items-center gap-1.5">
        <Button variant="secondary" size="sm" onClick={() => setMonth(monthKey(new Date()))}>I dag</Button>
        <Button variant="secondary" size="sm" className="px-2.5" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Forrige måned"><ChevronLeft size={17} /></Button>
        <Button variant="secondary" size="sm" className="px-2.5" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Neste måned"><ChevronRight size={17} /></Button>
      </div>
    </div></div>

    <div className={cn("grep-match-grid mt-3 overflow-hidden rounded-[18px] border border-[var(--line)] bg-[var(--surface)]", view === "calendar" ? "hidden sm:block" : "hidden")}>
      <div className="grid grid-cols-7 border-b border-[var(--line)] bg-[var(--paper)]">{WEEKDAYS.map((day) => <span key={day} className="px-2 py-2 text-center text-[11px] font-black uppercase tracking-[.1em] text-[var(--ink-soft)]">{day}</span>)}</div>
      <div className="grid grid-cols-7">{weeks.flat().map((day, index) => {
        const matches = byDay.get(day.key) ?? [];
        const overflowing = matches.length > LINES_PER_DAY;
        const listed = overflowing ? matches.slice(0, LINES_PER_DAY - 1) : matches;
        return <div key={day.key} className={cn("min-h-[116px] border-b border-r border-[var(--line)] p-1.5", index % 7 === 6 && "border-r-0", index >= 35 && "border-b-0", !day.inMonth && "bg-[var(--paper)]/60")}>
          <div className="flex h-6 items-center"><span className={cn("ml-1 grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs font-black", day.inMonth ? "text-[var(--ink)]" : "text-[var(--ink-soft)]/60", day.key === today && "bg-[var(--orange)] text-white")}>{day.dayOfMonth}</span></div>
          <div className="mt-1 flex flex-col gap-0.5">
            {listed.map((fixture) => <MatchChip key={fixture.id} fixture={fixture} onOpen={() => setOpen(fixture)} />)}
            {overflowing && <button type="button" onClick={() => setDayOpen(day.key)} className="flex w-full items-center gap-1 rounded-md bg-[#fdece3] px-1.5 py-0.5 text-left text-[11px] font-black leading-5 text-[#9c3913] transition hover:bg-[#f8d3c0]">+{matches.length - listed.length} til<ChevronDown className="ml-auto shrink-0" size={12} strokeWidth={3} /></button>}
          </div>
        </div>;
      })}</div>
    </div>

    {/* On a phone the grid cells are too small to read a match in, so the month
        becomes the list it would have to collapse to anyway. */}
    <div className={cn("grep-match-agenda mt-4", view === "calendar" && "sm:hidden")} aria-label="Månedens kamper">
      {monthDays.length ? <ul className="flex flex-col gap-2">{monthDays.map((day) => <li key={day.day}><MatchDay day={day} routine={routine} onOpen={setOpen} onWarmup={setWarmupFor} /></li>)}</ul>
        : <p className="rounded-2xl border border-dashed border-[#c8c3b7] px-4 py-8 text-center text-sm text-[var(--ink-soft)]">Ingen kamper denne måneden.</p>}
    </div>

    <DayMatches dayKey={dayOpen} matches={dayOpen ? byDay.get(dayOpen) ?? [] : []} routine={routine} onClose={() => setDayOpen(null)} onOpen={(fixture) => { setDayOpen(null); setOpen(fixture); }} onWarmup={(fixture) => { setDayOpen(null); setWarmupFor(fixture); }} />
    <MatchDetails fixture={open} dayStartsAt={open ? matchDayStart(shown, open) : null} canManage={canManage} removing={removing} routine={routine} onClose={() => { if (!removing) setOpen(null); }} onRemove={confirmRemove} onWarmup={(fixture) => { setOpen(null); setWarmupFor(fixture); }} />
    <WarmupDialog open={Boolean(warmupFor)} fixture={warmupFor} routine={routine} canEdit={canEditWarmup} onClose={() => setWarmupFor(null)} />
  </>;
}

function FilterChip({ active, color, onClick, children }: { active: boolean; color?: string; onClick(): void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} aria-pressed={active} className={cn("inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-bold transition", active ? "border-[#eac8b6] bg-[#fff0e7] text-[var(--ink)]" : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink-soft)] hover:border-[var(--ink)] hover:text-[var(--ink)]")}>
    {color && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden />}{children}
  </button>;
}

function TeamDots({ fixture }: { fixture: TeamFixture }) {
  return <span className="inline-flex items-center gap-1" aria-hidden>{fixture.ourTeams.map((name) => <span key={name} className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: teamPalette(name, fixture.ourTeamColors?.[name]).accent }} />)}</span>;
}

function chipLabel(fixture: TeamFixture) {
  const { opponent, isDerby } = fixtureOpponent(fixture);
  return isDerby ? `${fixture.homeTeam} — ${fixture.awayTeam}` : opponent;
}

/**
 * Weight carries which side is ours: our own squad in the title's full weight,
 * the opponent and the dash lighter. On a Sunday with four matches the eye
 * finds our teams without reading a single club name. A derby is both of ours,
 * so both stay heavy — which is exactly what it should look like.
 */
function MatchTeams({ fixture, separator }: { fixture: TeamFixture; separator: React.ReactNode }) {
  const side = (name: string) => fixture.ourTeams.includes(name) ? name : <span className="grep-match-them">{name}</span>;
  // The spaces belong to this element, not to the separator: an accessible
  // name is computed per element and trims each one, so " mot " inside the
  // span is announced as "Kolbotn Gulmot Ski Gul".
  return <>{side(fixture.homeTeam)}{" "}{separator}{" "}{side(fixture.awayTeam)}</>;
}

/**
 * The badge that replaces "Hjemmekamp": it is only shown when the match really
 * is on the club's own floor, which is the only version of "home" a coach can
 * plan around. See `isHomeVenue`.
 */
function HomeVenue({ fixture }: { fixture: TeamFixture }) {
  if (!isHomeVenue(fixture.venue)) return null;
  return <span className="grep-match-home"><span aria-hidden>🏠</span>Hjemmebane</span>;
}

function MatchChip({ fixture, onOpen }: { fixture: TeamFixture; onOpen(): void }) {
  return <button type="button" onClick={onOpen} title={`${fixture.homeTeam} — ${fixture.awayTeam}`} className="flex w-full items-center gap-1.5 rounded-md border-l-[3px] bg-[var(--paper)] py-0.5 pl-1.5 pr-1 text-left text-[11px] font-bold leading-5 transition hover:bg-[var(--paper-deep)]" style={{ borderLeftColor: fixturePalette(fixture).accent, background: fixturePalette(fixture).tint }}>
    <span className="shrink-0 tabular-nums text-[var(--ink-soft)]">{time(fixture.startsAt)}</span>
    <TeamDots fixture={fixture} />{isHomeVenue(fixture.venue) && <span aria-label="Hjemmebane" title="Hjemmebane">🏠</span>}<span className="truncate">{chipLabel(fixture)}</span>
    {fixture.result && <span className="ml-auto shrink-0 text-[10px] text-[var(--ink-soft)]">{fixture.result}</span>}
  </button>;
}

function DayMatches({ dayKey, matches, routine, onClose, onOpen, onWarmup }: { dayKey: string | null; matches: TeamFixture[]; routine: WarmupRoutine | null; onClose(): void; onOpen(fixture: TeamFixture): void; onWarmup(fixture: TeamFixture): void }) {
  if (!dayKey || !matches.length) return null;
  // Grouped the way the list groups, so a busy day reads the same wherever it
  // is opened from.
  const [day] = groupMatchDays(matches);
  return <Modal open onClose={onClose} size="sm" title={longDate(matches[0].startsAt)} description={`${matchCount(day?.count ?? matches.length)} denne dagen`}>
    <div className="grep-match-day-body">
      {(day?.teams ?? []).map((group) => <MatchDayTeamGroup key={group.key} group={group} routine={routine} onOpen={onOpen} onWarmup={onWarmup} />)}
    </div>
  </Modal>;
}

/**
 * A squad that plays three matches on Sunday is not going to "one match", so
 * the hero names the day: the squad, everyone they meet, and the one throw-off
 * and meet-up the whole trip hangs off. A single fixture still reads as one.
 */
function NextUp({ next, group, routine }: { next: TeamFixture; group: MatchDayTeam | null; routine: WarmupRoutine | null }) {
  const many = group && group.fixtures.length > 1 ? group : null;
  const meetAt = routine ? warmupSchedule(many ? many.startsAt : next.startsAt, routine)?.meetAt ?? null : null;
  const venue = many ? many.venue : next.venue;
  return <span className="grep-match-featured-copy">
    <span className="grep-eyebrow"><TeamDots fixture={next} />{" "}{many ? "Neste kampdag" : "Neste kamp"}</span>
    {many
      ? <><strong>{many.team}</strong><span className="grep-match-opponents"><span className="grep-match-them">mot</span>{" "}{joinNames(many.fixtures.map((fixture) => fixtureOpponent(fixture).opponent))}</span></>
      : <strong><MatchTeams fixture={next} separator={<span className="grep-match-versus">mot</span>} /></strong>}
    <span className="grep-match-meta">
      <span><Clock3 size={14} />{time(many ? many.startsAt : next.startsAt)}{meetAt && ` · oppmøte ${time(meetAt)}`}</span>
      {venue && <span><MapPin size={14} />{venue}</span>}
      {many && <span>{matchCount(many.fixtures.length)}</span>}
      {venue && isHomeVenue(venue) && <HomeVenue fixture={next} />}
    </span>
  </span>;
}

function matchCount(n: number) {
  return n === 1 ? "1 kamp" : `${n} kamper`;
}

/**
 * A day is one card, not one card per match. Three matches on the same Sunday
 * used to repeat the same date badge three times and read as three unrelated
 * trips; stated once, with the matches stacked under it in kick-off order, the
 * card says what the day actually asks of the coach.
 */
function MatchDay({ day, routine, onOpen, onWarmup }: { day: MatchDayGroup; routine: WarmupRoutine | null; onOpen(fixture: TeamFixture): void; onWarmup(fixture: TeamFixture): void }) {
  const date = new Date(day.teams[0].startsAt);
  return <div className="grep-match-day">
    {/* The badge costs 74px of a 390px screen, which is why match titles wrap
        there, so the phone spells the date across a header line instead. Both
        are always rendered and CSS picks one; the badge is the redundant copy,
        so the header is the one that stays in the accessibility tree. */}
    <span className="grep-match-date" aria-hidden><span>{weekdayFormat.format(date)}</span><strong>{dayOfMonthFormat.format(date)}</strong></span>
    <p className="grep-match-dayhead"><strong>{dayHeadFormat.format(date)}</strong><span>{matchCount(day.count)}</span></p>
    <div className="grep-match-day-body">
      {day.teams.map((group) => <MatchDayTeamGroup key={group.key} group={group} routine={routine} onOpen={onOpen} onWarmup={onWarmup} />)}
    </div>
  </div>;
}

/**
 * A squad's whole match day. Two or three matches in the same hall are one
 * trip, one meet-up and one warm-up, so everything they share is stated once
 * in the header and each row keeps only what varies: the throw-off and who we
 * meet. A lone match has nothing to share, so it skips the header rather than
 * growing a line that repeats the row beneath it.
 */
function MatchDayTeamGroup({ group, routine, onOpen, onWarmup }: { group: MatchDayTeam; routine: WarmupRoutine | null; onOpen(fixture: TeamFixture): void; onWarmup(fixture: TeamFixture): void }) {
  const rows = <ul className="grep-match-day-list">
    {group.fixtures.map((fixture) => <li key={fixture.id}><MatchEntry fixture={fixture} grouped={group.fixtures.length > 1} sharedVenue={group.venue !== null} onOpen={() => onOpen(fixture)} /></li>)}
  </ul>;
  if (group.fixtures.length < 2) return rows;

  const first = group.fixtures[0];
  const meetAt = routine ? warmupSchedule(group.startsAt, routine)?.meetAt ?? null : null;
  return <section className="grep-match-group" aria-label={`${group.team}, ${matchCount(group.fixtures.length)}`}>
    <p className="grep-match-group-head">
      <span className="grep-match-group-team"><TeamDots fixture={first} />{" "}{group.team}</span>
      <span className="grep-match-group-count">{matchCount(group.fixtures.length)}</span>
    </p>
    <p className="grep-match-meta grep-match-group-meta">
      {group.venue && <span><MapPin size={13} />{group.venue}</span>}
      {meetAt && <button type="button" className="grep-match-meetup" onClick={() => onWarmup(first)}><Clock3 size={13} />Oppmøte {time(meetAt)}</button>}
      {group.venue && isHomeVenue(group.venue) && <HomeVenue fixture={first} />}
    </p>
    {rows}
  </section>;
}

/**
 * Inside a squad's group the only party that changes is the opponent, so the
 * row drops our own name and reads "mot X"; on its own it still spells the
 * fixture out. The venue goes the same way — repeated on every row only when
 * the day is split over more than one hall.
 */
function MatchEntry({ fixture, grouped = false, sharedVenue = false, onOpen }: { fixture: TeamFixture; grouped?: boolean; sharedVenue?: boolean; onOpen(): void }) {
  const { opponent, isDerby } = fixtureOpponent(fixture);
  return <button type="button" onClick={onOpen} className="grep-match-entry">
    <span className="grep-match-time">{time(fixture.startsAt)}</span>
    <span className="grep-match-row-copy">
      <strong>{grouped && !isDerby
        ? <><span className="grep-match-them">mot</span>{" "}{opponent}</>
        : <><TeamDots fixture={fixture} />{" "}<MatchTeams fixture={fixture} separator={<span className="grep-match-them">—</span>} /></>}</strong>
      {!(grouped && sharedVenue) && <span className="grep-match-meta"><span><MapPin size={13} />{fixture.venue || "Bane ikke satt"}</span><HomeVenue fixture={fixture} /></span>}
    </span>
    {fixture.result && <Tag tone="green">{fixture.result}</Tag>}<ChevronRight size={18} className="grep-match-chevron" />
  </button>;
}

function MatchDetails({ fixture, dayStartsAt, canManage, removing, routine, onClose, onRemove, onWarmup }: { fixture: TeamFixture | null; dayStartsAt: string | null; canManage: boolean; removing: boolean; routine: WarmupRoutine | null; onClose(): void; onRemove(fixture: TeamFixture): void; onWarmup(fixture: TeamFixture): void }) {
  if (!fixture) return null;
  const { isDerby } = fixtureOpponent(fixture);
  const ours = (name: string) => fixture.ourTeams.includes(name);
  return <Modal open onClose={onClose} title={`${fixture.homeTeam} — ${fixture.awayTeam}`} description={`${longDate(fixture.startsAt)} kl. ${time(fixture.startsAt)}`}>
    <div className="grid gap-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 rounded-2xl bg-[var(--paper)] p-4 text-center">
        <div><p className="text-[10px] font-black uppercase tracking-[.14em] text-[var(--ink-soft)]">Hjemmelag</p><p className={cn("mt-1 break-words font-black", ours(fixture.homeTeam) && "text-[var(--orange)]")}>{fixture.homeTeam}</p></div>
        <p className="text-lg font-black text-[var(--ink-soft)]">{fixture.result || "–"}</p>
        <div><p className="text-[10px] font-black uppercase tracking-[.14em] text-[var(--ink-soft)]">Bortelag</p><p className={cn("mt-1 break-words font-black", ours(fixture.awayTeam) && "text-[var(--orange)]")}>{fixture.awayTeam}</p></div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {fixture.ourTeams.map((name) => <span key={name} className="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-[var(--line)] px-3 text-xs font-bold"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: teamPalette(name, fixture.ourTeamColors?.[name]).accent }} aria-hidden />{name}</span>)}
        {isDerby && <Tag tone="orange">Internkamp</Tag>}
        {isHomeVenue(fixture.venue) && <Tag tone="green">🏠 Hjemmebane</Tag>}
        {!fixture.result && <Tag>Ikke spilt</Tag>}
      </div>
      {/* The squad meets once, before the first throw-off of its day: the
          second match of an afternoon must not answer with its own. */}
      <WarmupSummaryButton routine={routine} startsAt={dayStartsAt ?? fixture.startsAt} onOpen={() => onWarmup(fixture)} />
      <dl className="grid gap-px overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2">
        <DetailRow icon={<MapPin size={15} />} label="Bane" value={fixture.venue} />
        <DetailRow icon={<Hash size={15} />} label="Kampnummer" value={fixture.matchNumber} />
        <DetailRow icon={<Building2 size={15} />} label="Arrangør" value={fixture.organizer} />
        <DetailRow icon={<Trophy size={15} />} label="Turnering" value={fixture.tournament} />
      </dl>
      <div className="flex flex-wrap justify-end gap-2">
        {canManage && <Button variant="danger" onClick={() => onRemove(fixture)} disabled={removing}><Trash2 size={17} />{removing ? "Fjerner…" : "Fjern kampen"}</Button>}
        <Button variant="secondary" onClick={onClose}>Lukk</Button>
      </div>
    </div>
  </Modal>;
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="bg-[var(--surface)] px-4 py-3"><dt className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[.1em] text-[var(--ink-soft)]">{icon}{label}</dt><dd className="mt-1 break-words font-bold">{value || "—"}</dd></div>;
}
