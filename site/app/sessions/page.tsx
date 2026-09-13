"use client";

import { CalendarDays, Clock3, LayoutList, MapPin, Plus, Sparkles, Target, Trash2 } from "lucide-react";
import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { HelpTip } from "@/components/help-tip";
import { useGrep } from "@/components/app-provider";
import { CopySessionDialog, ReopenSessionDialog, SessionMenu } from "@/components/session-actions";
import { PageHeading } from "@/components/page-heading";
import { Avatar, Button, EmptyState, Field, Modal, Tag, textareaClass } from "@/components/ui";
import { monthKey } from "@/lib/fixtures";
import { calendarMonthGroups, deriveSessionTab, groupSessionsByMonth, isNearTerm, relativeDayLabel, sessionDuration } from "@/lib/session";
import { MONTH_FOCUS_MAX_LENGTH } from "@/lib/types";
import type { PlannedSession, Profile, SessionTab } from "@/lib/types";
import { cn, minutesLabel, sessionDateParts } from "@/lib/utils";

const tabs: Array<{ id: SessionTab; label: string }> = [{ id: "upcoming", label: "Kommende" }, { id: "drafts", label: "Utkast" }, { id: "past", label: "Gjennomførte" }];

export default function SessionsPage() {
  return <Suspense><SessionsRoute /></Suspense>;
}

function SessionsRoute() {
  const search = useSearchParams();
  const view = search.get("view");
  const initialTab: SessionTab = view === "past" || view === "drafts" ? view : "upcoming";
  return <SessionsContent key={initialTab} initialTab={initialTab} />;
}

function SessionsContent({ initialTab }: { initialTab: SessionTab }) {
  const { sessions, currentTeam, monthFocus, user, createSession, deleteSession } = useGrep(); const [tab, setTab] = useState<SessionTab>(initialTab); const [creating, setCreating] = useState(false); const [pendingDelete, setPendingDelete] = useState<PlannedSession | null>(null); const [deleting, setDeleting] = useState(false); const [copySource, setCopySource] = useState<PlannedSession | null>(null); const [reopenSource, setReopenSource] = useState<PlannedSession | null>(null); const [focusMonth, setFocusMonth] = useState<{ key: string; label: string } | null>(null); const router = useRouter();
  const current = useMemo(() => sessions.filter((session) => session.teamId === currentTeam?.id && deriveSessionTab(session) === tab).sort((a, b) => tab === "drafts" ? b.updatedAt.localeCompare(a.updatedAt) : tab === "upcoming" ? (a.startsAt ?? "").localeCompare(b.startsAt ?? "") : (b.startsAt ?? "").localeCompare(a.startsAt ?? "")), [sessions, currentTeam, tab]);
  const counts = useMemo(() => tabs.reduce((acc, entry) => { acc[entry.id] = sessions.filter((session) => session.teamId === currentTeam?.id && deriveSessionTab(session) === entry.id).length; return acc; }, {} as Record<SessionTab, number>), [sessions, currentTeam]);
  // The nearest session is lifted out of its month so the one plan being
  // prepared for is not one card among ten identical ones.
  const hero = tab === "upcoming" ? current[0] : undefined; const listed = hero ? current.slice(1) : current;
  async function startSession() { setCreating(true); try { const id = await createSession(); router.push(`/sessions/${id}/edit`); } catch { /* The provider shows the failure notice. */ } finally { setCreating(false); } }
  // A failed delete rolls itself back in the provider and surfaces a notice, so
  // the dialog closes either way.
  async function confirmDelete() { if (!pendingDelete) return; setDeleting(true); try { await deleteSession(pendingDelete.id); } catch { /* notice is shown by the provider */ } finally { setDeleting(false); setPendingDelete(null); } }
  if (!currentTeam) return <AppShell><div className="mx-auto max-w-3xl px-4 py-20">{user?.isGlobalAdmin
    ? <EmptyState icon={<CalendarDays size={22} />} title="Du er ikke med på noe lag" body="Øktene tilhører et lag. Opprett lag og tildel trenere fra systemadministrasjonen." action={<Link href="/admin" className="grep-action">Gå til administrasjon</Link>} />
    : <EmptyState icon={<CalendarDays size={22} />} title="Du er ikke med på noe lag ennå" body="Øktene tilhører et lag, slik at de riktige trenerne kan se og redigere dem. Systemadministratoren gir deg tilgang." />}</div></AppShell>;
  return <AppShell><div className="grep-page grep-calendar"><PageHeading eyebrow={currentTeam.shortName} title="Øktkalender" description="En god plan. Et samkjørt trenerteam." actions={<>{tab !== "past" && <Button size="lg" onClick={() => void startSession()} disabled={creating}><Plus size={18} />{creating ? "Oppretter…" : "Opprett økt"}</Button>}<HelpTip topic="sessions-calendar" /></>} />
    <TabSelect tab={tab} onSelect={setTab} counts={counts} />
    {tab === "drafts"
      // Drafts sort by when they were last touched, so a calendar heading would
      // group them by a date the order does not follow. One card holds them the
      // way a month holds its sessions.
      ? (current.length
        ? <ul className="grep-session-month grep-session-rows">{current.map((session) => <SessionRow key={session.id} session={session} tab={tab} onCopy={() => setCopySource(session)} onReopen={() => setReopenSource(session)} onDelete={() => setPendingDelete(session)} />)}</ul>
        : <div className="grep-session-sections"><EmptyState icon={<Sparkles size={22} />} title="Ingen økter under planlegging" body="Start en øktplan og inviter trenerteamet til å bidra." /></div>)
      // Upcoming is a calendar, not a list of what happens to exist: the months
      // ahead are sections whether or not anything is scheduled in them, so the
      // month's focus can be written before the sessions that carry it. The
      // empty state still leads when nothing is planned — publishing a draft is
      // the thing to do then.
      : tab === "upcoming"
      ? <div className="grep-session-sections">
        {!current.length && <EmptyState icon={<CalendarDays size={22} />} title="Ingen planlagte økter ennå" body="Publiser et utkast, så vises det automatisk her." />}
        {hero && <section><ul><SessionRow session={hero} tab={tab} hero onCopy={() => setCopySource(hero)} onReopen={() => setReopenSource(hero)} onDelete={() => setPendingDelete(hero)} /></ul></section>}
        {calendarMonthGroups(listed).map((group) => <MonthSection key={group.key} group={group} tab={tab} onEditFocus={setFocusMonth} onCopy={setCopySource} onReopen={setReopenSource} onDelete={setPendingDelete} />)}
      </div>
      : (current.length
        ? <div className="grep-session-sections">{groupSessionsByMonth(listed).map((group) => <MonthSection key={group.key} group={group} tab={tab} onEditFocus={setFocusMonth} onCopy={setCopySource} onReopen={setReopenSource} onDelete={setPendingDelete} />)}</div>
        : <div className="grep-session-sections"><EmptyState icon={<CalendarDays size={22} />} title="Ingen gjennomførte økter" body="Gjennomførte økter samles her for senere bruk." /></div>)}
    {/* Gjennomførte is a record of what has been, so it ends where the last
        workout did. The new plan belongs under the tabs you plan in. */}
    {copySource && <CopySessionDialog session={copySource} onClose={() => setCopySource(null)} />}
    {reopenSource && <ReopenSessionDialog session={reopenSource} onClose={() => setReopenSource(null)} />}
    {focusMonth && <MonthFocusModal month={focusMonth.key} label={focusMonth.label} note={monthFocus.find((entry) => entry.teamId === currentTeam.id && entry.month === focusMonth.key)?.note ?? null} onClose={() => setFocusMonth(null)} />}
    <Modal open={Boolean(pendingDelete)} onClose={() => { if (!deleting) setPendingDelete(null); }} title="Vil du slette denne økten?" description="Planen, alle bolkene og aktivitetene blir slettet for hele laget. Dette kan ikke angres." size="sm">
      <p className="rounded-xl bg-[var(--paper)] px-4 py-3 text-sm font-semibold">{pendingDelete?.title}</p>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button variant="secondary" onClick={() => setPendingDelete(null)} disabled={deleting}>Behold økten</Button><Button variant="danger" onClick={() => void confirmDelete()} disabled={deleting}><Trash2 size={17} />{deleting ? "Sletter…" : "Slett økt"}</Button></div>
    </Modal>
  </div></AppShell>;
}

// One month of the calendar: the heading, the month's focus, and the sessions in
// it. A month the calendar padded in arrives with no sessions at all — heading
// and focus only, which is the whole point of padding it.
function MonthSection({ group, tab, onEditFocus, onCopy, onReopen, onDelete }: { group: { key: string; label: string; sessions: PlannedSession[] }; tab: SessionTab; onEditFocus(month: { key: string; label: string }): void; onCopy(session: PlannedSession): void; onReopen(session: PlannedSession): void; onDelete(session: PlannedSession): void }) {
  const { currentTeam, monthFocus, user } = useGrep();
  const focus = monthFocus.find((entry) => entry.teamId === currentTeam?.id && entry.month === group.key) ?? null;
  // The whole coaching team writes into the same note, so the row says whose
  // words are standing. Unlike a session row the name shows even when it is the
  // signed-in coach: "who set this month's focus" is the question the by-line
  // answers, and leaving your own name out leaves it open. A coach who has since
  // left the team is no longer in `members`, so only the credit survives.
  const author = focus ? currentTeam?.members.find((member) => member.id === focus.updatedBy) ?? null : null;
  const credit = focus ? { author, name: focus.updatedBy === user?.id ? "deg" : author?.fullName ?? "en tidligere trener", at: focus.updatedAt } : null;
  // A month that has been and gone keeps the focus it was given — it is a record
  // of what the team worked on — but is not advertised as something to fill in.
  // An "add" button on each of twelve past months is noise, not an offer.
  const editable = group.key !== "no-date" && group.key >= monthKey(new Date());
  const focusRow = <MonthFocusRow label={group.label} note={focus?.note ?? null} credit={credit} editable={editable} standalone={!focus && !group.sessions.length} onEdit={() => onEditFocus({ key: group.key, label: group.label })} />;
  const rows = group.sessions.length > 0 ? <ul className="grep-session-rows">{group.sessions.map((session) => tab === "upcoming" && isNearTerm(session)
    ? <SessionRow key={session.id} session={session} tab={tab} onCopy={() => onCopy(session)} onReopen={() => onReopen(session)} onDelete={() => onDelete(session)} />
    : <CompactSessionRow key={session.id} session={session} onCopy={() => onCopy(session)} onReopen={() => onReopen(session)} onDelete={() => onDelete(session)} />)}</ul> : null;
  // A month that holds anything is one card — the focus at its head, the plans
  // it is meant to steer as rows under it, hairline-separated the way a match
  // day holds its fixtures — so a plan reads as belonging to the month's theme
  // rather than merely following it. A month that is neither written nor
  // scheduled stays flat: the calendar pads four months ahead, and four empty
  // cards would weigh more than the invitation inside them.
  return <section>
    <h2 className="grep-session-month-heading">{group.label}{group.sessions.length > 0 && <span>{" · "}{group.sessions.length} {group.sessions.length === 1 ? "økt" : "økter"}</span>}</h2>
    {focus || rows
      ? <div className="grep-session-month">{focusRow}{rows}</div>
      : focusRow}
  </section>;
}

// Who left the note, ready to render: `author` is absent once that coach has
// left the team, and `name` is what the by-line says either way.
interface FocusCredit { author: Profile | null; name: string; at: string }
// The by-line sits under a month heading that already carries the year, so the
// day and month are all it has to say.
const focusDateFormat = new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "short" });

// The focus is the head of the month's card, above the sessions it is meant to
// steer and on the same ground as them. No accent either — in this list the
// apricot means "the next thing you act on", and a focus is context for the
// plans, not one of them.
function MonthFocusRow({ label, note, credit, editable, standalone, onEdit }: { label: string; note: string | null; credit: FocusCredit | null; editable: boolean; standalone: boolean; onEdit(): void }) {
  if (!note) return editable
    ? <button type="button" onClick={onEdit} className={cn("grep-session-focus-empty", standalone && "grep-session-focus-offer")}><Target size={16} />Sett månedens fokus</button>
    : null;
  const body = <>
    <small><Target size={13} />Månedens fokus</small>
    <p>{note}</p>
    {credit && <span className="grep-session-focus-by">
      {credit.author && <Avatar name={credit.author.fullName} initials={credit.author.initials} color={credit.author.color} size="sm" />}
      <span>Satt av {credit.name} · {focusDateFormat.format(new Date(credit.at))}</span>
    </span>}
  </>;
  // A month that can no longer be written to is text, not a control: a disabled
  // button would still be reached and announced as one.
  if (!editable) return <div className="grep-session-focus">{body}</div>;
  // The label replaces the button's text for a screen reader, so the credit has
  // to be repeated in it — otherwise the one month a coach can edit is the one
  // month that does not say who wrote it.
  return <button type="button" onClick={onEdit} aria-label={`Rediger månedens fokus for ${label}${credit ? `, satt av ${credit.name}` : ""}`} className="grep-session-focus">{body}</button>;
}

// One short note the whole coaching team shares, so there is nothing to merge:
// saving overwrites, and clearing the field deletes the note rather than storing
// a blank one.
function MonthFocusModal({ month, label, note, onClose }: { month: string; label: string; note: string | null; onClose(): void }) {
  const { saveMonthFocus } = useGrep();
  const [draft, setDraft] = useState(note ?? ""); const [busy, setBusy] = useState(false);
  const trimmed = draft.trim();
  async function save(next: string) {
    setBusy(true);
    // A failed save is rolled back and announced by the provider, so the dialog
    // stays open with the text still in it rather than losing what was typed.
    try { await saveMonthFocus(month, next); } catch { setBusy(false); return; }
    onClose();
  }
  return <Modal open onClose={() => { if (!busy) onClose(); }} title="Månedens fokus" description={`Hva laget skal jobbe mest med i ${label}. Alle trenerne på laget kan endre det.`} size="sm">
    <Field label="Fokus" hint={`${draft.length} av ${MONTH_FOCUS_MAX_LENGTH} tegn`}>
      <textarea className={textareaClass} value={draft} maxLength={MONTH_FOCUS_MAX_LENGTH} autoFocus onChange={(event) => setDraft(event.target.value)} placeholder="F.eks. forsvar 6-0 med aktiv midtblokk. Hver økt skal ha minst én bolk på det, og vi avslutter alltid med kontring." />
    </Field>
    <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
      {note && <Button variant="ghost" className="sm:mr-auto" disabled={busy} onClick={() => void save("")}><Trash2 size={16} />Fjern fokus</Button>}
      <Button variant="secondary" onClick={onClose} disabled={busy}>Avbryt</Button>
      <Button onClick={() => void save(draft)} disabled={busy || !trimmed || trimmed === note}>{busy ? "Lagrer…" : "Lagre fokus"}</Button>
    </div>
  </Modal>;
}

// Full labels stay visible on desktop; the native selector fits narrow screens.
function TabSelect({ tab, onSelect, counts }: { tab: SessionTab; onSelect(tab: SessionTab): void; counts: Record<SessionTab, number> }) {
  return <div className="grep-calendar-controls">
    <div className="grep-segments grep-calendar-desktop-tabs" role="group" aria-label="Vis økter">
      {tabs.map((entry) => <button key={entry.id} aria-pressed={tab === entry.id} onClick={() => onSelect(entry.id)}>{entry.label}<span>{counts[entry.id]}</span></button>)}
    </div>
    <label className="grep-calendar-mobile-select"><span>Vis økter</span><select value={tab} onChange={(event) => onSelect(event.target.value as SessionTab)}>{tabs.map((entry) => <option key={entry.id} value={entry.id}>{entry.label} ({counts[entry.id]})</option>)}</select></label>
  </div>;
}

// The date badge the match calendar wears, told the way a training session has
// to be read: the weekday first, because a coach plans "onsdag", and the month
// under it so a plan five weeks out still says which one it is.
function SessionDate({ session, live }: { session: PlannedSession; live: boolean }) {
  const date = sessionDateParts(session.startsAt);
  if (!date) return <span className={cn("grep-match-date", live && "grep-session-live")}><strong>—</strong><span>uten dato</span></span>;
  return <span className={cn("grep-match-date", live && "grep-session-live")}><span>{date.weekday}</span><strong>{date.day}</strong><span>{date.month}</span></span>;
}

// The row's date column, on the tabs that are ordered by date. A session still
// waiting for one keeps the column's width so the titles stay in line, and says
// nothing rather than repeating "uten dato" down the card.
function SessionDay({ date }: { date: ReturnType<typeof sessionDateParts> }) {
  return <span className="grep-session-day">{date ? `${date.weekday} ${date.day}` : ""}</span>;
}

function SessionRow({ session, tab, hero = false, onCopy, onReopen, onDelete }: { session: PlannedSession; tab: SessionTab; hero?: boolean; onCopy(): void; onReopen(): void; onDelete(): void }) {
  const { currentTeam, user } = useGrep(); const built = sessionDuration(session); const progress = session.plannedDurationMinutes ? Math.min(100, Math.round((built / session.plannedDurationMinutes) * 100)) : 0; const updater = currentTeam?.members.find((member) => member.id === session.updatedBy) ?? currentTeam?.members[0];
  const inProgress = session.status === "in_progress"; const date = sessionDateParts(session.startsAt); const relative = relativeDayLabel(session.startsAt); const [menuOpen, setMenuOpen] = useState(false);
  // Every row in a tab shares that tab's status, so only the one status that
  // does set a row apart is worth a chip. Same for the coach: it is the
  // signed-in one on every row until a team has more than one.
  const otherUpdater = updater && updater.id !== user?.id ? updater : null;
  const blockTitles = hero ? session.blocks.map((block) => block.title.trim()).filter(Boolean) : [];
  // The whole card opens the plan — Start and Rediger live in the plan view, so
  // the row carries no action but the menu, which opts back in to pointer
  // events. An open menu has to outrank the rows stacked after it.
  return <li className={cn(hero ? "grep-session-featured" : "grep-session-row", menuOpen && "grep-session-open")}>
    <Link href={`/sessions/${session.id}`} aria-label={`Åpne ${session.title}`} className="grep-session-hit" />
    {hero ? <SessionDate session={session} live={inProgress} /> : tab !== "drafts" && <SessionDay date={date} />}
    <span className="grep-session-copy">
      {hero && <h2 className="grep-eyebrow">Neste økt</h2>}
      <span className="grep-session-headline"><h3>{session.title}</h3>{inProgress && <Tag tone="orange">Pågår</Tag>}{relative && <Tag tone={relative === "I dag" && !inProgress ? "orange" : "neutral"}>{relative}</Tag>}</span>
      <span className="grep-match-meta">
        {/* Drafts are ordered by what was last touched, so they carry no date
            column to line up under; the few that do have a date say so here. */}
        <span><Clock3 size={14} />{date ? `${tab === "drafts" ? `${date.weekday} ${date.day} · ` : ""}${date.time} · ${minutesLabel(session.plannedDurationMinutes)}` : `${minutesLabel(session.plannedDurationMinutes)} planlagt`}</span>
        <span><MapPin size={14} /><span className="grep-session-venue">{session.venue || "Sted ikke angitt"}</span></span>
        <span><LayoutList size={14} />{session.blocks.length} {session.blocks.length === 1 ? "bolk" : "bolker"}</span>
        {otherUpdater && <span><Avatar name={otherUpdater.fullName} initials={otherUpdater.initials} color={otherUpdater.color} size="sm" />{otherUpdater.fullName}</span>}
      </span>
      {blockTitles.length > 0 && <span className="grep-session-blocks">{blockTitles.join(" · ")}</span>}
      {tab === "drafts" && <span className="grep-session-progress"><span className="grep-session-bar"><span style={{ width: `${progress}%` }} /></span><small>{built} av {session.plannedDurationMinutes} min planlagt</small></span>}
    </span>
    <span className="grep-session-actions">
      <SessionMenu session={session} open={menuOpen} onOpenChange={setMenuOpen} onCopy={onCopy} onReopen={onReopen} onDelete={onDelete} />
    </span>
  </li>;
}

// Sessions further out than the coming week, and every finished one, are things
// you read rather than act on: the same row, one line tall, carrying the date
// and the title only. Everything else is one tap away in the plan itself.
function CompactSessionRow({ session, onCopy, onReopen, onDelete }: { session: PlannedSession; onCopy(): void; onReopen(): void; onDelete(): void }) {
  const date = sessionDateParts(session.startsAt); const [menuOpen, setMenuOpen] = useState(false);
  return <li className={cn("grep-session-row grep-session-compact", menuOpen && "grep-session-open")}>
    <Link href={`/sessions/${session.id}`} aria-label={`Åpne ${session.title}`} className="grep-session-hit" />
    <SessionDay date={date} />
    <span className="grep-session-copy"><span className="grep-session-headline"><h3>{session.title}</h3></span></span>
    <span className="grep-session-actions">
      <SessionMenu session={session} open={menuOpen} onOpenChange={setMenuOpen} onCopy={onCopy} onReopen={onReopen} onDelete={onDelete} />
    </span>
  </li>;
}
