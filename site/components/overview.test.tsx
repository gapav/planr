import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoFixtures, demoMonthFocus, demoSessions, demoTeams, demoUser, demoWarmupRoutines } from "@/lib/demo-data";
import { Overview } from "./overview";

const mocks = vi.hoisted(() => ({ useGrep: vi.fn(), push: vi.fn(), createSession: vi.fn() }));
vi.mock("./app-provider", () => ({ useGrep: mocks.useGrep }));
vi.mock("./app-shell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("next/link", () => ({ default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children?: ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }));
const state = () => ({
  user: demoUser, currentTeam: demoTeams[0], sessions: demoSessions, fixtures: demoFixtures,
  warmupRoutines: demoWarmupRoutines, monthFocus: demoMonthFocus, workspaceLoaded: true, createSession: mocks.createSession,
});

describe("Oversikt", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true }); vi.setSystemTime(new Date("2026-09-20T10:00:00Z"));
    vi.clearAllMocks(); mocks.useGrep.mockReturnValue(state());
  });
  afterEach(() => vi.useRealTimers());
  it("creates a real draft and opens the editor", async () => {
    mocks.createSession.mockResolvedValue("new-plan"); render(<Overview />);
    fireEvent.click(screen.getByRole("button", { name: "Planlegg økt" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/sessions/new-plan/edit"));
    expect(mocks.createSession).toHaveBeenCalledTimes(1);
  });
  it("shows creation failure and allows retry", async () => {
    mocks.createSession.mockRejectedValue(new Error("offline")); render(<Overview />);
    fireEvent.click(screen.getByRole("button", { name: "Planlegg økt" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Prøv igjen");
    expect(screen.getByRole("button", { name: "Planlegg økt" })).toBeEnabled();
  });
  it("does not show a false empty state while loading", () => {
    mocks.useGrep.mockReturnValue({ ...state(), workspaceLoaded: false }); render(<Overview />);
    expect(screen.getByRole("status")).toHaveTextContent("Henter lagets økter");
    expect(screen.queryByText("Plass til en god økt.")).not.toBeInTheDocument();
  });
  it("shows the next match with the meet-up counted back from the throw-off", () => {
    render(<Overview />);
    const card = screen.getByRole("link", { name: /Neste kamp lørdag 26. september/ });
    expect(card).toHaveAttribute("href", "/matches");
    expect(card).toHaveTextContent("Fjordvik Blå – Fjordvik Rød");
    expect(card).toHaveTextContent("oppmøte 12:40");
    expect(card).toHaveTextContent("Sofiemyrhallen B");
  });
  it("drops the meet-up line when the team has no warm-up routine", () => {
    mocks.useGrep.mockReturnValue({ ...state(), warmupRoutines: [] }); render(<Overview />);
    expect(screen.getByRole("link", { name: /Neste kamp lørdag 26. september/ })).not.toHaveTextContent("oppmøte");
  });
  it("keeps the match card and invites an admin to import when the calendar is empty", () => {
    mocks.useGrep.mockReturnValue({ ...state(), fixtures: [] }); render(<Overview />);
    expect(screen.getByRole("link", { name: "Importer kamper" })).toHaveTextContent("Ingen kamper i kalenderen ennå.");
  });
  it("sends a coach who cannot import to the calendar instead", () => {
    mocks.useGrep.mockReturnValue({ ...state(), currentTeam: demoTeams[1], fixtures: [] }); render(<Overview />);
    expect(screen.getByRole("link", { name: "Se kampkalenderen" })).toHaveAttribute("href", "/matches");
    expect(screen.queryByRole("link", { name: /Importer kamper/ })).not.toBeInTheDocument();
  });
  it("shows this month's focus and links it to the session calendar", () => {
    render(<Overview />);
    const focus = screen.getByRole("link", { name: /Månedens fokus/ });
    expect(focus).toHaveTextContent("Forsvar 6-0 med aktiv midtblokk");
    expect(focus).toHaveAttribute("href", "/sessions");
  });
  it("does not carry the focus into a month it was not written for", () => {
    vi.setSystemTime(new Date("2026-10-05T10:00:00Z")); render(<Overview />);
    expect(screen.queryByText(/Månedens fokus/)).not.toBeInTheDocument();
  });
  it("prevents planning without a team", () => {
    mocks.useGrep.mockReturnValue({ ...state(), currentTeam: null }); render(<Overview />);
    expect(screen.getByRole("button", { name: "Planlegg økt" })).toBeDisabled();
    expect(screen.getByRole("link", { name: /Administrer lag/ })).toHaveAttribute("href", "/admin");
  });
});
