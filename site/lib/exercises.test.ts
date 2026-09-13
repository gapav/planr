import { describe, expect, it } from "vitest";
import { demoExercises, demoSessions, demoWarmupRoutines } from "./demo-data";
import type { ExerciseAgeGroup } from "./types";
import { canEditExercise, countExerciseFacets, emptyExerciseFilterState, filterExercises, formatAgeGroup, hasActiveExerciseFilter, indexExercises, matchesAgeGroup, matchesAgeGroups, parseExerciseFilterParams, resolveAll, resolveItemDisplay, resolveSessionDisplay, resolveWarmupRoutineDisplay, serializeExerciseFilterParams, teamAgeGroup, toggleFilterValue } from "./exercises";
import { EXERCISE_AGE_GROUPS, EXERCISE_CATEGORIES } from "./types";

describe("exercise filtering", () => {
  it("filters exercises by category", () => {
    expect(filterExercises(demoExercises, { categories: ["Forsvar"] }).map((exercise) => exercise.id)).toEqual(["exercise-2"]);
  });

  it("searches names and descriptions without case sensitivity", () => {
    expect(filterExercises(demoExercises, { query: "FOTARBEID I FORSVAR" }).map((exercise) => exercise.id)).toEqual(["exercise-2"]);
  });

  it("combines category and text filters", () => {
    expect(filterExercises(demoExercises, { query: "kant", categories: ["Angrep"] }).map((exercise) => exercise.id)).toEqual(["exercise-4"]);
    expect(filterExercises(demoExercises, { query: "kant", categories: ["Forsvar"] })).toEqual([]);
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
    expect(filterExercises(demoExercises, { categories: ["Forsvar"], favoriteIds }).map((exercise) => exercise.id)).toEqual(["exercise-2"]);
    expect(filterExercises(demoExercises, { query: "kant", categories: ["Forsvar"], favoriteIds })).toEqual([]);
  });

  it("shows nothing rather than everything when no exercise is hearted", () => {
    expect(filterExercises(demoExercises, { favoriteIds: new Set() })).toEqual([]);
  });

  it("filters exercises by age group", () => {
    expect(filterExercises(demoExercises, { ageGroups: ["6-9"] }).map((exercise) => exercise.id)).toContain("exercise-5");
    expect(filterExercises(demoExercises, { ageGroups: ["6-9"] }).map((exercise) => exercise.id)).not.toContain("exercise-1");
  });

  // The band a coach never picked would otherwise hide most of the library.
  it("shows an untagged exercise in every band", () => {
    expect(filterExercises(demoExercises, { ageGroups: ["6-9"] }).map((exercise) => exercise.id)).toContain("exercise-6");
    expect(filterExercises(demoExercises, { ageGroups: ["13-15"] }).map((exercise) => exercise.id)).toContain("exercise-6");
  });

  it("keeps an exercise that lists several age groups in each of them", () => {
    const ids = (ageGroup: ExerciseAgeGroup) => filterExercises(demoExercises, { ageGroups: [ageGroup] }).map((exercise) => exercise.id);
    expect(ids("10-12")).toContain("exercise-1");
    expect(ids("13-15")).toContain("exercise-1");
  });

  it("combines the age group with the other filters", () => {
    expect(filterExercises(demoExercises, { ageGroups: ["6-9"], categories: ["Leker"] }).map((exercise) => exercise.id)).toEqual(["exercise-5"]);
    expect(filterExercises(demoExercises, { ageGroups: ["6-9"], categories: ["Forsvar"] })).toEqual([]);
  });
});

describe("filtering across several chips", () => {
  it("or-s the values inside one dimension", () => {
    const ids = filterExercises(demoExercises, { categories: ["Forsvar", "Leker"] }).map((exercise) => exercise.id);
    expect(ids).toEqual(["exercise-2", "exercise-5"]);
  });

  it("or-s age bands too, without listing an exercise twice", () => {
    const ids = filterExercises(demoExercises, { ageGroups: ["6-9", "13-15"] }).map((exercise) => exercise.id);
    expect(ids).toContain("exercise-1");
    expect(ids).toEqual([...new Set(ids)]);
  });

  it("still and-s the dimensions against each other", () => {
    expect(filterExercises(demoExercises, { categories: ["Forsvar", "Leker"], ageGroups: ["6-9"] }).map((exercise) => exercise.id)).toEqual(["exercise-5"]);
  });

  it("treats an empty list as an unconstrained dimension, not as an impossible one", () => {
    expect(filterExercises(demoExercises, { categories: [], ageGroups: [] })).toHaveLength(demoExercises.length);
  });
});

describe("facet counts", () => {
  it("counts every category against an unfiltered library", () => {
    const counts = countExerciseFacets(demoExercises);
    expect(counts.allCategories).toBe(demoExercises.length);
    expect(counts.categories.Angrep).toBe(3);
    expect(counts.categories.Forsvar).toBe(1);
  });

  it("warns before the click that a category is empty", () => {
    expect(countExerciseFacets(demoExercises).categories.Målvakt).toBe(0);
  });

  it("measures a chip with its own dimension lifted, so the selected one keeps its full count", () => {
    const counts = countExerciseFacets(demoExercises, { categories: ["Forsvar"] });
    expect(counts.categories.Forsvar).toBe(1);
    expect(counts.categories.Angrep).toBe(3);
    expect(counts.allCategories).toBe(demoExercises.length);
  });

  it("honours the other dimensions in every count", () => {
    const counts = countExerciseFacets(demoExercises, { ageGroups: ["6-9"] });
    const within = filterExercises(demoExercises, { ageGroups: ["6-9"] });
    expect(counts.categories.Leker).toBe(within.filter((exercise) => exercise.category === "Leker").length);
    expect(counts.allCategories).toBe(within.length);
  });

  it("gives a count that matches what clicking the chip actually shows", () => {
    for (const category of EXERCISE_CATEGORIES) {
      const filter = { query: "i", ageGroups: ["13-15"] as const };
      expect(countExerciseFacets(demoExercises, filter).categories[category])
        .toBe(filterExercises(demoExercises, { ...filter, categories: [category] }).length);
    }
    for (const group of EXERCISE_AGE_GROUPS) {
      const filter = { categories: ["Angrep"] as const };
      expect(countExerciseFacets(demoExercises, filter).ageGroups[group])
        .toBe(filterExercises(demoExercises, { ...filter, ageGroups: [group] }).length);
    }
  });
});

describe("filter state and its query string", () => {
  it("starts empty and reports itself inactive", () => {
    expect(hasActiveExerciseFilter(emptyExerciseFilterState())).toBe(false);
  });

  it("treats whitespace as no search at all", () => {
    expect(hasActiveExerciseFilter({ ...emptyExerciseFilterState(), query: "   " })).toBe(false);
    expect(hasActiveExerciseFilter({ ...emptyExerciseFilterState(), query: "kant" })).toBe(true);
  });

  it("notices each dimension on its own", () => {
    expect(hasActiveExerciseFilter({ ...emptyExerciseFilterState(), categories: ["Angrep"] })).toBe(true);
    expect(hasActiveExerciseFilter({ ...emptyExerciseFilterState(), ageGroups: ["6-9"] })).toBe(true);
    expect(hasActiveExerciseFilter({ ...emptyExerciseFilterState(), favoritesOnly: true })).toBe(true);
  });

  it("round-trips a filter through the query string", () => {
    const state = { query: "kant", categories: ["Angrep", "Forsvar"] as const, ageGroups: ["13-15"] as const, favoritesOnly: true };
    const restored = parseExerciseFilterParams(serializeExerciseFilterParams({ ...state, categories: [...state.categories], ageGroups: [...state.ageGroups] }));
    expect(restored).toEqual({ query: "kant", categories: ["Forsvar", "Angrep"], ageGroups: ["13-15"], favoritesOnly: true });
  });

  it("keeps an unfiltered library out of the URL", () => {
    expect(serializeExerciseFilterParams(emptyExerciseFilterState()).toString()).toBe("");
  });

  it("degrades a hand-edited link to a wider library instead of throwing", () => {
    const restored = parseExerciseFilterParams(new URLSearchParams("kategori=Angrep,Trolldom&alder=99-100"));
    expect(restored.categories).toEqual(["Angrep"]);
    expect(restored.ageGroups).toEqual([]);
  });

  it("reads a list in the canonical order however the link was written", () => {
    expect(parseExerciseFilterParams(new URLSearchParams("kategori=Leker,Forsvar")).categories).toEqual(["Forsvar", "Leker"]);
  });
});

describe("toggling a chip", () => {
  it("adds and removes a value", () => {
    expect(toggleFilterValue(["Angrep"], "Forsvar", EXERCISE_CATEGORIES)).toEqual(["Forsvar", "Angrep"]);
    expect(toggleFilterValue(["Forsvar", "Angrep"], "Forsvar", EXERCISE_CATEGORIES)).toEqual(["Angrep"]);
  });

  it("keeps the canonical order whatever order the coach clicked in", () => {
    expect(toggleFilterValue(["13-15"], "6-9", EXERCISE_AGE_GROUPS)).toEqual(["6-9", "13-15"]);
  });
});

describe("age group matching", () => {
  it("keeps an exercise with no stated age group in every band", () => {
    expect(matchesAgeGroup([], "6-9")).toBe(true);
    expect(matchesAgeGroup([], null)).toBe(true);
  });

  it("lets an unconstrained list through and or-s a constrained one", () => {
    expect(matchesAgeGroups([], [])).toBe(true);
    expect(matchesAgeGroups(["10-12"], ["6-9"])).toBe(false);
    expect(matchesAgeGroups(["13-15"], ["6-9", "13-15"])).toBe(true);
    expect(matchesAgeGroups(["10-12"], ["6-9", "13-15"])).toBe(false);
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
    durationMinutes: 25, coachingNotes: "Behold dette", assignedCoachId: "user-nora", position: 0, updatedBy: "user-gard",
  };

  it("shows the library's display data instead of the stored copy", () => {
    expect(resolveItemDisplay(item, library)).toMatchObject({
      title: "Ny tittel", description: "Ny beskrivelse",
      mediaUrl: "https://example.com/ny.jpg", thumbnailUrl: "https://example.com/ny-thumb.jpg",
    });
  });

  it("keeps the plan's own fields", () => {
    expect(resolveItemDisplay(item, library)).toMatchObject({ durationMinutes: 25, coachingNotes: "Behold dette", assignedCoachId: "user-nora", position: 0 });
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

// A coach coaches one team, and the team's own name already says which band it
// trains in — so the library opens there rather than at "alle aldre".
describe("teamAgeGroup", () => {
  const now = new Date("2026-09-13T10:00:00.000Z");

  it("reads the birth year Norwegian club teams are named after", () => {
    expect(teamAgeGroup({ shortName: "J2016", name: "KIL - J2016" }, now)).toBe("10-12");
    expect(teamAgeGroup({ shortName: "G2012", name: "KIL - G2012" }, now)).toBe("13-15");
    expect(teamAgeGroup({ shortName: "J2018", name: "KIL - J2018" }, now)).toBe("6-9");
  });

  it("reads a stated age where the name carries no year", () => {
    expect(teamAgeGroup({ shortName: "Jenter 14", name: "Fjordvik HK - Jenter 14" }, now)).toBe("13-15");
    expect(teamAgeGroup({ shortName: "G11", name: "Fjordvik HK - G11" }, now)).toBe("10-12");
  });

  // "J2016" matches the stated-age pattern too, so the year has to win.
  it("prefers the year when a name carries both", () => {
    expect(teamAgeGroup({ shortName: "J2016", name: "J2016" }, now)).toBe("10-12");
  });

  // Guessing is worse than not narrowing: a band that does not exist yet, or a
  // name that says nothing about age, leaves the whole library in place.
  it("gives null for a team no band covers", () => {
    expect(teamAgeGroup({ shortName: "Senior kvinner", name: "Fjordvik HK - Senior kvinner" }, now)).toBeNull();
    expect(teamAgeGroup({ shortName: "Jenter 16", name: "Fjordvik HK - Jenter 16" }, now)).toBeNull();
    expect(teamAgeGroup({ shortName: "Fjordvik 2", name: "Fjordvik HK 2" }, now)).toBeNull();
    expect(teamAgeGroup(null, now)).toBeNull();
  });
});

// The library opens on the team's own band without anyone asking for it, so that
// band must not hide the exercises whose author simply never stated one.
describe("an exercise with no stated age", () => {
  it("suits every band", () => {
    expect(matchesAgeGroup([], "10-12")).toBe(true);
    expect(matchesAgeGroups([], ["10-12"])).toBe(true);
  });

  it("does not excuse an exercise tagged for another age", () => {
    expect(matchesAgeGroups(["13-15"], ["10-12"])).toBe(false);
    expect(matchesAgeGroups(["10-12"], ["10-12"])).toBe(true);
  });

  it("filters a library the same way", () => {
    const library = [
      { id: "a", name: "Uten alder", description: "", category: "Angrep" as const, ageGroups: [] },
      { id: "b", name: "For eldre", description: "", category: "Angrep" as const, ageGroups: ["13-15" as const] },
      { id: "c", name: "For laget", description: "", category: "Angrep" as const, ageGroups: ["10-12" as const] },
    ];
    expect(filterExercises(library, { ageGroups: ["10-12"] }).map((entry) => entry.id)).toEqual(["a", "c"]);
  });
});
