import { fireEvent, render, screen, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoSessions, demoTeams, demoUser } from "@/lib/demo-data";
import type { PlannedSession } from "@/lib/types";
import SessionsPage from "./page";

const mocks = vi.hoisted(() => ({ useGrep: vi.fn(), push: vi.fn(), deleteSession: vi.fn() }));

vi.mock("@/components/app-provider", () => ({ useGrep: mocks.useGrep }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children?: ReactNode; href: string }) => <a href={href} {...props}>{children}</a>,
}));

const team = demoTeams[0];
const upcoming = (id: string, title: string, startsAt: string, extra: Partial<PlannedSession> = {}): PlannedSession =>
  ({ ...demoSessions[1], id, teamId: team.id, title, startsAt, status: "published", updatedBy: demoUser.id, ...extra });

function renderPage(sessions: PlannedSession[]) {
  mocks.useGrep.mockReturnValue({ sessions, currentTeam: team, user: demoUser, createSession: vi.fn(), deleteSession: mocks.deleteSession });
  render(<SessionsPage />);
}
const rowFor = (title: string) => screen.getByRole("link", { name: `Åpne ${title}` }).closest("li") as HTMLElement;

describe("session calendar rows", () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); vi.setSystemTime(new Date("2026-09-02T09:00:00.000Z")); mocks.useGrep.mockReset(); mocks.deleteSession.mockReset(); });
  afterEach(() => { vi.useRealTimers(); });

  it("lifts the nearest session out of its month and counts the rest", () => {
    renderPage([upcoming("a", "I dag", "2026-09-02T13:45:00.000Z"), upcoming("b", "Om to dager", "2026-09-04T13:45:00.000Z"), upcoming("c", "Neste måned", "2026-10-01T13:45:00.000Z")]);

    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(["Neste økt", "september 2026 · 1 økt", "oktober 2026 · 1 økt"]);
    // The hero is its own section, so its month section holds only what is left.
    expect(within(screen.getByRole("heading", { name: "Neste økt" }).closest("section") as HTMLElement).getAllByRole("listitem")).toHaveLength(1);
  });

  it("names the days around today", () => {
    renderPage([upcoming("a", "Uke 36 - Torsdag", "2026-09-03T13:45:00.000Z")]);

    expect(screen.getByText("I morgen")).toBeInTheDocument();
  });

  it("offers Start only on a session that can actually be started", () => {
    renderPage([upcoming("a", "I dag", "2026-09-02T18:00:00.000Z"), upcoming("b", "Om to dager", "2026-09-04T13:45:00.000Z")]);

    expect(within(rowFor("I dag")).getByRole("link", { name: "Start" })).toHaveAttribute("href", "/sessions/a/live");
    expect(within(rowFor("Om to dager")).queryByRole("link", { name: "Start" })).toBeNull();
  });

  it("keeps the orange button on a session already running", () => {
    renderPage([upcoming("a", "Pågående", "2026-09-01T18:00:00.000Z", { status: "in_progress" })]);

    expect(within(rowFor("Pågående")).getByRole("link", { name: "Fortsett" })).toBeInTheDocument();
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

    // Both keep Rediger; the compact row drops the meta line it does not need.
    expect(within(rowFor("Denne uka")).getByText(/bolk/)).toBeInTheDocument();
    expect(within(rowFor("Om en måned")).queryByText(/bolk/)).toBeNull();
    expect(within(rowFor("Om en måned")).getByRole("link", { name: "Rediger" })).toHaveAttribute("href", "/sessions/b/edit");
    expect(within(rowFor("Om en måned")).getByRole("button", { name: "Flere valg for Om en måned" })).toBeInTheDocument();
  });

  it("opens the plan for reading, and keeps editing behind its own button", () => {
    renderPage([upcoming("a", "Uke 36 - Torsdag", "2026-09-03T13:45:00.000Z")]);

    expect(screen.getByRole("link", { name: "Åpne Uke 36 - Torsdag" })).toHaveAttribute("href", "/sessions/a");
    expect(screen.getByRole("link", { name: "Rediger" })).toHaveAttribute("href", "/sessions/a/edit");
  });

  it("sends a locked plan to the view, which is the only screen it has", () => {
    renderPage([upcoming("a", "Pågående", "2026-09-01T18:00:00.000Z", { status: "in_progress" })]);

    expect(within(rowFor("Pågående")).getByRole("link", { name: "Se planen" })).toHaveAttribute("href", "/sessions/a");
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
