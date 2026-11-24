import type { Exercise, PlannedSession, Profile, SessionItem, SessionItemSuggestion, SessionStatus } from "./types";
import { SUGGESTION_COMMENT_MAX_LENGTH } from "./types";

/**
 * «Foreslå alternativ» (decision 14): a coach on the team proposes another
 * exercise for an activity, the plan shows who suggested what, and anyone on
 * the team swaps it in with «Bytt». The database holds the same rules —
 * `session_item_suggestions`' policies and triggers and
 * `accept_item_suggestion` — so these decide what the screen offers, not what
 * is allowed.
 */

/**
 * Suggestions belong to a plan still being planned. Once a workout starts,
 * `prevent_in_progress_session_changes` locks the plan, and the live session
 * and print never show them.
 */
export function suggestionsOpen(status: SessionStatus): boolean {
  return status === "draft" || status === "published";
}

/** Only an activity with an exercise behind it has one to swap. */
export function canSuggestOnItem(item: Pick<SessionItem, "kind">, session: Pick<PlannedSession, "status">): boolean {
  return item.kind === "exercise" && suggestionsOpen(session.status);
}

/** What one suggestion shows on the card, and what the signed-in coach may do with it. */
export interface SuggestionView {
  suggestion: SessionItemSuggestion;
  /** The library's exercise, or the copy read with the suggestion once it is archived. */
  exercise: Exercise | null;
  archived: boolean;
  /** `null` once the coach has left the team: there is no name to show. */
  suggester: Profile | null;
  own: boolean;
  /** «Bytt» — any coach on the team. */
  canAccept: boolean;
  /** «Avvis» — any coach on the team, on a colleague's suggestion. */
  canDismiss: boolean;
  /** «Trekk tilbake» — the suggester, on their own. */
  canWithdraw: boolean;
}

/**
 * The suggestions to show on one activity's card, oldest first. One that names
 * the exercise the activity already has is left out — accepting deletes those,
 * but a collaborator's screen may not have caught up yet, and «Bytt» to what
 * is already there would do nothing.
 *
 * `canAct` is whether the signed-in coach is on the session's team; a global
 * admin reading another team's plan sees the suggestions and can do nothing
 * with them.
 */
export function suggestionsForItem(
  item: Pick<SessionItem, "exerciseId" | "suggestions">,
  context: { session: Pick<PlannedSession, "status">; library: ReadonlyMap<string, Exercise>; members: readonly Profile[]; userId: string | null; canAct: boolean },
): SuggestionView[] {
  const open = suggestionsOpen(context.session.status) && context.canAct;
  return [...(item.suggestions ?? [])]
    .filter((suggestion) => suggestion.exerciseId !== item.exerciseId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .map((suggestion) => {
      const fromLibrary = context.library.get(suggestion.exerciseId) ?? null;
      const exercise = fromLibrary ?? suggestion.exercise;
      const own = context.userId !== null && suggestion.suggestedBy === context.userId;
      return {
        suggestion,
        exercise,
        archived: !fromLibrary && Boolean(exercise?.archivedAt),
        suggester: context.members.find((member) => member.id === suggestion.suggestedBy) ?? null,
        own,
        canAccept: open && exercise !== null,
        canDismiss: open && !own,
        canWithdraw: open && own,
      };
    });
}

/** The signed-in coach's own suggestion on the activity, which suggesting again replaces. */
export function ownSuggestion(item: Pick<SessionItem, "suggestions">, userId: string | null): SessionItemSuggestion | null {
  if (!userId) return null;
  return item.suggestions?.find((suggestion) => suggestion.suggestedBy === userId) ?? null;
}

/** «2 forslag». */
export function suggestionCountLabel(count: number): string {
  return `${count} forslag`;
}

/** Trimmed, as the trigger stores it, and cut at the column's limit. */
export function normalizeSuggestionComment(comment: string): string {
  return comment.trim().slice(0, SUGGESTION_COMMENT_MAX_LENGTH);
}

/** Why an exercise cannot be suggested for the activity, or `null` when it can. */
export function suggestionError(item: Pick<SessionItem, "kind" | "exerciseId">, exerciseId: string): string | null {
  if (item.kind !== "exercise") return "Bare øvelser kan få forslag til alternativ";
  if (item.exerciseId === exerciseId) return "Øvelsen er allerede i planen";
  return null;
}

/**
 * The activity's suggestions with `next` in: replacing the coach's own, since
 * there is one per coach per activity, or added after the others.
 */
export function upsertSuggestion(suggestions: readonly SessionItemSuggestion[], next: SessionItemSuggestion): SessionItemSuggestion[] {
  const index = suggestions.findIndex((entry) => entry.suggestedBy === next.suggestedBy);
  if (index < 0) return [...suggestions, next];
  return suggestions.map((entry, position) => position === index ? { ...next, id: entry.id, createdAt: entry.createdAt } : entry);
}

/**
 * What «Bytt» makes of the activity — the same as `accept_item_suggestion`:
 * the suggested exercise and the display data adding it would copy, while the
 * position, minutes, stikkord and coaches stay the plan's. The accepted
 * suggestion goes, and so does any other one now naming the same exercise;
 * the rest are still alternatives for the slot.
 */
export function acceptedItem(item: SessionItem, suggestion: Pick<SessionItemSuggestion, "id" | "exerciseId">, exercise: Pick<Exercise, "id" | "name" | "description" | "mediaUrl" | "thumbnailUrl">, userId: string): SessionItem {
  return {
    ...item,
    kind: "exercise",
    exerciseId: exercise.id,
    title: exercise.name,
    description: exercise.description,
    mediaUrl: exercise.mediaUrl,
    thumbnailUrl: exercise.thumbnailUrl,
    updatedBy: userId,
    suggestions: (item.suggestions ?? []).filter((entry) => entry.id !== suggestion.id && entry.exerciseId !== exercise.id),
  };
}
