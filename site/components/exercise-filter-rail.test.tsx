import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActiveExerciseFilters, ExerciseFilterRail, ExerciseFilterSheet } from "./exercise-filter-rail";
import { categoryPresentation } from "./exercise-category-filter";
import { tagTones } from "./ui";
import { countExerciseFacets, emptyExerciseFilterState } from "@/lib/exercises";
import { demoExercises } from "@/lib/demo-data";
import type { ExerciseFilterState } from "@/lib/exercises";

const counts = countExerciseFacets(demoExercises);
const option = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });
const state = (patch: Partial<ExerciseFilterState> = {}): ExerciseFilterState => ({ ...emptyExerciseFilterState(), ...patch });

const collections = [{ id: "c1", name: "Oktober 2026 fokus", size: 3 }, { id: "c2", name: "Kantspill", size: 0 }];

function renderRail(filters: ExerciseFilterState, onChange = vi.fn(), suggested: "10-12" | null = "10-12", onNewCollection = vi.fn()) {
  render(<ExerciseFilterRail filters={filters} counts={counts} suggested={suggested} canFavorite favoriteCount={2} collections={collections} resultCount={demoExercises.length} onChange={onChange} onNewCollection={onNewCollection} />);
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

  // The rail and the grid have to agree: a chosen topic is highlighted in the
  // same hue as the tag on every card it then leaves standing. jsdom has no
  // cascade, so the rule is asserted on the custom property the CSS reads.
  it("highlights a row in the hue its own value wears on a card", () => {
    renderRail(state({ categories: ["Forsvar"], ageGroups: ["13-15"] }));

    expect(option("Forsvar").style.getPropertyValue("--rail-tint")).toBe(tagTones[categoryPresentation.Forsvar.tone].tint);
    expect(option("13-15 år").style.getPropertyValue("--rail-tint")).toBe(tagTones.band3.tint);
    // «Alle tema» stands for no choice at all, so it keeps the brand lilac the
    // stylesheet falls back to.
    expect(option("Alle tema").style.getPropertyValue("--rail-tint")).toBe("");
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

  // The count is worth keeping — it is the whole answer to "why is the grid
  // empty" — but a row that leads nowhere should not offer to take you there.
  it("stops an empty topic acting, while its count still explains the grid", () => {
    const onChange = renderRail(state());

    expect(option("Målvakt")).toHaveTextContent("0");
    expect(option("Målvakt")).toHaveAttribute("aria-disabled", "true");

    fireEvent.click(option("Målvakt"));
    expect(onChange).not.toHaveBeenCalled();
  });

  // Choosing a samling can empty a topic that is still standing. Going inert
  // then would leave the coach unable to take off the filter emptying the grid.
  it("keeps an empty filter that is already chosen clickable", () => {
    const onChange = renderRail(state({ categories: ["Målvakt"] }));

    expect(option("Målvakt")).not.toHaveAttribute("aria-disabled");
    fireEvent.click(option("Målvakt"));
    expect(onChange).toHaveBeenCalledWith({ categories: [] });
  });

  it("stops the favourites pill acting when nothing is hearted", () => {
    const onChange = vi.fn();
    render(<ExerciseFilterRail filters={state()} counts={counts} suggested={null} canFavorite favoriteCount={0} collections={collections} resultCount={0} onChange={onChange} />);
    const pill = screen.getByRole("button", { name: "Favoritter — 0 øvelser" });

    expect(pill).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(pill);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("hides favourites from a visitor with no shortlist", () => {
    render(<ExerciseFilterRail filters={state()} counts={counts} suggested={null} canFavorite={false} favoriteCount={0} collections={[]} resultCount={0} onChange={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /^Favoritter/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Oktober/ })).toBeNull();
  });
});

describe("the shortlist group", () => {
  // Favourites and samlinger are two tables but one question, so choosing
  // either has to release the other rather than intersect with it.
  it("chooses one shortlist at a time", () => {
    const onChange = renderRail(state({ shortlist: { kind: "favorites" } }));

    fireEvent.click(option("Oktober 2026 fokus"));
    expect(onChange).toHaveBeenCalledWith({ shortlist: { kind: "collection", id: "c1" }, ageGroups: [], categories: [] });
  });

  it("clears the shortlist when the chosen one is clicked again", () => {
    const onChange = renderRail(state({ shortlist: { kind: "collection", id: "c1" } }));

    fireEvent.click(option("Oktober 2026 fokus"));
    expect(onChange).toHaveBeenCalledWith({ shortlist: null, ageGroups: [], categories: [] });
  });

  // The library opens on the band the team's name implies, which nobody chose.
  // A samling is an explicit act and has to outrank that guess, or the 13-15
  // exercise a coach put in it goes missing without a word. A topic left
  // standing from before would hide it just as quietly.
  it("hands the age band and the topics back when a shortlist is chosen", () => {
    const onChange = renderRail(state({ ageGroups: ["10-12"], categories: ["Angrep"] }));

    fireEvent.click(screen.getByRole("button", { name: /^Favoritter/ }));
    expect(onChange).toHaveBeenCalledWith({ shortlist: { kind: "favorites" }, ageGroups: [], categories: [] });
  });

  // A samling is somebody's own list, and offering to slice three exercises by
  // topic and age is noise. Off rather than gone: the taxonomy stays where it
  // was, and the rail keeps its height when a samling is picked up or put down.
  it("switches the age and topic rows off while a shortlist stands", () => {
    renderRail(state({ shortlist: { kind: "collection", id: "c1" } }));

    expect(option("Alle aldre")).toBeDisabled();
    expect(option("13-15 år")).toBeDisabled();
    expect(option("Alle tema")).toBeDisabled();
    expect(option("Forsvar")).toBeDisabled();
    // The samlinger themselves stay live — putting the list down is the way out.
    expect(option("Oktober 2026 fokus")).toBeEnabled();
    expect(screen.getByRole("button", { name: /^Favoritter/ })).toBeEnabled();
  });

  it("names the list it is showing whole, so the greyed rows read as a decision", () => {
    renderRail(state({ shortlist: { kind: "collection", id: "c1" } }));

    expect(screen.getByText(/Viser «Oktober 2026 fokus» i sin helhet/)).toBeInTheDocument();
  });

  // `shortlistExerciseIds` resolves a samling since deleted to the whole
  // library, so the rail must not switch itself off over a filter that is not
  // actually filtering — that would be a dead rail nobody can explain.
  it("stays usable when the chosen samling no longer exists", () => {
    renderRail(state({ shortlist: { kind: "collection", id: "gone" } }));

    expect(option("Forsvar")).toBeEnabled();
    expect(option("Alle aldre")).toBeEnabled();
    expect(screen.queryByText(/i sin helhet/)).toBeNull();
  });

  it("offers a way to start one", () => {
    const onNewCollection = vi.fn();
    renderRail(state(), vi.fn(), "10-12", onNewCollection);

    fireEvent.click(screen.getByRole("button", { name: "Ny samling" }));
    expect(onNewCollection).toHaveBeenCalled();
  });
});

describe("ActiveExerciseFilters", () => {
  it("says nothing while nothing is applied", () => {
    const { container } = render(<ActiveExerciseFilters filters={state()} shortlistLabel={null} onChange={vi.fn()} onReset={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("removes one filter without disturbing the rest", () => {
    const onChange = vi.fn();
    render(<ActiveExerciseFilters filters={state({ categories: ["Forsvar", "Angrep"], ageGroups: ["10-12"], query: "skudd" })} shortlistLabel="Oktober 2026 fokus" onChange={onChange} onReset={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Fjern filteret Forsvar" }));
    expect(onChange).toHaveBeenCalledWith({ categories: ["Angrep"] });

    fireEvent.click(screen.getByRole("button", { name: "Fjern filteret «skudd»" }));
    expect(onChange).toHaveBeenLastCalledWith({ query: "" });

    // The chip carries the samling's own name, so the one filter a coach cannot
    // see the rail for is still nameable from above the grid.
    fireEvent.click(screen.getByRole("button", { name: "Fjern filteret Oktober 2026 fokus" }));
    expect(onChange).toHaveBeenLastCalledWith({ shortlist: null });
  });

  it("offers one reset for all of them", () => {
    const onReset = vi.fn();
    render(<ActiveExerciseFilters filters={state({ ageGroups: ["10-12"] })} shortlistLabel={null} onChange={vi.fn()} onReset={onReset} />);

    fireEvent.click(screen.getByRole("button", { name: "Nullstill" }));
    expect(onReset).toHaveBeenCalled();
  });
});

// Below 1024px the rail is hidden by CSS and this is the only way in, so the
// button has to say what is standing before it is opened.
describe("ExerciseFilterSheet", () => {
  const sheet = (filters: ExerciseFilterState, resultCount = 4) =>
    render(<ExerciseFilterSheet filters={filters} counts={counts} suggested="10-12" canFavorite favoriteCount={1} collections={collections} resultCount={resultCount} onChange={vi.fn()} onNewCollection={vi.fn()} />);

  it("counts the filters standing, including the band nobody picked", () => {
    sheet(state({ ageGroups: ["10-12"], categories: ["Angrep", "Forsvar"] }));

    expect(screen.getByRole("button", { name: /^Filter/ })).toHaveTextContent("Filter3");
  });

  it("counts a chosen samling as one of them", () => {
    sheet(state({ shortlist: { kind: "collection", id: "c1" } }));

    expect(screen.getByRole("button", { name: /^Filter/ })).toHaveTextContent("Filter1");
  });

  // A dialog opened from inside a dialog is two modals deep for something the
  // bookmark on a card already offers, so the sheet leaves the row out.
  it("leaves starting a samling to the card, not the sheet", () => {
    sheet(state());

    fireEvent.click(screen.getByRole("button", { name: /^Filter/ }));

    expect(screen.getByRole("button", { name: /^Oktober 2026 fokus/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ny samling" })).toBeNull();
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
