import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExerciseAgeGroupFilter, ExerciseAgeGroupPicker } from "./exercise-age-group-filter";
import { countExerciseFacets } from "@/lib/exercises";
import { demoExercises } from "@/lib/demo-data";

const counts = countExerciseFacets(demoExercises);
const chip = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name} —`) });

describe("ExerciseAgeGroupFilter", () => {
  it("offers every band plus an unfiltered default", () => {
    render(<ExerciseAgeGroupFilter value={["10-12"]} onChange={vi.fn()} counts={counts} />);

    expect(chip("Alle aldre")).toHaveAttribute("aria-pressed", "false");
    expect(chip("10-12 år")).toHaveAttribute("aria-pressed", "true");
    expect(chip("6-9 år")).toHaveAttribute("aria-pressed", "false");
    expect(chip("13-15 år")).toBeInTheDocument();
  });

  it("counts each band against the untagged exercises it excludes", () => {
    render(<ExerciseAgeGroupFilter value={[]} onChange={vi.fn()} counts={counts} />);

    expect(chip("6-9 år")).toHaveAccessibleName("6-9 år — 1 øvelse");
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
