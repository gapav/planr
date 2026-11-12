import { describe, expect, it } from "vitest";
import packageJson from "../package.json";
import { CURRENT_VERSION, RELEASES } from "./changelog";
import { compareVersions, parseVersion } from "./release-notes";

describe("RELEASES", () => {
  it("lists only valid semver versions", () => {
    for (const release of RELEASES) expect(parseVersion(release.version), release.version).not.toBeNull();
  });

  it("is in strictly descending version order", () => {
    for (let i = 1; i < RELEASES.length; i++) {
      const newer = parseVersion(RELEASES[i - 1].version)!;
      const older = parseVersion(RELEASES[i].version)!;
      expect(compareVersions(newer, older), `${RELEASES[i - 1].version} before ${RELEASES[i].version}`).toBeGreaterThan(0);
    }
  });

  it("starts with the version package.json declares", () => {
    expect(RELEASES[0].version).toBe(packageJson.version);
    expect(CURRENT_VERSION).toBe(packageJson.version);
  });

  it("gives every minor or major release after 1.0.0 at least one highlight", () => {
    const announced = RELEASES.filter((release) => {
      const version = parseVersion(release.version)!;
      return version.patch === 0 && compareVersions(version, { major: 1, minor: 0, patch: 0 }) > 0;
    });
    expect(announced.length).toBeGreaterThan(0);
    for (const release of announced) expect(release.highlights.filter((line) => line.trim()).length, release.version).toBeGreaterThan(0);
  });

  it("dates every release as YYYY-MM-DD", () => {
    for (const release of RELEASES) expect(release.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
