import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoFixtures, demoWarmupRoutines } from "@/lib/demo-data";
import { WarmupDialog, WarmupSummaryButton } from "./warmup-dialog";

const mocks = vi.hoisted(() => ({ useGrep: vi.fn() }));
vi.mock("./app-provider", () => ({ useGrep: mocks.useGrep }));

const store = {
  exercises: [], ensureWarmupRoutine: vi.fn(), addCustomWarmupItem: vi.fn(), addWarmupExercise: vi.fn(),
  updateWarmupRoutine: vi.fn(), updateWarmupItem: vi.fn(), deleteWarmupItem: vi.fn(), reorderWarmupItems: vi.fn(),
};
const fixture = demoFixtures[0];
const routine = demoWarmupRoutines[0];
// 5 + 6 + 4 + 6 + 5 + 3
const DURATION = 29;

function clock(startsAt: string, minutesBefore: number) {
  return new Intl.DateTimeFormat("nb-NO", { hour: "2-digit", minute: "2-digit" }).format(new Date(Date.parse(startsAt) - minutesBefore * 60_000));
}

describe("WarmupDialog", () => {
  beforeEach(() => {
    for (const fn of Object.values(store)) if (typeof fn === "function") fn.mockReset().mockResolvedValue(undefined);
    store.ensureWarmupRoutine.mockResolvedValue(routine.id);
    mocks.useGrep.mockReturnValue(store);
  });

  it("counts back from the kick-off to the meet-up and the first activity", () => {
    render(<WarmupDialog open fixture={fixture} routine={routine} canEdit onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(clock(fixture.startsAt, 60))).toBeInTheDocument();
    // The strip and the first activity agree on when the warm-up starts.
    expect(within(dialog).getAllByText(clock(fixture.startsAt, DURATION))).toHaveLength(2);
    expect(within(dialog).getByText(clock(fixture.startsAt, 0))).toBeInTheDocument();
    expect(within(dialog).getByText(`${routine.items.length} aktiviteter · 29 min`)).toBeInTheDocument();
  });

  it("gives every activity the clock time it starts at, in order", () => {
    render(<WarmupDialog open fixture={fixture} routine={routine} canEdit onClose={vi.fn()} />);
    const rows = within(screen.getByRole("dialog")).getAllByRole("listitem");
    expect(rows).toHaveLength(routine.items.length);
    expect(rows[0]).toHaveTextContent(clock(fixture.startsAt, DURATION));
    expect(rows[0]).toHaveTextContent("Løpsserie med stigning");
    expect(rows[1]).toHaveTextContent(clock(fixture.startsAt, DURATION - 5));
  });

  it("warns when the routine is longer than the meet-up allows", () => {
    render(<WarmupDialog open fixture={fixture} routine={{ ...routine, meetMinutesBefore: 15 }} canEdit onClose={vi.fn()} />);
    expect(screen.getByText(/Kort ned rutinen/)).toBeInTheDocument();
  });

  it("opens the activity in the same detail popup the exercise bank uses", () => {
    render(<WarmupDialog open fixture={fixture} routine={routine} canEdit onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Skudd fra kant"));
    const detail = screen.getAllByRole("dialog").at(-1) as HTMLElement;
    expect(within(detail).getByRole("heading", { name: "Skudd fra kant" })).toBeInTheDocument();
    expect(within(detail).getByText(/Fem avslutninger fra hver kant/)).toBeInTheDocument();
  });

  it("offers the routine as read-only to a coach who may not edit it", () => {
    render(<WarmupDialog open fixture={fixture} routine={routine} canEdit={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Rediger oppvarmingen" })).not.toBeInTheDocument();
  });

  it("creates the routine on the first activity rather than with the team", async () => {
    render(<WarmupDialog open fixture={fixture} routine={null} canEdit onClose={vi.fn()} />);
    expect(screen.getByText("Ingen kampoppvarming ennå")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Lag oppvarmingen/ }));
    await vi.waitFor(() => expect(store.addCustomWarmupItem).toHaveBeenCalledWith(routine.id));
    expect(store.ensureWarmupRoutine).toHaveBeenCalled();
  });

  it("says that an edit reaches every match, and edits in place", () => {
    render(<WarmupDialog open fixture={fixture} routine={routine} canEdit onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Rediger oppvarmingen" }));
    expect(screen.getByText(/gjelder alle kampene i kalenderen/)).toBeInTheDocument();

    const minutes = screen.getByLabelText(`Minutter for ${routine.items[0].title}`);
    fireEvent.change(minutes, { target: { value: "8" } });
    fireEvent.blur(minutes);
    expect(store.updateWarmupItem).toHaveBeenCalledWith(routine.id, routine.items[0].id, { durationMinutes: 8 });

    fireEvent.click(screen.getByLabelText(`Flytt ${routine.items[1].title} opp`));
    expect(store.reorderWarmupItems).toHaveBeenCalledWith(routine.id, [routine.items[1].id, routine.items[0].id, ...routine.items.slice(2).map((item) => item.id)]);

    fireEvent.click(screen.getByRole("button", { name: /Egendefinert aktivitet/ }));
    expect(store.addCustomWarmupItem).toHaveBeenCalledWith(routine.id);
  });

  it("clamps an impossible duration instead of saving it", () => {
    render(<WarmupDialog open fixture={fixture} routine={routine} canEdit onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Rediger oppvarmingen" }));
    const minutes = screen.getByLabelText(`Minutter for ${routine.items[0].title}`) as HTMLInputElement;
    fireEvent.change(minutes, { target: { value: "0" } });
    fireEvent.blur(minutes);
    expect(minutes.value).toBe("1");
    expect(store.updateWarmupItem).toHaveBeenCalledWith(routine.id, routine.items[0].id, { durationMinutes: 1 });
  });

  it("cannot move the first activity up or the last one down", () => {
    render(<WarmupDialog open fixture={fixture} routine={routine} canEdit onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Rediger oppvarmingen" }));
    expect(screen.getByLabelText(`Flytt ${routine.items[0].title} opp`)).toBeDisabled();
    expect(screen.getByLabelText(`Flytt ${routine.items.at(-1)?.title} ned`)).toBeDisabled();
  });

  it("swaps the sheet to the exercise picker instead of stacking a dialog", () => {
    render(<WarmupDialog open fixture={fixture} routine={routine} canEdit onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Rediger oppvarmingen" }));
    fireEvent.click(screen.getByRole("button", { name: /Legg til øvelse/ }));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Legg til fra øvelsesbanken" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tilbake" }));
    expect(screen.getByRole("heading", { name: "Rediger oppvarmingen" })).toBeInTheDocument();
  });
});

describe("WarmupSummaryButton", () => {
  it("summarises the routine and when it starts", () => {
    render(<WarmupSummaryButton routine={routine} startsAt={fixture.startsAt} onOpen={vi.fn()} />);
    expect(screen.getByRole("button")).toHaveTextContent(`6 aktiviteter · 29 min · start kl. ${clock(fixture.startsAt, DURATION)}`);
  });

  it("counts a single activity in the singular", () => {
    render(<WarmupSummaryButton routine={{ ...routine, items: routine.items.slice(0, 1) }} startsAt={fixture.startsAt} onOpen={vi.fn()} />);
    expect(screen.getByRole("button")).toHaveTextContent("1 aktivitet ·");
  });

  it("invites the coach to set one up when there is none", () => {
    render(<WarmupSummaryButton routine={null} startsAt={fixture.startsAt} onOpen={vi.fn()} />);
    expect(screen.getByRole("button")).toHaveTextContent("Ikke satt opp ennå");
  });
});
