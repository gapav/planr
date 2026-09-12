import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoSessions, demoTeams, demoUser } from "@/lib/demo-data";
import type { MonthFocus, PlannedSession } from "@/lib/types";
import SessionsPage from "./page";

const mocks = vi.hoisted(() => ({ useGrep: vi.fn(), push: vi.fn(), deleteSession: vi.fn(), saveMonthFocus: vi.fn(), query: "" }));

vi.mock("@/components/app-provider", () => ({ useGrep: mocks.useGrep }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }), useSearchParams: () => new URLSearchParams(mocks.query) }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children?: ReactNode; href: string }) => <a href={href} {...props}>{children}</a>,
}));

const team = demoTeams[0];
const upcoming = (id: string, title: string, startsAt: string, extra: Partial<PlannedSession> = {}): PlannedSession =>
  ({ ...demoSessions[1], id, teamId: team.id, title, startsAt, status: "published", updatedBy: demoUser.id, ...extra });

function renderPage(sessions: PlannedSession[], monthFocus: MonthFocus[] = []) {
  mocks.useGrep.mockReturnValue({ sessions, currentTeam: team, user: demoUser, monthFocus, createSession: vi.fn(), deleteSession: mocks.deleteSession, saveMonthFocus: mocks.saveMonthFocus });
  render(<SessionsPage />);
}
const rowFor = (title: string) => screen.getByRole("link", { name: `Åpne ${title}` }).closest("li") as HTMLElement;

describe("session calendar rows", () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); vi.setSystemTime(new Date("2026-09-02T09:00:00.000Z")); mocks.useGrep.mockReset(); mocks.deleteSession.mockReset(); mocks.saveMonthFocus.mockReset(); });
  afterEach(() => { vi.useRealTimers(); mocks.query = ""; });

  it("opens completed sessions from the Oversikt history shortcut", () => {
    mocks.query = "view=past";
    renderPage([upcoming("old", "En gjennomført økt", "2026-08-01T10:00:00Z"), upcoming("new", "Neste trening", "2026-09-05T10:00:00Z")]);
    expect(screen.getByRole("link", { name: "Åpne En gjennomført økt" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Åpne Neste trening" })).not.toBeInTheDocument();
  });

  it("lifts the nearest session out of its month and counts the rest", () => {
    renderPage([upcoming("a", "I dag", "2026-09-02T13:45:00.000Z"), upcoming("b", "Om to dager", "2026-09-04T13:45:00.000Z"), upcoming("c", "Neste måned", "2026-10-01T13:45:00.000Z")]);

    // The months ahead are sections whether or not anything is scheduled in them,
    // so only the two that hold a session carry a count.
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(["Neste økt", "september 2026 · 1 økt", "oktober 2026 · 1 økt", "november 2026", "desember 2026", "januar 2027"]);
    // The hero is its own section, so its month section holds only what is left.
    expect(within(screen.getByRole("heading", { name: "Neste økt" }).closest("section") as HTMLElement).getAllByRole("listitem")).toHaveLength(1);
  });

  it("names the days around today", () => {
    renderPage([upcoming("a", "Uke 36 - Torsdag", "2026-09-03T13:45:00.000Z")]);

    expect(screen.getByText("I morgen")).toBeInTheDocument();
  });

  // Starting and editing belong to the plan view, so even a session that could
  // be started right now offers nothing but the card itself.
  it("keeps Start and Rediger out of the calendar row", () => {
    renderPage([upcoming("a", "I dag", "2026-09-02T18:00:00.000Z")]);

    expect(within(rowFor("I dag")).queryByRole("link", { name: "Start" })).toBeNull();
    expect(within(rowFor("I dag")).queryByRole("link", { name: "Rediger" })).toBeNull();
    // The card link is the row's only one; Rediger lives inside the closed menu.
    expect(within(rowFor("I dag")).getAllByRole("link")).toHaveLength(1);
  });

  it("still marks a session already running", () => {
    renderPage([upcoming("a", "Pågående", "2026-09-01T18:00:00.000Z", { status: "in_progress" })]);

    expect(within(rowFor("Pågående")).queryByRole("link", { name: "Fortsett" })).toBeNull();
    expect(within(rowFor("Pågående")).getByText("Pågår")).toBeInTheDocument();
  });

  it("drops the status chip the tab already states, and the coach when it is you", () => {
    renderPage([upcoming("a", "Uke 36 - Torsdag", "2026-09-03T13:45:00.000Z")]);

    expect(screen.queryByText("Planlagt")).toBeNull();
    expect(screen.queryByText(demoUser.fullName)).toBeNull();
  });

  it("still names the coach when someone else touched the plan", () => {
    renderPage([upcoming("a", "Uke 36 - Torsdag", "2026-09-03T13:45:00.000Z", { updatedBy: "user-nora" })]);

    expect(screen.getByText("Nora Vik")).toBeInTheDocument();
  });

  it("shrinks sessions further out than the coming week to a single line", () => {
    renderPage([upcoming("a", "Denne uka", "2026-09-04T13:45:00.000Z"), upcoming("b", "Om en måned", "2026-10-01T13:45:00.000Z")]);

    // Both keep the menu; the compact row drops the meta line it does not need.
    expect(within(rowFor("Denne uka")).getByText(/bolk/)).toBeInTheDocument();
    expect(within(rowFor("Om en måned")).queryByText(/bolk/)).toBeNull();
    expect(within(rowFor("Om en måned")).getByRole("button", { name: "Flere valg for Om en måned" })).toBeInTheDocument();
  });

  it("sends the whole card to the plan, where the actions live", () => {
    renderPage([upcoming("a", "Uke 36 - Torsdag", "2026-09-03T13:45:00.000Z")]);

    expect(screen.getByRole("link", { name: "Åpne Uke 36 - Torsdag" })).toHaveAttribute("href", "/sessions/a");
    expect(screen.queryByRole("link", { name: "Rediger" })).toBeNull();
  });

  it("puts Rediger in the row menu, and leaves it out of a locked plan", () => {
    renderPage([upcoming("a", "Uke 36 - Torsdag", "2026-09-03T13:45:00.000Z"), upcoming("b", "Pågående", "2026-09-04T13:45:00.000Z", { status: "in_progress" })]);

    fireEvent.click(screen.getByRole("button", { name: "Flere valg for Uke 36 - Torsdag" }));
    expect(within(rowFor("Uke 36 - Torsdag")).getByRole("menuitem", { name: "Rediger" })).toHaveAttribute("href", "/sessions/a/edit");

    fireEvent.click(screen.getByRole("button", { name: "Flere valg for Pågående" }));
    expect(within(rowFor("Pågående")).queryByRole("menuitem", { name: "Rediger" })).toBeNull();
    expect(within(rowFor("Pågående")).getByRole("menuitem", { name: "Slett økt" })).toBeInTheDocument();
  });

  it("keeps delete behind the row menu so a stray tap cannot reach it", () => {
    renderPage([upcoming("a", "Uke 36 - Torsdag", "2026-09-03T13:45:00.000Z")]);
    expect(screen.queryByRole("menuitem")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Flere valg for Uke 36 - Torsdag" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Slett økt" }));

    // Still only the confirmation dialog: nothing is deleted from the menu itself.
    expect(mocks.deleteSession).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveTextContent("Vil du slette denne økten?");
  });

  it("closes the menu on Escape", () => {
    renderPage([upcoming("a", "Uke 36 - Torsdag", "2026-09-03T13:45:00.000Z")]);

    fireEvent.click(screen.getByRole("button", { name: "Flere valg for Uke 36 - Torsdag" }));
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menuitem")).toBeNull();
  });

  it("blocks deleting a session that is already running", () => {
    renderPage([upcoming("a", "Uke 36 - Torsdag", "2026-09-03T13:45:00.000Z", { status: "in_progress" })]);

    fireEvent.click(screen.getByRole("button", { name: "Flere valg for Uke 36 - Torsdag" }));

    expect(screen.getByRole("menuitem", { name: "Slett økt" })).toBeDisabled();
  });
});

// The month focus is the one thing on this page that is not a session: it hangs
// off the month heading, and the months are padded out precisely so it can be
// written before anything is scheduled.
describe("month focus", () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); vi.setSystemTime(new Date("2026-09-02T09:00:00.000Z")); mocks.useGrep.mockReset(); mocks.deleteSession.mockReset(); mocks.saveMonthFocus.mockReset(); });
  afterEach(() => { vi.useRealTimers(); });
  const focusFor = (month: string, note: string): MonthFocus => ({ teamId: team.id, month, note, updatedAt: "2026-09-01T08:00:00.000Z", updatedBy: demoUser.id });

  it("shows the month's own focus and offers one on every month still to come", () => {
    renderPage([upcoming("a", "I dag", "2026-09-02T13:45:00.000Z")], [focusFor("2026-09", "Forsvar 6-0 med aktiv midtblokk.")]);

    expect(screen.getByText("Forsvar 6-0 med aktiv midtblokk.")).toBeInTheDocument();
    // September has one, so the four padded months ahead are what is left to fill.
    expect(screen.getAllByRole("button", { name: "Sett månedens fokus" })).toHaveLength(4);
  });

  it("names the coach whose focus is standing", () => {
    renderPage([upcoming("a", "I dag", "2026-09-02T13:45:00.000Z")], [{ ...focusFor("2026-09", "Forsvar 6-0 med aktiv midtblokk."), updatedBy: "user-nora" }]);

    expect(screen.getByText("Satt av Nora Vik · 1. sep.")).toBeInTheDocument();
  });

  it("says «deg» when the focus is the signed-in coach's own", () => {
    renderPage([upcoming("a", "I dag", "2026-09-02T13:45:00.000Z")], [focusFor("2026-09", "Forsvar 6-0 med aktiv midtblokk.")]);

    expect(screen.getByText("Satt av deg · 1. sep.")).toBeInTheDocument();
  });

  it("saves against the month the dialog was opened from", async () => {
    renderPage([upcoming("a", "I dag", "2026-09-02T13:45:00.000Z")]);
    const october = screen.getByRole("heading", { name: "oktober 2026" }).closest("section") as HTMLElement;

    fireEvent.click(within(october).getByRole("button", { name: "Sett månedens fokus" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Kontring ut av forsvaret." } });
    fireEvent.click(screen.getByRole("button", { name: "Lagre fokus" }));

    await waitFor(() => expect(mocks.saveMonthFocus).toHaveBeenCalledWith("2026-10", "Kontring ut av forsvaret."));
  });

  it("keeps a past month's focus on the page but stops offering to write one", () => {
    // Two sessions in August: the first becomes the hero, so the second leaves a
    // month section behind for a month that has already been and gone.
    renderPage([
      upcoming("a", "Forrige", "2026-08-29T13:45:00.000Z", { status: "in_progress" }),
      upcoming("b", "Også forrige", "2026-08-30T13:45:00.000Z", { status: "in_progress" }),
    ], [focusFor("2026-08", "Innspill til strek.")]);
    const august = screen.getByRole("heading", { name: /august 2026/ }).closest("section") as HTMLElement;

    expect(within(august).getByText("Innspill til strek.")).toBeInTheDocument();
    // Nothing in the section is a control: the focus is a record now, not an offer.
    expect(within(august).queryByRole("button", { name: /månedens fokus/i })).toBeNull();
  });

  // Gjennomførte is a record of what has been; the offer to plan a new session
  // belongs under the tabs you plan in.
  it("offers to create a session everywhere but under Gjennomførte", () => {
    renderPage([upcoming("a", "Gjennomført", "2026-08-28T13:45:00.000Z", { status: "completed" })]);

    expect(screen.getByRole("button", { name: /Opprett økt/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Gjennomførte/ }));

    expect(screen.getByRole("heading", { name: "Gjennomført" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Opprett økt/ })).toBeNull();
  });
});
