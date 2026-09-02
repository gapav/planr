import { fireEvent, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoTeams, demoUser } from "@/lib/demo-data";
import { AppShell } from "./app-shell";

const mocks = vi.hoisted(() => ({ useGrep: vi.fn() }));

vi.mock("./app-provider", () => ({ useGrep: mocks.useGrep }));
vi.mock("next/navigation", () => ({ usePathname: () => "/exercises" }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode; href: string }) => <a href={href} {...props}>{children}</a>,
}));

function grepState(user: typeof demoUser | null, sidebarCollapsed = false) {
  return {
    user,
    authLoading: false,
    isDemoMode: true,
    teams: demoTeams,
    currentTeam: demoTeams[0],
    setCurrentTeamId: vi.fn(),
    sidebarCollapsed,
    setSidebarCollapsed: vi.fn(),
    signOut: vi.fn(),
    notice: null,
    clearNotice: vi.fn(),
  };
}

describe("AppShell navigation", () => {
  beforeEach(() => mocks.useGrep.mockReset());

  it("keeps the app sidebar on the public exercise route for signed-in coaches", () => {
    const state = grepState(demoUser);
    mocks.useGrep.mockReturnValue(state);

    render(<AppShell publicPage><div>Exercise library</div></AppShell>);

    expect(screen.getByRole("complementary")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Exercises" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(state.setSidebarCollapsed).toHaveBeenCalledWith(true);
  });

  it("uses the public header for signed-out exercise visitors", () => {
    mocks.useGrep.mockReturnValue(grepState(null));

    render(<AppShell publicPage><div>Exercise library</div></AppShell>);

    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("Exercise library");
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
  });
});
