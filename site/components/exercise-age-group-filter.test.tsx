import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExerciseAgeGroupFilter, ExerciseAgeGroupPicker, bandTone } from "./exercise-age-group-filter";
import { categoryPresentation } from "./exercise-category-filter";
import { countExerciseFacets } from "@/lib/exercises";
import { demoExercises } from "@/lib/demo-data";
import { EXERCISE_AGE_GROUPS, EXERCISE_CATEGORIES } from "@/lib/types";

const counts = countExerciseFacets(demoExercises);
const chip = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name} —`) });

describe("bandTone", () => {
  it("gives every band a tone of its own", () => {
    const tones = EXERCISE_AGE_GROUPS.map((group) => bandTone[group]);

    expect(new Set(tones).size).toBe(EXERCISE_AGE_GROUPS.length);
  });

  // A card prints a topic and its bands side by side, so a band borrowing a
  // topic's hue would make the row read as five values of one thing.
  it("keeps the band ramp clear of every topic hue", () => {
    const topics = new Set(EXERCISE_CATEGORIES.map((category) => categoryPresentation[category].tone));

    for (const group of EXERCISE_AGE_GROUPS) expect(topics.has(bandTone[group])).toBe(false);
  });
});

describe("ExerciseAgeGroupFilter", () => {
  it("offers every band plus an unfiltered default", () => {
    render(<ExerciseAgeGroupFilter value={["10-12"]} onChange={vi.fn()} counts={counts} />);

    expect(chip("Alle aldre")).toHaveAttribute("aria-pressed", "false");
    expect(chip("10-12 år")).toHaveAttribute("aria-pressed", "true");
    expect(chip("6-9 år")).toHaveAttribute("aria-pressed", "false");
    expect(chip("13-15 år")).toBeInTheDocument();
  });

  // An exercise with no stated band suits every one of them, so a band counts
  // the exercises written for it plus everything nobody tagged.
  it("counts each band including the exercises with no stated age", () => {
    render(<ExerciseAgeGroupFilter value={[]} onChange={vi.fn()} counts={counts} />);

    const expected = demoExercises.filter((exercise) => exercise.ageGroups.length === 0 || exercise.ageGroups.includes("6-9")).length;
    expect(chip("6-9 år")).toHaveAccessibleName(`6-9 år — ${expected} ${expected === 1 ? "øvelse" : "øvelser"}`);
    expect(chip("Alle aldre")).toHaveAccessibleName(`Alle aldre — ${demoExercises.length} øvelser`);
  });

  it("collects bands instead of replacing them, and clears from Alle aldre", () => {
    const onChange = vi.fn();
    render(<ExerciseAgeGroupFilter value={["13-15"]} onChange={onChange} counts={counts} />);

    fireEvent.click(chip("6-9 år"));
    expect(onChange).toHaveBeenCalledWith(["6-9", "13-15"]);

    fireEvent.click(chip("Alle aldre"));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});

describe("ExerciseAgeGroupPicker", () => {
  const pick = (name: string) => screen.getByRole("button", { name });

  it("adds a band without dropping the ones already chosen", () => {
    const onChange = vi.fn();
    render(<ExerciseAgeGroupPicker value={["13-15"]} onChange={onChange} />);

    fireEvent.click(pick("6-9 år"));

    expect(onChange).toHaveBeenCalledWith(["6-9", "13-15"]);
  });

  it("removes a band that is already chosen", () => {
    const onChange = vi.fn();
    render(<ExerciseAgeGroupPicker value={["6-9", "10-12"]} onChange={onChange} />);

    fireEvent.click(pick("6-9 år"));

    expect(onChange).toHaveBeenCalledWith(["10-12"]);
  });

  it("shows which bands are chosen", () => {
    render(<ExerciseAgeGroupPicker value={["10-12"]} onChange={vi.fn()} />);

    expect(pick("10-12 år")).toHaveAttribute("aria-pressed", "true");
    expect(pick("6-9 år")).toHaveAttribute("aria-pressed", "false");
  });
});
