import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SeasonOverview } from "./season-overview";

const mocks = vi.hoisted(() => ({ useGrep: vi.fn() }));
vi.mock("@/components/app-provider", () => ({ useGrep: mocks.useGrep }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children?: ReactNode; href: string }) => <a href={href} {...props}>{children}</a>,
}));

function renderSeason(workspaceLoaded: boolean) {
  mocks.useGrep.mockReturnValue({ workspaceLoaded });
  render(<SeasonOverview teamId="team-1" sessions={[]} fixtures={[]} focusPeriods={[]} initialFocus={null} onCreateTraining={vi.fn()} />);
}

// Decision 9: before the workspace has loaded, an empty week is "not here yet".
describe("SeasonOverview", () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); vi.setSystemTime(new Date("2026-09-02T09:00:00.000Z")); mocks.useGrep.mockReset(); });
  afterEach(() => vi.useRealTimers());

  it("says the season is loading, not that the week is empty, before the workspace has loaded", () => {
    renderSeason(false);
    expect(screen.getByRole("status")).toHaveTextContent("Henter økter …");
    expect(screen.queryByText("Ingen kamper eller økter denne uka.")).not.toBeInTheDocument();
  });

  it("still says an empty week is empty once the workspace has loaded", () => {
    renderSeason(true);
    expect(screen.getByText("Ingen kamper eller økter denne uka.")).toBeInTheDocument();
    expect(screen.queryByText("Henter økter …")).not.toBeInTheDocument();
  });
});
