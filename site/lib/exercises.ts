import type { Exercise, ExerciseCategory } from "./types";

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
