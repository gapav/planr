import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExerciseCategoryFilter, categoryPresentation } from "./exercise-category-filter";
import { countExerciseFacets } from "@/lib/exercises";
import { demoExercises } from "@/lib/demo-data";
import { EXERCISE_CATEGORIES } from "@/lib/types";

const counts = countExerciseFacets(demoExercises);
const chip = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name} —`) });

describe("categoryPresentation", () => {
  // The hue is the point: six topics sharing one apricot said nothing a coach
  // could not already read off the label.
  it("gives every category a tone no other category wears", () => {
    const tones = EXERCISE_CATEGORIES.map((category) => categoryPresentation[category].tone);

    expect(new Set(tones).size).toBe(EXERCISE_CATEGORIES.length);
  });
});

describe("ExerciseCategoryFilter", () => {
  // Each category used to carry its own palette here, which the rebrand's
  // `.grep-filter-chips` rules had been overriding for months. The icon is the
  // cue the markup still owns; being on or off is painted in CSS.
  it("gives every category its own visual cue", () => {
    render(<ExerciseCategoryFilter value={["Angrep"]} onChange={vi.fn()} counts={counts} />);

    expect(chip("Forsvar").querySelector(".lucide-shield")).toBeInTheDocument();
    expect(chip("Skuddferdigheter").querySelector(".lucide-target")).toBeInTheDocument();
    expect(chip("Angrep")).toHaveAttribute("aria-pressed", "true");
    expect(chip("Forsvar")).toHaveAttribute("aria-pressed", "false");
  });

  it("shows what each chip is worth before it is clicked", () => {
    render(<ExerciseCategoryFilter value={[]} onChange={vi.fn()} counts={counts} />);

    expect(chip("Angrep")).toHaveAccessibleName("Angrep — 3 øvelser");
    expect(chip("Alle")).toHaveAccessibleName(`Alle — ${demoExercises.length} øvelser`);
  });

  it("dims a category that would return nothing", () => {
    render(<ExerciseCategoryFilter value={[]} onChange={vi.fn()} counts={counts} />);

    expect(chip("Målvakt")).toHaveAccessibleName("Målvakt — 0 øvelser");
    expect(chip("Målvakt")).toHaveClass("opacity-50");
    expect(chip("Angrep")).not.toHaveClass("opacity-50");
  });

  it("adds a second category rather than replacing the first", () => {
    const onChange = vi.fn();
    render(<ExerciseCategoryFilter value={["Angrep"]} onChange={onChange} counts={counts} />);

    fireEvent.click(chip("Forsvar"));

    expect(onChange).toHaveBeenCalledWith(["Forsvar", "Angrep"]);
  });

  it("removes a category that is already chosen", () => {
    const onChange = vi.fn();
    render(<ExerciseCategoryFilter value={["Forsvar", "Angrep"]} onChange={onChange} counts={counts} />);

    fireEvent.click(chip("Angrep"));

    expect(onChange).toHaveBeenCalledWith(["Forsvar"]);
  });

  it("clears the dimension from the Alle chip", () => {
    const onChange = vi.fn();
    render(<ExerciseCategoryFilter value={["Forsvar", "Angrep"]} onChange={onChange} counts={counts} />);

    fireEvent.click(chip("Alle"));

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("marks Alle as current only while nothing is chosen", () => {
    const { rerender } = render(<ExerciseCategoryFilter value={[]} onChange={vi.fn()} counts={counts} />);
    expect(chip("Alle")).toHaveAttribute("aria-pressed", "true");

    rerender(<ExerciseCategoryFilter value={["Angrep"]} onChange={vi.fn()} counts={counts} />);
    expect(chip("Alle")).toHaveAttribute("aria-pressed", "false");
  });

  // A chosen samling does the narrowing on its own, so the row goes quiet
  // rather than away — the counts stay readable, the clicks stop, and the
  // layout does not jump when the samling is put down again.
  it("switches the whole row off without hiding it", () => {
    const onChange = vi.fn();
    render(<ExerciseCategoryFilter value={[]} onChange={onChange} counts={counts} disabled />);

    expect(chip("Forsvar")).toBeDisabled();
    expect(chip("Forsvar")).toHaveAccessibleName("Forsvar — 1 øvelse");
    fireEvent.click(chip("Forsvar"));
    expect(onChange).not.toHaveBeenCalled();
    // The per-chip dimming would stack on the row's own, so it stands down.
    expect(chip("Målvakt")).not.toHaveClass("opacity-50");
  });

  it("is a single tab stop that arrow keys move within", () => {
    render(<ExerciseCategoryFilter value={[]} onChange={vi.fn()} counts={counts} />);

    expect(chip("Alle")).toHaveAttribute("tabindex", "0");
    expect(chip("Forsvar")).toHaveAttribute("tabindex", "-1");

    fireEvent.keyDown(chip("Alle"), { key: "ArrowRight" });

    expect(chip("Forsvar")).toHaveAttribute("tabindex", "0");
    expect(chip("Forsvar")).toHaveFocus();
    expect(chip("Alle")).toHaveAttribute("tabindex", "-1");
  });

  it("wraps at the ends and jumps with Home", () => {
    render(<ExerciseCategoryFilter value={[]} onChange={vi.fn()} counts={counts} />);

    fireEvent.keyDown(chip("Alle"), { key: "ArrowLeft" });
    expect(chip("Leker")).toHaveFocus();

    fireEvent.keyDown(chip("Leker"), { key: "Home" });
    expect(chip("Alle")).toHaveFocus();
  });
});
