import { describe, expect, it } from "vitest";
import { demoExercises } from "./demo-data";
import { filterExercises } from "./exercises";

describe("exercise filtering", () => {
  it("filters exercises by category", () => {
    expect(filterExercises(demoExercises, "", "Forsvar").map((exercise) => exercise.id)).toEqual(["exercise-2"]);
  });

  it("searches names and descriptions without case sensitivity", () => {
    expect(filterExercises(demoExercises, "DEFENSIVE FOOTWORK", null).map((exercise) => exercise.id)).toEqual(["exercise-2"]);
  });

  it("combines category and text filters", () => {
    expect(filterExercises(demoExercises, "wing", "Angrep").map((exercise) => exercise.id)).toEqual(["exercise-4"]);
    expect(filterExercises(demoExercises, "wing", "Forsvar")).toEqual([]);
  });
});
