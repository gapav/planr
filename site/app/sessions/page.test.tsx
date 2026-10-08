import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoFixtures, demoSessions, demoTeams, demoUser } from "@/lib/demo-data";
import { dayKey } from "@/lib/fixtures";
import type { FocusPeriod, PlannedSession } from "@/lib/types";
import SessionsPage from "./page";

const mocks = vi.hoisted(() => ({ useGrep: vi.fn(), push: vi.fn(), replace: vi.fn(), createSession: vi.fn(), deleteSession: vi.fn(), createFocusPeriod: vi.fn(), updateFocusPeriod: vi.fn(), deleteFocusPeriod: vi.fn(), query: "" }));

vi.mock("@/components/app-provider", () => ({ useGrep: mocks.useGrep }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, replace: mocks.replace }), useSearchParams: () => new URLSearchParams(mocks.query) }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children?: ReactNode; href: string }) => <a href={href} {...props}>{children}</a>,
}));

const team = demoTeams[0];
const upcoming = (id: string, title: string, startsAt: string, extra: Partial<PlannedSession> = {}): PlannedSession =>
  ({ ...demoSessions[1], id, teamId: team.id, title, startsAt, status: "published", updatedBy: demoUser.id, ...extra });

function renderPage(sessions: PlannedSession[], focusPeriods: FocusPeriod[] = []) {
  mocks.useGrep.mockReturnValue({ sessions, fixtures: demoFixtures, currentTeam: team, user: demoUser, focusPeriods, createSession: mocks.createSession, deleteSession: mocks.deleteSession, createFocusPeriod: mocks.createFocusPeriod, updateFocusPeriod: mocks.updateFocusPeriod, deleteFocusPeriod: mocks.deleteFocusPeriod });
  render(<SessionsPage />);
}
const rowFor = (title: string) => screen.getByRole("link", { name: `Åpne ${title}` }).closest("li") as HTMLElement;

describe("session calendar rows", () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); vi.setSystemTime(new Date("2026-09-02T09:00:00.000Z")); mocks.useGrep.mockReset(); mocks.deleteSession.mockReset(); mocks.createFocusPeriod.mockReset().mockResolvedValue("new-focus"); mocks.updateFocusPeriod.mockReset(); mocks.deleteFocusPeriod.mockReset(); });
  afterEach(() => { vi.useRealTimers(); mocks.query = ""; });

  it("opens completed sessions from the Oversikt history shortcut", () => {
    mocks.query = "view=past";
    renderPage([upcoming("old", "En gjennomført økt", "2026-08-01T10:00:00Z"), upcoming("new", "Neste trening", "2026-09-05T10:00:00Z")]);
    expect(screen.getByRole("link", { name: "Åpne En gjennomført økt" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Åpne Neste trening" })).not.toBeInTheDocument();
  });

  it("lifts the nearest session out of its month and counts the rest", () => {
    renderPage([upcoming("a", "I dag", "2026-09-02T13:45:00.000Z"), upcoming("b", "Om to dager", "2026-09-04T13:45:00.000Z"), upcoming("c", "Neste måned", "2026-10-01T13:45:00.000Z")]);

    // Only the months that hold a session are sections, under the current focus.
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(["Nåværende fokus", "Neste økt", "september 2026 · 1 økt", "oktober 2026 · 1 økt"]);
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

    // Both keep the menu; the compact row drops the meta line it does not need,
    // but keeps how much of the plan is there — a month of published sessions
    // would otherwise render a full plan and an empty one as the same line.
    expect(within(rowFor("Denne uka")).getByText(/Fjordvik Arena/)).toBeInTheDocument();
    expect(within(rowFor("Om en måned")).queryByText(/Fjordvik Arena/)).toBeNull();
    expect(within(rowFor("Om en måned")).getByText("Ingen bolker")).toBeInTheDocument();
    expect(within(rowFor("Om en måned")).getByRole("button", { name: "Flere valg for Om en måned" })).toBeInTheDocument();
  });

  it("names a far-out session by its title, not by its blocks", () => {
    renderPage([
      upcoming("a", "Denne uka", "2026-09-04T13:45:00.000Z"),
      upcoming("b", "Torsdag - Uke 40", "2026-10-01T13:45:00.000Z", { blocks: demoSessions[0].blocks }),
    ]);

    const row = rowFor("Torsdag - Uke 40");
    expect(within(row).getByRole("heading", { name: "Torsdag - Uke 40" })).toBeInTheDocument();
    expect(within(row).queryByText("Oppvarming · Stasjoner · Spill")).toBeNull();
    expect(within(row).getByText("3 bolker · 1 t 30 min")).toBeInTheDocument();
  });

  it("keeps a name the coach chose on the row that has one", () => {
    renderPage([upcoming("a", "Denne uka", "2026-09-04T13:45:00.000Z"), upcoming("b", "Skudd & pådrag", "2026-10-01T13:45:00.000Z", { blocks: demoSessions[0].blocks })]);

    expect(within(rowFor("Skudd & pådrag")).getByRole("heading", { name: "Skudd & pådrag" })).toBeInTheDocument();
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

// The focus running today heads the calendar. It is a run of weeks, laid out in
// the season overview; here it can be read, edited, or set when none is running.
describe("current focus", () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); vi.setSystemTime(new Date("2026-09-02T09:00:00.000Z")); mocks.useGrep.mockReset(); mocks.createFocusPeriod.mockReset().mockResolvedValue("new-focus"); mocks.updateFocusPeriod.mockReset(); });
  afterEach(() => { vi.useRealTimers(); });
  const focusFrom = (id: string, title: string, startsOn: string, weeks: number, extra: Partial<FocusPeriod> = {}): FocusPeriod => ({
    id, teamId: team.id, title, note: "", notes: "", startsOn, weeks, updatedAt: "2026-09-01T08:00:00.000Z", updatedBy: demoUser.id, ...extra,
  });
  const region = () => screen.getByRole("region", { name: /Nåværende fokus/ });

  it("reads out the focus running today, with its weeks, sentence and points", () => {
    renderPage([upcoming("a", "I dag", "2026-09-02T13:45:00.000Z")], [focusFrom("forsvar", "Forsvar 6-0", "2026-08-31", 3, { note: "Aktiv midtblokk.", notes: "To-er og tre-er\nKontring" }), focusFrom("senere", "Kontring", "2026-09-21", 2)]);

    expect(region()).toHaveTextContent("Uke 36–38 · 31. aug.–20. sep.");
    expect(within(region()).getByText("Forsvar 6-0")).toBeInTheDocument();
    expect(within(region()).getByText("Aktiv midtblokk.")).toBeInTheDocument();
    expect(within(region()).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["To-er og tre-er", "Kontring"]);
    expect(region()).not.toHaveTextContent("Kontring fra");
  });

  it("names the coach whose focus is standing, «deg» included", () => {
    renderPage([], [focusFrom("forsvar", "Forsvar 6-0", "2026-08-31", 3, { updatedBy: "user-nora" })]);
    expect(within(region()).getByText("Satt av Nora Vik · 1. sep.")).toBeInTheDocument();
  });

  it("says «deg» when the focus is the signed-in coach's own", () => {
    renderPage([], [focusFrom("forsvar", "Forsvar 6-0", "2026-08-31", 3)]);
    expect(within(region()).getByText("Satt av deg · 1. sep.")).toBeInTheDocument();
  });

  it("no longer asks for a focus month by month", () => {
    renderPage([upcoming("a", "I dag", "2026-09-02T13:45:00.000Z"), upcoming("b", "Senere", "2026-11-12T13:45:00.000Z")]);
    expect(screen.queryByRole("button", { name: /månedens fokus/i })).toBeNull();
    // Only the months that hold something are sections now.
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).not.toContain("oktober 2026");
  });

  it("says what comes next when nothing is running, and sets a focus from this week", async () => {
    renderPage([], [focusFrom("senere", "Kontring", "2026-09-21", 2)]);
    expect(region()).toHaveTextContent("Ingen fokus nå. Neste er Kontring fra uke 39.");

    fireEvent.click(within(region()).getByRole("button", { name: "Sett fokus" }));
    const dialog = screen.getByRole("dialog", { name: "Nytt fokus" });
    // This week, and as long as fits before Kontring starts.
    expect(within(dialog).getByRole("combobox", { name: "Starter" })).toHaveValue("2026-08-31");
    expect(within(dialog).getByRole("textbox", { name: "Uker" })).toHaveValue("3");
    const save = within(dialog).getByRole("button", { name: "Lagre" });
    expect(save).toBeDisabled();
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Navn/ }), { target: { value: "Forsvar 6-0" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Notater/ }), { target: { value: "Midtblokk" } });
    fireEvent.click(save);

    await waitFor(() => expect(mocks.createFocusPeriod).toHaveBeenCalledWith({ title: "Forsvar 6-0", note: "", notes: "Midtblokk", startsOn: "2026-08-31", weeks: 3 }));
  });

  it("refuses a focus that would run into the next one, and names it", () => {
    renderPage([], [focusFrom("senere", "Kontring", "2026-09-21", 2)]);
    fireEvent.click(within(region()).getByRole("button", { name: "Sett fokus" }));
    const dialog = screen.getByRole("dialog", { name: "Nytt fokus" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Navn/ }), { target: { value: "Forsvar 6-0" } });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Uker" }), { target: { value: "4" } });

    expect(within(dialog).getByRole("alert")).toHaveTextContent("Overlapper med «Kontring»");
    expect(within(dialog).getByRole("button", { name: "Lagre" })).toBeDisabled();
  });

  it("edits the running focus in place", async () => {
    renderPage([], [focusFrom("forsvar", "Forsvar 6-0", "2026-08-31", 3, { note: "Aktiv midtblokk." })]);
    fireEvent.click(within(region()).getByRole("button", { name: "Rediger fokus" }));
    const dialog = screen.getByRole("dialog", { name: "Rediger fokus" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Navn/ }), { target: { value: "Forsvar 5-1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Lagre" }));

    await waitFor(() => expect(mocks.updateFocusPeriod).toHaveBeenCalledWith("forsvar", { title: "Forsvar 5-1", note: "Aktiv midtblokk.", notes: "", startsOn: "2026-08-31", weeks: 3 }));
  });

  it("offers to create a session everywhere but under Gjennomførte", () => {
    renderPage([upcoming("a", "Gjennomført", "2026-08-28T13:45:00.000Z", { status: "completed" })]);

    expect(screen.getByRole("button", { name: /Opprett økt/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Gjennomførte/ }));

    expect(screen.getByRole("heading", { name: "Gjennomført" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Opprett økt/ })).toBeNull();
  });
});

describe("season overview", () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); vi.setSystemTime(new Date("2026-09-02T09:00:00.000Z")); mocks.useGrep.mockReset(); mocks.createSession.mockReset().mockResolvedValue("new-session"); mocks.createFocusPeriod.mockReset().mockResolvedValue("new-focus"); mocks.updateFocusPeriod.mockReset(); mocks.deleteFocusPeriod.mockReset(); });
  afterEach(() => { vi.useRealTimers(); mocks.query = ""; });

  it("shows the calendar lanes, opens on this week, and sets a focus from a week", () => {
    const draft = upcoming("october-draft", "Kontringsøkt", "2026-10-10T13:00:00.000Z", { status: "draft" });
    renderPage([draft]);

    fireEvent.click(screen.getByRole("button", { name: "Sesongoverblikk" }));
    expect(screen.getByRole("heading", { name: "Sesong 2026/27" })).toBeInTheDocument();
    const calendar = screen.getByRole("region", { name: "Sesongkalender" });
    for (const row of ["Fokus", "Kamper", "Treninger"]) expect(within(calendar).getByText(row)).toBeInTheDocument();
    expect(within(calendar).getByText("Dra over ukene for å sette fokus")).toBeInTheDocument();
    // Months are labels, not something to open: a focus runs over weeks.
    expect(within(calendar).queryByRole("button", { name: /oktober/ })).toBeNull();
    expect(screen.queryByText(/måned/i)).toBeNull();
    // With no focus running, the season opens on this week.
    expect(screen.getByRole("heading", { name: "Uke 36" })).toBeInTheDocument();

    fireEvent.click(within(calendar).getByRole("button", { name: /Uke 41.*1 trening/ }));
    const detail = screen.getByRole("heading", { name: "Uke 41" }).closest("section") as HTMLElement;
    expect(within(detail).getByRole("link", { name: /Kontringsøkt/ })).toHaveAttribute("href", "/sessions/october-draft");
    expect(within(detail).getByText(/Utkast/)).toBeInTheDocument();
    expect(within(detail).getByText("Ingen fokus denne uka.")).toBeInTheDocument();
    fireEvent.click(within(detail).getByRole("button", { name: "Sett fokus" }));
    expect(within(screen.getByRole("dialog", { name: "Nytt fokus" })).getByRole("combobox", { name: "Starter" })).toHaveValue("2026-10-05");
  });

  it("opens a week from either activity row and starts a dated training plan", async () => {
    renderPage([upcoming("october-draft", "Kontringsøkt", "2026-10-10T13:00:00.000Z", { status: "draft" })]);
    fireEvent.click(screen.getByRole("button", { name: "Sesongoverblikk" }));
    const calendar = screen.getByRole("region", { name: "Sesongkalender" });
    fireEvent.click(within(calendar).getByRole("button", { name: /Uke 41.*1 kamp/ }));
    const detail = screen.getByRole("heading", { name: "Uke 41" }).closest("section") as HTMLElement;
    // One agenda, day by day: the match and the training share Saturday's row,
    // and the club's own side is the one set in bold.
    const saturday = within(detail).getByText("10. okt.").closest("li") as HTMLElement;
    const match = within(saturday).getByText((_, element) => element?.tagName === "STRONG" && element.textContent === "Ski Rød – Fjordvik Rød");
    expect(within(match).getByText("Fjordvik Rød").tagName).toBe("B");
    expect(within(saturday).getByRole("link", { name: /Kontringsøkt/ })).toBeInTheDocument();
    fireEvent.click(within(detail).getByRole("button", { name: "Planlegg økt denne uka" }));
    await waitFor(() => expect(mocks.createSession).toHaveBeenCalledWith(expect.any(String)));
    expect(dayKey(mocks.createSession.mock.calls[0][0])).toBe("2026-10-06");
    expect(mocks.push).toHaveBeenCalledWith("/sessions/new-session/edit");
  });

  const kontring: FocusPeriod = { id: "kontring", teamId: team.id, title: "Kontring", note: "Vinne ballen høyt og komme raskt i gang.", notes: "Første pasning fram\n\nFire i løp", startsOn: "2026-10-05", weeks: 3, updatedAt: "2026-09-01T08:00:00Z", updatedBy: demoUser.id };

  it("draws a focus as one bar over its weeks and reads it in full on its card", () => {
    renderPage([upcoming("october", "Oktoberøkt", "2026-10-07T13:00:00Z")], [kontring]);
    fireEvent.click(screen.getByRole("button", { name: "Sesongoverblikk" }));

    const bar = within(screen.getByRole("region", { name: "Sesongkalender" })).getByRole("button", { name: "Fokus: Kontring, Uke 41–43 · 5. okt.–25. okt." });
    expect(bar).toHaveTextContent(/^Kontring$/);
    expect(bar).toHaveAttribute("title", "Kontring — Vinne ballen høyt og komme raskt i gang.");
    expect(bar.style.gridColumn).toBe("12 / 15");

    const card = within(screen.getByRole("region", { name: "Fokus gjennom sesongen" })).getByRole("button", { name: /Kontring/ });
    expect(card).toHaveTextContent("Uke 41–43 · 5. okt.–25. okt. · 1 økt · 2 kamper");
    expect(within(card).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Første pasning fram", "Fire i løp"]);

    fireEvent.click(card);
    const detail = screen.getByRole("heading", { name: "Kontring" }).closest("section") as HTMLElement;
    expect(within(detail).getByText("Fire i løp")).toBeInTheDocument();
    expect(within(detail).getByRole("link", { name: /Oktoberøkt/ })).toBeInTheDocument();
    fireEvent.click(within(detail).getByRole("button", { name: "Rediger fokus" }));
    expect(screen.getByRole("dialog", { name: "Rediger fokus" })).toBeInTheDocument();
  });

  it("shows the focus running in a selected week, and opens it from there", () => {
    renderPage([upcoming("october", "Oktoberøkt", "2026-10-07T13:00:00Z")], [kontring]);
    fireEvent.click(screen.getByRole("button", { name: "Sesongoverblikk" }));
    fireEvent.click(within(screen.getByRole("region", { name: "Sesongkalender" })).getByRole("button", { name: /Uke 41.*1 trening/ }));

    const detail = screen.getByRole("heading", { name: "Uke 41" }).closest("section") as HTMLElement;
    expect(within(detail).getByText("Vinne ballen høyt og komme raskt i gang.")).toBeInTheDocument();
    fireEvent.click(within(detail).getByRole("button", { name: "Åpne fokuset" }));
    expect(screen.getByRole("heading", { name: "Kontring" })).toBeInTheDocument();
  });

  it("starts a new focus from the heading in the first free weeks", () => {
    renderPage([], [kontring]);
    fireEvent.click(screen.getByRole("button", { name: "Sesongoverblikk" }));
    fireEvent.click(screen.getByRole("button", { name: "Nytt fokus" }));
    const dialog = screen.getByRole("dialog", { name: "Nytt fokus" });
    expect(within(dialog).getByRole("combobox", { name: "Starter" })).toHaveValue("2026-08-31");
    expect(within(dialog).getByRole("textbox", { name: "Uker" })).toHaveValue("4");
  });

  it("keeps the calendar view available after opening Sesongoverblikk", () => {
    renderPage([upcoming("next", "Neste økt", "2026-09-05T13:00:00.000Z")]);
    fireEvent.click(screen.getByRole("button", { name: "Sesongoverblikk" }));
    expect(mocks.replace).toHaveBeenCalledWith("/sessions?mode=season", { scroll: false });
    fireEvent.click(screen.getByRole("button", { name: "Økter" }));
    expect(screen.getByRole("button", { name: /Kommende/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Åpne Neste økt" })).toBeInTheDocument();
  });

  it("opens on the focus running today", () => {
    vi.setSystemTime(new Date("2026-10-14T09:00:00.000Z"));
    renderPage([], [kontring]);
    fireEvent.click(screen.getByRole("button", { name: "Sesongoverblikk" }));
    expect(screen.getByRole("heading", { name: "Kontring" }).closest("section")).toHaveAttribute("id", "season-detail");
  });

  it("opens the focus linked from a session, in its own season", () => {
    mocks.query = "mode=season&focus=next-season";
    renderPage([], [kontring, { ...kontring, id: "next-season", title: "Overgang", startsOn: "2027-08-30" }]);

    expect(screen.getByRole("heading", { name: "Sesong 2027/28" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Overgang" }).closest("section")).toHaveAttribute("id", "season-detail");
  });
});
