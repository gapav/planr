import type { Exercise, ExerciseCategory, Profile } from "./types";

export function filterExercises<T extends Pick<Exercise, "name" | "description" | "category">>(
  exercises: readonly T[],
  query: string,
  category: ExerciseCategory | null,
): T[] {
  const normalizedQuery = query.trim().toLocaleLowerCase("nb-NO");

  return exercises.filter((exercise) => {
    const matchesCategory = category === null || exercise.category === category;
    const searchableText = `${exercise.name} ${exercise.description}`.toLocaleLowerCase("nb-NO");
    return matchesCategory && searchableText.includes(normalizedQuery);
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
