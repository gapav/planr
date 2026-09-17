import { COLLECTION_NAME_MAX_LENGTH, type ExerciseCollection } from "./types";

/**
 * Samlinger: the named shortlists a coaching team keeps over the øvelsesbank.
 *
 * The rules here mirror migration `202609170001` — 1 to 60 characters after
 * trimming, and one name per team however it is capitalised — so a name the
 * dialog accepts is a name the database accepts. Without the duplicate check in
 * front of it, a second "Oktober" comes back as a raw unique-violation, which
 * `norwegianServerMessage` can only translate after the fact.
 */

/** Trims the ends and collapses inner runs of whitespace, like a display name. */
export function normalizeCollectionName(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

/**
 * The Norwegian refusal for a name that cannot be saved, or `null` if it can.
 * `existing` is the current team's samlinger; `ignoreId` is the one being
 * renamed, so keeping its own name is never a collision with itself.
 */
export function collectionNameError(
  input: string,
  existing: readonly Pick<ExerciseCollection, "id" | "name">[] = [],
  ignoreId?: string,
): string | null {
  const name = normalizeCollectionName(input);
  if (name === "") return "Gi samlingen et navn.";
  if (name.length > COLLECTION_NAME_MAX_LENGTH) return `Navnet kan ha høyst ${COLLECTION_NAME_MAX_LENGTH} tegn.`;
  const folded = name.toLocaleLowerCase("nb-NO");
  if (existing.some((entry) => entry.id !== ignoreId && normalizeCollectionName(entry.name).toLocaleLowerCase("nb-NO") === folded)) {
    return "Laget har allerede en samling med dette navnet.";
  }
  return null;
}

/**
 * One order for every consumer, so the rail, the picker and the popover never
 * disagree about where a samling sits. Alphabetical in Norwegian: æ, ø and å
 * belong at the end, which a default sort puts in the middle of the alphabet.
 */
export function sortCollections<T extends Pick<ExerciseCollection, "name">>(collections: readonly T[]): T[] {
  return [...collections].sort((a, b) => a.name.localeCompare(b.name, "nb-NO"));
}

/** The samlinger belonging to one team, already ordered. A samling never leaves its team. */
export function collectionsForTeam<T extends Pick<ExerciseCollection, "teamId" | "name">>(
  collections: readonly T[],
  teamId: string | null | undefined,
): T[] {
  if (!teamId) return [];
  return sortCollections(collections.filter((collection) => collection.teamId === teamId));
}
