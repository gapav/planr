/**
 * What has changed in Grep, newest first — decision 7. `RELEASES[0].version`
 * is the running version and must equal `site/package.json`'s `version`;
 * `changelog.test.ts` checks both.
 *
 * A minor or major release adds an entry here with highlights a coach can act
 * on: short, concrete Norwegian about what they can do now, not which parts of
 * the code changed. A patch adds nothing — coaches are never told about one,
 * because the «Hva er nytt» dialog compares on `major.minor` alone.
 */
export type Release = {
  version: string;
  /** ISO date (YYYY-MM-DD) the release reached production. */
  date: string;
  highlights: string[];
};

export const RELEASES: readonly Release[] = [
  {
    version: "1.1.0",
    date: "2026-11-12",
    highlights: [
      "Hvert tema i øvelsesbanken har fått undertema. Under Angrep finner du for eksempel Teknikk, Kast og mottak og Finter, så du kommer raskere til riktig øvelse.",
      "Åpne et tema i filteret for å velge ett eller flere undertema. Tallet ved siden av viser hvor mange øvelser som passer.",
      "Øvelseskortene viser undertemaet øverst, så du ser med en gang hva øvelsen trener.",
    ],
  },
  // Production as it stood when Grep got a version number. Nothing to
  // announce: a coach who has never seen the dialog counts as having seen this.
  { version: "1.0.0", date: "2026-11-12", highlights: [] },
];

export const CURRENT_VERSION = RELEASES[0].version;
