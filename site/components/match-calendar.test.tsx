import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoFixtures, demoWarmupRoutines } from "@/lib/demo-data";
import { MatchCalendar } from "./match-calendar";

const mocks = vi.hoisted(() => ({ useGrep: vi.fn() }));
const removeFixture = vi.fn();

vi.mock("./app-provider", () => ({ useGrep: mocks.useGrep }));

// The calendar opens on the current month, so the tests pin "now" to the month
// the demo schedule is played in.
const NOW = new Date("2026-09-12T07:00:00.000Z");

function grid() {
  // The month grid and the phone list render the same matches; assertions read
  // the grid, which is the view the component is really about.
  return screen.getByText("man").closest("div")?.parentElement as HTMLElement;
}

describe("MatchCalendar", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    removeFixture.mockReset().mockResolvedValue(undefined);
    mocks.useGrep.mockReturnValue({ removeFixture, warmupRoutines: demoWarmupRoutines });
  });

  it("asks for an import when the calendar is empty", () => {
    render(<MatchCalendar fixtures={[]} canManage canEditWarmup />);
    expect(screen.getByText("Ingen kamper i kalenderen")).toBeInTheDocument();
  });

  it("starts with a scannable list and lets the coach switch to the month grid", () => {
    render(<MatchCalendar fixtures={demoFixtures} canManage={false} canEditWarmup />);
    expect(screen.getByRole("button", { name: "Liste" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Månedens kamper")).not.toHaveClass("sm:hidden");
    fireEvent.click(screen.getByRole("button", { name: "Kalender" }));
    expect(screen.getByRole("button", { name: "Kalender" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Månedens kamper")).toHaveClass("sm:hidden");
    fireEvent.click(screen.getByRole("button", { name: "Liste" }));
    expect(screen.getByRole("button", { name: "Liste" })).toHaveAttribute("aria-pressed", "true");
  });

  it("opens full match details from the agenda", () => {
    render(<MatchCalendar fixtures={demoFixtures} canManage={false} canEditWarmup />);
    const agenda = screen.getByLabelText("Månedens kamper");
    fireEvent.click(within(agenda).getByRole("button", { name: /mot Nesodden Gul/ }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByText("41041006001")).toBeInTheDocument();
  });

  it("shows the month's matches and the next one up", () => {
    render(<MatchCalendar fixtures={demoFixtures} canManage={false} canEditWarmup />);
    // Fjordvik Rød plays twice on 12 September, so the hero names the day.
    expect(screen.getByText("Neste kampdag")).toBeInTheDocument();
    expect(within(grid()).getByText("Nesodden Gul")).toBeInTheDocument();
    expect(within(grid()).getByText("Kolbotn Rød")).toBeInTheDocument();
    // A match played in August belongs to the previous month's grid.
    expect(within(grid()).queryByText("Bækkelaget Blå")).not.toBeInTheDocument();
  });

  it("gathers a day's matches under one date card", () => {
    render(<MatchCalendar fixtures={demoFixtures} canManage={false} canEditWarmup />);
    const agenda = screen.getByLabelText("Månedens kamper");
    // September holds four matches over two days; the 12th carries three.
    const days = [...agenda.querySelectorAll<HTMLElement>(".grep-match-day")];
    expect(days).toHaveLength(2);
    expect(within(days[0]).getAllByRole("listitem")).toHaveLength(3);
    expect(within(days[0]).getAllByText("12.")).toHaveLength(1);
    // Fjordvik Rød's two matches share a header; Fjordvik Blå's single one does not.
    expect(within(days[0]).getAllByRole("region").map((group) => group.getAttribute("aria-label"))).toEqual(["Fjordvik Rød, 2 kamper"]);
  });

  it("marks the club's own hall instead of calling every listed match a hjemmekamp", () => {
    render(<MatchCalendar fixtures={demoFixtures} canManage={false} canEditWarmup />);
    const agenda = screen.getByLabelText("Månedens kamper");
    // Fjordvik Rød's whole 12 September is in Sofiemyrhallen, so the group says
    // so once rather than on each row; the derby on the 26th says it too.
    expect(within(agenda).getAllByText("Hjemmebane")).toHaveLength(2);
    expect(screen.queryByText(/Hjemmekamp|Bortekamp/)).not.toBeInTheDocument();
  });

  it("pages between months", () => {
    render(<MatchCalendar fixtures={demoFixtures} canManage={false} canEditWarmup />);
    fireEvent.click(screen.getByLabelText("Forrige måned"));
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("august 2026");
    expect(within(grid()).getByText("Bækkelaget Blå")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "I dag" }));
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("september 2026");
  });

  it("filters the calendar down to one of our teams", () => {
    render(<MatchCalendar fixtures={demoFixtures} canManage={false} canEditWarmup />);
    fireEvent.click(screen.getByRole("button", { name: "Fjordvik Blå" }));
    expect(within(grid()).getByText("Kolbotn Rød")).toBeInTheDocument();
    expect(within(grid()).queryByText("Nesodden Gul")).not.toBeInTheDocument();
  });

  it("keeps a derby between two of our teams as one entry naming both", () => {
    render(<MatchCalendar fixtures={demoFixtures} canManage={false} canEditWarmup />);
    expect(within(grid()).getAllByText("Fjordvik Blå — Fjordvik Rød")).toHaveLength(1);
  });

  it("opens a match with everything the export carried", () => {
    render(<MatchCalendar fixtures={demoFixtures} canManage={false} canEditWarmup />);
    fireEvent.click(within(grid()).getByText("Nesodden Gul"));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Fjordvik Rød — Nesodden Gul" })).toBeInTheDocument();
    expect(within(dialog).getByText("Sofiemyrhallen A")).toBeInTheDocument();
    expect(within(dialog).getByText("41041006001")).toBeInTheDocument();
    expect(within(dialog).getByText("Kortbaneserie kvinner — Avdeling 3")).toBeInTheDocument();
    expect(within(dialog).getByText("🏠 Hjemmebane")).toBeInTheDocument();
    expect(within(dialog).getByText("Ikke spilt")).toBeInTheDocument();
  });

  // A busy Saturday must not stretch its week to four times the height of the
  // six empty days beside it.
  it("caps a day at three lines and offers the rest behind one link", () => {
    const busy = ["09:00", "10:20", "11:40", "13:00"].map((clock, index) => ({
      ...demoFixtures[0], id: `busy-${index}`, matchNumber: `900${index}`,
      startsAt: `2026-09-12T${String(7 + index * 1.5 | 0).padStart(2, "0")}:0${index}:00.000Z`,
      awayTeam: `Motstander ${clock}`,
    }));
    render(<MatchCalendar fixtures={busy} canManage={false} canEditWarmup />);

    expect(within(grid()).getAllByText(/^Motstander/)).toHaveLength(2);
    const more = within(grid()).getByRole("button", { name: "+2 til" });

    fireEvent.click(more);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("4 kamper denne dagen")).toBeInTheDocument();
    expect(within(dialog).getAllByRole("listitem")).toHaveLength(4);

    // Picking one there hands over to the match itself.
    fireEvent.click(within(dialog).getAllByRole("listitem")[3].querySelector("button") as HTMLElement);
    expect(screen.getByRole("heading", { name: /Motstander/ })).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("carries the warm-up into the match, and opens it from there", () => {
    render(<MatchCalendar fixtures={demoFixtures} canManage={false} canEditWarmup />);
    fireEvent.click(within(grid()).getByText("Nesodden Gul"));
    const strip = screen.getByRole("button", { name: /Kampoppvarming/ });
    expect(strip).toHaveTextContent("6 aktiviteter");

    fireEvent.click(strip);
    // The match dialog gives way to the warm-up rather than stacking under it.
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Kampoppvarming" })).toBeInTheDocument();
    expect(screen.getByText("Løpsserie med stigning")).toBeInTheDocument();
  });

  it("offers removal only to a team admin", () => {
    const { unmount } = render(<MatchCalendar fixtures={demoFixtures} canManage={false} canEditWarmup />);
    fireEvent.click(within(grid()).getByText("Nesodden Gul"));
    expect(screen.queryByRole("button", { name: /Fjern kampen/ })).not.toBeInTheDocument();
    unmount();

    render(<MatchCalendar fixtures={demoFixtures} canManage canEditWarmup />);
    fireEvent.click(within(grid()).getByText("Nesodden Gul"));
    fireEvent.click(screen.getByRole("button", { name: /Fjern kampen/ }));
    expect(removeFixture).toHaveBeenCalledWith(demoFixtures[0].id);
  });
});
