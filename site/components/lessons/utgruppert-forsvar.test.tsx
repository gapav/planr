import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { StrictMode, type AnchorHTMLAttributes, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoTeams, demoUser } from "@/lib/demo-data";
import { CURRENT_VERSION } from "@/lib/changelog";
import { QUIZ, STEPS } from "@/lib/lessons/utgruppert-forsvar";
import { SEEN_VERSION_KEY } from "@/lib/release-notes";
import { UtgruppertForsvarLesson } from "./utgruppert-forsvar";

const mocks = vi.hoisted(() => ({ useGrep: vi.fn() }));
vi.mock("@/components/app-provider", () => ({ useGrep: mocks.useGrep }));
vi.mock("next/navigation", () => ({ usePathname: () => "/handballskolen/utgruppert-forsvar", useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { children: ReactNode; href: string }) => <a href={href} {...props}>{children}</a>,
}));

// The lesson needs nothing from the provider; the shell around it reads this.
function grepState() {
  return { user: demoUser, authLoading: false, workspaceLoaded: true, isDemoMode: true, teams: demoTeams, currentTeam: demoTeams[0], setCurrentTeamId: vi.fn(), sidebarCollapsed: false, setSidebarCollapsed: vi.fn(), signOut: vi.fn(), notice: null, clearNotice: vi.fn() };
}

const headings: Record<string, string> = {
  hva: "Fra nedgruppert til utgruppert",
  roller: "1'ere, 2'ere og 3'ere",
  ballen: "Forflytning med ball",
  overgang: "Overgang",
  spill: "Hvor står du?",
  quiz: "Riktig eller feil?",
};
const steps = () => within(screen.getByRole("navigation", { name: "Steg i temaet" }));
const lesson = (random = () => 0.25) => render(<UtgruppertForsvarLesson random={random} />);

describe("Utgruppert forsvar", () => {
  beforeEach(() => {
    mocks.useGrep.mockReturnValue(grepState());
    window.localStorage.setItem(SEEN_VERSION_KEY, CURRENT_VERSION);
    window.history.replaceState(null, "", "/handballskolen/utgruppert-forsvar");
  });
  afterEach(() => { vi.useRealTimers(); window.localStorage.clear(); });

  it("opens on the first step and renders every step's panel from its tab", () => {
    lesson();
    expect(screen.getByRole("heading", { level: 2, name: headings.hva })).toBeInTheDocument();
    for (const step of STEPS) {
      fireEvent.click(steps().getByRole("button", { name: step.title }));
      expect(screen.getByRole("heading", { level: 2, name: headings[step.id] })).toBeInTheDocument();
      expect(steps().getByRole("button", { name: step.title })).toHaveAttribute("aria-current", "step");
      expect(window.location.hash).toBe(`#${step.id}`);
    }
  });

  it("walks the steps in order with «Neste» and back round to the start", () => {
    lesson();
    for (const step of STEPS.slice(1)) {
      fireEvent.click(screen.getByRole("button", { name: /^Neste: / }));
      expect(window.location.hash).toBe(`#${step.id}`);
      expect(screen.getByRole("heading", { level: 2, name: headings[step.id] })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole("button", { name: "Til start" }));
    expect(window.location.hash).toBe("#hva");
    expect(screen.getByRole("button", { name: "Forrige" })).toBeDisabled();
  });

  it("lands on the quiz from #quiz", () => {
    window.history.replaceState(null, "", "/handballskolen/utgruppert-forsvar#quiz");
    lesson();
    expect(screen.getByRole("heading", { level: 2, name: headings.quiz })).toBeInTheDocument();
    expect(screen.getByText(`Påstand 1 av ${QUIZ.length}`)).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /håndballbane/ })).not.toBeInTheDocument();
  });

  it("explains a statement once it is answered and counts the right answers", () => {
    window.history.replaceState(null, "", "#quiz");
    lesson();
    const statement = QUIZ.find((item) => screen.queryByText((_, element) => element?.classList.contains("lesson-quiz-statement") === true && element.textContent === item.statement))!;
    expect(statement).toBeDefined();
    expect(screen.getByText(/Riktige svar:/)).toHaveTextContent("Riktige svar: 0 av 0");

    fireEvent.click(screen.getByRole("button", { name: statement.answer ? "Riktig" : "Feil" }));

    expect(screen.getByText("Riktig svar!")).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.tagName === "SPAN" && element.textContent === `Påstanden er ${statement.answer ? "riktig" : "feil"}. ${statement.explanation}`)).toBeInTheDocument();
    expect(screen.getByText(/Riktige svar:/)).toHaveTextContent("Riktige svar: 1 av 1");
    expect(screen.getByRole("button", { name: "Riktig" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Neste påstand" })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Neste påstand" }));
    expect(screen.getByText(`Påstand 2 av ${QUIZ.length}`)).toBeInTheDocument();
  });

  it("checks a placement in «Hvor står du?» and keeps the score", () => {
    lesson();
    fireEvent.click(steps().getByRole("button", { name: "Hvor står du?" }));
    expect(screen.getByText(/Hvor skal du stå\?/)).toBeInTheDocument();
    expect(screen.getByText(/^Poeng:/)).toHaveTextContent("Poeng: 0 av 0");

    fireEvent.click(screen.getByRole("button", { name: "Sjekk" }));

    const result = document.querySelector(".lesson-result")!;
    expect(result).toHaveTextContent(/^(Bra! Der står du perfekt\.|Bra! Du står riktig\. Ett lite steg|Nesten! Flytt deg litt|Ikke helt\. Du skal stå)/);
    expect(result).not.toHaveTextContent(/\d+,\d m/);
    expect(screen.getByText(/^Poeng:/)).toHaveTextContent(/^Poeng: [012] av 2$/);
    expect(screen.getByRole("button", { name: "Sjekk" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Ny oppgave" }));
    expect(screen.getByRole("button", { name: "Sjekk" })).toBeEnabled();
    expect(document.querySelector(".lesson-result")).toBeNull();
  });

  it("moves «Deg» with the arrow keys", () => {
    lesson();
    fireEvent.click(steps().getByRole("button", { name: "Hvor står du?" }));
    const me = screen.getByRole("button", { name: /^Deg\./ });
    const before = me.style.transform;
    fireEvent.keyDown(me, { key: "ArrowLeft" });
    expect(screen.getByRole("button", { name: /^Deg\./ }).style.transform).not.toBe(before);
  });

  it("passes the ball to an attacker on the court from the keyboard", () => {
    lesson();
    fireEvent.click(steps().getByRole("button", { name: "Forflytning med ball" }));
    expect(screen.getByText("Ballen:")).toHaveTextContent("Ballen: venstre back");
    const court = screen.getByRole("group", { name: /håndballbane/ });

    const kant = within(court).getByRole("button", { name: "Spill ballen til høyre kant" });
    expect(kant).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(kant, { key: "Enter" });
    expect(screen.getByText("Ballen:")).toHaveTextContent("Ballen: høyre kant");

    fireEvent.keyDown(within(court).getByRole("button", { name: "Spill ballen til midtback" }), { key: " " });
    expect(screen.getByText("Ballen:")).toHaveTextContent("Ballen: midtback");
    expect(document.querySelector(".lesson-tip")).toHaveTextContent(/^Fremre 3'er jobber frem mot midtbacken/);
    expect(document.querySelector(".lesson-tip .lesson-role-3")).toHaveTextContent("3'er");
  });

  it("falls to 3:2 against a linjespiller", () => {
    lesson();
    fireEvent.click(steps().getByRole("button", { name: "Forflytning med ball" }));
    expect(screen.getByText("Forsvar:")).toHaveTextContent("Forsvar: 2:2:1");
    fireEvent.click(screen.getByRole("button", { name: /Med linjespiller/ }));
    expect(screen.getByText("Forsvar:")).toHaveTextContent("Forsvar: 3:2");
    expect(screen.getByRole("button", { name: "linjespiller" })).toBeInTheDocument();
  });

  it("slides from nedgruppert into utgruppert on the first visit", () => {
    vi.useFakeTimers();
    lesson();
    expect(screen.getByText(/Angrep mot forsvar:/)).toHaveTextContent("5 mot 4");
    expect(screen.getByRole("button", { name: "Nedgruppert" })).toHaveAttribute("aria-pressed", "true");
    act(() => { vi.advanceTimersByTime(1300); });
    expect(screen.getByText(/Angrep mot forsvar:/)).toHaveTextContent("5 mot 5");
    expect(screen.getByRole("button", { name: "Utgruppert" })).toHaveAttribute("aria-pressed", "true");
  });

  // Strict Mode mounts, cleans up and mounts again; the intro must survive it.
  it("still slides into utgruppert under Strict Mode", () => {
    vi.useFakeTimers();
    render(<StrictMode><UtgruppertForsvarLesson random={() => 0.25} /></StrictMode>);
    expect(screen.getByText(/Angrep mot forsvar:/)).toHaveTextContent("5 mot 4");
    act(() => { vi.advanceTimersByTime(1300); });
    expect(screen.getByText(/Angrep mot forsvar:/)).toHaveTextContent("5 mot 5");
  });

  it("runs an overgang and starts it over", () => {
    lesson();
    fireEvent.click(steps().getByRole("button", { name: "Overgang" }));
    fireEvent.click(screen.getByRole("button", { name: "VK" }));
    fireEvent.click(screen.getByRole("button", { name: "Kjør overgang" }));
    expect(screen.getByText(/^Venstre kant har løpt overgang/)).toBeInTheDocument();
    expect(screen.getByText("Forsvar:")).toHaveTextContent("Forsvar: 3:2");
    expect(screen.getByRole("button", { name: "2:2:1" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Start på nytt" }));
    expect(screen.getByRole("button", { name: "2:2:1" })).toBeEnabled();
  });

  it("hides the shell in storskjerm and brings it back with the button or Escape", () => {
    lesson();
    expect(screen.getByRole("complementary")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Hurtigmeny" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Vis på storskjerm" }));
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Hurtigmeny" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Åpne menyen" })).not.toBeInTheDocument();
    // The lesson keeps its place: it is the same tree, only the shell changes.
    fireEvent.click(steps().getByRole("button", { name: "Overgang" }));

    fireEvent.click(screen.getByRole("button", { name: "Avslutt storskjerm" }));
    expect(screen.getByRole("complementary")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Hurtigmeny" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: headings.overgang })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Vis på storskjerm" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("complementary")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vis på storskjerm" })).toBeInTheDocument();
  });
});
