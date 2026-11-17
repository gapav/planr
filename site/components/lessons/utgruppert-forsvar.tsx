"use client";

import { ArrowLeft, ArrowRight, Maximize2, Minimize2 } from "lucide-react";
import Link from "next/link";
import { Fragment, cloneElement, isValidElement, useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactElement, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { bandTone } from "@/components/exercise-age-group-filter";
import { Button, Tag } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  ATTACKERS, ATTACKER_NAMES, DEFENDER_ROLES, FORMATION_HEADINGS, KEEPER_Y, NEDGRUPPERT, PLACEMENT_START, PLACEMENT_VERDICTS, QUIZ, ROLE_TASKS, STEPS,
  attackPositions, autoPassSequence, ballAfterSetupChange, clampPlacement, countOutsideNine, defencePositions, distanceFromGoal, effectiveFormation,
  formatMetres, formationName, isStepId, newPlacementTask, overgangDefence, overgangRunPath, overgangRunnerPosition, overgangTip, placementSide,
  placementTarget, quizVerdict, scorePlacement, shuffledOrder, splitRoleMentions, tipFor, zonesFor,
  type Attacker, type Formation, type OvergangRunner, type PlacementTask, type Point, type Role, type Score, type Setup, type StepId,
} from "@/lib/lessons/utgruppert-forsvar";
import { HandballCourt, type CourtLine, type CourtPiece } from "./handball-court";

/** How long each kind of piece takes to get where it is going, in ms. */
type Motion = { attack: number; defence: number; ball: number; delay: number };
const MOTION: Motion = { attack: 650, defence: 850, ball: 480, delay: 0 };
const STILL: Motion = { attack: 0, defence: 0, ball: 0, delay: 0 };

type Game = PlacementTask & { result: { score: Score; distance: number } | null };
type Quiz = { order: number[]; index: number; score: number; done: number; picked: boolean | null };

type LessonState = {
  step: StepId;
  formation: Formation;
  setup: Setup;
  ball: Attacker | null;
  focus: 0 | Role;
  zones: boolean;
  nedgruppert: boolean;
  showOutside: boolean;
  runner: OvergangRunner;
  overgang: boolean;
  /** A kant running an overgang, which moves the defence off its tables. */
  kantRun: "VK" | "HK" | null;
  run: string;
  motion: Motion;
  game: Game | null;
  me: Point;
  dragging: boolean;
  points: number;
  tasks: number;
};

const INITIAL: LessonState = {
  step: "hva", formation: "32", setup: "noL", ball: null, focus: 0, zones: false, nedgruppert: true, showOutside: true,
  runner: "MB", overgang: false, kantRun: null, run: "", motion: STILL, game: null, me: PLACEMENT_START, dragging: false, points: 0, tasks: 0,
};

/** The overgang step before anybody has run: the ball is with the player next to the runner. */
function overgangReset(state: LessonState): LessonState {
  return { ...state, overgang: false, kantRun: null, setup: "noL", ball: state.runner === "MB" ? "VB" : "MB", run: "" };
}

function withTask(state: LessonState, task: PlacementTask): LessonState {
  return { ...state, formation: task.formation, setup: task.setup, ball: task.ball, focus: 0, zones: false, game: { ...task, result: null }, me: PLACEMENT_START, dragging: false, motion: MOTION };
}

// Role names in the copy wear their role's colour, as on the court. `marked`
// walks plain elements and strings the way the prototype's tree walker did.
function RoleText({ text }: { text: string }) {
  return <>{splitRoleMentions(text).map((part, index) => typeof part === "string" ? <Fragment key={index}>{part}</Fragment> : <span key={index} className={`lesson-role lesson-role-${part.role}`}>{part.text}</span>)}</>;
}
function marked(node: ReactNode): ReactNode {
  if (typeof node === "string") return <RoleText text={node} />;
  if (Array.isArray(node)) return node.map((child, index) => <Fragment key={index}>{marked(child)}</Fragment>);
  if (isValidElement(node) && typeof node.type === "string") {
    const element = node as ReactElement<{ children?: ReactNode }>;
    return element.props.children === undefined ? element : cloneElement(element, undefined, marked(element.props.children));
  }
  return node;
}
function Copy({ children }: { children: ReactNode }) { return <>{marked(children)}</>; }

function leaveFullscreen() {
  if (typeof document !== "undefined" && document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function UtgruppertForsvarLesson({ random = Math.random }: { random?: () => number }) {
  const [state, setState] = useState<LessonState>(INITIAL);
  const [auto, setAuto] = useState(false);
  const [passes, setPasses] = useState<CourtLine[]>([]);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [presenting, setPresenting] = useState(false);
  const latest = useRef(state);
  const introSeen = useRef(false);
  const routed = useRef(false);
  const introTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const passId = useRef(0);
  const stage = useRef<HTMLDivElement>(null);
  const court = useRef<SVGSVGElement>(null);
  const quizNext = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => { latest.current = state; });

  const s = state;
  const keys = ATTACKERS[s.setup];
  const holder = s.ball ? keys.indexOf(s.ball) : -1;
  const attack = attackPositions(s.setup, s.ball);
  if (s.kantRun) attack[s.kantRun === "VK" ? 0 : 4] = overgangRunnerPosition(s.kantRun);
  const defence = s.nedgruppert ? NEDGRUPPERT : s.kantRun ? overgangDefence(s.kantRun) : defencePositions(s.formation, s.setup, s.ball);
  const fell = s.setup === "L" || s.kantRun !== null;
  const shownFormation = effectiveFormation(s.formation, s.setup, s.kantRun !== null);
  const outside = countOutsideNine(defence, s.nedgruppert);
  const stepIndex = STEPS.findIndex((step) => step.id === s.step);

  function enter(step: StepId) {
    setAuto(false);
    clearTimeout(introTimer.current);
    const base: LessonState = { ...latest.current, step, showOutside: ["hva", "ballen", "overgang"].includes(step), focus: 0, overgang: false, kantRun: null, nedgruppert: false, run: "", motion: MOTION, dragging: false };
    let next = base;
    if (step === "hva") {
      next = { ...base, formation: "32", setup: "noL", ball: null, zones: false };
      // The first visit starts in nedgruppert and slides into utgruppert, so
      // the new fifth defender is seen arriving.
      if (!introSeen.current) {
        introSeen.current = true;
        next = { ...next, nedgruppert: true, motion: STILL };
        introTimer.current = setTimeout(() => setState((current) => current.step === "hva" ? { ...current, nedgruppert: false, motion: { ...MOTION, defence: 1300 } } : current), 1200);
      }
    }
    if (step === "roller") next = { ...base, setup: "noL", ball: "MB", zones: true };
    if (step === "ballen") next = { ...base, formation: "221", setup: "noL", ball: "VB", zones: true };
    if (step === "overgang") next = overgangReset({ ...base, formation: "221", zones: true });
    if (step === "spill") next = withTask(base, newPlacementTask(random, null));
    if (step === "quiz") setQuiz((current) => current ?? startQuiz());
    setState(next);
    try { window.history.replaceState(null, "", "#" + step); } catch { /* a sandboxed frame may refuse */ }
  }

  function startQuiz(): Quiz { return { order: shuffledOrder(QUIZ.length, random), index: 0, score: 0, done: 0, picked: null }; }

  // The hash names the step, so a link can open on any of them and a reload
  // stays put. Read after mount: the server has no hash to render from.
  const enterRef = useRef(enter);
  useLayoutEffect(() => { enterRef.current = enter; });
  useEffect(() => {
    const route = () => {
      const hash = window.location.hash.slice(1);
      const step = isStepId(hash) ? hash : "hva";
      if (!routed.current || step !== latest.current.step) enterRef.current(step);
      routed.current = true;
    };
    route();
    window.addEventListener("hashchange", route);
    // Unmounting cancels the intro, so a remount (Strict Mode does one in dev)
    // must be free to start it again.
    return () => { window.removeEventListener("hashchange", route); clearTimeout(introTimer.current); routed.current = false; introSeen.current = false; };
  }, []);

  function update(patch: Partial<LessonState>) { setState((current) => ({ ...current, motion: MOTION, ...patch })); }

  const pass = useCallback((to: Attacker) => {
    const current = latest.current;
    if (to === current.ball || !current.ball) return;
    const order = ATTACKERS[current.setup];
    const from = attackPositions(current.setup, current.ball)[order.indexOf(current.ball)];
    const target = attackPositions(current.setup, to)[order.indexOf(to)];
    const id = `pass-${passId.current += 1}`;
    setPasses((lines) => [...lines, { id, from, to: target }]);
    setTimeout(() => setPasses((lines) => lines.filter((line) => line.id !== id)), 1400);
    setState((state) => ({ ...state, ball: to, motion: MOTION }));
  }, []);

  // «Spill ballen rundt»: one pass now, then one every 1,8 s until stopped.
  useEffect(() => {
    if (!auto) return;
    const sequence = autoPassSequence(latest.current.setup);
    let index = Math.max(0, sequence.indexOf(latest.current.ball as Attacker));
    const go = () => { index = (index + 1) % sequence.length; pass(sequence[index]); };
    go();
    const timer = setInterval(go, 1800);
    return () => clearInterval(timer);
  }, [auto, pass]);

  function jump(delta: number) {
    enter(STEPS[(stepIndex + delta + STEPS.length) % STEPS.length].id);
    if (window.innerWidth < 880) stage.current?.scrollIntoView?.({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }

  function chooseFormation(formation: Formation) {
    if (s.step === "overgang") update(overgangReset({ ...s, formation }));
    else update({ formation });
  }
  function chooseSetup(setup: Setup) {
    setAuto(false);
    update({ setup, formation: s.step === "ballen" ? (setup === "L" ? "32" : "221") : s.formation, ball: ballAfterSetupChange(s.ball, setup) });
  }
  function chooseRunner(runner: OvergangRunner) { update(overgangReset({ ...s, runner })); }
  function toggleFocus(role: Role, fromRoleCard = false) { update({ focus: fromRoleCard || s.step === "roller" ? (s.focus === role ? 0 : role) : role }); }
  function setNedgruppert(on: boolean) { clearTimeout(introTimer.current); update({ nedgruppert: on, motion: { ...MOTION, defence: 1100 } }); }

  function runOvergang() {
    if (s.overgang) { update({ ...overgangReset(s), motion: { ...MOTION, attack: 700 } }); return; }
    const motion = { attack: 1500, defence: 1150, ball: MOTION.ball, delay: 450 };
    if (s.runner === "MB") update({ overgang: true, setup: "L", run: overgangRunPath("MB", s.ball ?? "VB"), motion });
    else update({ overgang: true, kantRun: s.runner, run: overgangRunPath(s.runner, s.ball ?? "MB"), motion });
  }

  // «Hvor står du?»
  const game = s.step === "spill" ? s.game : null;
  const target = game ? placementTarget(game) : null;
  function newTask() { update(withTask(s, newPlacementTask(random, s.game))); }
  function check() {
    if (!game || game.result || !target) return;
    const distance = Math.hypot(s.me[0] - target[0], s.me[1] - target[1]);
    const score = scorePlacement(distance);
    update({ game: { ...game, result: { score, distance } }, points: s.points + score, tasks: s.tasks + 1, zones: true, dragging: false });
  }
  const placing = Boolean(game && !game.result);
  function moveTo(event: PointerEvent<SVGSVGElement>) {
    const matrix = court.current?.getScreenCTM?.();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    setState((current) => ({ ...current, me: clampPlacement(point.x / 10, point.y / 10) }));
  }
  function startDrag(event: PointerEvent<SVGSVGElement>) {
    if (!placing) return;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* not every pointer can be captured */ }
    update({ dragging: true });
    moveTo(event);
    event.preventDefault();
  }
  useEffect(() => {
    if (!s.dragging) return;
    const stop = () => setState((current) => ({ ...current, dragging: false }));
    window.addEventListener("pointerup", stop); window.addEventListener("pointercancel", stop);
    return () => { window.removeEventListener("pointerup", stop); window.removeEventListener("pointercancel", stop); };
  }, [s.dragging]);
  function nudgeMe(event: KeyboardEvent<SVGGElement>) {
    const step = 0.5;
    const delta: Record<string, Point> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const move = delta[event.key];
    if (!move || !placing) return;
    event.preventDefault();
    update({ me: clampPlacement(s.me[0] + move[0], s.me[1] + move[1]) });
  }

  // «Riktig eller feil?»
  const finished = quiz ? quiz.index >= quiz.order.length : false;
  const item = quiz && !finished ? QUIZ[quiz.order[quiz.index]] : null;
  function answer(value: boolean) {
    if (!quiz || !item || quiz.picked !== null) return;
    const right = value === item.answer;
    setQuiz({ ...quiz, picked: value, done: quiz.done + 1, score: quiz.score + (right ? 1 : 0) });
  }
  function nextStatement() {
    if (!quiz) return;
    if (finished) { setQuiz(startQuiz()); return; }
    setQuiz({ ...quiz, index: quiz.index + 1, picked: null });
  }
  useEffect(() => { if (quiz?.picked !== null && quiz?.picked !== undefined) quizNext.current?.focus({ preventScroll: true }); }, [quiz?.picked]);

  // «Vis på storskjerm»: the shell steps aside and the page asks for the whole
  // screen. Leaving the browser's full screen (its own Esc) leaves it too.
  function present(on: boolean) {
    setPresenting(on);
    if (on) document.documentElement.requestFullscreen?.().catch(() => undefined);
    else leaveFullscreen();
  }
  useEffect(() => {
    if (!presenting) return;
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setPresenting(false); leaveFullscreen(); } };
    const onFullscreen = () => { if (!document.fullscreenElement) setPresenting(false); };
    document.addEventListener("keydown", onKey); document.addEventListener("fullscreenchange", onFullscreen);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("fullscreenchange", onFullscreen); };
  }, [presenting]);

  // The pieces.
  const pieces: CourtPiece[] = [];
  keys.forEach((key, index) => {
    const standIn = s.nedgruppert && index === 2;
    const clickable = s.step === "ballen";
    pieces.push({
      id: `a${index}`, kind: "attacker", at: attack[index], duration: s.motion.attack,
      label: index === 2 ? (s.nedgruppert ? "MV" : s.setup === "L" ? "L" : "MB") : key,
      caption: standIn ? "Målvakt" : undefined, dashedEdge: standIn,
      onActivate: clickable ? () => { setAuto(false); pass(key); } : undefined,
      buttonLabel: clickable ? `Spill ballen til ${ATTACKER_NAMES[key]}` : undefined,
    });
  });
  DEFENDER_ROLES.forEach((role, index) => {
    const me = game?.role === index;
    const arriving = s.step === "hva" && !s.nedgruppert && index === 4;
    const out = s.showOutside && !(s.nedgruppert && index === 4) && distanceFromGoal(...defence[index]) > 9;
    pieces.push({
      id: `d${index}`, kind: "defender", role, label: String(role),
      at: me ? s.me : defence[index],
      duration: me ? (s.dragging ? 0 : 500) : s.motion.defence, delay: me ? 0 : s.motion.delay,
      ring: me || arriving ? "solid" : out ? "dashed" : undefined,
      caption: me ? "Deg" : arriving ? "Ny!" : undefined,
      hidden: s.nedgruppert && index === 4,
      dim: s.focus !== 0 && s.focus !== role,
      onActivate: s.step === "roller" ? () => toggleFocus(role) : undefined,
      buttonLabel: me && placing ? "Deg. Flytt med piltastene, eller dra." : undefined,
      onKeyDown: me ? nudgeMe : undefined,
    });
  });
  const ballX = holder >= 0 ? attack[holder][0] : 10;
  pieces.push({ id: "mv", kind: "keeper", label: "MV", at: [10 + (ballX - 10) * 0.12, KEEPER_Y], duration: s.motion.defence });
  const zones = s.zones && !s.nedgruppert ? zonesFor(s.formation, s.kantRun ? "L" : s.setup).map((zone) => ({ ...zone, dim: s.focus !== 0 && s.focus !== zone.role })) : [];
  const ball = holder >= 0 ? { at: [attack[holder][0] + 0.8, attack[holder][1] - 0.8] as Point, duration: s.motion.ball } : null;

  const pressed = (on: boolean) => ({ "aria-pressed": on });
  const ballTip = s.ball ? tipFor(s.formation, s.setup, s.ball) : "";
  const roleNames: Record<Role, string> = { 1: "1'erne", 2: "2'erne", 3: s.formation === "221" ? "Fremre 3'er" : "3'eren" };

  return <AppShell presenting={presenting}>
    <div className={cn("grep-page lesson", presenting && "is-presenting", `lesson-step-${s.step}`)}>
      <header className="lesson-header">
        <div className="min-w-0">
          {!presenting && <Link href="/handballskolen" className="lesson-back"><ArrowLeft size={15} aria-hidden="true" />Håndballskolen</Link>}
          <div className="flex flex-wrap items-center gap-3"><h1>Utgruppert forsvar</h1><Tag tone={bandTone["10-12"]}>11 år</Tag></div>
          {!presenting && <p className="lesson-lead">Utgruppert forsvar i 11-årsserien: standardoppsett, 3:2 og 2:2:1, overganger og hvordan forsvaret forflytter seg med ball.</p>}
        </div>
        {presenting
          ? <Button variant="secondary" size="lg" onClick={() => present(false)}><Minimize2 size={18} aria-hidden="true" />Avslutt storskjerm</Button>
          : <Button variant="secondary" size="lg" onClick={() => present(true)}><Maximize2 size={18} aria-hidden="true" />Vis på storskjerm</Button>}
      </header>

      <nav className="lesson-steps" aria-label="Steg i temaet">
        {STEPS.map((step) => <button key={step.id} type="button" aria-current={step.id === s.step ? "step" : undefined} onClick={() => enter(step.id)}>{step.title}</button>)}
      </nav>

      <div className="lesson-stage" ref={stage}>
        <div className="lesson-board-column">
          <div className="lesson-board">
            {s.step === "quiz" ? <div className="lesson-quiz" aria-live="polite">
              {quiz && (finished ? <>
                <p className="lesson-quiz-count">Ferdig!</p>
                <p className="lesson-quiz-statement">Dere fikk {quiz.score} av {quiz.order.length} riktige.</p>
                <div className="lesson-quiz-feedback"><b>{quizVerdict(quiz.score, quiz.order.length)}</b><button ref={quizNext} type="button" onClick={nextStatement}>Ta quizen igjen</button></div>
              </> : item && <>
                <p className="lesson-quiz-count">Påstand {quiz.index + 1} av {quiz.order.length}</p>
                <p className="lesson-quiz-statement"><RoleText text={item.statement} /></p>
                <div className="lesson-quiz-answers">
                  <button type="button" className={cn("is-yes", quiz.picked === true && "is-picked")} disabled={quiz.picked !== null} onClick={() => answer(true)}>Riktig</button>
                  <button type="button" className={cn("is-no", quiz.picked === false && "is-picked")} disabled={quiz.picked !== null} onClick={() => answer(false)}>Feil</button>
                </div>
                {quiz.picked !== null && <div className="lesson-quiz-feedback">
                  <b>{quiz.picked === item.answer ? "Riktig svar!" : "Ikke helt."}</b>
                  <span><RoleText text={`Påstanden er ${item.answer ? "riktig" : "feil"}. ${item.explanation}`} /></span>
                  <button ref={quizNext} type="button" onClick={nextStatement}>{quiz.index + 1 < quiz.order.length ? "Neste påstand" : "Se resultatet"}</button>
                </div>}
              </>)}
            </div> : <HandballCourt
              svgRef={court}
              label="Halv håndballbane sett ovenfra, med forsvarsspillere og angrepsspillere"
              className={cn(s.step === "spill" && placing && "is-placing")}
              style={{ touchAction: s.step === "spill" ? "none" : "manipulation" }}
              pieces={pieces} zones={zones} passes={passes} run={s.run || undefined} ball={ball}
              guide={game?.result && target ? { from: s.me, to: target, label: "Her" } : null}
              highlightNine={s.step === "hva"}
              onPointerDown={startDrag}
              onPointerMove={(event) => { if (s.dragging) moveTo(event); }}
            />}
          </div>
          {s.step !== "quiz" && <>
            <div className="lesson-hud">
              {s.ball && <span className="lesson-chip">Ballen: <b>{ATTACKER_NAMES[s.ball]}</b></span>}
              {s.step !== "spill" && <span className={cn("lesson-chip", outside >= 2 ? "is-ok" : "is-bad")}>Utenfor 9 m: <b>{outside}</b>{outside >= 2 ? " ✓" : ""}</span>}
              {["roller", "ballen", "overgang"].includes(s.step) && <span className="lesson-chip">Forsvar: <b>{formationName(shownFormation)}</b></span>}
              {s.step === "hva" && <span className={cn("lesson-chip", s.nedgruppert ? "is-bad" : "is-ok")}>Angrep mot forsvar: <b>{s.nedgruppert ? "5 mot 4" : "5 mot 5"}</b></span>}
            </div>
            <div className="lesson-legend" aria-hidden="true">
              <span><i className="lesson-dot lesson-dot-1" />1&apos;er</span><span><i className="lesson-dot lesson-dot-2" />2&apos;er</span><span><i className="lesson-dot lesson-dot-3" />3&apos;er</span><span><i className="lesson-dot lesson-dot-opponent" />Angrepsspiller</span><span><i className="lesson-dot lesson-dot-keeper" />Målvakt</span>
            </div>
          </>}
        </div>

        <section className="lesson-panel" aria-labelledby={`lesson-${s.step}`}>
          {s.step === "hva" && <Copy>
            <h2 id="lesson-hva">Fra nedgruppert til utgruppert</h2>
            <p>I 10-årsklassen spilte vi nedgruppert forsvar med fire forsvarsspillere ved 6-meteren. Målvakten var med i angrepet, så angrepet hadde overtall: fem mot fire.</p>
            <p>I 11-årsserien har hvert lag fem utespillere og målvakt, og målvakten er ikke med i angrepet. Det blir fem mot fem. Nå spiller vi utgruppert forsvar: minimum to spillere skal være utenfor 9-meteren og søke ball, og hele forsvaret forflytter seg med ball.</p>
            <div className="lesson-controls"><div><span className="lesson-label" id="lesson-velg-forsvar">Velg forsvar</span><div className="grep-segments" role="group" aria-labelledby="lesson-velg-forsvar"><button type="button" {...pressed(s.nedgruppert)} onClick={() => setNedgruppert(true)}>Nedgruppert</button><button type="button" {...pressed(!s.nedgruppert)} onClick={() => setNedgruppert(false)}>Utgruppert</button></div></div></div>
            <p className="lesson-small">Banen viser standardoppsettet, uten ball. Bytt mellom de to knappene for å se forskjellen. I utgruppert forsvar kommer den nye femte forsvarsspilleren inn som 3&apos;er. Den stiplede ringen viser hvem som er utenfor 9-meteren.</p>
            <h3>Fire regler å huske</h3>
            <ol className="lesson-rules">
              <li><b>Minimum to utenfor 9-meteren.</b> De skal søke ball.</li>
              <li><b>Soneforsvar.</b> Hver spiller har sin sone. Det er ikke lov med «frimerke» eller «halvbanepress».</li>
              <li><b>Jobb frem og ned igjen.</b> De som ligger utgruppert, kan jobbe frem mot ballfører, men må jobbe ned igjen når ballen spilles videre.</li>
              <li><b>Hold avstand.</b> Angrepsspilleren skal kunne motta ball. Du kan ikke stå konstant i pasningsbanen, men du kan rykke inn i pasningsbanen for å snappe ball.</li>
            </ol>
            <h3>Hvorfor utgruppert forsvar?</h3>
            <p>Det skaper bevegelse med og uten ball, gir rom for bevegelse, involverer flere i angrepsspillet og utvikler kant- og linjespill. Nye utfordringer gir bredere erfaring og gjør dere til bedre spillere.</p>
            <p className="lesson-small">I 11-årsserien spilles det 6-er-håndball med redusert målhøyde. Spilletiden er 2 × 20 minutter, og det spilles utgruppert forsvar i første omgang.</p>
          </Copy>}

          {s.step === "roller" && <>
            <Copy>
              <h2 id="lesson-roller">1&apos;ere, 2&apos;ere og 3&apos;ere</h2>
              <p>Utgruppert forsvar er et soneforsvar, på samme måte som nedgruppert, men med større rom for bevegelse. 1&apos;ere, 2&apos;ere og 3&apos;ere har hver sine oppgaver.</p>
              <h3>To formasjoner: 3:2 og 2:2:1</h3>
              <p>Tallene forteller hvor mange som står i hver rekke, fra bakerst (nærmest eget mål) til fremst.</p>
              <p><b>Hvorfor to formasjoner?</b> Motstanderne angriper forskjellig. Spiller de med linjespiller eller kjører mye overganger, trenger vi en 3&apos;er inne på linjeområdet. Spiller de uten linjespiller, kan 3&apos;eren heller stå i spissen av forsvaret, rundt 9-meteren.</p>
              <span className="lesson-label">Trykk på en formasjon for å se den på banen</span>
            </Copy>
            <div className="lesson-formations">
              <button type="button" className="lesson-card" {...pressed(shownFormation === "32")} onClick={() => chooseFormation("32")}><b className="lesson-card-title">3:2</b>
                <span className="lesson-mini" aria-hidden="true"><span className="lesson-mini-row" style={{ gap: 22 }}><i className="lesson-dot lesson-dot-1" /><i className="lesson-dot lesson-dot-3" /><i className="lesson-dot lesson-dot-1" /><em>3</em></span><span className="lesson-mini-row" style={{ gap: 40 }}><i className="lesson-dot lesson-dot-2" /><i className="lesson-dot lesson-dot-2" /><em>2</em></span></span>
                <Copy><span className="lesson-card-text">Tre bakerst: to 1&apos;ere og 3&apos;eren. To foran: 2&apos;erne.</span><span className="lesson-card-text"><b>Passer mot</b> lag som spiller med linjespiller eller kjører mye overganger.</span></Copy>
              </button>
              <button type="button" className="lesson-card" {...pressed(shownFormation === "221")} onClick={() => chooseFormation("221")}><b className="lesson-card-title">2:2:1</b>
                <span className="lesson-mini" aria-hidden="true"><span className="lesson-mini-row" style={{ gap: 60 }}><i className="lesson-dot lesson-dot-1" /><i className="lesson-dot lesson-dot-1" /><em>2</em></span><span className="lesson-mini-row" style={{ gap: 40 }}><i className="lesson-dot lesson-dot-2" /><i className="lesson-dot lesson-dot-2" /><em>2</em></span><span className="lesson-mini-row"><i className="lesson-dot lesson-dot-3" /><em>1</em></span></span>
                <Copy><span className="lesson-card-text">To bakerst: 1&apos;erne. To i midten: 2&apos;erne. Én foran: fremre 3&apos;er.</span><span className="lesson-card-text"><b>Passer mot</b> lag som ikke spiller med linjespiller. Kommer det overganger, faller 3&apos;eren ned.</span></Copy>
              </button>
            </div>
            <Copy>
              <p className="lesson-small">Det er ikke ønskelig å spille i et fast 3:2- eller 2:2:1-mønster. Forsvaret skal bevege seg i forhold til ball.</p>
              <h3>{FORMATION_HEADINGS[s.formation]}</h3>
              <p className="lesson-small">Trykk på en rolle, eller på en spiller på banen, for å se sonen.</p>
            </Copy>
            <div className="lesson-roles">
              {([1, 2, 3] as const).map((role) => <button key={role} type="button" className="lesson-card lesson-role-card" {...pressed(s.focus === role)} onClick={() => toggleFocus(role, true)}>
                <i className={`lesson-dot lesson-dot-${role} lesson-dot-big`} aria-hidden="true">{role}</i>
                <span><b><RoleText text={roleNames[role]} /></b><br /><RoleText text={ROLE_TASKS[s.formation][role - 1]} /></span>
              </button>)}
            </div>
          </>}

          {s.step === "ballen" && <>
            <h2 id="lesson-ballen">Forflytning med ball</h2>
            <p>Velg hvordan motstanderen angriper, så ser du hvilket forsvar vi spiller. Velg så hvem som har ballen, med knappene eller ved å trykke på en angrepsspiller på banen, og se hvordan forsvaret forflytter seg med ball.</p>
            <span className="lesson-label" id="lesson-setup">Hvordan angriper motstanderen?</span>
            <div className="lesson-setups" role="group" aria-labelledby="lesson-setup">
              <button type="button" className="lesson-card" {...pressed(s.setup === "noL")} onClick={() => chooseSetup("noL")}><b>Uten linjespiller</b><span>Vi spiller <em>2:2:1</em></span></button>
              <button type="button" className="lesson-card" {...pressed(s.setup === "L")} onClick={() => chooseSetup("L")}><b>Med linjespiller</b><span>Vi spiller <em>3:2</em></span></button>
            </div>
            <span className="lesson-label mt-3" id="lesson-ball">Hvem har ballen?</span>
            <div className="grep-segments" role="group" aria-labelledby="lesson-ball">{keys.map((key) => <button key={key} type="button" aria-label={ATTACKER_NAMES[key]} title={ATTACKER_NAMES[key]} {...pressed(s.ball === key)} onClick={() => { setAuto(false); pass(key); }}>{key}</button>)}</div>
            <div className="lesson-controls">
              <Button variant="secondary" aria-pressed={auto} onClick={() => setAuto(!auto)}>{auto ? "Stopp" : "Spill ballen rundt"}</Button>
              <Button variant="secondary" aria-pressed={s.zones} onClick={() => update({ zones: !s.zones })}>Vis soner</Button>
            </div>
            <span className="lesson-label" id="lesson-focus">Vis bare én rolle</span>
            <div className="grep-segments" role="group" aria-labelledby="lesson-focus">
              <button type="button" {...pressed(s.focus === 0)} onClick={() => update({ focus: 0 })}>Alle</button>
              {([1, 2, 3] as const).map((role) => <button key={role} type="button" {...pressed(s.focus === role)} onClick={() => update({ focus: role })}><RoleText text={role === 3 ? "3'er" : `${role}'ere`} /></button>)}
            </div>
            {ballTip && <p className="lesson-tip"><RoleText text={ballTip} /></p>}
            <p>Legg merke til at forsvarsspillerne har avstand fra angrepsspillerne, slik at angrepsspilleren kan motta ball. Snapp av ball er lov: du kan ikke stå konstant i pasningsbanen, men du kan rykke inn i pasningsbanen for å snappe ball.</p>
          </>}

          {s.step === "overgang" && <>
            <h2 id="lesson-overgang">Overgang</h2>
            <p>En overgang er når en angrepsspiller løper inn på linja. En overgang kan komme fra både kant- og bakspillerposisjon.</p>
            <div className="lesson-controls lesson-controls-wide">
              <div><span className="lesson-label" id="lesson-ov-form">Forsvar</span><div className="grep-segments" role="group" aria-labelledby="lesson-ov-form">
                {(["221", "32"] as const).map((formation) => { const blocked = formation === "221" && fell; return <button key={formation} type="button" {...pressed(shownFormation === formation)} disabled={blocked} title={blocked ? "Mot linjespiller faller 3'eren ned, så forsvaret blir 3:2" : undefined} onClick={() => chooseFormation(formation)}>{formationName(formation)}</button>; })}
              </div></div>
              <div><span className="lesson-label" id="lesson-ov-who">Hvem løper overgang?</span><div className="grep-segments" role="group" aria-labelledby="lesson-ov-who">
                {(["VK", "MB", "HK"] as const).map((runner) => <button key={runner} type="button" title={{ VK: "Venstre kant", MB: "Midtback", HK: "Høyre kant" }[runner]} {...pressed(s.runner === runner)} onClick={() => chooseRunner(runner)}>{runner}</button>)}
              </div></div>
            </div>
            <div className="lesson-controls"><Button onClick={runOvergang}>{s.overgang ? "Start på nytt" : "Kjør overgang"}</Button></div>
            <p className="lesson-tip"><RoleText text={overgangTip(s.runner, s.formation, s.overgang)} /></p>
            <h3>Regler ved overgang</h3>
            <ul className="lesson-rules">
              <li>Forsvarsspillerne kan følge angrepsspillerne innenfor 9-meteren.</li>
              <li>Forsvarsspilleren skal ikke rive, dytte eller holde angrepsspilleren som løper overgang.</li>
              <li>Har motstanderen 4–5 spillere innenfor 9-meteren, får forsvarende lag også ha 4–5 spillere innenfor 9-meteren.</li>
            </ul>
          </>}

          {s.step === "spill" && <>
            <h2 id="lesson-spill">Hvor står du?</h2>
            {game && <Copy><p>Du er <b>{`${DEFENDER_ROLES[game.role]}'er`}</b>{placementSide(game.role)} i <b>{formationName(game.formation)}</b>. Motstanderen spiller {game.setup === "L" ? "med" : "uten"} linjespiller, og ballen er hos <b>{ATTACKER_NAMES[game.ball]}</b>. Hvor skal du stå?</p></Copy>}
            <p className="lesson-small">Trykk på banen, eller dra spilleren merket «Deg», dit du skal stå. Trykk på «Sjekk» når du er klar.</p>
            <div className="lesson-controls">
              <Button onClick={check} disabled={!placing}>Sjekk</Button>
              <Button variant="secondary" onClick={newTask}>Ny oppgave</Button>
              <Button variant="secondary" aria-pressed={s.zones} onClick={() => update({ zones: !s.zones })}>Vis soner</Button>
            </div>
            <div aria-live="polite">{game?.result && <p className={cn("lesson-result", ["is-bad", "is-mid", "is-good"][game.result.score])}>
              <b>{PLACEMENT_VERDICTS[game.result.score]}</b> <RoleText text={`Du sto ${formatMetres(game.result.distance)} m fra plassen i den stiplede ringen. ${tipFor(game.formation, game.setup, game.ball)}`} />
            </p>}</div>
            <p>Poeng: <b>{s.points}</b> av <b>{s.tasks * 2}</b></p>
            <p className="lesson-small">2 poeng for perfekt (under 1,6 m unna), 1 poeng for nesten (under 2,8 m unna).</p>
          </>}

          {s.step === "quiz" && <>
            <h2 id="lesson-quiz">Riktig eller feil?</h2>
            <p>Les påstanden høyt og la alle stemme før dere trykker. Snakk om forklaringen før dere går videre.</p>
            <p>Riktige svar: <b>{quiz?.score ?? 0}</b> av <b>{quiz?.done ?? 0}</b></p>
            <Button variant="secondary" onClick={() => setQuiz(startQuiz())}>Start på nytt</Button>
          </>}

          <div className="lesson-pager">
            <Button variant="ghost" disabled={stepIndex === 0} onClick={() => jump(-1)}><ArrowLeft size={17} aria-hidden="true" />Forrige</Button>
            <Button onClick={() => jump(1)}>{stepIndex < STEPS.length - 1 ? <>Neste: {STEPS[stepIndex + 1].title}<ArrowRight size={17} aria-hidden="true" /></> : "Til start"}</Button>
          </div>
        </section>
      </div>

      <footer className="lesson-source"><p>Bygger på Norges Håndballforbund Region Øst sin veiledning for utgruppert forsvar i 11-årsserien. Banetegningene er forenklede eksempler. Posisjonene viser én god løsning, men forsvaret skal alltid bevege seg i forhold til ball.</p></footer>
    </div>
  </AppShell>;
}
