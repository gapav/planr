import { afterEach, describe, expect, it, vi } from "vitest";
import type { Release } from "./changelog";
import { formatReleaseDate, readSeenVersion, releasesToAnnounce, rememberSeenVersion, SEEN_VERSION_KEY, subscribeSeenVersion } from "./release-notes";

const release = (version: string): Release => ({ version, date: "2026-11-12", highlights: [`Nytt i ${version}`] });
const versions = (list: Release[]) => list.map((entry) => entry.version);

describe("releasesToAnnounce", () => {
  const shipped = [release("1.1.0"), release("1.0.0")];

  it("treats nothing stored as having seen 1.0.0", () => {
    expect(versions(releasesToAnnounce(null, shipped))).toEqual(["1.1.0"]);
  });

  it("announces nothing to a coach who has seen the current minor", () => {
    expect(releasesToAnnounce("1.1.0", shipped)).toEqual([]);
  });

  it("keeps patches silent by comparing major.minor only", () => {
    expect(releasesToAnnounce("1.1.3", [release("1.1.5"), release("1.1.4"), release("1.1.0"), release("1.0.0")])).toEqual([]);
  });

  it("returns every minor since the one last seen, newest first", () => {
    expect(versions(releasesToAnnounce("1.0.0", [release("1.1.0"), release("1.2.0"), release("1.0.0")]))).toEqual(["1.2.0", "1.1.0"]);
  });

  it("includes a major release", () => {
    expect(versions(releasesToAnnounce("1.2.4", [release("2.0.0"), release("1.2.0")]))).toEqual(["2.0.0"]);
  });

  it("treats a stored value that is not semver as nothing stored", () => {
    for (const junk of ["", "v1.1.0", "1.1", "banan", "1.1.0-beta"]) {
      expect(versions(releasesToAnnounce(junk, shipped)), junk).toEqual(["1.1.0"]);
    }
  });
});

describe("seen version storage", () => {
  afterEach(() => { vi.restoreAllMocks(); window.localStorage.clear(); });

  it("reads and writes grep-seen-version and tells subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSeenVersion(listener);
    expect(readSeenVersion()).toBeNull();
    rememberSeenVersion("1.1.0");
    expect(window.localStorage.getItem(SEEN_VERSION_KEY)).toBe("1.1.0");
    expect(readSeenVersion()).toBe("1.1.0");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    rememberSeenVersion("1.1.0");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("reports storage that throws as unavailable, and writing to it does not throw", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("SecurityError"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("QuotaExceededError"); });
    expect(readSeenVersion()).toBe(false);
    expect(() => rememberSeenVersion("1.1.0")).not.toThrow();
  });
});

describe("formatReleaseDate", () => {
  it("writes the date in Norwegian", () => {
    expect(formatReleaseDate("2026-11-12")).toBe("12. november 2026");
    expect(formatReleaseDate("2027-01-05")).toBe("5. januar 2027");
  });
});
