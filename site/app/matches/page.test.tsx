import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoTeams } from "@/lib/demo-data";
import MatchesPage from "./page";

const mocks = vi.hoisted(() => ({ useGrep: vi.fn() }));
vi.mock("@/components/app-provider", () => ({ useGrep: mocks.useGrep }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/fixture-import", () => ({ FixtureImport: () => null }));
vi.mock("@/components/help-tip", () => ({ HelpTip: () => null }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children?: ReactNode; href: string }) => <a href={href} {...props}>{children}</a>,
}));

function renderMatches(extra: Record<string, unknown>) {
  mocks.useGrep.mockReturnValue({ currentTeam: demoTeams[0], fixtures: [], warmupRoutines: [], clearFixtures: vi.fn(), removeFixture: vi.fn(), workspaceLoaded: true, ...extra });
  render(<MatchesPage />);
}

// Decision 9: before the workspace has loaded, no matches means "not here yet".
describe("/matches", () => {
  beforeEach(() => mocks.useGrep.mockReset());

  it("says the matches are loading, not that there are none, before the workspace has loaded", () => {
    renderMatches({ workspaceLoaded: false });
    expect(screen.getByRole("status")).toHaveTextContent("Henter kamper …");
    expect(screen.queryByText("Ingen kamper i kalenderen")).not.toBeInTheDocument();
  });

  it("waits before saying the coach is on no team", () => {
    renderMatches({ workspaceLoaded: false, currentTeam: null });
    expect(screen.getByRole("status")).toHaveTextContent("Henter kamper …");
    expect(screen.queryByText("Du er ikke med på noe lag ennå")).not.toBeInTheDocument();
  });

  it("still says the calendar is empty once the workspace has loaded", () => {
    renderMatches({});
    expect(screen.getByText("Ingen kamper i kalenderen")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("says the coach is on no team once the workspace has loaded", () => {
    renderMatches({ currentTeam: null });
    expect(screen.getByText("Du er ikke med på noe lag ennå")).toBeInTheDocument();
  });
});
