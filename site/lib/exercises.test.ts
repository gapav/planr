import { describe, expect, it } from "vitest";
import { demoExercises } from "./demo-data";
import { canEditExercise, filterExercises } from "./exercises";

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
