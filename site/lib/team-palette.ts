import type { TeamFixture } from "./types";

/** Curated identities: accents identify teams, tints support dark readable text. */
export const TEAM_PALETTE = [
  { id: "apricot", name: "Aprikos", accent: "#E89B74", tint: "#FFF0E7" },
  { id: "lilac", name: "Syrin", accent: "#AD8CC8", tint: "#F1EAF8" },
  { id: "sage", name: "Salvie", accent: "#7F9E8B", tint: "#EAF2ED" },
  { id: "blue", name: "Disblå", accent: "#819DB9", tint: "#EDF2F8" },
  { id: "rose", name: "Rose", accent: "#C88E9E", tint: "#FAEDF1" },
  { id: "honey", name: "Honning", accent: "#C3A35C", tint: "#F8F2E3" },
] as const;

/**
 * Coach avatars, mirroring `--avatar-self` / `--avatar-peer` in `globals.css`.
 *
 * They are hex rather than `var(...)` because `readableInk` has to measure the
 * background to pick a label colour, and a CSS variable has no value until the
 * browser resolves it. Keep the two in step.
 */
export const COACH_AVATAR_SELF = "#67467e";
export const COACH_AVATAR_PEER = "#e9ddf7";

export function teamPalette(name: string, choice?: string) {
  const saved = TEAM_PALETTE.find((color) => color.id === choice);
  if (saved) return saved;
  const words = name.toLocaleLowerCase("nb-NO").split(/[^\p{L}]+/u);
  const aliases = ["oransje orange", "lilla purple", "grønn gronn green turkis cyan", "blå bla blue", "rød rod red rosa pink", "gul yellow"];
  const index = aliases.findIndex((group) => group.split(" ").some((word) => words.includes(word)));
  if (index >= 0) return TEAM_PALETTE[index];
  let hash = 0;
  for (const character of name.toLocaleLowerCase("nb-NO")) hash = (hash * 31 + character.codePointAt(0)!) % 100_000;
  return TEAM_PALETTE[hash % TEAM_PALETTE.length];
}

export function validTeamColors(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([name, id]) => name.length > 0 && name.length <= 140 && TEAM_PALETTE.some((color) => color.id === id)));
}

/** Call with fixtures already scoped to the active workspace. Latest import wins. */
export function savedTeamColors(fixtures: readonly TeamFixture[]): Record<string, string> {
  return Object.assign({}, ...[...fixtures].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)).map((fixture) => validTeamColors(fixture.ourTeamColors)));
}

export function fixturePalette(fixture: TeamFixture) {
  const name = fixture.ourTeams[0] ?? fixture.homeTeam;
  return teamPalette(name, fixture.ourTeamColors?.[name]);
}
