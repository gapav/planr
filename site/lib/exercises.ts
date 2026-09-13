import { EXERCISE_AGE_GROUPS, EXERCISE_CATEGORIES, type Exercise, type ExerciseAgeGroup, type ExerciseCategory, type PlannedSession, type Profile, type SessionItem, type WarmupRoutine } from "./types";

/** `"6-9"` reads as `"6-9 år"`. The stored value is a key, never a label. */
export function formatAgeGroup(group: ExerciseAgeGroup): string {
  return `${group} år`;
}

/**
 * An exercise with no stated age group suits every band.
 *
 * This reverses the rule that shipped with the column, which showed an untagged
 * exercise under "Alle aldre" alone so that picking "10-12" could not drag the
 * whole untagged library along with the one exercise a coach had tagged. That
 * reasoning assumed age filtering was something a coach opts into from a neutral
 * default. The library now opens on the band the team's own name implies
 * (`teamAgeGroup`), so the old rule would hide most of the library from a coach
 * who asked for nothing — punishing an exercise for its author's omission at the
 * one moment nobody made a choice. "Not stated" is not "not suitable", and as
 * tagging becomes normal the two rules converge anyway.
 */
export function matchesAgeGroup(ageGroups: readonly ExerciseAgeGroup[], filter: ExerciseAgeGroup | null): boolean {
  if (filter === null) return true;
  if (ageGroups.length === 0) return true;
  return ageGroups.includes(filter);
}

/** Several chosen bands read as "or": a 6-9 exercise survives a `["6-9", "13-15"]` filter. */
export function matchesAgeGroups(ageGroups: readonly ExerciseAgeGroup[], filter: readonly ExerciseAgeGroup[]): boolean {
  if (filter.length === 0) return true;
  return filter.some((group) => matchesAgeGroup(ageGroups, group));
}

/**
 * The age band a team's own name implies, so the library opens on the exercises
 * that team can actually use instead of asking a coach to state something the
 * app already knows. Norwegian club teams are named either by birth year
 * ("KIL - J2016") or by the age itself ("Jenter 16"), so both are read. The year
 * wins where a name carries both, because "J2016" contains a stated-age match
 * too. Anything a name does not settle - "Senior kvinner" - gives null, which
 * leaves the library at every age rather than guessing.
 */
export function teamAgeGroup(team: { name?: string; shortName?: string } | null | undefined, now = new Date()): ExerciseAgeGroup | null {
  if (!team) return null;
  const text = `${team.shortName ?? ""} ${team.name ?? ""}`;
  const bornIn = text.match(/(?<!\d)(?:19|20)\d{2}(?!\d)/);
  // "J14", "G 14", "Jenter 16" - the letter is required, so a hall number or a
  // squad number ("Fjordvik 2") is not read as an age.
  const stated = text.match(/\b(?:jenter|gutter|[jg])\s*(\d{1,2})\b/i);
  const age = bornIn ? now.getFullYear() - Number(bornIn[0]) : stated ? Number(stated[1]) : null;
  return age === null ? null : ageGroupForAge(age);
}

/**
 * Derived from the bands themselves rather than a second list of boundaries, so
 * adding "16-20" to `EXERCISE_AGE_GROUPS` is the whole change.
 */
function ageGroupForAge(age: number): ExerciseAgeGroup | null {
  return EXERCISE_AGE_GROUPS.find((group) => {
    const [from, to] = group.split("-").map(Number);
    return age >= from && age <= to;
  }) ?? null;
}

/**
 * Every field is optional and an omitted one filters nothing. Both chip
 * dimensions take a list because a coach planning a session thinks in unions —
 * "angrep or skuddferdigheter" — so values within a dimension are or-ed while
 * the dimensions themselves are and-ed. An empty list is therefore not "match
 * nothing" but "this dimension is not constrained", which is also what the
 * "Alle" chip selects. `favoriteIds` narrows the library to the signed-in
 * coach's own shortlist; `null` — the default, and what a signed-out visitor
 * always gets — leaves the whole library in place. A heart is never a property
 * of the shared exercise row, so the set is passed in rather than read off the
 * exercise.
 */
export interface ExerciseFilter {
  query?: string;
  categories?: readonly ExerciseCategory[];
  ageGroups?: readonly ExerciseAgeGroup[];
  favoriteIds?: ReadonlySet<string> | null;
}

type FilterableExercise = Pick<Exercise, "id" | "name" | "description" | "category" | "ageGroups">;

export function filterExercises<T extends FilterableExercise>(
  exercises: readonly T[],
  { query = "", categories = [], ageGroups = [], favoriteIds = null }: ExerciseFilter = {},
): T[] {
  const normalizedQuery = query.trim().toLocaleLowerCase("nb-NO");

  return exercises.filter((exercise) => {
    if (favoriteIds && !favoriteIds.has(exercise.id)) return false;
    if (categories.length > 0 && !categories.includes(exercise.category)) return false;
    if (!matchesAgeGroups(exercise.ageGroups, ageGroups)) return false;
    const searchableText = `${exercise.name} ${exercise.description}`.toLocaleLowerCase("nb-NO");
    return searchableText.includes(normalizedQuery);
  });
}

/**
 * What each filter chip is worth before it is clicked, so a coach never spends a
 * click to discover an empty grid — the library ships with no Målvakt exercises
 * at all, and nothing on screen used to say so.
 *
 * A facet count is measured with its *own* dimension lifted and every other
 * filter still applied, which is what makes the numbers add up: the badge on
 * "Forsvar" is exactly how many exercises remain once the current search, age
 * bands and favourites are honoured. Because a dimension or-s its values, the
 * badge answers "how many are Forsvar", not "how many will I have afterwards" —
 * adding a second chip widens the result rather than narrowing it.
 */
export interface ExerciseFacetCounts {
  categories: Record<ExerciseCategory, number>;
  ageGroups: Record<ExerciseAgeGroup, number>;
  allCategories: number;
  allAgeGroups: number;
}

export function countExerciseFacets<T extends FilterableExercise>(
  exercises: readonly T[],
  filter: ExerciseFilter = {},
): ExerciseFacetCounts {
  const acrossCategories = filterExercises(exercises, { ...filter, categories: [] });
  const acrossAgeGroups = filterExercises(exercises, { ...filter, ageGroups: [] });

  return {
    categories: Object.fromEntries(EXERCISE_CATEGORIES.map((category) => [
      category,
      acrossCategories.filter((exercise) => exercise.category === category).length,
    ])) as Record<ExerciseCategory, number>,
    ageGroups: Object.fromEntries(EXERCISE_AGE_GROUPS.map((group) => [
      group,
      acrossAgeGroups.filter((exercise) => matchesAgeGroup(exercise.ageGroups, group)).length,
    ])) as Record<ExerciseAgeGroup, number>,
    allCategories: acrossCategories.length,
    allAgeGroups: acrossAgeGroups.length,
  };
}

/**
 * The library's filter state, and its round trip through the query string so a
 * coach can send another coach "skuddtrening for 13-15" as a link, and so a
 * reload or a trip into an exercise and back does not silently drop the filters.
 * Parsing discards unknown values rather than throwing: a hand-edited or
 * outdated link should degrade to a wider library, never to an error.
 */
export interface ExerciseFilterState {
  query: string;
  categories: ExerciseCategory[];
  ageGroups: ExerciseAgeGroup[];
  favoritesOnly: boolean;
}

export function emptyExerciseFilterState(): ExerciseFilterState {
  return { query: "", categories: [], ageGroups: [], favoritesOnly: false };
}

export function hasActiveExerciseFilter(state: ExerciseFilterState): boolean {
  return state.query.trim() !== "" || state.categories.length > 0 || state.ageGroups.length > 0 || state.favoritesOnly;
}

/** Reselecting from the constant keeps a list canonically ordered however the link was written. */
function readList<T extends string>(params: URLSearchParams, key: string, allowed: readonly T[]): T[] {
  const raw = (params.get(key) ?? "").split(",").map((entry) => entry.trim());
  return allowed.filter((value) => raw.includes(value));
}

export function parseExerciseFilterParams(params: URLSearchParams): ExerciseFilterState {
  return {
    query: params.get("q") ?? "",
    categories: readList(params, "kategori", EXERCISE_CATEGORIES),
    ageGroups: readList(params, "alder", EXERCISE_AGE_GROUPS),
    favoritesOnly: params.get("favoritter") === "1",
  };
}

/** Only non-default fields are written, so an unfiltered library keeps a clean URL. */
export function serializeExerciseFilterParams(state: ExerciseFilterState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.query.trim() !== "") params.set("q", state.query);
  if (state.categories.length > 0) params.set("kategori", state.categories.join(","));
  if (state.ageGroups.length > 0) params.set("alder", state.ageGroups.join(","));
  if (state.favoritesOnly) params.set("favoritter", "1");
  return params;
}

/** Toggling a chip keeps the list in the constant's order, so links read the same however they were clicked. */
export function toggleFilterValue<T extends string>(values: readonly T[], value: T, allowed: readonly T[]): T[] {
  const next = values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
  return allowed.filter((entry) => next.includes(entry));
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
