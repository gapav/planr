import { describe, expect, it } from "vitest";
import { demoExercises, demoSessions, demoWarmupRoutines } from "./demo-data";
import { canEditExercise, filterExercises, indexExercises, resolveAll, resolveItemDisplay, resolveSessionDisplay, resolveWarmupRoutineDisplay } from "./exercises";

describe("exercise filtering", () => {
  it("filters exercises by category", () => {
    expect(filterExercises(demoExercises, "", "Forsvar").map((exercise) => exercise.id)).toEqual(["exercise-2"]);
  });

  it("searches names and descriptions without case sensitivity", () => {
    expect(filterExercises(demoExercises, "FOTARBEID I FORSVAR", null).map((exercise) => exercise.id)).toEqual(["exercise-2"]);
  });

  it("combines category and text filters", () => {
    expect(filterExercises(demoExercises, "kant", "Angrep").map((exercise) => exercise.id)).toEqual(["exercise-4"]);
    expect(filterExercises(demoExercises, "kant", "Forsvar")).toEqual([]);
  });

  it("leaves the library whole when no favourites are passed", () => {
    expect(filterExercises(demoExercises, "", null, null)).toHaveLength(demoExercises.length);
  });

  it("narrows the library to the coach's hearted exercises", () => {
    const favorites = new Set(["exercise-2", "exercise-4"]);
    expect(filterExercises(demoExercises, "", null, favorites).map((exercise) => exercise.id)).toEqual(["exercise-2", "exercise-4"]);
  });

  it("applies search and category on top of the favourites", () => {
    const favorites = new Set(["exercise-2", "exercise-4"]);
    expect(filterExercises(demoExercises, "", "Forsvar", favorites).map((exercise) => exercise.id)).toEqual(["exercise-2"]);
    expect(filterExercises(demoExercises, "kant", "Forsvar", favorites)).toEqual([]);
  });

  it("shows nothing rather than everything when no exercise is hearted", () => {
    expect(filterExercises(demoExercises, "", null, new Set())).toEqual([]);
  });
});

describe("exercise edit permission", () => {
  const exercise = { createdBy: "user-gard" };
  const author = { id: "user-gard" };
  const other = { id: "user-nora" };

  it("lets the author edit their own exercise", () => {
    expect(canEditExercise(author, exercise)).toBe(true);
  });

  it("keeps another coach out of an exercise they did not create", () => {
    expect(canEditExercise(other, exercise)).toBe(false);
  });

  it("lets a global admin edit any exercise", () => {
    expect(canEditExercise({ ...other, isGlobalAdmin: true }, exercise)).toBe(true);
  });

  it("denies signed-out visitors and unknown exercises", () => {
    expect(canEditExercise(null, exercise)).toBe(false);
    expect(canEditExercise(author, null)).toBe(false);
  });
});

describe("library resolution", () => {
  const library = indexExercises([
    { ...demoExercises[0], name: "Ny tittel", description: "Ny beskrivelse", mediaUrl: "https://example.com/ny.jpg", thumbnailUrl: "https://example.com/ny-thumb.jpg" },
  ]);
  const item = {
    id: "item-1", blockId: "block-1", kind: "exercise" as const, exerciseId: demoExercises[0].id,
    title: "Gammel tittel", description: "Gammel beskrivelse", mediaUrl: null, thumbnailUrl: null,
    durationMinutes: 25, coachingNotes: "Behold dette", position: 0, updatedBy: "user-gard",
  };

  it("shows the library's display data instead of the stored copy", () => {
    expect(resolveItemDisplay(item, library)).toMatchObject({
      title: "Ny tittel", description: "Ny beskrivelse",
      mediaUrl: "https://example.com/ny.jpg", thumbnailUrl: "https://example.com/ny-thumb.jpg",
    });
  });

  it("keeps the plan's own fields", () => {
    expect(resolveItemDisplay(item, library)).toMatchObject({ durationMinutes: 25, coachingNotes: "Behold dette", position: 0 });
  });

  it("falls back to the copy for custom items and for archived or deleted exercises", () => {
    expect(resolveItemDisplay({ ...item, kind: "custom", exerciseId: null }, library).title).toBe("Gammel tittel");
    expect(resolveItemDisplay({ ...item, exerciseId: "exercise-archived" }, library).title).toBe("Gammel tittel");
    expect(resolveItemDisplay({ ...item, exerciseId: null }, library).title).toBe("Gammel tittel");
  });

  it("hands back the same object when nothing resolves, so React keeps identity", () => {
    expect(resolveItemDisplay(item, indexExercises([]))).toBe(item);
    const session = demoSessions[0];
    expect(resolveSessionDisplay(session, indexExercises(demoExercises))).toBe(session);
    expect(resolveAll([session], (entry) => resolveSessionDisplay(entry, indexExercises(demoExercises)))[0]).toBe(session);
  });

  it("resolves every linked item in a session's blocks", () => {
    const session = { ...demoSessions[0], blocks: [{ id: "block-1", sessionId: "session-1", title: "Bolk", notes: "", position: 0, updatedBy: "user-gard", items: [item, { ...item, id: "item-2", kind: "custom" as const, exerciseId: null }] }] };
    const [linked, custom] = resolveSessionDisplay(session, library).blocks[0].items;
    expect(linked.title).toBe("Ny tittel");
    expect(custom.title).toBe("Gammel tittel");
  });

  it("resolves warm-up routine items the same way", () => {
    const routine = { ...demoWarmupRoutines[0], items: [{ id: "warmup-1", routineId: demoWarmupRoutines[0].id, kind: "exercise" as const, exerciseId: demoExercises[0].id, title: "Gammel", description: "", mediaUrl: null, thumbnailUrl: null, durationMinutes: 5, coachingNotes: "", position: 0 }] };
    expect(resolveWarmupRoutineDisplay(routine, library).items[0].title).toBe("Ny tittel");
  });
});
