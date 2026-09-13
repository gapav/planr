import { describe, expect, it } from "vitest";
import { TEAM_PALETTE, savedTeamColors, teamPalette, validTeamColors } from "./team-palette";
import { demoFixtures } from "./demo-data";

describe("team palette", () => {
  it("recognises Norwegian colour names including the final å", () => {
    expect(teamPalette("Kolbotn Blå").id).toBe("blue");
    expect(teamPalette("Kolbotn Grønn").id).toBe("sage");
    expect(teamPalette("Kolbotn Rød").id).toBe("rose");
    expect(teamPalette("Kolbotn Gul").id).toBe("honey");
  });
  it("uses a chosen identity and safely ignores arbitrary CSS", () => {
    expect(teamPalette("Kolbotn Blå", "apricot")).toEqual(TEAM_PALETTE[0]);
    expect(teamPalette("Kolbotn Blå", "url(evil)").id).toBe("blue");
    expect(validTeamColors({ A: "sage", B: "#ff0000", C: null })).toEqual({ A: "sage" });
    expect(validTeamColors(null)).toEqual({});
  });
  it("keeps saved colours after re-import and resolves the latest assignment", () => {
    const first = { ...demoFixtures[0], updatedAt: "2026-09-01", ourTeamColors: { A: "sage", B: "blue" } };
    const second = { ...first, updatedAt: "2026-09-12", ourTeamColors: { A: "lilac" } };
    expect(savedTeamColors([second, first])).toEqual({ A: "lilac", B: "blue" });
  });
});
