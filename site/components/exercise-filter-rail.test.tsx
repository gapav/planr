import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActiveExerciseFilters, ExerciseFilterRail, ExerciseFilterSheet } from "./exercise-filter-rail";
import { countExerciseFacets, emptyExerciseFilterState } from "@/lib/exercises";
import { demoExercises } from "@/lib/demo-data";
import type { ExerciseFilterState } from "@/lib/exercises";

const counts = countExerciseFacets(demoExercises);
const option = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });
const state = (patch: Partial<ExerciseFilterState> = {}): ExerciseFilterState => ({ ...emptyExerciseFilterState(), ...patch });

function renderRail(filters: ExerciseFilterState, onChange = vi.fn(), suggested: "10-12" | null = "10-12") {
  render(<ExerciseFilterRail filters={filters} counts={counts} suggested={suggested} canFavorite favoriteCount={2} resultCount={demoExercises.length} onChange={onChange} />);
  return onChange;
}

describe("ExerciseFilterRail", () => {
  // A coach coaches one team at one age, so the band replaces rather than joins.
  it("narrows to one band and lets the same band clear itself", () => {
    const onChange = renderRail(state({ ageGroups: ["6-9"] }));

    fireEvent.click(option("10-12 år"));
    expect(onChange).toHaveBeenCalledWith({ ageGroups: ["10-12"] });

    fireEvent.click(option("6-9 år"));
    expect(onChange).toHaveBeenLastCalledWith({ ageGroups: [] });
  });

  // "angrep or skudd" is how a coach looks for an idea, so topics collect.
  it("collects topics instead of replacing them", () => {
    const onChange = renderRail(state({ categories: ["Angrep"] }));

    fireEvent.click(option("Forsvar"));
    expect(onChange).toHaveBeenCalledWith({ categories: ["Forsvar", "Angrep"] });
  });

  it("clears a dimension from its own «alle» row", () => {
    const onChange = renderRail(state({ categories: ["Angrep"], ageGroups: ["10-12"] }));

    fireEvent.click(option("Alle tema"));
    expect(onChange).toHaveBeenCalledWith({ categories: [] });

    fireEvent.click(option("Alle aldre"));
    expect(onChange).toHaveBeenLastCalledWith({ ageGroups: [] });
  });

  // Narrowed without being asked, the rail has to say why.
  it("says which band came from the team, and only on that band", () => {
    renderRail(state({ ageGroups: ["10-12"] }));

    expect(option("10-12 år")).toHaveTextContent("laget ditt");
    expect(option("6-9 år")).not.toHaveTextContent("laget ditt");
  });

  it("leaves the note out when the team's name settles no band", () => {
    renderRail(state(), vi.fn(), null);

    expect(screen.queryByText("laget ditt")).toBeNull();
  });

  it("keeps an empty topic reachable, so the count can explain the empty grid", () => {
    renderRail(state());

    expect(option("Målvakt")).toBeEnabled();
    expect(option("Målvakt")).toHaveTextContent("0");
  });

  it("hides favourites from a visitor with no shortlist", () => {
    render(<ExerciseFilterRail filters={state()} counts={counts} suggested={null} canFavorite={false} favoriteCount={0} resultCount={0} onChange={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /^Favoritter/ })).toBeNull();
  });
});

describe("ActiveExerciseFilters", () => {
  it("says nothing while nothing is applied", () => {
    const { container } = render(<ActiveExerciseFilters filters={state()} favoritesOnly={false} onChange={vi.fn()} onReset={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("removes one filter without disturbing the rest", () => {
    const onChange = vi.fn();
    render(<ActiveExerciseFilters filters={state({ categories: ["Forsvar", "Angrep"], ageGroups: ["10-12"], query: "skudd" })} favoritesOnly onChange={onChange} onReset={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Fjern filteret Forsvar" }));
    expect(onChange).toHaveBeenCalledWith({ categories: ["Angrep"] });

    fireEvent.click(screen.getByRole("button", { name: "Fjern filteret «skudd»" }));
    expect(onChange).toHaveBeenLastCalledWith({ query: "" });
  });

  it("offers one reset for all of them", () => {
    const onReset = vi.fn();
    render(<ActiveExerciseFilters filters={state({ ageGroups: ["10-12"] })} favoritesOnly={false} onChange={vi.fn()} onReset={onReset} />);

    fireEvent.click(screen.getByRole("button", { name: "Nullstill" }));
    expect(onReset).toHaveBeenCalled();
  });
});

// Below 1024px the rail is hidden by CSS and this is the only way in, so the
// button has to say what is standing before it is opened.
describe("ExerciseFilterSheet", () => {
  const sheet = (filters: ExerciseFilterState, resultCount = 4) =>
    render(<ExerciseFilterSheet filters={filters} counts={counts} suggested="10-12" canFavorite favoriteCount={1} resultCount={resultCount} onChange={vi.fn()} />);

  it("counts the filters standing, including the band nobody picked", () => {
    sheet(state({ ageGroups: ["10-12"], categories: ["Angrep", "Forsvar"] }));

    expect(screen.getByRole("button", { name: /^Filter/ })).toHaveTextContent("Filter3");
  });

  it("carries no badge when nothing is applied", () => {
    sheet(state());

    expect(screen.getByRole("button", { name: /^Filter/ })).toHaveTextContent(/^Filter$/);
  });

  // The grid is behind the sheet, so the button is where the choice is priced.
  it("opens the same body and says what the choice is worth", () => {
    sheet(state({ ageGroups: ["10-12"] }), 7);

    fireEvent.click(screen.getByRole("button", { name: /^Filter/ }));

    expect(screen.getByRole("dialog")).toHaveAccessibleName("Filtrer øvelser");
    expect(screen.getByRole("button", { name: `Alle tema — ${demoExercises.length} øvelser` })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vis 7 øvelser" })).toBeInTheDocument();
  });
});
