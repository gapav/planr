import { describe, expect, it } from "vitest";
import { demoExercises, demoSessions, demoWarmupRoutines } from "./demo-data";
import type { ExerciseAgeGroup } from "./types";
import { canEditExercise, filterExercises, formatAgeGroup, indexExercises, matchesAgeGroup, resolveAll, resolveItemDisplay, resolveSessionDisplay, resolveWarmupRoutineDisplay } from "./exercises";

describe("exercise filtering", () => {
  it("filters exercises by category", () => {
    expect(filterExercises(demoExercises, { category: "Forsvar" }).map((exercise) => exercise.id)).toEqual(["exercise-2"]);
  });

  it("searches names and descriptions without case sensitivity", () => {
    expect(filterExercises(demoExercises, { query: "FOTARBEID I FORSVAR" }).map((exercise) => exercise.id)).toEqual(["exercise-2"]);
  });

  it("combines category and text filters", () => {
    expect(filterExercises(demoExercises, { query: "kant", category: "Angrep" }).map((exercise) => exercise.id)).toEqual(["exercise-4"]);
    expect(filterExercises(demoExercises, { query: "kant", category: "Forsvar" })).toEqual([]);
  });

  it("leaves the library whole when nothing is filtered", () => {
    expect(filterExercises(demoExercises)).toHaveLength(demoExercises.length);
    expect(filterExercises(demoExercises, { favoriteIds: null })).toHaveLength(demoExercises.length);
  });

  it("narrows the library to the coach's hearted exercises", () => {
    const favoriteIds = new Set(["exercise-2", "exercise-4"]);
    expect(filterExercises(demoExercises, { favoriteIds }).map((exercise) => exercise.id)).toEqual(["exercise-2", "exercise-4"]);
  });

  it("applies search and category on top of the favourites", () => {
    const favoriteIds = new Set(["exercise-2", "exercise-4"]);
    expect(filterExercises(demoExercises, { category: "Forsvar", favoriteIds }).map((exercise) => exercise.id)).toEqual(["exercise-2"]);
    expect(filterExercises(demoExercises, { query: "kant", category: "Forsvar", favoriteIds })).toEqual([]);
  });

  it("shows nothing rather than everything when no exercise is hearted", () => {
    expect(filterExercises(demoExercises, { favoriteIds: new Set() })).toEqual([]);
  });

  it("filters exercises by age group", () => {
    expect(filterExercises(demoExercises, { ageGroup: "6-9" }).map((exercise) => exercise.id)).toEqual(["exercise-5"]);
  });

  it("hides an untagged exercise from every band rather than showing it in all of them", () => {
    expect(filterExercises(demoExercises, { ageGroup: "6-9" }).map((exercise) => exercise.id)).not.toContain("exercise-6");
    expect(filterExercises(demoExercises, { ageGroup: "13-15" }).map((exercise) => exercise.id)).not.toContain("exercise-6");
    expect(filterExercises(demoExercises).map((exercise) => exercise.id)).toContain("exercise-6");
  });

  it("keeps an exercise that lists several age groups in each of them", () => {
    const ids = (ageGroup: ExerciseAgeGroup) => filterExercises(demoExercises, { ageGroup }).map((exercise) => exercise.id);
    expect(ids("10-12")).toContain("exercise-1");
    expect(ids("13-15")).toContain("exercise-1");
  });

  it("combines the age group with the other filters", () => {
    expect(filterExercises(demoExercises, { ageGroup: "6-9", category: "Leker" }).map((exercise) => exercise.id)).toEqual(["exercise-5"]);
    expect(filterExercises(demoExercises, { ageGroup: "6-9", category: "Forsvar" })).toEqual([]);
  });
});

describe("age group matching", () => {
  it("keeps an exercise with no stated age group out of every band", () => {
    expect(matchesAgeGroup([], "6-9")).toBe(false);
    expect(matchesAgeGroup([], null)).toBe(true);
  });

  it("keeps an exercise only in the bands it lists", () => {
    expect(matchesAgeGroup(["10-12", "13-15"], "13-15")).toBe(true);
    expect(matchesAgeGroup(["10-12", "13-15"], "6-9")).toBe(false);
  });

  it("matches everything when no band is selected", () => {
    expect(matchesAgeGroup(["6-9"], null)).toBe(true);
  });
});

describe("age group labels", () => {
  it("renders a stored key as Norwegian text", () => {
    expect(formatAgeGroup("6-9")).toBe("6-9 år");
    expect(formatAgeGroup("13-15")).toBe("13-15 år");
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
