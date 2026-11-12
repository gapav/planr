import { describe, expect, it } from "vitest";
import { demoExercises, demoSessions, demoWarmupRoutines } from "./demo-data";
import type { ExerciseAgeGroup } from "./types";
import { canEditExercise, countExerciseFacets, formatAgeRange, formatSubtopic, formatSubtopicShort,matchesTopics, subtopicCategory, subtopicsForCategory, subtopicsOf, emptyExerciseFilterState, filterExercises, formatAgeGroup, hasActiveExerciseFilter, indexExercises, matchesAgeGroup, matchesAgeGroups, parseExerciseFilterParams, resolveAll, resolveItemDisplay, resolveSessionDisplay, resolveWarmupRoutineDisplay, sameShortlist, serializeExerciseFilterParams, shortlistExerciseIds, teamAgeGroup, toggleFilterValue } from "./exercises";
import { EXERCISE_AGE_GROUPS, EXERCISE_CATEGORIES, EXERCISE_SUBTOPIC_KEYS, EXERCISE_SUBTOPICS, type ExerciseCategory, type ExerciseSubtopic } from "./types";

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
    expect(filterExercises(demoExercises, { shortlistIds: null })).toHaveLength(demoExercises.length);
  });

  // The same slot carries a samling's contents; the filter cannot tell the two
  // shortlists apart, and deliberately does not try.
  it("narrows the library to one chosen shortlist", () => {
    const shortlistIds = new Set(["exercise-2", "exercise-4"]);
    expect(filterExercises(demoExercises, { shortlistIds }).map((exercise) => exercise.id)).toEqual(["exercise-2", "exercise-4"]);
  });

  it("applies search and category on top of the shortlist", () => {
    const shortlistIds = new Set(["exercise-2", "exercise-4"]);
    expect(filterExercises(demoExercises, { categories: ["Forsvar"], shortlistIds }).map((exercise) => exercise.id)).toEqual(["exercise-2"]);
    expect(filterExercises(demoExercises, { query: "kant", categories: ["Forsvar"], shortlistIds })).toEqual([]);
  });

  it("shows nothing rather than everything when the shortlist is empty", () => {
    expect(filterExercises(demoExercises, { shortlistIds: new Set() })).toEqual([]);
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
    expect(hasActiveExerciseFilter({ ...emptyExerciseFilterState(), shortlist: { kind: "favorites" } })).toBe(true);
    expect(hasActiveExerciseFilter({ ...emptyExerciseFilterState(), shortlist: { kind: "collection", id: "c1" } })).toBe(true);
  });

  it("round-trips a filter through the query string", () => {
    const state = { query: "kant", categories: ["Angrep", "Forsvar"] as const, subtopics: ["forsvar.teknikk", "angrep.finter"] as const, ageGroups: ["13-15"] as const, shortlist: { kind: "favorites" } as const };
    const restored = parseExerciseFilterParams(serializeExerciseFilterParams({ ...state, categories: [...state.categories], subtopics: [...state.subtopics], ageGroups: [...state.ageGroups] }));
    expect(restored).toEqual({ query: "kant", categories: ["Forsvar", "Angrep"], subtopics: ["forsvar.teknikk", "angrep.finter"], ageGroups: ["13-15"], shortlist: { kind: "favorites" } });
  });

  it("round-trips a samling through the query string", () => {
    const shortlist = { kind: "collection", id: "9f1c6f40-0f0e-4c4a-9a6e-2b9c1b2b3c4d" } as const;
    expect(serializeExerciseFilterParams({ ...emptyExerciseFilterState(), shortlist }).toString()).toBe(`samling=${shortlist.id}`);
    expect(parseExerciseFilterParams(new URLSearchParams(`samling=${shortlist.id}`)).shortlist).toEqual(shortlist);
  });

  // Links written before samlinger existed are in coaches' inboxes; they are
  // still read, and rewritten in the new form the first time a filter is touched.
  it("still reads the favourites link the library used to write", () => {
    expect(parseExerciseFilterParams(new URLSearchParams("favoritter=1")).shortlist).toEqual({ kind: "favorites" });
    expect(serializeExerciseFilterParams({ ...emptyExerciseFilterState(), shortlist: { kind: "favorites" } }).toString()).toBe("samling=favoritter");
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

describe("resolving a chosen shortlist", () => {
  const collections = [
    { id: "c1", exerciseIds: ["exercise-1", "exercise-3"] },
    { id: "c2", exerciseIds: [] },
  ];

  it("has nothing to narrow by when no shortlist is chosen", () => {
    expect(shortlistExerciseIds(null, ["exercise-2"], collections)).toBeNull();
  });

  it("resolves favourites to the coach's own hearts", () => {
    expect([...shortlistExerciseIds({ kind: "favorites" }, ["exercise-2"], collections) ?? []]).toEqual(["exercise-2"]);
  });

  it("resolves a samling to its contents", () => {
    expect([...shortlistExerciseIds({ kind: "collection", id: "c1" }, [], collections) ?? []]).toEqual(["exercise-1", "exercise-3"]);
  });

  // An empty samling is a real answer; an unknown one is not.
  it("keeps an empty samling empty", () => {
    expect([...shortlistExerciseIds({ kind: "collection", id: "c2" }, ["exercise-2"], collections) ?? []]).toEqual([]);
  });

  // A link to a samling since deleted, or one that arrives before the workspace
  // has loaded, widens to the whole library rather than emptying the grid.
  it("widens rather than empties when the samling is unknown", () => {
    expect(shortlistExerciseIds({ kind: "collection", id: "gone" }, [], collections)).toBeNull();
  });
});

describe("comparing shortlists", () => {
  it("matches a samling by id and favourites by kind", () => {
    expect(sameShortlist({ kind: "favorites" }, { kind: "favorites" })).toBe(true);
    expect(sameShortlist({ kind: "collection", id: "c1" }, { kind: "collection", id: "c1" })).toBe(true);
    expect(sameShortlist({ kind: "collection", id: "c1" }, { kind: "collection", id: "c2" })).toBe(false);
    expect(sameShortlist({ kind: "favorites" }, { kind: "collection", id: "c1" })).toBe(false);
    expect(sameShortlist(null, null)).toBe(true);
    expect(sameShortlist(null, { kind: "favorites" })).toBe(false);
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
    durationMinutes: 25, coachingNotes: "Behold dette", assignedCoachIds: ["user-nora"], position: 0, updatedBy: "user-gard",
  };

  it("shows the library's display data instead of the stored copy", () => {
    expect(resolveItemDisplay(item, library)).toMatchObject({
      title: "Ny tittel", description: "Ny beskrivelse",
      mediaUrl: "https://example.com/ny.jpg", thumbnailUrl: "https://example.com/ny-thumb.jpg",
    });
  });

  it("keeps the plan's own fields", () => {
    expect(resolveItemDisplay(item, library)).toMatchObject({ durationMinutes: 25, coachingNotes: "Behold dette", assignedCoachIds: ["user-nora"], position: 0 });
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
    const session = { ...demoSessions[0], blocks: [{ id: "block-1", sessionId: "session-1", title: "Bolk", notes: "", kind: "sequence" as const, rotationMinutes: null, position: 0, updatedBy: "user-gard", items: [item, { ...item, id: "item-2", kind: "custom" as const, exerciseId: null }] }] };
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

describe("undertema", () => {
  const row = (id: string, category: ExerciseCategory, subtopics: ExerciseSubtopic[] = []) =>
    ({ id, name: id, description: "", category, ageGroups: [], subtopics });
  const library = [
    row("finter", "Angrep", ["angrep.finter"]),
    row("finter-og-kast", "Angrep", ["angrep.finter", "angrep.kast-og-mottak"]),
    row("kast", "Angrep", ["angrep.kast-og-mottak"]),
    row("angrep-uten", "Angrep"),
    row("forsvar-teknikk", "Forsvar", ["forsvar.teknikk"]),
    row("forsvar-uten", "Forsvar"),
    row("lufta", "Skuddferdigheter", ["skudd.lufta"]),
  ];
  const ids = (filter: Parameters<typeof filterExercises>[1]) => filterExercises(library, filter).map((exercise) => exercise.id);

  it("keys each subtopic to one topic, with no key used twice", () => {
    expect(new Set(EXERCISE_SUBTOPIC_KEYS).size).toBe(EXERCISE_SUBTOPIC_KEYS.length);
    for (const category of EXERCISE_CATEGORIES) {
      for (const { key } of EXERCISE_SUBTOPICS[category]) expect(subtopicCategory(key)).toBe(category);
    }
    // "Teknikk" is a label twice and a key once each.
    expect(formatSubtopic("forsvar.teknikk")).toBe("Teknikk");
    expect(formatSubtopic("malvakt.teknikk")).toBe("Teknikk");
    expect(subtopicsOf("Leker")).toEqual(["leker.oppvarming", "leker.smalagsspill"]);
  });

  it("shows only the exercises tagged with a chosen subtopic, never an untagged one", () => {
    expect(ids({ categories: ["Angrep"], subtopics: ["angrep.finter"] })).toEqual(["finter", "finter-og-kast"]);
    // The same without the topic, as a hand-written link might arrive.
    expect(ids({ subtopics: ["angrep.finter"] })).toEqual(["finter", "finter-og-kast"]);
    expect(matchesTopics(row("x", "Angrep"), ["Angrep"], ["angrep.finter"])).toBe(false);
  });

  it("still shows the whole topic, tagged or not, while none of its subtopics is chosen", () => {
    expect(ids({ categories: ["Angrep"] })).toEqual(["finter", "finter-og-kast", "kast", "angrep-uten"]);
  });

  it("combines several subtopics as a union", () => {
    expect(ids({ categories: ["Angrep"], subtopics: ["angrep.finter", "angrep.kast-og-mottak"] })).toEqual(["finter", "finter-og-kast", "kast"]);
    expect(ids({ subtopics: ["angrep.finter", "skudd.lufta"] })).toEqual(["finter", "finter-og-kast", "lufta"]);
  });

  it("narrows only the topic a subtopic belongs to", () => {
    expect(ids({ categories: ["Angrep", "Forsvar"], subtopics: ["angrep.finter"] })).toEqual(["finter", "finter-og-kast", "forsvar-teknikk", "forsvar-uten"]);
  });

  it("still applies the other dimensions to a subtopic", () => {
    expect(ids({ subtopics: ["angrep.finter"], shortlistIds: new Set(["finter-og-kast"]) })).toEqual(["finter-og-kast"]);
    expect(ids({ subtopics: ["angrep.finter"], query: "og-kast" })).toEqual(["finter-og-kast"]);
  });

  it("treats a row without subtopics as untagged", () => {
    const bare = { id: "bare", name: "bare", description: "", category: "Angrep" as const, ageGroups: [] };
    expect(filterExercises([bare], { categories: ["Angrep"] })).toHaveLength(1);
    expect(filterExercises([bare], { subtopics: ["angrep.finter"] })).toHaveLength(0);
  });

  it("counts every subtopic, an empty one as 0, with the whole Tema dimension lifted", () => {
    const counts = countExerciseFacets(library, { categories: ["Forsvar"], subtopics: ["forsvar.teknikk"] });
    expect(Object.keys(counts.subtopics)).toEqual([...EXERCISE_SUBTOPIC_KEYS]);
    expect(counts.subtopics["angrep.finter"]).toBe(2);
    expect(counts.subtopics["angrep.kast-og-mottak"]).toBe(2);
    expect(counts.subtopics["forsvar.teknikk"]).toBe(1);
    expect(counts.subtopics["malvakt.teknikk"]).toBe(0);
    // Choosing a subtopic does not shrink its own topic's badge.
    expect(counts.categories.Forsvar).toBe(2);
    expect(counts.allCategories).toBe(library.length);
  });

  it("measures subtopic counts against the other filters", () => {
    const counts = countExerciseFacets(library, { query: "kast" });
    expect(counts.subtopics["angrep.finter"]).toBe(1);
    expect(counts.subtopics["angrep.kast-og-mottak"]).toBe(2);
  });

  it("round-trips subtopics through `undertema=`, dropping unknown keys", () => {
    const state = { ...emptyExerciseFilterState(), categories: ["Angrep" as const], subtopics: ["angrep.finter" as const, "angrep.1-mot-1" as const] };
    const params = serializeExerciseFilterParams(state);
    expect(params.get("undertema")).toBe("angrep.finter,angrep.1-mot-1");
    expect(parseExerciseFilterParams(params)).toEqual(state);
    expect(parseExerciseFilterParams(new URLSearchParams("undertema=angrep.1-mot-1,angrep.trolldom,Finter,angrep.finter")).subtopics).toEqual(["angrep.finter", "angrep.1-mot-1"]);
    expect(serializeExerciseFilterParams(emptyExerciseFilterState()).has("undertema")).toBe(false);
  });

  it("notices a chosen subtopic as an active filter", () => {
    expect(hasActiveExerciseFilter({ ...emptyExerciseFilterState(), subtopics: ["skudd.lufta"] })).toBe(true);
  });

  it("keeps only the subtopics of a topic, in list order", () => {
    expect(subtopicsForCategory(["angrep.finter", "forsvar.teknikk", "angrep.ballbehandling"], "Angrep")).toEqual(["angrep.ballbehandling", "angrep.finter"]);
    expect(subtopicsForCategory(["angrep.finter"], "Forsvar")).toEqual([]);
  });
});

describe("the library card's labels", () => {
  it("merges adjacent age bands into one range and lists a gap", () => {
    expect(formatAgeRange(["6-9", "10-12", "13-15"])).toBe("6–15 år");
    expect(formatAgeRange(["6-9", "10-12"])).toBe("6–12 år");
    expect(formatAgeRange(["10-12", "13-15"])).toBe("10–15 år");
    expect(formatAgeRange(["6-9", "13-15"])).toBe("6–9, 13–15 år");
    expect(formatAgeRange(["10-12"])).toBe("10–12 år");
  });

  it("reads no age group as every age, as matchesAgeGroup does", () => {
    expect(formatAgeRange([])).toBe("Alle aldre");
  });

  it("does not care which order the bands arrive in", () => {
    expect(formatAgeRange(["13-15", "6-9", "10-12"])).toBe("6–15 år");
    expect(formatAgeRange(["13-15", "6-9"])).toBe("6–9, 13–15 år");
  });

  it("gives every subtopic a non-empty short label", () => {
    for (const category of EXERCISE_CATEGORIES) {
      for (const entry of EXERCISE_SUBTOPICS[category]) expect(entry.short.trim(), entry.key).not.toBe("");
    }
  });

  it("shortens a subtopic for the card and keeps the full label elsewhere", () => {
    expect(formatSubtopicShort("angrep.1-mot-1")).toBe("1 mot 1");
    expect(formatSubtopic("angrep.1-mot-1")).toBe("Angrepsspill 1 mot 1");
    expect(formatSubtopicShort("skudd.posisjon")).toBe("Posisjonsspesifikke");
    expect(formatSubtopicShort("malvakt.fysisk")).toBe("Fysikk");
  });
});
