import { fireEvent, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoTeams, demoUser } from "@/lib/demo-data";
import { AppShell } from "./app-shell";

const mocks = vi.hoisted(() => ({ useGrep: vi.fn(), replace: vi.fn() }));

vi.mock("./app-provider", () => ({ useGrep: mocks.useGrep }));
vi.mock("next/navigation", () => ({ usePathname: () => "/exercises", useRouter: () => ({ replace: mocks.replace }) }));
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
  beforeEach(() => { mocks.useGrep.mockReset(); mocks.replace.mockReset(); });

  it("keeps the app sidebar on the public exercise route for signed-in coaches", () => {
    const state = grepState(demoUser);
    mocks.useGrep.mockReturnValue(state);

    render(<AppShell publicPage><div>Exercise library</div></AppShell>);

    expect(screen.getByRole("complementary")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Øvelsesbank" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Skjul sidemenyen" }));
    expect(state.setSidebarCollapsed).toHaveBeenCalledWith(true);
  });

  it("uses the public header for signed-out exercise visitors", () => {
    mocks.useGrep.mockReturnValue(grepState(null));

    render(<AppShell publicPage><div>Exercise library</div></AppShell>);

    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("Exercise library");
    expect(screen.getByRole("link", { name: "Logg inn" })).toBeInTheDocument();
  });

  it("sends a coach still on a temporary password to the password page", () => {
    mocks.useGrep.mockReturnValue(grepState({ ...demoUser, mustSetPassword: true }));

    render(<AppShell publicPage><div>Exercise library</div></AppShell>);

    expect(mocks.replace).toHaveBeenCalledWith("/account/password?next=%2Fexercises");
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
  });

  it("leaves a coach who has set their own password alone", () => {
    mocks.useGrep.mockReturnValue(grepState({ ...demoUser, mustSetPassword: false }));

    render(<AppShell publicPage><div>Exercise library</div></AppShell>);

    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("main")).toHaveTextContent("Exercise library");
  });
});
