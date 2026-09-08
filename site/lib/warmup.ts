import type { WarmupItem, WarmupRoutine } from "./types";

export function warmupDuration(items: readonly WarmupItem[]) {
  return items.reduce((total, item) => total + item.durationMinutes, 0);
}

export function sortWarmupItems(items: readonly WarmupItem[]) {
  return [...items].sort((a, b) => a.position - b.position);
}

export interface WarmupSchedule {
  /** When the squad meets at the hall. */
  meetAt: string;
  /** Kick-off minus the routine's own length. */
  warmupAt: string;
  kickOffAt: string;
  durationMinutes: number;
  /**
   * The routine is longer than the meet-up gives it. The coach is the one who
   * has to resolve that, so it is surfaced rather than silently clamped.
   */
  startsBeforeMeetUp: boolean;
}

/**
 * The calendar knows the kick-off, which is what makes this worth showing at
 * all: "oppmøte 17:30, oppvarming 18:15, avkast 19:00" is the line a coach
 * actually needs, and none of it can be derived from the routine alone.
 */
export function warmupSchedule(startsAt: string | null, routine: Pick<WarmupRoutine, "meetMinutesBefore"> & { items: readonly WarmupItem[] }): WarmupSchedule | null {
  if (!startsAt) return null;
  const kickOff = Date.parse(startsAt);
  if (Number.isNaN(kickOff)) return null;
  const durationMinutes = warmupDuration(routine.items);
  return {
    meetAt: new Date(kickOff - routine.meetMinutesBefore * 60_000).toISOString(),
    warmupAt: new Date(kickOff - durationMinutes * 60_000).toISOString(),
    kickOffAt: new Date(kickOff).toISOString(),
    durationMinutes,
    startsBeforeMeetUp: durationMinutes > routine.meetMinutesBefore,
  };
}

export interface ScheduledWarmupItem { item: WarmupItem; startsAt: string | null }

/**
 * Each activity gets the clock time it starts at, counted forward from when the
 * warm-up begins. Without a kick-off the routine still lists in order, just
 * without times.
 */
export function scheduleWarmupItems(startsAt: string | null, routine: Pick<WarmupRoutine, "meetMinutesBefore"> & { items: readonly WarmupItem[] }): ScheduledWarmupItem[] {
  const ordered = sortWarmupItems(routine.items);
  const schedule = warmupSchedule(startsAt, routine);
  if (!schedule) return ordered.map((item) => ({ item, startsAt: null }));
  let offset = Date.parse(schedule.warmupAt);
  return ordered.map((item) => {
    const at = new Date(offset).toISOString();
    offset += item.durationMinutes * 60_000;
    return { item, startsAt: at };
  });
}

export function warmupSummary(routine: Pick<WarmupRoutine, "items"> | null) {
  const items = routine?.items ?? [];
  return { count: items.length, durationMinutes: warmupDuration(items) };
}
