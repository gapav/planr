// @vitest-environment node
import { expect, it } from "vitest";
import { createInterestRateLimit } from "./interest-rate-limit";

it("isolates identities and expires hourly buckets", () => {
  const allow = createInterestRateLimit();
  expect(allow("one", 2, 0)).toBe(true);
  expect(allow("one", 2, 1)).toBe(true);
  expect(allow("one", 2, 2)).toBe(false);
  expect(allow("two", 2, 2)).toBe(true);
  expect(allow("one", 2, 3_600_001)).toBe(true);
});
