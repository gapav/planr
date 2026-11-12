import { EXERCISE_AGE_GROUPS, EXERCISE_CATEGORIES, EXERCISE_SUBTOPIC_KEYS, EXERCISE_SUBTOPICS, type Exercise, type ExerciseAgeGroup, type ExerciseCategory, type ExerciseSubtopic, type ExerciseCollection, type PlannedSession, type Profile, type SessionItem, type WarmupRoutine } from "./types";

/** `"6-9"` reads as `"6-9 år"`. The stored value is a key, never a label. */
export function formatAgeGroup(group: ExerciseAgeGroup): string {
  return `${group} år`;
}

/**
 * The bands an exercise suits, as the library card's footer says it: adjacent
 * bands merge into one range and a gap is listed — «6–15 år», «6–9, 13–15 år».
 * No band at all reads «Alle aldre», the same rule `matchesAgeGroup` filters by.
 * Derived from the band keys, so a fourth band in `EXERCISE_AGE_GROUPS` merges
 * with its neighbour without a change here.
 */
export function formatAgeRange(ageGroups: readonly ExerciseAgeGroup[]): string {
  const chosen = EXERCISE_AGE_GROUPS.filter((group) => ageGroups.includes(group));
  if (chosen.length === 0) return "Alle aldre";
  const runs: [number, number][] = [];
  for (const group of chosen) {
    const [from, to] = group.split("-").map(Number);
    const last = runs.at(-1);
    if (last && from === last[1] + 1) last[1] = to;
    else runs.push([from, to]);
  }
  return `${runs.map(([from, to]) => `${from}–${to}`).join(", ")} år`;
}

const subtopicIndex = new Map<ExerciseSubtopic, { category: ExerciseCategory; label: string; short: string }>(
  EXERCISE_CATEGORIES.flatMap((category) => EXERCISE_SUBTOPICS[category].map((entry) => [entry.key, { category, label: entry.label, short: entry.short }] as const)),
);

/** `"angrep.finter"` reads as `"Finter"`. Like an age band, the stored value is a key. */
export function formatSubtopic(subtopic: ExerciseSubtopic): string {
  return subtopicIndex.get(subtopic)?.label ?? subtopic;
}

/**
 * The card's label: `"angrep.1-mot-1"` reads as `"1 mot 1"`, because the topic
 * chip beside it already says Angrep. Only the library card uses it; the rail
 * and the detail view keep `formatSubtopic`.
 */
export function formatSubtopicShort(subtopic: ExerciseSubtopic): string {
  return subtopicIndex.get(subtopic)?.short ?? subtopic;
}

/** The topic a subtopic sits under — the part of the key before the dot, but read from the list. */
export function subtopicCategory(subtopic: ExerciseSubtopic): ExerciseCategory {
  return subtopicIndex.get(subtopic)!.category;
}

/** The subtopic keys under one topic, in list order. */
export function subtopicsOf(category: ExerciseCategory): ExerciseSubtopic[] {
  return EXERCISE_SUBTOPICS[category].map((entry) => entry.key);
}

/**
 * Only the subtopics that belong to `category`, in canonical order — what the
 * form keeps when the topic changes, and the rule `exercises_subtopics_check`
 * enforces in Postgres.
 */
export function subtopicsForCategory(subtopics: readonly ExerciseSubtopic[], category: ExerciseCategory): ExerciseSubtopic[] {
  return subtopicsOf(category).filter((key) => subtopics.includes(key));
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
 * Topics and subtopics are one dimension, Tema, read as a union of choices: a
 * chosen subtopic matches the exercises tagged with it, and a chosen topic none
 * of whose subtopics is chosen matches its whole topic, tagged or not. Choosing
 * a subtopic therefore narrows its own topic and leaves the others alone —
 * "Angrep › Finter or all of Forsvar". An untagged exercise never matches a
 * subtopic: unlike an age band, a missing subtopic is not "all of them", or a
 * coach asking for jump shots would get every untagged shooting drill.
 */
export function matchesTopics(
  exercise: { category: ExerciseCategory; subtopics?: readonly ExerciseSubtopic[] },
  categories: readonly ExerciseCategory[],
  subtopics: readonly ExerciseSubtopic[],
): boolean {
  if (categories.length === 0 && subtopics.length === 0) return true;
  const own = exercise.subtopics ?? [];
  if (subtopics.some((subtopic) => own.includes(subtopic))) return true;
  if (!categories.includes(exercise.category)) return false;
  return !subtopics.some((subtopic) => subtopicCategory(subtopic) === exercise.category);
}

/**
 * Every field is optional and an omitted one filters nothing. Both chip
 * dimensions take a list because a coach planning a session thinks in unions —
 * "angrep or skuddferdigheter" — so values within a dimension are or-ed while
 * the dimensions themselves are and-ed. An empty list is therefore not "match
 * nothing" but "this dimension is not constrained", which is also what the
 * "Alle" chip selects. `shortlistIds` narrows the library to one chosen
 * shortlist — the coach's own favourites, or a team samling; `null` — the
 * default, and what a signed-out visitor always gets — leaves the whole library
 * in place. Neither a heart nor a samling is a property of the shared exercise
 * row, so the set is passed in rather than read off the exercise, and this
 * function cannot tell the two apart by design.
 */
export interface ExerciseFilter {
  query?: string;
  categories?: readonly ExerciseCategory[];
  ageGroups?: readonly ExerciseAgeGroup[];
  /** See `matchesTopics` for how these combine with `categories`. */
  subtopics?: readonly ExerciseSubtopic[];
  shortlistIds?: ReadonlySet<string> | null;
}

/** `subtopics` is optional so the dialogs' lighter rows still filter; absent reads as untagged. */
type FilterableExercise = Pick<Exercise, "id" | "name" | "description" | "category" | "ageGroups"> & Partial<Pick<Exercise, "subtopics">>;

export function filterExercises<T extends FilterableExercise>(
  exercises: readonly T[],
  { query = "", categories = [], ageGroups = [], subtopics = [], shortlistIds = null }: ExerciseFilter = {},
): T[] {
  const normalizedQuery = query.trim().toLocaleLowerCase("nb-NO");

  return exercises.filter((exercise) => {
    if (shortlistIds && !shortlistIds.has(exercise.id)) return false;
    if (!matchesTopics(exercise, categories, subtopics)) return false;
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
 *
 * Topics and subtopics are one dimension, so both are lifted together: the
 * badge on "Finter" is how many Finter exercises the search, age and shortlist
 * leave, whatever else under Tema is chosen. A subtopic nobody has tagged yet
 * counts 0, which the rail shows rather than hides.
 */
export interface ExerciseFacetCounts {
  categories: Record<ExerciseCategory, number>;
  subtopics: Record<ExerciseSubtopic, number>;
  ageGroups: Record<ExerciseAgeGroup, number>;
  allCategories: number;
  allAgeGroups: number;
}

export function countExerciseFacets<T extends FilterableExercise>(
  exercises: readonly T[],
  filter: ExerciseFilter = {},
): ExerciseFacetCounts {
  const acrossCategories = filterExercises(exercises, { ...filter, categories: [], subtopics: [] });
  const acrossAgeGroups = filterExercises(exercises, { ...filter, ageGroups: [] });

  return {
    categories: Object.fromEntries(EXERCISE_CATEGORIES.map((category) => [
      category,
      acrossCategories.filter((exercise) => exercise.category === category).length,
    ])) as Record<ExerciseCategory, number>,
    subtopics: Object.fromEntries(EXERCISE_SUBTOPIC_KEYS.map((subtopic) => [
      subtopic,
      acrossCategories.filter((exercise) => exercise.subtopics?.includes(subtopic)).length,
    ])) as Record<ExerciseSubtopic, number>,
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
  subtopics: ExerciseSubtopic[];
  ageGroups: ExerciseAgeGroup[];
  shortlist: ExerciseShortlist | null;
}

/**
 * Which shortlist the library is being read through, if any. Favourites and
 * samlinger are stored apart — one private to the coach, one belonging to the
 * team — but a coach reads through one of them at a time: "favorittene mine and
 * oktoberfokus" is an intersection nobody asks for, and offering it would mean
 * two controls where the question has one answer.
 */
export type ExerciseShortlist = { kind: "favorites" } | { kind: "collection"; id: string };

/** The value `?samling=` takes for the private list, which has no id of its own. */
export const FAVORITES_SHORTLIST_PARAM = "favoritter";

export function sameShortlist(a: ExerciseShortlist | null, b: ExerciseShortlist | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind === "favorites" || b.kind === "favorites") return a.kind === b.kind;
  return a.id === b.id;
}

/**
 * The exercises a chosen shortlist stands for, ready for `shortlistIds`.
 *
 * An unknown samling id gives `null` rather than an empty set, which is the
 * same rule the query-string parser follows: a link to a samling since deleted,
 * or one arriving before the workspace has loaded, should widen to the whole
 * library rather than show an empty grid nobody can explain.
 */
export function shortlistExerciseIds(
  shortlist: ExerciseShortlist | null,
  favoriteExerciseIds: readonly string[],
  collections: readonly Pick<ExerciseCollection, "id" | "exerciseIds">[],
): ReadonlySet<string> | null {
  if (!shortlist) return null;
  if (shortlist.kind === "favorites") return new Set(favoriteExerciseIds);
  const collection = collections.find((entry) => entry.id === shortlist.id);
  return collection ? new Set(collection.exerciseIds) : null;
}

export function emptyExerciseFilterState(): ExerciseFilterState {
  return { query: "", categories: [], subtopics: [], ageGroups: [], shortlist: null };
}

export function hasActiveExerciseFilter(state: ExerciseFilterState): boolean {
  return state.query.trim() !== "" || state.categories.length > 0 || state.subtopics.length > 0 || state.ageGroups.length > 0 || state.shortlist !== null;
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
    subtopics: readList(params, "undertema", EXERCISE_SUBTOPIC_KEYS),
    ageGroups: readList(params, "alder", EXERCISE_AGE_GROUPS),
    shortlist: readShortlist(params),
  };
}

/**
 * `?favoritter=1` is what the library wrote before samlinger existed, and links
 * to it are in coaches' inboxes, so it is still read. It is never written back:
 * the first touch of a filter rewrites the URL in the new form.
 */
function readShortlist(params: URLSearchParams): ExerciseShortlist | null {
  const chosen = params.get("samling");
  if (chosen === FAVORITES_SHORTLIST_PARAM) return { kind: "favorites" };
  if (chosen) return { kind: "collection", id: chosen };
  return params.get("favoritter") === "1" ? { kind: "favorites" } : null;
}

/** Only non-default fields are written, so an unfiltered library keeps a clean URL. */
export function serializeExerciseFilterParams(state: ExerciseFilterState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.query.trim() !== "") params.set("q", state.query);
  if (state.categories.length > 0) params.set("kategori", state.categories.join(","));
  if (state.subtopics.length > 0) params.set("undertema", state.subtopics.join(","));
  if (state.ageGroups.length > 0) params.set("alder", state.ageGroups.join(","));
  if (state.shortlist) params.set("samling", state.shortlist.kind === "favorites" ? FAVORITES_SHORTLIST_PARAM : state.shortlist.id);
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
