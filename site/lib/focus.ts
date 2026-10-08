import { isoWeekNumber } from "./session";
import type { FocusPeriod } from "./types";

export const FOCUS_TITLE_MAX_LENGTH = 80;
export const FOCUS_NOTE_MAX_LENGTH = 400;
export const FOCUS_NOTES_MAX_LENGTH = 1000;
export const FOCUS_MAX_WEEKS = 60;
/** How long a new focus runs unless a neighbour is in the way. */
export const FOCUS_DEFAULT_WEEKS = 4;

const DAY_MS = 24 * 60 * 60 * 1000;
function dayNumber(key: string) { return Math.round(Date.parse(`${key}T00:00:00Z`) / DAY_MS); }
function dayFromNumber(number: number) { return new Date(number * DAY_MS).toISOString().slice(0, 10); }

export function addDays(key: string, days: number) { return dayFromNumber(dayNumber(key) + days); }

/** The Monday on or before a day. */
export function mondayOf(key: string) {
  const day = dayNumber(key);
  return dayFromNumber(day - (new Date(day * DAY_MS).getUTCDay() + 6) % 7);
}

/** The Sunday a focus ends on. */
export function focusEndsOn(focus: Pick<FocusPeriod, "startsOn" | "weeks">) {
  return addDays(focus.startsOn, focus.weeks * 7 - 1);
}

/** Whether a focus is running on a day — both ends included. */
export function focusCovers(focus: Pick<FocusPeriod, "startsOn" | "weeks">, day: string) {
  return day >= focus.startsOn && day <= focusEndsOn(focus);
}

/** Whether a focus touches any day from `from` to `to`, both included. */
export function focusOverlapsRange(focus: Pick<FocusPeriod, "startsOn" | "weeks">, from: string, to: string) {
  return focus.startsOn <= to && focusEndsOn(focus) >= from;
}

/** The team's focuses, in the order they run. */
export function teamFocuses(focuses: readonly FocusPeriod[], teamId: string | undefined) {
  return focuses.filter((focus) => focus.teamId === teamId).sort((a, b) => a.startsOn.localeCompare(b.startsOn));
}

/** The focus running on a day. Focuses never overlap, so there is at most one. */
export function focusAt(focuses: readonly FocusPeriod[], teamId: string | undefined, day: string) {
  return focuses.find((focus) => focus.teamId === teamId && focusCovers(focus, day)) ?? null;
}

/** The first focus that starts after a day — what comes next when nothing is running. */
export function nextFocus(focuses: readonly FocusPeriod[], teamId: string | undefined, day: string) {
  return teamFocuses(focuses, teamId).find((focus) => focus.startsOn > day) ?? null;
}

/**
 * The focus a candidate would collide with, if any. The database refuses an
 * overlap too; this is so the dialog can say which one before it is sent.
 */
export function overlappingFocus(focuses: readonly FocusPeriod[], candidate: Pick<FocusPeriod, "teamId" | "startsOn" | "weeks"> & { id?: string }) {
  return focuses.find((focus) => focus.id !== candidate.id && focus.teamId === candidate.teamId
    && focusOverlapsRange(focus, candidate.startsOn, focusEndsOn(candidate))) ?? null;
}

/**
 * Where a new focus goes from a chosen week: that week if it is free, or the
 * first free one after it, running up to `FOCUS_DEFAULT_WEEKS` weeks and
 * stopping short of the next focus.
 */
export function freeFocusSpan(focuses: readonly FocusPeriod[], teamId: string, fromDay: string, maxWeeks = FOCUS_DEFAULT_WEEKS) {
  const taken = (monday: string) => Boolean(focusAt(focuses, teamId, monday));
  let startsOn = mondayOf(fromDay);
  for (let guard = 0; taken(startsOn) && guard < 520; guard += 1) startsOn = addDays(startsOn, 7);
  let weeks = 1;
  while (weeks < maxWeeks && !taken(addDays(startsOn, weeks * 7))) weeks += 1;
  return { startsOn, weeks };
}

/** The working points: one per non-blank line, as the dialog asks for them. */
export function noteLines(notes: string) {
  return notes.split("\n").map((line) => line.replace(/^\s*[-•*]\s*/, "").trim()).filter(Boolean);
}

const shortDay = new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "short", timeZone: "UTC" });
/** The ISO week number of a `YYYY-MM-DD` day. */
export function weekOf(day: string) { return isoWeekNumber(new Date(`${day}T12:00:00Z`), "UTC"); }

/** "Uke 36–39 · 31. aug.–27. sep." — the weeks a focus runs, for its card and its bar. */
export function focusSpanLabel(focus: Pick<FocusPeriod, "startsOn" | "weeks">) {
  const end = focusEndsOn(focus);
  const first = weekOf(focus.startsOn); const last = weekOf(end);
  const day = (key: string) => shortDay.format(new Date(`${key}T12:00:00Z`));
  return `${first === last ? `Uke ${first}` : `Uke ${first}–${last}`} · ${day(focus.startsOn)}–${day(end)}`;
}

/** Which of a focus's weeks a day falls in, from 1; null outside it. */
export function focusWeekNumber(focus: Pick<FocusPeriod, "startsOn" | "weeks">, day: string) {
  if (!focusCovers(focus, day)) return null;
  return Math.floor((dayNumber(day) - dayNumber(focus.startsOn)) / 7) + 1;
}
