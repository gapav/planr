import { fireEvent, render, screen, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoTeams, demoUser } from "@/lib/demo-data";
import { AppShell } from "./app-shell";

const mocks = vi.hoisted(() => ({ useGrep: vi.fn(), replace: vi.fn(), push: vi.fn() }));

vi.mock("./app-provider", () => ({ useGrep: mocks.useGrep }));
vi.mock("next/navigation", () => ({ usePathname: () => "/exercises", useRouter: () => ({ replace: mocks.replace, push: mocks.push }) }));
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
  beforeEach(() => { mocks.useGrep.mockReset(); mocks.replace.mockReset(); mocks.push.mockReset(); });

  // Whatever the coach was looking at belonged to the old team, so the switch
  // lands on the one page that is about the new one.
  it("sends the coach to the overview when they switch team", () => {
    const state = grepState(demoUser);
    mocks.useGrep.mockReturnValue(state);
    render(<AppShell><p>Innhold</p></AppShell>);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: demoTeams[1].id } });

    expect(state.setCurrentTeamId).toHaveBeenCalledWith(demoTeams[1].id);
    expect(mocks.push).toHaveBeenCalledWith("/");
  });

  it("keeps the app sidebar on the exercise route for signed-in coaches", () => {
    const state = grepState(demoUser);
    mocks.useGrep.mockReturnValue(state);

    render(<AppShell><div>Exercise library</div></AppShell>);

    expect(screen.getByRole("complementary")).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Hovedmeny" })).getByRole("link", { name: "Øvelsesbank" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Skjul sidemenyen" }));
    expect(state.setSidebarCollapsed).toHaveBeenCalledWith(true);
  });

  it("hides the exercise library behind the sign-in gate", () => {
    mocks.useGrep.mockReturnValue(grepState(null));

    render(<AppShell><div>Exercise library</div></AppShell>);

    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.queryByText("Exercise library")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Logg inn" })).toHaveAttribute("href", "/sign-in?next=%2Fexercises");
  });

  it("ignores the retired temporary-password flag for passwordless accounts", () => {
    mocks.useGrep.mockReturnValue(grepState({ ...demoUser, mustSetPassword: true }));

    render(<AppShell><div>Exercise library</div></AppShell>);

    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("main")).toHaveTextContent("Exercise library");
  });

  it("renders an ordinary passwordless coach session", () => {
    mocks.useGrep.mockReturnValue(grepState({ ...demoUser, mustSetPassword: false }));

    render(<AppShell><div>Exercise library</div></AppShell>);

    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("main")).toHaveTextContent("Exercise library");
  });

  it("keeps Oversikt from appearing selected on other routes", () => {
    mocks.useGrep.mockReturnValue(grepState(demoUser));
    render(<AppShell>Innhold</AppShell>);
    const nav = within(screen.getByRole("navigation", { name: "Hovedmeny" }));
    expect(nav.getByRole("link", { name: "Oversikt" })).not.toHaveAttribute("aria-current");
    expect(nav.getByRole("link", { name: "Øvelsesbank" })).toHaveAttribute("aria-current", "page");
  });

  it("does not offer system administration to ordinary coaches", () => {
    mocks.useGrep.mockReturnValue(grepState({ ...demoUser, isGlobalAdmin: false }));
    render(<AppShell>Innhold</AppShell>);
    expect(screen.queryByRole("link", { name: "Administrasjon" })).not.toBeInTheDocument();
  });

  it("keeps administration next to primary navigation, not in the footer", () => {
    mocks.useGrep.mockReturnValue(grepState(demoUser));
    render(<AppShell>Innhold</AppShell>);
    const admin = within(screen.getByRole("navigation", { name: "Systemadministrasjon" })).getByRole("link", { name: "Administrasjon" });
    expect(admin).toHaveAttribute("href", "/admin");
    expect(admin.closest(".grep-sidebar-footer")).toBeNull();
  });

  it("closes mobile navigation with Escape and restores focus and scrolling", () => {
    mocks.useGrep.mockReturnValue(grepState(demoUser));
    render(<AppShell>Innhold</AppShell>);
    const trigger = screen.getByRole("button", { name: "Åpne menyen" });
    trigger.focus(); fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Navigasjon" })).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).not.toBe("hidden");
    expect(trigger).toHaveFocus();
  });
});
