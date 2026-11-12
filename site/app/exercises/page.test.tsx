import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoExercises, demoUser } from "@/lib/demo-data";
import type { Exercise } from "@/lib/types";
import ExercisesPage from "./page";

const mocks = vi.hoisted(() => ({ useGrep: vi.fn() }));

vi.mock("@/components/app-provider", () => ({ useGrep: mocks.useGrep }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("") }));
// The card is under test; the rail, dialogs and shortlist menu have their own.
vi.mock("@/components/exercise-filter-rail", () => ({ ExerciseFilterRail: () => null, ExerciseFilterSheet: () => null, ActiveExerciseFilters: () => null }));
vi.mock("@/components/collections", () => ({ CollectionDialog: () => null, SelectedCollectionBar: () => null, ShortlistMenu: () => null }));
vi.mock("@/components/exercise-detail", () => ({ ExerciseDetail: () => null }));
vi.mock("@/components/exercise-form", () => ({ ExerciseForm: () => null }));
vi.mock("@/components/help-tip", () => ({ HelpTip: () => null }));

const base = demoExercises[0];
const exercise = (id: string, extra: Partial<Exercise>): Exercise => ({ ...base, id, name: id, createdBy: "someone-else", createdByName: "Kari", ...extra });

function renderLibrary(exercises: Exercise[], exercisesLoaded = true) {
  mocks.useGrep.mockReturnValue({ exercises, exercisesLoaded, user: demoUser, currentTeam: null, archiveExercise: vi.fn(), favoriteExerciseIds: [], collections: [], createCollection: vi.fn() });
  render(<ExercisesPage />);
}
const card = (name: string) => screen.getByRole("heading", { name }).closest("article") as HTMLElement;
const topic = (name: string) => card(name).querySelector("[data-card-topic]") as HTMLElement;
const ages = (name: string) => card(name).querySelector("[data-card-ages]") as HTMLElement;
const visible = (element: HTMLElement) => Array.from(element.querySelectorAll("[aria-hidden='true']")).map((node) => node.textContent).join("");
const filled = (name: string) => Array.from(ages(name).querySelectorAll("[data-band]")).map((node) => node.getAttribute("data-filled") === "true");

// Decision 9: the library loads on its own, after the rest of the workspace.
describe("before the library has loaded", () => {
  beforeEach(() => mocks.useGrep.mockReset());

  it("says the exercises are loading, not that none were found", () => {
    renderLibrary([], false);
    expect(screen.getByRole("status")).toHaveTextContent("Henter øvelser …");
    expect(screen.queryByText("Fant ingen øvelser")).not.toBeInTheDocument();
  });

  it("still says none were found once an empty library has loaded", () => {
    renderLibrary([]);
    expect(screen.getByText("Fant ingen øvelser")).toBeInTheDocument();
    expect(screen.queryByText("Henter øvelser …")).not.toBeInTheDocument();
  });
});

describe("the library card", () => {
  beforeEach(() => mocks.useGrep.mockReset());

  it("puts the topic and at most two short subtopics on one line, in canonical order", () => {
    renderLibrary([exercise("Tre undertema", { category: "Angrep", ageGroups: ["6-9", "10-12", "13-15"], subtopics: ["angrep.sma-grupper", "angrep.finter", "angrep.1-mot-1"] })]);
    const row = topic("Tre undertema");
    expect(row.className).toContain("flex-nowrap");
    expect(within(row).getByText("Angrep")).toBeInTheDocument();
    expect(visible(row)).toBe("Finter · 1 mot 1 +1");
    // The +N hides one; a screen reader hears all three in full.
    expect(within(row).getByText("Undertema: Finter, Angrepsspill 1 mot 1, Angrepsspill i små grupper")).toHaveClass("sr-only");
    // The age bands moved to the footer.
    expect(within(row).queryByText(/år/)).toBeNull();
  });

  it("orders by EXERCISE_SUBTOPIC_KEYS, not by how the subtopics were stored", () => {
    renderLibrary([
      exercise("Spill", { category: "Angrep", subtopics: ["angrep.1-mot-1", "angrep.sma-grupper", "angrep.kast-og-mottak"] }),
      exercise("To", { category: "Angrep", subtopics: ["angrep.sma-grupper", "angrep.1-mot-1"] }),
    ]);
    expect(visible(topic("Spill"))).toBe("Kast og mottak · 1 mot 1 +1");
    expect(visible(topic("To"))).toBe("1 mot 1 · Små grupper");
  });

  it("shows the topic chip alone when the exercise has no subtopic", () => {
    renderLibrary([exercise("Uten", { category: "Forsvar", subtopics: [] })]);
    expect(topic("Uten").textContent).toBe("Forsvar");
  });

  it("says who the exercise is for as one range with a square per band", () => {
    renderLibrary([
      exercise("Alle tre", { ageGroups: ["13-15", "6-9", "10-12"] }),
      exercise("Hull", { ageGroups: ["6-9", "13-15"] }),
      exercise("Én", { ageGroups: ["10-12"] }),
      exercise("Ingen", { ageGroups: [] }),
    ]);
    expect(ages("Alle tre").textContent).toBe("6–15 år");
    expect(filled("Alle tre")).toEqual([true, true, true]);
    expect(ages("Hull").textContent).toBe("6–9, 13–15 år");
    expect(filled("Hull")).toEqual([true, false, true]);
    expect(ages("Én").textContent).toBe("10–12 år");
    expect(filled("Én")).toEqual([false, true, false]);
    expect(ages("Ingen").textContent).toBe("Alle aldre");
    expect(filled("Ingen")).toEqual([true, true, true]);
    expect(within(card("Ingen")).getByText(/av Kari/)).toBeInTheDocument();
  });

  it("drops the media-kind chip but keeps ▶ on a video's thumbnail", () => {
    renderLibrary([exercise("Filmet", { mediaKind: "youtube", mediaUrl: "https://www.youtube.com/watch?v=abc", thumbnailUrl: "https://img.youtube.com/vi/abc/hqdefault.jpg" })]);
    expect(within(card("Filmet")).queryByText("Video")).toBeNull();
    expect(card("Filmet").querySelector(".grep-exercise-media svg.lucide-play")).not.toBeNull();
  });
});
