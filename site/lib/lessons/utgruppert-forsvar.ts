/**
 * «Utgruppert forsvar» (Håndballskolen, decision 10): the lesson's data and the
 * rules that place the pieces, ported from the prototype attached to issue #33.
 *
 * Coordinates are metres on a half court 20 wide and 17 deep, with the goal at
 * the top: x runs from the left touchline, y from the goal line. The court
 * component draws them ×10. Defenders are always listed in the same order —
 * the two 1'ere (left, right), the two 2'ere (left, right), then the 3'er — and
 * attackers left to right: VK, VB, MB or L, HB, HK.
 */

export type Point = readonly [x: number, y: number];
export type Formation = "32" | "221";
/** How the opponent attacks: without (`noL`) or with (`L`) a linjespiller. */
export type Setup = "noL" | "L";
export type Attacker = "VK" | "VB" | "MB" | "HB" | "HK" | "L";
export type Role = 1 | 2 | 3;
/** Who runs the overgang in «Overgang». */
export type OvergangRunner = "VK" | "MB" | "HK";
export type StepId = "hva" | "roller" | "ballen" | "overgang" | "spill" | "quiz";

export const STEPS: readonly { id: StepId; title: string }[] = [
  { id: "hva", title: "Hva er utgruppert?" },
  { id: "roller", title: "1'ere, 2'ere og 3'ere" },
  { id: "ballen", title: "Forflytning med ball" },
  { id: "overgang", title: "Overgang" },
  { id: "spill", title: "Hvor står du?" },
  { id: "quiz", title: "Riktig eller feil?" },
];

export function isStepId(value: string): value is StepId {
  return STEPS.some((step) => step.id === value);
}

/** The attackers' places when nobody has moved. */
const ATTACK: readonly Point[] = [[1.0, 3.6], [4.6, 11.0], [10, 12.2], [15.4, 11.0], [19.0, 3.6]];
/** How far the linjespiller drifts towards the ball, in metres. */
const LINE_SHIFT: Record<Attacker, number> = { VK: -2, VB: -1.2, L: 0, MB: 0, HB: 1.2, HK: 2 };
export const ATTACKERS: Record<Setup, readonly Attacker[]> = {
  noL: ["VK", "VB", "MB", "HB", "HK"],
  L: ["VK", "VB", "L", "HB", "HK"],
};
export const DEFENDER_ROLES: readonly Role[] = [1, 1, 2, 2, 3];

/** Nedgruppert: four along 6 m; the fifth (the coming 3'er) is off court. */
export const NEDGRUPPERT: readonly Point[] = [[3.0, 3.8], [17.0, 3.8], [7.6, 6.5], [12.4, 6.5], [18.6, 14.4]];
/** Venstre kant has run an overgang along 6 m. Høyre kant is its mirror. */
const OVERGANG_VK: readonly Point[] = [[5.0, 6.6], [16.6, 5.2], [7.4, 9.8], [12.2, 9.9], [9.6, 7.6]];
/** Standard positions, no ball. */
const STANDARD: Record<Formation, readonly Point[]> = {
  "32": [[3.2, 5.2], [16.8, 5.2], [5.6, 9.3], [14.4, 9.3], [10, 7.0]],
  "221": [[3.3, 4.6], [16.7, 4.6], [5.6, 8.9], [14.4, 8.9], [10, 9.8]],
};
/** Positions with the ball on the left or in the middle; the right is mirrored. */
const WITH_BALL: { "32": Record<Setup, Partial<Record<Attacker, readonly Point[]>>>; "221": { noL: Partial<Record<Attacker, readonly Point[]>> } } = {
  "32": {
    noL: {
      MB: [[3.2, 5.0], [16.8, 5.0], [8.3, 10.2], [11.7, 10.2], [10, 7.2]],
      VB: [[2.8, 5.6], [14.6, 6.0], [5.6, 9.3], [11.0, 9.9], [8.4, 7.0]],
      VK: [[2.4, 4.6], [14.4, 6.2], [5.0, 8.9], [10.6, 9.8], [7.4, 6.9]],
    },
    L: {
      L: [[4.4, 6.0], [15.6, 6.0], [8.6, 9.4], [11.4, 9.4], [10, 7.7]],
      VB: [[2.8, 5.6], [14.4, 6.2], [5.6, 9.4], [10.8, 9.7], [7.5, 7.3]],
      VK: [[2.4, 4.6], [14.2, 6.4], [5.0, 8.9], [10.4, 9.6], [6.6, 6.6]],
    },
  },
  "221": {
    noL: {
      MB: [[3.2, 4.8], [16.8, 4.8], [5.8, 8.8], [14.2, 8.8], [10, 10.2]],
      VB: [[3.0, 5.4], [15.4, 5.4], [5.4, 9.6], [12.4, 8.4], [8.6, 9.7]],
      VK: [[2.4, 4.4], [15.2, 5.6], [4.8, 8.4], [12.2, 8.6], [7.8, 9.5]],
    },
  },
};

export type Zone = { role: Role } & (
  | { shape: "circle"; cx: number; cy: number; r: number }
  | { shape: "ellipse"; cx: number; cy: number; rx: number; ry: number }
  | { shape: "rect"; x1: number; y1: number; x2: number; y2: number }
);
const ZONES: Record<Formation, readonly Zone[]> = {
  "32": [
    { role: 1, shape: "circle", cx: 3.2, cy: 5.4, r: 2.9 },
    { role: 1, shape: "circle", cx: 16.8, cy: 5.4, r: 2.9 },
    { role: 2, shape: "ellipse", cx: 6.2, cy: 9.6, rx: 3.6, ry: 2.0 },
    { role: 2, shape: "ellipse", cx: 13.8, cy: 9.6, rx: 3.6, ry: 2.0 },
    { role: 3, shape: "rect", x1: 5.5, y1: 5.3, x2: 14.5, y2: 8.3 },
  ],
  "221": [
    { role: 1, shape: "circle", cx: 3.3, cy: 4.8, r: 3.0 },
    { role: 1, shape: "circle", cx: 16.7, cy: 4.8, r: 3.0 },
    { role: 2, shape: "circle", cx: 5.6, cy: 8.6, r: 3.0 },
    { role: 2, shape: "circle", cx: 14.4, cy: 8.6, r: 3.0 },
    { role: 3, shape: "circle", cx: 10, cy: 9.8, r: 2.8 },
  ],
};

export const ATTACKER_NAMES: Record<Attacker, string> = { VK: "venstre kant", VB: "venstre back", MB: "midtback", HB: "høyre back", HK: "høyre kant", L: "linjespiller" };
/** Where «Deg» waits at the start of each «Hvor står du?» task. */
export const PLACEMENT_START: Point = [18.2, 13.6];
export const KEEPER_Y = 0.9;

/**
 * Distance from the 9 m line's centre segment — the line is two arcs of radius
 * 9 around the posts (x 8.5 and 11.5) joined by a straight piece. More than 9
 * is «utenfor 9 m».
 */
export function distanceFromGoal(x: number, y: number) {
  const centre = x < 8.5 ? 8.5 : x > 11.5 ? 11.5 : x;
  return Math.hypot(x - centre, y);
}

/** The same picture seen from the other side: left and right swap places. */
export function mirror(points: readonly Point[]): Point[] {
  const flip = ([x, y]: Point): Point => [20 - x, y];
  return [flip(points[1]), flip(points[0]), flip(points[3]), flip(points[2]), flip(points[4])];
}

/** 2:2:1 against a linjespiller is 3:2: the fremre 3'er falls back onto the line. */
export function effectiveFormation(formation: Formation, setup: Setup, overgang = false): Formation {
  return formation === "221" && (setup === "L" || overgang) ? "32" : formation;
}

export function defencePositions(formation: Formation, setup: Setup, ball: Attacker | null): readonly Point[] {
  const form = effectiveFormation(formation, setup);
  if (!ball) return STANDARD[form];
  const table: Partial<Record<Attacker, readonly Point[]>> = form === "32" ? WITH_BALL["32"][setup] : WITH_BALL["221"].noL;
  const direct = table[ball];
  if (direct) return direct;
  const mirrored = ({ HB: "VB", HK: "VK" } as const)[ball as "HB" | "HK"];
  const source = mirrored && table[mirrored];
  // Every reachable ball has a row; anything else stands in the standard set-up.
  return source ? mirror(source) : STANDARD[form];
}

export function attackPositions(setup: Setup, ball: Attacker | null): Point[] {
  return ATTACK.map((point, index) => index === 2 && setup === "L" ? [10 + (ball ? LINE_SHIFT[ball] : 0), 6.7] as Point : point);
}

export function zonesFor(formation: Formation, setup: Setup): readonly Zone[] {
  return ZONES[effectiveFormation(formation, setup)];
}

export function formationName(formation: Formation) {
  return formation === "32" ? "3:2" : "2:2:1";
}

/** How many defenders are outside 9 m. In nedgruppert the fifth is off court. */
export function countOutsideNine(points: readonly Point[], nedgruppert = false) {
  return (nedgruppert ? points.slice(0, 4) : points).filter(([x, y]) => distanceFromGoal(x, y) > 9).length;
}

/** «1,6» — Norwegian decimal comma, one decimal. */
export function formatMetres(metres: number) {
  return metres.toFixed(1).replace(".", ",");
}

const BALL_TIPS = {
  "32kant": "1'eren på ballsiden jobber frem mot kanten. 2'eren og 3'eren forflytter seg mot ballsiden. 1'eren på motsatt side trekker inn mot midten.",
  "32back": "2'eren på ballsiden jobber frem mot ballfører, men holder avstand. 3'eren forflytter seg mot ballsiden, og den andre 2'eren dekker midtsektoren. 1'eren på motsatt side trekker inn.",
  "32mb": "Begge 2'erne står klare foran midtbacken. 3'eren beveger seg på linjeområdet, og 1'erne står i hver sin sidesektor.",
  "32l": "Ballen er hos linjespilleren. 3'eren er tett på, og 2'erne faller ned og hjelper.",
  "221kant": "1'eren på ballsiden jobber frem mot kanten. 2'eren på ballsiden er klar hvis ballen spilles tilbake til backen. Fremre 3'er forflytter seg mot ballsiden.",
  "221back": "2'eren på ballsiden jobber frem mot ballfører. Fremre 3'er forflytter seg mot ballsiden og dekker midtsektoren. 2'eren og 1'eren på motsatt side trekker inn.",
  "221mb": "Fremre 3'er jobber frem mot midtbacken. 2'erne står rundt 9-meteren på hver side, og 1'erne står i sidesektorene.",
} as const;

function ballKind(ball: Attacker) {
  return ball === "MB" ? "mb" : ball === "L" ? "l" : ball.endsWith("K") ? "kant" : "back";
}

export function tipFor(formation: Formation, setup: Setup, ball: Attacker): string {
  if (formation === "221" && setup === "L") return "Motstanderen spiller med linjespiller, så 3'eren har falt ned på linja. Nå står forsvaret som i 3:2. " + BALL_TIPS[`32${ballKind(ball)}`];
  const tip = (BALL_TIPS as Record<string, string>)[formation + ballKind(ball)];
  if (!tip) throw new Error(`No tip for ${ball} in ${formation}`);
  return tip;
}

export const ROLE_TASKS: Record<Formation, readonly [string, string, string]> = {
  "32": [
    "Beveger seg rundt sidesektorene og forflytter seg med ball.",
    "Beveger seg rundt 9-meteren, i både sidesektor og midtsektor, og forflytter seg med ball.",
    "Beveger seg inne på linjeområdet og forflytter seg med ball.",
  ],
  "221": [
    "Beveger seg rundt sidesektorene og forflytter seg med ball.",
    "Beveger seg rundt 9-meteren, i både sidesektor og midtsektor, og forflytter seg med ball.",
    "Beveger seg i spissen av forsvaret rundt 9-meteren og forflytter seg med ball. Faller ned på linja ved overganger.",
  ],
};
export const FORMATION_HEADINGS: Record<Formation, string> = { "32": "Oppgavene i 3:2", "221": "Oppgavene i 2:2:1" };

/** Where the defence and the runner stand once an overgang has been run. */
export function overgangDefence(runner: "VK" | "HK"): Point[] {
  return runner === "VK" ? [...OVERGANG_VK] : mirror(OVERGANG_VK);
}
export function overgangRunnerPosition(runner: "VK" | "HK"): Point {
  return runner === "VK" ? [8.0, 6.7] : [12.0, 6.7];
}

export function overgangTip(runner: OvergangRunner, formation: Formation, run: boolean): string {
  const who = { MB: "midtbacken", VK: "venstre kant", HK: "høyre kant" }[runner];
  const Who = who[0].toUpperCase() + who.slice(1);
  if (!run) return `Ballen er hos ${runner === "MB" ? "venstre back" : "midtbacken"}. Trykk på knappen «Kjør overgang» for å se ${who} løpe inn på linja.`;
  if (runner === "MB") return formation === "221"
    ? "Midtbacken har løpt overgang. Fremre 3'er faller ned på linja, og forsvaret står nå som i 3:2. 2'erne er fortsatt utenfor 9-meteren."
    : "Midtbacken har løpt overgang. 3'eren beveger seg allerede på linjeområdet og tar imot. Derfor passer 3:2 mot lag som kjører mye overganger.";
  return formation === "221"
    ? `${Who} har løpt overgang langs 6-meteren. 1'eren på den siden følger med henne inn, og fremre 3'er faller ned og tar henne på linja. Forsvaret står nå som i 3:2.`
    : `${Who} har løpt overgang langs 6-meteren. 1'eren på den siden følger med henne inn, og 3'eren, som allerede er på linjeområdet, tar imot. 2'erne er fortsatt utenfor 9-meteren.`;
}

/** The arrow drawn for an overgang, in court units (×10). */
export function overgangRunPath(runner: OvergangRunner, ball: Attacker): string {
  if (runner === "VK") return "M14 44Q40 74 70 70";
  if (runner === "HK") return "M186 44Q160 74 130 70";
  const [x, y] = attackPositions("L", ball)[2];
  return `M100 112Q${x * 10 + 16} 96 ${x * 10 + 3} ${y * 10 + 12}`;
}

/** The order «Spill ballen rundt» passes in. */
export function autoPassSequence(setup: Setup): readonly Attacker[] {
  return setup === "L" ? ["VK", "VB", "HB", "HK", "HB", "VB"] : ["VK", "VB", "MB", "HB", "HK", "HB", "MB", "VB"];
}

/** When the opponent changes how it attacks, the ball stays with the player in the middle. */
export function ballAfterSetupChange(ball: Attacker | null, setup: Setup): Attacker | null {
  if (ball === "MB" && setup === "L") return "L";
  if (ball === "L" && setup === "noL") return "MB";
  return ball;
}

// «Hvor står du?»

export type PlacementTask = { formation: Formation; setup: Setup; ball: Attacker; role: number };
export type Score = 0 | 1 | 2;

/** 2 within 1,6 m of the right spot, 1 within 2,8 m, otherwise 0. */
export function scorePlacement(distance: number): Score {
  return distance <= 1.6 ? 2 : distance <= 2.8 ? 1 : 0;
}

/**
 * Keeps a dragged player on the court and outside the 6 m area: nobody but the
 * keeper stands in it, so a point inside is pushed out to 6,3 m.
 */
export function clampPlacement(x: number, y: number): Point {
  let px = Math.min(19.5, Math.max(0.5, x));
  let py = Math.min(15, Math.max(0.6, y));
  const centre = px < 8.5 ? 8.5 : px > 11.5 ? 11.5 : px;
  const distance = Math.hypot(px - centre, py);
  if (distance < 6.3) {
    if (distance < 0.01) py = 6.3;
    else { px = centre + (px - centre) / distance * 6.3; py = py / distance * 6.3; }
  }
  return [px, py];
}

/** A new task, never the same as the one before it. */
export function newPlacementTask(random: () => number, previous: PlacementTask | null): PlacementTask {
  for (let attempt = 0; ; attempt += 1) {
    const formation: Formation = random() < 0.5 ? "32" : "221";
    const setup: Setup = formation === "32" && random() < 0.4 ? "L" : "noL";
    const balls = ATTACKERS[setup].filter((key) => key !== "L");
    const ball = balls[Math.floor(random() * balls.length)];
    const role = Math.floor(random() * 5);
    const task = { formation, setup, ball, role };
    const same = previous && previous.formation === formation && previous.setup === setup && previous.ball === ball && previous.role === role;
    // A random source that keeps repeating itself would spin forever; nudge the role.
    if (!same) return task;
    if (attempt > 50) return { ...task, role: (role + 1) % 5 };
  }
}

export function placementTarget(task: PlacementTask): Point {
  return defencePositions(task.formation, task.setup, task.ball)[task.role];
}

export function placementSide(role: number) {
  return role < 4 ? (role % 2 ? " (den til høyre på tegningen)" : " (den til venstre på tegningen)") : "";
}

export const PLACEMENT_VERDICTS: Record<Score, string> = { 0: "Ikke helt.", 1: "Nesten!", 2: "Perfekt plassert!" };

// «Riktig eller feil?»

export type QuizItem = { statement: string; answer: boolean; explanation: string };
export const QUIZ: readonly QuizItem[] = [
  { statement: "I utgruppert forsvar står alle fem ved 6-meteren.", answer: false, explanation: "Det er nedgruppert forsvar. I utgruppert forsvar skal minimum to spillere være utenfor 9-meteren." },
  { statement: "Minimum to spillere skal være utenfor 9-meteren og søke ball.", answer: true, explanation: "Det er hovedregelen i utgruppert forsvar." },
  { statement: "I 11-årsserien er vi fem i forsvar, én mer enn i 10-årsklassen.", answer: true, explanation: "Det spilles 6-er-håndball: fem utespillere og målvakt." },
  { statement: "Målvakten er med i angrepet i 11-årsserien, så angrepet har overtall.", answer: false, explanation: "I 11-årsserien er målvakten ikke med i angrepet. Det blir fem mot fem." },
  { statement: "Emma følger én angrepsspiller over hele banen, uansett hvor ballen er.", answer: false, explanation: "Det kalles «frimerke» og er ikke lov. Utgruppert forsvar er et soneforsvar." },
  { statement: "Hele laget presser motstanderen over hele halvbanen.", answer: false, explanation: "Det kalles «halvbanepress» og er ikke lov. De som ligger utgruppert, kan jobbe frem mot ballfører, men må jobbe ned igjen." },
  { statement: "2'eren jobber frem mot ballfører, og jobber ned igjen når ballen spilles videre.", answer: true, explanation: "Slik skal det være." },
  { statement: "Sara rykker inn i pasningsbanen og snapper ballen.", answer: true, explanation: "Snapp av ball er lov!" },
  { statement: "Ida står konstant i pasningsbanen, så angrepsspilleren aldri kan motta ball.", answer: false, explanation: "En kan ikke stå konstant i pasningsbanen. Hold avstand, men rykk gjerne inn i pasningsbanen for å snappe ball." },
  { statement: "1'erne beveger seg rundt sidesektorene.", answer: true, explanation: "1'erne beveger seg rundt sidesektorene og forflytter seg med ball." },
  { statement: "I 3:2 beveger 3'eren seg inne på linjeområdet.", answer: true, explanation: "3'eren i 3:2 beveger seg inne på linjeområdet og forflytter seg med ball." },
  { statement: "2:2:1 passer best mot lag som spiller med linjespiller.", answer: false, explanation: "3:2 passer mot lag som spiller med linjespiller eller kjører mye overganger. 2:2:1 passer mot lag som ikke spiller med linjespiller." },
  { statement: "Det kommer en overgang mens vi spiller 2:2:1. Da faller 3'eren ned.", answer: true, explanation: "Kommer det overganger, faller 3'eren ned på linja." },
  { statement: "Ved overganger kan forsvarsspillerne følge angrepsspillerne innenfor 9-meteren.", answer: true, explanation: "Det er lov å følge med inn." },
  { statement: "Det er greit å holde litt i trøya til den som løper overgang.", answer: false, explanation: "Forsvarsspilleren skal ikke rive, dytte eller holde angrepsspilleren som løper overgang." },
  { statement: "Motstanderen har fire spillere innenfor 9-meteren. Da kan vi også ha fire der.", answer: true, explanation: "Har motstanderen 4–5 spillere innenfor 9-meteren, får forsvarende lag også ha 4–5 der." },
  { statement: "Når ballen går fra venstre til høyre side, står forsvaret stille.", answer: false, explanation: "Forsvaret skal ikke stå i et fast mønster, men bevege seg i forhold til ball." },
];

export function shuffledOrder(length: number, random: () => number): number[] {
  const order = Array.from({ length }, (_, index) => index);
  for (let index = order.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [order[index], order[other]] = [order[other], order[index]];
  }
  return order;
}

/** 80 % or better is «Supert!». */
export function quizVerdict(score: number, total: number) {
  return score >= Math.round(total * 0.8) ? "Supert! Dere kan utgruppert forsvar." : "Bra jobba! Ta en runde til?";
}

// Role names in running text: «1'er», «2'erne», «3'eren» … get their colour.

const ROLE_MENTION = /([123])['’](erne|eren|ere|er)(?![A-Za-zæøåÆØÅ])/g;
export type TextPart = string | { role: Role; text: string };

export function splitRoleMentions(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(ROLE_MENTION)) {
    const start = match.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    parts.push({ role: Number(match[1]) as Role, text: match[0] });
    last = start + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
