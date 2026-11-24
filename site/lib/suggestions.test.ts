import { describe, expect, it } from "vitest";
import { demoExercises, demoSessions } from "./demo-data";
import { buildSessionCopy } from "./session";
import { acceptedItem, canSuggestOnItem, normalizeSuggestionComment, ownSuggestion, suggestionCountLabel, suggestionError, suggestionsForItem, suggestionsOpen, upsertSuggestion } from "./suggestions";
import type { Exercise, Profile, SessionItem, SessionItemSuggestion } from "./types";
import { SUGGESTION_COMMENT_MAX_LENGTH } from "./types";

const [first, second, third] = demoExercises;
const nora: Profile = { id: "user-nora", email: "nora@example.com", fullName: "Nora Vik", initials: "NV", color: "#123456" };
const gard: Profile = { id: "user-gard", email: "gard@example.com", fullName: "Gard Pavel", initials: "GP", color: "#654321" };

function suggestion(overrides: Partial<SessionItemSuggestion> = {}): SessionItemSuggestion {
  return { id: "s-1", itemId: "item-1", exerciseId: second.id, suggestedBy: nora.id, comment: "", createdAt: "2026-11-01T10:00:00.000Z", updatedAt: "2026-11-01T10:00:00.000Z", exercise: second, ...overrides };
}

const item: SessionItem = {
  id: "item-1", blockId: "block-1", kind: "exercise", exerciseId: first.id, title: first.name, description: first.description,
  mediaUrl: first.mediaUrl, thumbnailUrl: first.thumbnailUrl, durationMinutes: 14, coachingNotes: "Høyt tempo.",
  assignedCoachIds: [nora.id], position: 3, updatedBy: gard.id,
};

const library = new Map<string, Exercise>(demoExercises.map((exercise) => [exercise.id, exercise]));
const context = { session: { status: "published" as const }, library, members: [nora, gard], userId: gard.id, canAct: true };

describe("where suggestions can be made", () => {
  it("is open while a plan is a draft or published, and closed once the workout has started", () => {
    expect(suggestionsOpen("draft")).toBe(true);
    expect(suggestionsOpen("published")).toBe(true);
    expect(suggestionsOpen("in_progress")).toBe(false);
    expect(suggestionsOpen("completed")).toBe(false);
  });
  it("takes only activities with an exercise behind them", () => {
    expect(canSuggestOnItem(item, { status: "draft" })).toBe(true);
    expect(canSuggestOnItem({ kind: "custom" }, { status: "draft" })).toBe(false);
    expect(canSuggestOnItem(item, { status: "in_progress" })).toBe(false);
  });
  it("refuses the exercise the activity already has, and a free-text activity", () => {
    expect(suggestionError(item, first.id)).toBe("Øvelsen er allerede i planen");
    expect(suggestionError({ kind: "custom", exerciseId: null }, second.id)).toBe("Bare øvelser kan få forslag til alternativ");
    expect(suggestionError(item, second.id)).toBeNull();
  });
});

describe("the suggestions on a card", () => {
  it("lists them oldest first, with the library's exercise and the suggesting coach", () => {
    const later = suggestion({ id: "s-2", suggestedBy: gard.id, exerciseId: third.id, exercise: third, createdAt: "2026-11-02T10:00:00.000Z" });
    const views = suggestionsForItem({ ...item, suggestions: [later, suggestion()] }, context);
    expect(views.map((view) => view.suggestion.id)).toEqual(["s-1", "s-2"]);
    expect(views[0].exercise?.name).toBe(second.name);
    expect(views[0].suggester?.fullName).toBe("Nora Vik");
    expect(suggestionCountLabel(views.length)).toBe("2 forslag");
  });
  it("prefers the library over the copy read with the suggestion", () => {
    const stale = { ...second, name: "Gammelt navn" };
    const [view] = suggestionsForItem({ ...item, suggestions: [suggestion({ exercise: stale })] }, context);
    expect(view.exercise?.name).toBe(second.name);
    expect(view.archived).toBe(false);
  });
  it("still shows an exercise archived since it was suggested, marked as archived, and lets it be swapped in", () => {
    const archived: Exercise = { ...second, id: "exercise-archived", archivedAt: "2026-11-03T10:00:00.000Z" };
    const [view] = suggestionsForItem({ ...item, suggestions: [suggestion({ exerciseId: archived.id, exercise: archived })] }, context);
    expect(view.exercise?.id).toBe("exercise-archived");
    expect(view.archived).toBe(true);
    expect(view.canAccept).toBe(true);
  });
  it("leaves out a suggestion naming the exercise the activity already has", () => {
    expect(suggestionsForItem({ ...item, suggestions: [suggestion({ exerciseId: first.id })] }, context)).toEqual([]);
  });
  it("lets any coach swap or dismiss a colleague's suggestion, and only the suggester withdraw it", () => {
    const [colleagues] = suggestionsForItem({ ...item, suggestions: [suggestion()] }, context);
    expect(colleagues).toMatchObject({ own: false, canAccept: true, canDismiss: true, canWithdraw: false });
    const [mine] = suggestionsForItem({ ...item, suggestions: [suggestion()] }, { ...context, userId: nora.id });
    expect(mine).toMatchObject({ own: true, canAccept: true, canDismiss: false, canWithdraw: true });
  });
  it("offers nothing once the workout has started, nor to a reader who is not on the team", () => {
    const locked = suggestionsForItem({ ...item, suggestions: [suggestion()] }, { ...context, session: { status: "in_progress" } });
    expect(locked[0]).toMatchObject({ canAccept: false, canDismiss: false, canWithdraw: false });
    const admin = suggestionsForItem({ ...item, suggestions: [suggestion()] }, { ...context, canAct: false });
    expect(admin[0]).toMatchObject({ canAccept: false, canDismiss: false, canWithdraw: false });
  });
  it("shows a suggestion from a coach who has left the team without a name", () => {
    const [view] = suggestionsForItem({ ...item, suggestions: [suggestion({ suggestedBy: "user-gone" })] }, context);
    expect(view.suggester).toBeNull();
  });
});

describe("suggesting again", () => {
  it("replaces the coach's own suggestion rather than adding another", () => {
    const mine = suggestion();
    const theirs = suggestion({ id: "s-2", suggestedBy: gard.id });
    const next = upsertSuggestion([mine, theirs], suggestion({ id: "s-new", exerciseId: third.id, exercise: third, comment: "Bedre", createdAt: "2026-11-05T10:00:00.000Z" }));
    expect(next).toHaveLength(2);
    expect(next[0]).toMatchObject({ id: "s-1", exerciseId: third.id, comment: "Bedre", createdAt: mine.createdAt });
    expect(next[1]).toBe(theirs);
  });
  it("adds a first suggestion after the others", () => {
    const next = upsertSuggestion([suggestion()], suggestion({ id: "s-2", suggestedBy: gard.id }));
    expect(next.map((entry) => entry.id)).toEqual(["s-1", "s-2"]);
  });
  it("finds the coach's own suggestion", () => {
    expect(ownSuggestion({ suggestions: [suggestion()] }, nora.id)?.id).toBe("s-1");
    expect(ownSuggestion({ suggestions: [suggestion()] }, gard.id)).toBeNull();
    expect(ownSuggestion({ suggestions: [suggestion()] }, null)).toBeNull();
  });
  it("trims the comment and holds it to the column's limit", () => {
    expect(normalizeSuggestionComment("  Mindre kø  ")).toBe("Mindre kø");
    expect(normalizeSuggestionComment("x".repeat(250))).toHaveLength(SUGGESTION_COMMENT_MAX_LENGTH);
  });
});

describe("accepting a suggestion", () => {
  it("swaps in the exercise and its display data and keeps what belongs to the plan", () => {
    const accepted = suggestion();
    const sameExercise = suggestion({ id: "s-2", suggestedBy: "user-sam" });
    const other = suggestion({ id: "s-3", suggestedBy: gard.id, exerciseId: third.id, exercise: third });
    const next = acceptedItem({ ...item, suggestions: [accepted, sameExercise, other] }, accepted, second, gard.id);
    expect(next).toMatchObject({
      kind: "exercise", exerciseId: second.id, title: second.name, description: second.description,
      mediaUrl: second.mediaUrl, thumbnailUrl: second.thumbnailUrl, updatedBy: gard.id,
      id: item.id, position: 3, durationMinutes: 14, coachingNotes: "Høyt tempo.", assignedCoachIds: [nora.id],
    });
    expect(next.suggestions?.map((entry) => entry.id)).toEqual(["s-3"]);
  });
});

describe("copying a plan", () => {
  it("leaves the suggestions behind", () => {
    let counter = 0;
    const source = demoSessions[0];
    expect(source.blocks.some((block) => block.items.some((entry) => entry.suggestions?.length))).toBe(true);
    const copy = buildSessionCopy(source, { id: "copy", title: "Kopi", startsAt: null, userId: gard.id, makeId: () => `id-${counter++}` });
    expect(copy.blocks.every((block) => block.items.every((entry) => !entry.suggestions?.length))).toBe(true);
  });
});
