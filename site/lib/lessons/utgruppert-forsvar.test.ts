import { describe, expect, it } from "vitest";
import { LESSONS } from "./index";
import {
  ATTACKERS, NEDGRUPPERT, PLACEMENT_START, QUIZ, STEPS, attackPositions, ballAfterSetupChange, clampPlacement, countOutsideNine, defencePositions,
  ballX, distanceFromGoal, effectiveFormation, mirror, placementDirection, placementFeedback, newPlacementTask, overgangDefence, overgangTip, placementTarget, quizVerdict,
  scorePlacement, shuffledOrder, splitRoleMentions, tipFor, zonesFor, type Point,
} from "./utgruppert-forsvar";

/** A random source that plays back the given values, then repeats the last. */
function sequence(...values: number[]) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

describe("defence positions", () => {
  it("stands in the standard set-up when nobody has the ball", () => {
    expect(defencePositions("32", "noL", null)).toEqual([[3.2, 5.2], [16.8, 5.2], [5.6, 9.3], [14.4, 9.3], [10, 7.0]]);
    expect(defencePositions("221", "noL", null)[4]).toEqual([10, 9.8]);
  });

  it("reads the left and the middle straight from the table", () => {
    expect(defencePositions("32", "noL", "VB")[0]).toEqual([2.8, 5.6]);
    expect(defencePositions("221", "noL", "MB")[4]).toEqual([10, 10.2]);
    expect(defencePositions("32", "L", "L")[4]).toEqual([10, 7.7]);
  });

  // The tables only hold the left side: the right is the same picture flipped,
  // with the left and right player of each pair trading places.
  it("mirrors høyre back and høyre kant from venstre back and venstre kant", () => {
    for (const [formation, setup] of [["32", "noL"], ["32", "L"], ["221", "noL"]] as const) {
      expect(defencePositions(formation, setup, "HB")).toEqual(mirror(defencePositions(formation, setup, "VB")));
      expect(defencePositions(formation, setup, "HK")).toEqual(mirror(defencePositions(formation, setup, "VK")));
    }
    const vb = defencePositions("32", "noL", "VB");
    const hb = defencePositions("32", "noL", "HB");
    expect(hb[0][0]).toBeCloseTo(20 - vb[1][0]);
    expect(hb[1][0]).toBeCloseTo(20 - vb[0][0]);
    expect(hb[4][0]).toBeCloseTo(20 - vb[4][0]);
  });

  it("falls from 2:2:1 to 3:2 against a linjespiller", () => {
    expect(effectiveFormation("221", "L")).toBe("32");
    expect(effectiveFormation("221", "noL", true)).toBe("32");
    expect(effectiveFormation("221", "noL")).toBe("221");
    expect(defencePositions("221", "L", "VB")).toEqual(defencePositions("32", "L", "VB"));
    expect(zonesFor("221", "L")).toEqual(zonesFor("32", "noL"));
  });

  it("has a defence for every ball each set-up can hold", () => {
    for (const formation of ["32", "221"] as const) for (const setup of ["noL", "L"] as const) for (const ball of ATTACKERS[setup]) {
      const points = defencePositions(formation, setup, ball);
      expect(points).toHaveLength(5);
      expect(points).not.toEqual(defencePositions(formation, setup, null));
    }
  });

  it("mirrors an overgang from høyre kant", () => {
    expect(overgangDefence("HK")).toEqual(mirror(overgangDefence("VK")));
  });
});

describe("attack positions", () => {
  it("moves the linjespiller towards the ball, and nobody else", () => {
    expect(attackPositions("L", "VK")[2]).toEqual([8, 6.7]);
    expect(attackPositions("L", "HB")[2]).toEqual([11.2, 6.7]);
    expect(attackPositions("noL", "VK")[2]).toEqual([10, 12.2]);
    expect(attackPositions("L", "VK")[0]).toEqual(attackPositions("noL", "VK")[0]);
  });

  it("keeps the ball in the middle when the opponent changes how it attacks", () => {
    expect(ballAfterSetupChange("MB", "L")).toBe("L");
    expect(ballAfterSetupChange("L", "noL")).toBe("MB");
    expect(ballAfterSetupChange("VB", "L")).toBe("VB");
  });
});

describe("utenfor 9 m", () => {
  it("measures from the 9 m line's straight middle and its arcs", () => {
    expect(distanceFromGoal(10, 9.5)).toBeCloseTo(9.5);
    expect(distanceFromGoal(2.5, 0)).toBeCloseTo(6);
    expect(distanceFromGoal(14.5, 4)).toBeCloseTo(5);
  });

  it("counts only those more than 9 m out", () => {
    const points: Point[] = [[10, 9], [10, 9.01], [1, 1], [10, 12], [20, 0]];
    expect(countOutsideNine(points)).toBe(2);
  });

  it("leaves the fifth out in nedgruppert, and counts two in the standard 3:2", () => {
    expect(countOutsideNine(NEDGRUPPERT, true)).toBe(0);
    expect(countOutsideNine(defencePositions("32", "noL", null))).toBe(2);
    expect(countOutsideNine(defencePositions("221", "noL", null))).toBe(3);
  });
});

describe("«Hvor står du?»", () => {
  it("scores 2 within 1,6 m, 1 within 2,8 m, and 0 beyond", () => {
    expect(scorePlacement(0)).toBe(2);
    expect(scorePlacement(1.6)).toBe(2);
    expect(scorePlacement(1.61)).toBe(1);
    expect(scorePlacement(2.8)).toBe(1);
    expect(scorePlacement(2.81)).toBe(0);
  });

  it("keeps the dragged player on court and out of the 6 m area", () => {
    expect(clampPlacement(-3, 40)).toEqual([0.5, 15]);
    expect(clampPlacement(10, 0)).toEqual([10, 6.3]);
    const [x, y] = clampPlacement(10, 3);
    expect([x, y]).toEqual([10, 6.3]);
    const pushed = clampPlacement(5.5, 3);
    expect(distanceFromGoal(...pushed)).toBeCloseTo(6.3);
    expect(pushed[0]).toBeLessThan(8.5);
    expect(clampPlacement(4, 12)).toEqual([4, 12]);
  });

  it("starts «Deg» outside 6 m", () => {
    expect(clampPlacement(...PLACEMENT_START)).toEqual(PLACEMENT_START);
  });

  it("never hands out the same task twice in a row", () => {
    const first = newPlacementTask(sequence(0.1, 0.1, 0.1, 0.1), null);
    expect(first).toEqual({ formation: "32", setup: "L", ball: "VK", role: 0 });
    const next = newPlacementTask(sequence(0.1, 0.1, 0.1, 0.1, 0.9, 0.5, 0.5), first);
    expect(next).not.toEqual(first);
    expect(newPlacementTask(() => 0.1, first)).not.toEqual(first);
  });

  it("never asks for the linjespiller to have the ball", () => {
    const random = sequence(...Array.from({ length: 400 }, (_, index) => (index * 0.137) % 1));
    for (let round = 0; round < 80; round += 1) expect(newPlacementTask(random, null).ball).not.toBe("L");
  });

  it("aims at the player's own spot in the defence", () => {
    expect(placementTarget({ formation: "221", setup: "noL", ball: "HK", role: 4 })).toEqual(defencePositions("221", "noL", "HK")[4]);
  });

  // A coaching cue, not a measurement: praise on the spot, a direction otherwise.
  it("praises a player within half a metre, with no cue", () => {
    expect(placementFeedback([5, 9], [5.3, 9.3], 4.6)).toEqual({ verdict: "Bra! Der står du perfekt.", cue: null });
  });

  it("says which way to move, and how far in words", () => {
    expect(placementFeedback([5, 10], [5, 9], 4.6)).toEqual({ verdict: "Bra! Du står riktig.", cue: "Ett lite steg nærmere mål, så er det perfekt." });
    expect(placementFeedback([5, 7], [5, 9.2], 4.6)).toEqual({ verdict: "Nesten!", cue: "Flytt deg litt lenger ut." });
    expect(placementFeedback([12, 9], [6, 9], 4.6)).toEqual({ verdict: "Ikke helt.", cue: "Du skal stå mot ballen. Se på den stiplede ringen." });
  });

  it("names the side relative to the ball, and both ways when both matter", () => {
    expect(placementDirection([8, 9], [10, 9], 4.6)).toBe("bort fra ballen");
    expect(placementDirection([12, 9], [14, 9], 15.4)).toBe("mot ballen");
    expect(placementDirection([10, 12], [8, 9.5], 4.6)).toBe("nærmere mål og mot ballen");
    expect(placementDirection([10, 12], [9.6, 9], 4.6)).toBe("nærmere mål");
  });

  it("finds the ball across the court from its holder", () => {
    expect(ballX({ setup: "noL", ball: "VB" })).toBe(4.6);
    expect(ballX({ setup: "L", ball: "HK" })).toBe(19);
  });
});

describe("tips", () => {
  it("picks the tip by formation and where the ball is", () => {
    expect(tipFor("32", "noL", "VK")).toMatch(/^1'eren på ballsiden jobber frem mot kanten\. 2'eren og 3'eren/);
    expect(tipFor("32", "noL", "HB")).toMatch(/^2'eren på ballsiden jobber frem mot ballfører, men holder avstand/);
    expect(tipFor("221", "noL", "MB")).toMatch(/^Fremre 3'er jobber frem mot midtbacken/);
    expect(tipFor("32", "L", "L")).toMatch(/^Ballen er hos linjespilleren/);
  });

  it("says the 3'er has fallen when 2:2:1 meets a linjespiller", () => {
    const tip = tipFor("221", "L", "VK");
    expect(tip).toMatch(/^Motstanderen spiller med linjespiller, så 3'eren har falt ned på linja\. Nå står forsvaret som i 3:2\. /);
    expect(tip.endsWith(tipFor("32", "L", "VK"))).toBe(true);
  });

  it("explains the overgang before and after it is run", () => {
    expect(overgangTip("VK", "221", false)).toBe("Ballen er hos midtbacken. Trykk på knappen «Kjør overgang» for å se venstre kant løpe inn på linja.");
    expect(overgangTip("MB", "32", false)).toMatch(/^Ballen er hos venstre back\./);
    expect(overgangTip("HK", "221", true)).toMatch(/^Høyre kant har løpt overgang/);
    expect(overgangTip("MB", "221", true)).toMatch(/Fremre 3'er faller ned på linja/);
  });
});

describe("«Riktig eller feil?»", () => {
  it("has 17 statements, each with an answer and an explanation", () => {
    expect(QUIZ).toHaveLength(17);
    for (const item of QUIZ) {
      expect(item.statement.trim()).not.toBe("");
      expect(typeof item.answer).toBe("boolean");
      expect(item.explanation.trim()).not.toBe("");
    }
    expect(new Set(QUIZ.map((item) => item.statement)).size).toBe(17);
    expect(QUIZ.filter((item) => item.answer).length).toBeGreaterThan(0);
    expect(QUIZ.filter((item) => !item.answer).length).toBeGreaterThan(0);
  });

  it("shuffles every statement in exactly once", () => {
    const order = shuffledOrder(QUIZ.length, sequence(0.3, 0.7, 0.1, 0.9, 0.5));
    expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: 17 }, (_, index) => index));
  });

  it("calls 14 of 17 «Supert!»", () => {
    expect(quizVerdict(14, 17)).toBe("Supert! Dere kan utgruppert forsvar.");
    expect(quizVerdict(13, 17)).toBe("Bra jobba! Ta en runde til?");
  });
});

describe("role names in the copy", () => {
  it("splits out every form of 1'er, 2'er and 3'er", () => {
    expect(splitRoleMentions("1'erne og 2'eren hjelper 3'er, mens 1'ere venter.")).toEqual([
      { role: 1, text: "1'erne" }, " og ", { role: 2, text: "2'eren" }, " hjelper ", { role: 3, text: "3'er" }, ", mens ", { role: 1, text: "1'ere" }, " venter.",
    ]);
  });

  it("leaves other numbers and longer words alone", () => {
    expect(splitRoleMentions("5 mot 4 i 3:2")).toEqual(["5 mot 4 i 3:2"]);
    expect(splitRoleMentions("3'erstatning")).toEqual(["3'erstatning"]);
  });
});

describe("the lesson registry", () => {
  it("lists Utgruppert forsvar with its six steps", () => {
    expect(LESSONS).toEqual([expect.objectContaining({ slug: "utgruppert-forsvar", title: "Utgruppert forsvar", age: "11 år", steps: 6 })]);
    expect(STEPS.map((step) => step.id)).toEqual(["hva", "roller", "ballen", "overgang", "spill", "quiz"]);
  });
});
