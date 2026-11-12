import { fireEvent, render, screen, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoPlayers, demoSessions, demoTeams, demoUser } from "@/lib/demo-data";
import { CURRENT_VERSION, RELEASES } from "@/lib/changelog";
import { SEEN_VERSION_KEY } from "@/lib/release-notes";
import { AppShell } from "./app-shell";
import { WorkoutSession } from "./live-session";

const mocks = vi.hoisted(() => ({ useGrep: vi.fn(), replace: vi.fn(), push: vi.fn(), pathname: vi.fn(() => "/exercises") }));

vi.mock("./app-provider", () => ({ useGrep: mocks.useGrep }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname(), useRouter: () => ({ replace: mocks.replace, push: mocks.push }) }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode; href: string }) => <a href={href} {...props}>{children}</a>,
}));

function grepState(user: typeof demoUser | null, sidebarCollapsed = false) {
  return {
    user,
    authLoading: false,
    workspaceLoaded: true,
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
  // These are about navigation; the «Hva er nytt» dialog has its own tests below.
  beforeEach(() => { mocks.useGrep.mockReset(); mocks.replace.mockReset(); mocks.push.mockReset(); mocks.pathname.mockReturnValue("/exercises"); window.localStorage.setItem(SEEN_VERSION_KEY, CURRENT_VERSION); });

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

  // A deep link is worth signing in for; the bare front door is not, so an
  // unknown visitor meets the public introduction instead of an empty gate.
  it("sends a signed-out visitor from the front door to the introduction", () => {
    mocks.pathname.mockReturnValue("/");
    mocks.useGrep.mockReturnValue(grepState(null));

    render(<AppShell><div>Oversikt</div></AppShell>);

    expect(mocks.replace).toHaveBeenCalledWith("/velkommen");
    expect(screen.queryByRole("link", { name: "Logg inn" })).not.toBeInTheDocument();
    expect(screen.queryByText("Oversikt")).not.toBeInTheDocument();
  });

  it("leaves a signed-out deep link on the sign-in gate", () => {
    mocks.useGrep.mockReturnValue(grepState(null));

    render(<AppShell><div>Exercise library</div></AppShell>);

    expect(mocks.replace).not.toHaveBeenCalled();
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

describe("AppShell «Velkommen tilbake!»", () => {
  const whatsNew = () => screen.queryByRole("dialog", { name: "Velkommen tilbake!" });

  beforeEach(() => {
    mocks.useGrep.mockReset(); mocks.replace.mockReset(); mocks.push.mockReset(); mocks.pathname.mockReturnValue("/exercises");
    window.localStorage.clear();
  });
  afterEach(() => { vi.restoreAllMocks(); window.localStorage.clear(); });

  it("greets a signed-in coach with nothing stored, one list per release", () => {
    mocks.useGrep.mockReturnValue(grepState(demoUser));
    render(<AppShell>Innhold</AppShell>);

    const dialog = whatsNew();
    expect(dialog).toBeInTheDocument();
    expect(within(dialog!).getByText("Her er hva som er nytt siden sist.")).toBeInTheDocument();
    expect(within(dialog!).getByRole("heading", { name: /Versjon 1\.2\.0/ })).toHaveTextContent("12. november 2026");
    expect(within(dialog!).getByRole("heading", { name: /Versjon 1\.1\.0/ })).toHaveTextContent("12. november 2026");
    expect(within(dialog!).queryByRole("heading", { name: /Versjon 1\.0\.0/ })).not.toBeInTheDocument();
    expect(within(dialog!).getAllByRole("listitem")).toHaveLength(RELEASES.reduce((sum, release) => sum + release.highlights.length, 0));
  });

  it("stays closed when grep-seen-version is current", () => {
    window.localStorage.setItem(SEEN_VERSION_KEY, CURRENT_VERSION);
    mocks.useGrep.mockReturnValue(grepState(demoUser));
    render(<AppShell>Innhold</AppShell>);
    expect(whatsNew()).not.toBeInTheDocument();
  });

  it("stores the current version and closes on «Skjønner»", () => {
    mocks.useGrep.mockReturnValue(grepState(demoUser));
    render(<AppShell>Innhold</AppShell>);
    fireEvent.click(screen.getByRole("button", { name: "Skjønner" }));
    expect(window.localStorage.getItem(SEEN_VERSION_KEY)).toBe(CURRENT_VERSION);
    expect(whatsNew()).not.toBeInTheDocument();
  });

  it("stores the current version when closed with Escape or the backdrop", () => {
    mocks.useGrep.mockReturnValue(grepState(demoUser));
    const { unmount } = render(<AppShell>Innhold</AppShell>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(whatsNew()).not.toBeInTheDocument();
    expect(window.localStorage.getItem(SEEN_VERSION_KEY)).toBe(CURRENT_VERSION);
    unmount(); window.localStorage.clear();

    render(<AppShell>Innhold</AppShell>);
    fireEvent.pointerDown(screen.getByRole("dialog", { name: "Velkommen tilbake!" }).parentElement!);
    expect(whatsNew()).not.toBeInTheDocument();
    expect(window.localStorage.getItem(SEEN_VERSION_KEY)).toBe(CURRENT_VERSION);
  });

  it("shows a coach who last saw 1.0.0 what came after it", () => {
    window.localStorage.setItem(SEEN_VERSION_KEY, "1.0.0");
    mocks.useGrep.mockReturnValue(grepState(demoUser));
    render(<AppShell>Innhold</AppShell>);
    expect(whatsNew()).toBeInTheDocument();
  });

  it("waits until the user and teams are loaded", () => {
    mocks.useGrep.mockReturnValue({ ...grepState(demoUser), workspaceLoaded: false });
    const { rerender } = render(<AppShell>Innhold</AppShell>);
    expect(whatsNew()).not.toBeInTheDocument();
    mocks.useGrep.mockReturnValue({ ...grepState(demoUser), authLoading: true });
    rerender(<AppShell>Innhold</AppShell>);
    expect(whatsNew()).not.toBeInTheDocument();
    mocks.useGrep.mockReturnValue(grepState(null));
    rerender(<AppShell>Innhold</AppShell>);
    expect(whatsNew()).not.toBeInTheDocument();
  });

  it("shows nothing when storage cannot be read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("SecurityError"); });
    mocks.useGrep.mockReturnValue(grepState(demoUser));
    expect(() => render(<AppShell>Innhold</AppShell>)).not.toThrow();
    expect(whatsNew()).not.toBeInTheDocument();
  });

  it("waits while the support dialog is open", () => {
    mocks.useGrep.mockReturnValue({ ...grepState(demoUser), sendSupportMessage: vi.fn() });
    render(<AppShell>Innhold</AppShell>);
    fireEvent.click(within(screen.getByRole("complementary")).getByRole("button", { name: "Kontakt support" }));
    expect(screen.getByRole("dialog", { name: "Kontakt support" })).toBeInTheDocument();
    expect(whatsNew()).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Avbryt" }));
    expect(whatsNew()).toBeInTheDocument();
  });

  it("stays away from the immersive shell", () => {
    mocks.useGrep.mockReturnValue(grepState(demoUser));
    render(<AppShell immersive>Innhold</AppShell>);
    expect(whatsNew()).not.toBeInTheDocument();
  });

  it("does not interrupt a live workout", () => {
    const live = { ...demoSessions[0], status: "in_progress" as const, groupingKind: null };
    mocks.useGrep.mockReturnValue({ ...grepState(demoUser), sessions: [live], players: demoPlayers, attendance: [], groupings: [], undoWorkoutStart: vi.fn(), finishWorkout: vi.fn(), reopenSession: vi.fn(), copySession: vi.fn() });
    render(<WorkoutSession sessionId={live.id} />);
    expect(screen.getByText("Økten pågår")).toBeInTheDocument();
    expect(whatsNew()).not.toBeInTheDocument();
  });

  it("greets a coach in demo mode the same way", () => {
    mocks.useGrep.mockReturnValue({ ...grepState(demoUser), isDemoMode: true });
    expect(() => render(<AppShell>Innhold</AppShell>)).not.toThrow();
    expect(whatsNew()).toBeInTheDocument();
  });
});
