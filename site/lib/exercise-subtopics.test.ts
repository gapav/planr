// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EXERCISE_CATEGORIES, EXERCISE_SUBTOPICS } from "./types";

/**
 * `EXERCISE_SUBTOPICS` and `exercises_subtopics_check` are one list written
 * twice (decision 4). A key the app offers but Postgres refuses would fail on
 * save; one Postgres allows but the app lacks could never be picked. The newest
 * migration that sets the constraint is the one in force.
 */
describe("the undertema list in Postgres", () => {
  const dir = path.join(__dirname, "..", "supabase", "migrations");
  const latest = readdirSync(dir).filter((file) => file.endsWith(".sql")).sort()
    .map((file) => readFileSync(path.join(dir, file), "utf8"))
    .filter((sql) => /add constraint exercises_subtopics_check/.test(sql))
    .at(-1);

  it("matches EXERCISE_SUBTOPICS topic by topic", () => {
    expect(latest).toBeDefined();
    const inDb = Object.fromEntries([...latest!.matchAll(/when '([^']+)' then array\[([^\]]*)\]/g)]
      .map(([, category, list]) => [category, [...list.matchAll(/'([^']+)'/g)].map(([, key]) => key)]));
    const inApp = Object.fromEntries(EXERCISE_CATEGORIES.map((category) => [category, EXERCISE_SUBTOPICS[category].map((entry) => entry.key)]));
    expect(inDb).toEqual(inApp);
  });
});
