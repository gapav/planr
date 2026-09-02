import { describe, expect, it } from "vitest";
import { HELP_TOPICS } from "./help";

const topics = Object.entries(HELP_TOPICS);

describe("help topics", () => {
  it("gives every topic a title, an intro and something to say", () => {
    for (const [id, topic] of topics) {
      expect(topic.title.trim(), id).not.toBe("");
      expect(topic.intro.trim(), id).not.toBe("");
      expect(topic.points.length, id).toBeGreaterThan(0);
    }
  });
  it("has no blank point or note left behind", () => {
    for (const [id, topic] of topics) {
      for (const point of topic.points) expect(point.trim(), id).not.toBe("");
      if ("note" in topic) expect(topic.note.trim(), id).not.toBe("");
    }
  });
  it("covers the flows the app actually has", () => {
    expect(topics.map(([id]) => id)).toEqual(["sessions-calendar", "session-day", "session-builder", "session-publish", "exercises-library", "roster-import", "team-access"]);
  });
});
