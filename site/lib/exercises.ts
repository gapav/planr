import type { Exercise, ExerciseAgeGroup, ExerciseCategory, PlannedSession, Profile, SessionItem, WarmupRoutine } from "./types";

/** `"6-9"` reads as `"6-9 år"`. The stored value is a key, never a label. */
export function formatAgeGroup(group: ExerciseAgeGroup): string {
  return `${group} år`;
}

/**
 * Picking a band shows only the exercises that list it. An exercise with no
 * stated age group therefore appears under "Alle aldre" alone — it was tempting
 * to let an empty array match everything so that exercises written before the
 * column existed never disappear, but that makes the filter useless: pick
 * "10-12" and the whole untagged library comes along with the one exercise a
 * coach actually tagged.
 */
export function matchesAgeGroup(ageGroups: readonly ExerciseAgeGroup[], filter: ExerciseAgeGroup | null): boolean {
  if (filter === null) return true;
  return ageGroups.includes(filter);
}

/**
 * Every field is optional and an omitted one filters nothing. `favoriteIds`
 * narrows the library to the signed-in coach's own shortlist; `null` — the
 * default, and what a signed-out visitor always gets — leaves the whole library
 * in place. A heart is never a property of the shared exercise row, so the set
 * is passed in rather than read off the exercise.
 */
export interface ExerciseFilter {
  query?: string;
  category?: ExerciseCategory | null;
  ageGroup?: ExerciseAgeGroup | null;
  favoriteIds?: ReadonlySet<string> | null;
}

export function filterExercises<T extends Pick<Exercise, "id" | "name" | "description" | "category" | "ageGroups">>(
  exercises: readonly T[],
  { query = "", category = null, ageGroup = null, favoriteIds = null }: ExerciseFilter = {},
): T[] {
  const normalizedQuery = query.trim().toLocaleLowerCase("nb-NO");

  return exercises.filter((exercise) => {
    if (favoriteIds && !favoriteIds.has(exercise.id)) return false;
    if (category !== null && exercise.category !== category) return false;
    if (!matchesAgeGroup(exercise.ageGroups, ageGroup)) return false;
    const searchableText = `${exercise.name} ${exercise.description}`.toLocaleLowerCase("nb-NO");
    return searchableText.includes(normalizedQuery);
  });
}

/**
 * Who may change a library exercise: its author, or a global admin. This mirrors
 * the `exercises_edit_owner` policy from 202609020001 — Postgres is the boundary,
 * but a blocked update matches zero rows instead of erroring, so an edit the UI
 * offers by mistake would look saved and then vanish on the next load.
 */
export function canEditExercise(
  user: Pick<Profile, "id" | "isGlobalAdmin"> | null | undefined,
  exercise: Pick<Exercise, "createdBy"> | null | undefined,
): boolean {
  if (!user || !exercise) return false;
  return exercise.createdBy === user.id || user.isGlobalAdmin === true;
}

/**
 * Session and warm-up items carry a copy of the exercise's display data taken
 * when they were added, but the library is the source of truth: editing an
 * exercise in Øvelsesbanken has to show on every card that links to it. The copy
 * is therefore resolved against the library at render time rather than rewritten
 * in the database — nothing is written, so an in-progress session stays locked by
 * `prevent_in_progress_session_changes` — and the stored copy is still what a
 * card falls back to once the exercise is archived or deleted and drops out of
 * the library.
 */
export type ExerciseLibrary = ReadonlyMap<string, Pick<Exercise, "name" | "description" | "mediaUrl" | "thumbnailUrl">>;

export function indexExercises(exercises: readonly Exercise[]): ExerciseLibrary {
  return new Map(exercises.map((exercise) => [exercise.id, exercise]));
}

type LinkedItem = Pick<SessionItem, "kind" | "exerciseId" | "title" | "description" | "mediaUrl" | "thumbnailUrl">;

/** Returns the item untouched when nothing resolves, so React keeps its identity. */
export function resolveItemDisplay<T extends LinkedItem>(item: T, library: ExerciseLibrary): T {
  if (item.kind !== "exercise" || !item.exerciseId) return item;
  const exercise = library.get(item.exerciseId);
  if (!exercise) return item;
  if (exercise.name === item.title && exercise.description === item.description
    && exercise.mediaUrl === item.mediaUrl && exercise.thumbnailUrl === item.thumbnailUrl) return item;
  return { ...item, title: exercise.name, description: exercise.description, mediaUrl: exercise.mediaUrl, thumbnailUrl: exercise.thumbnailUrl };
}

function resolveItems<T extends LinkedItem>(items: T[], library: ExerciseLibrary): T[] {
  let changed = false;
  const resolved = items.map((item) => { const next = resolveItemDisplay(item, library); if (next !== item) changed = true; return next; });
  return changed ? resolved : items;
}

export function resolveSessionDisplay(session: PlannedSession, library: ExerciseLibrary): PlannedSession {
  let changed = false;
  const blocks = session.blocks.map((block) => {
    const items = resolveItems(block.items, library);
    if (items === block.items) return block;
    changed = true;
    return { ...block, items };
  });
  return changed ? { ...session, blocks } : session;
}

export function resolveWarmupRoutineDisplay(routine: WarmupRoutine, library: ExerciseLibrary): WarmupRoutine {
  const items = resolveItems(routine.items, library);
  return items === routine.items ? routine : { ...routine, items };
}

/** Maps a list through `map`, handing back the original array when every row is unchanged. */
export function resolveAll<T>(rows: T[], map: (row: T) => T): T[] {
  let changed = false;
  const resolved = rows.map((row) => { const next = map(row); if (next !== row) changed = true; return next; });
  return changed ? resolved : rows;
}
